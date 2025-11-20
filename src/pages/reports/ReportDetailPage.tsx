import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Search, Check, X, Sparkles, Download, Filter, TrendingUp, DollarSign, BarChart3, Calendar, AlertCircle } from 'lucide-react'
import { listProducts } from '../../lib/api/products'
import { getSalesReport, updateSalesReport } from '../../lib/api/salesReports'
import { fetchSalesLines } from '../../lib/api/analytics'
import { saveProductMappings } from '../../lib/api/productMappings'
import { getProductAllies, saveProductAllies } from '../../lib/api/productAllies'
import { findBestMatches, autoMatchProducts, normalizeName } from '../../lib/utils/productMatching'
import { exportMappingReport } from '../../lib/utils/exportMappingReport'
import { getMenuGroups } from '../../lib/api/menuGroups'
import type { Product, SalesReport, SalesLine, CategoryBreakdown, ProductPerformance } from '../../lib/types'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useAuth } from '../../context/AuthContext'
import { Select } from '../../components/forms/Select'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { DataTable } from '../../components/tables/DataTable'
import { BarChart } from '../../components/charts/BarChart'
import { PieChart } from '../../components/charts/PieChart'
import { formatCurrency } from '../../lib/utils/formatting'

export function ReportDetailPage() {
  const { reportId } = useParams()
  const workspace = useWorkspace()
  const { user } = useAuth()
  const [report, setReport] = useState<SalesReport | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [salesLines, setSalesLines] = useState<SalesLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'mapped' | 'unmapped'>('all')
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [menuGroups, setMenuGroups] = useState<{ id: string; label: string; color: string }[]>([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [reportDoc, productList, lines, allies, groups] = await Promise.all([
        reportId ? getSalesReport(workspace, reportId) : Promise.resolve(null),
        listProducts(workspace),
        reportId ? fetchSalesLines(workspace, { reportId }) : Promise.resolve([]),
        getProductAllies(workspace),
        getMenuGroups(workspace),
      ])
      setReport(reportDoc)
      setProducts(productList)
      setSalesLines(lines)
      setMenuGroups(groups.map(g => ({ id: g.id, label: g.label, color: g.color })))
      if (reportDoc?.unmappedProducts) {
        // Auto-match with high confidence (0.9 threshold) - allies checked first
        const autoMapped = autoMatchProducts(reportDoc.unmappedProducts, productList, 0.9, allies)
        setMapping(autoMapped)
      }
      setLoading(false)
    }
    load()
  }, [workspace, reportId])

  // Auto-refresh when status is 'processing'
  useEffect(() => {
    if (report?.status !== 'processing') return

    const interval = setInterval(async () => {
      if (!reportId) return
      try {
        const updatedReport = await getSalesReport(workspace, reportId)
        if (updatedReport) {
          setReport(updatedReport)
          // If status changed from processing, reload sales lines
          if (updatedReport.status !== 'processing' && updatedReport.status !== report.status) {
            const lines = await fetchSalesLines(workspace, { reportId })
            setSalesLines(lines)
            // Load mappings if status changed to needs_mapping
            if (updatedReport.status === 'needs_mapping' && updatedReport.unmappedProducts) {
              const allies = await getProductAllies(workspace)
              const autoMapped = autoMatchProducts(updatedReport.unmappedProducts, products, 0.9, allies)
              setMapping(autoMapped)
            }
          }
        }
      } catch (error) {
        console.error('Error refreshing report:', error)
      }
    }, 3000) // Check every 3 seconds

    return () => clearInterval(interval)
  }, [report?.status, reportId, workspace, products])

  // Log report error if exists (must be before early returns)
  useEffect(() => {
    if (report?.status === 'error' && report?.errorMessage) {
      console.error('[ReportDetailPage] Report error:', report.errorMessage)
    }
  }, [report?.status, report?.errorMessage])

  const needsMapping = report?.status === 'needs_mapping'

  const unmappedStillPending = useMemo(() => {
    if (!report?.unmappedProducts) return []
    return report.unmappedProducts.filter((name) => !mapping[name])
  }, [report, mapping])

  // Filter unmapped products based on search, status, and confidence
  const filteredUnmappedProducts = useMemo(() => {
    if (!report?.unmappedProducts) return []

    return report.unmappedProducts.filter((name) => {
      // Search filter
      if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }

      // Status filter
      const isMapped = !!mapping[name]
      if (statusFilter === 'mapped' && !isMapped) return false
      if (statusFilter === 'unmapped' && isMapped) return false

      // Confidence filter (only for unmapped items)
      if (confidenceFilter !== 'all' && !isMapped) {
        const suggestions = findBestMatches(name, products, 1)
        const bestScore = suggestions.length > 0 ? suggestions[0].score : 0

        if (confidenceFilter === 'high' && bestScore < 0.8) return false
        if (confidenceFilter === 'medium' && (bestScore < 0.5 || bestScore >= 0.8)) return false
        if (confidenceFilter === 'low' && bestScore >= 0.5) return false
      }

      return true
    })
  }, [report?.unmappedProducts, searchQuery, statusFilter, confidenceFilter, mapping, products])

  // Calculate totals from salesLines if report totals are missing or NaN
  // These hooks must be called before any conditional returns
  const calculatedTotalAmount = useMemo(() => {
    if (!report || salesLines.length === 0) return report?.totalAmount ?? 0
    return salesLines.reduce((sum, line) => sum + (line.amount || 0), 0)
  }, [salesLines, report?.totalAmount])

  const calculatedTotalQuantity = useMemo(() => {
    if (!report || salesLines.length === 0) return report?.totalQuantity ?? 0
    return salesLines.reduce((sum, line) => sum + (line.quantity || 0), 0)
  }, [salesLines, report?.totalQuantity])

  const displayTotalAmount = report && report.totalAmount != null && !isNaN(report.totalAmount)
    ? report.totalAmount
    : calculatedTotalAmount
  const displayTotalQuantity = report && report.totalQuantity != null && !isNaN(report.totalQuantity)
    ? report.totalQuantity
    : calculatedTotalQuantity

  // Calculate detailed KPIs and charts data
  const reportMetrics = useMemo(() => {
    if (salesLines.length === 0) return null

    const avgPrice = displayTotalQuantity > 0 ? displayTotalAmount / displayTotalQuantity : 0

    // Top products by amount
    const productTotals = new Map<string, ProductPerformance>()
    salesLines.forEach((line) => {
      const existing = productTotals.get(line.productId) ?? {
        productId: line.productId,
        productName: line.productNameAtSale,
        menuGroup: line.menuGroupAtSale,
        menuSubGroup: line.menuSubGroupAtSale,
        quantity: 0,
        amount: 0,
        avgPrice: 0,
        percentOfTotal: 0,
      }
      existing.quantity += line.quantity
      existing.amount += line.amount
      productTotals.set(line.productId, existing)
    })

    const productPerformances = Array.from(productTotals.values()).map((item) => ({
      ...item,
      avgPrice: item.quantity > 0 ? item.amount / item.quantity : 0,
      percentOfTotal: displayTotalAmount > 0 ? item.amount / displayTotalAmount : 0,
    }))

    const topProductsByAmount = [...productPerformances]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)

    const topProductsByQty = [...productPerformances]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)

    // Category breakdown
    const categoryTotals = new Map<string, CategoryBreakdown>()
    salesLines.forEach((line) => {
      const group = menuGroups.find((g) => g.id === line.menuGroupAtSale)
      if (!group) return

      const existing = categoryTotals.get(group.id) ?? {
        menuGroupId: group.id,
        label: group.label,
        amount: 0,
        share: 0,
        color: group.color,
      }
      existing.amount += line.amount
      categoryTotals.set(group.id, existing)
    })

    const categories = Array.from(categoryTotals.values()).map((item) => ({
      ...item,
      share: displayTotalAmount > 0 ? item.amount / displayTotalAmount : 0,
    }))

    // Top product
    const topProduct = topProductsByAmount[0]

    // Unique products count
    const uniqueProducts = new Set(salesLines.map(line => line.productId)).size

    return {
      avgPrice,
      topProductsByAmount,
      topProductsByQty,
      categories,
      topProduct,
      uniqueProducts,
    }
  }, [salesLines, displayTotalAmount, displayTotalQuantity, menuGroups])

  const salesLinesColumns = useMemo(() => [
    {
      header: 'Product',
      accessor: (line: SalesLine) => (
        <span className="font-medium text-slate-900 truncate block max-w-md">{line.productNameAtSale}</span>
      ),
    },
    {
      header: 'Quantity',
      accessor: (line: SalesLine) => {
        const qty = line.quantity != null && !isNaN(line.quantity) ? line.quantity : 0
        return <span className="text-slate-700 whitespace-nowrap">{qty.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
      },
      align: 'right' as const,
    },
    {
      header: 'Amount',
      accessor: (line: SalesLine) => {
        const amount = line.amount != null && !isNaN(line.amount) ? line.amount : 0
        return <span className="font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(workspace.currency, amount)}</span>
      },
      align: 'right' as const,
    },
    {
      header: 'Unit Price',
      accessor: (line: SalesLine) => {
        // Recalculate unit price to ensure accuracy
        const qty = line.quantity != null && !isNaN(line.quantity) && line.quantity > 0 ? line.quantity : 1
        const amount = line.amount != null && !isNaN(line.amount) ? line.amount : 0
        const unitPrice = amount / qty
        return <span className="text-slate-600 whitespace-nowrap">{formatCurrency(workspace.currency, unitPrice)}</span>
      },
      align: 'right' as const,
    },
  ], [workspace.currency])

  async function handleResolveMapping() {
    if (!reportId) {
      setFeedback('Error: Report ID is missing.')
      return
    }

    if (!user?.userId) {
      setFeedback('Error: User authentication required.')
      return
    }

    setSaving(true)
    setFeedback(null)
    try {
      // Save mappings to workspace-level productMappings collection (for future reports)
      if (Object.keys(mapping).length > 0) {
        await saveProductMappings(workspace, mapping, user.userId)

        // Also save to Product Allies table (high-priority mappings)
        // Get existing allies to avoid duplicates
        const existingAllies = await getProductAllies(workspace)
        const existingSalesNames = new Set(
          Object.keys(existingAllies).map((name) => normalizeName(name))
        )

        // Convert mapping format and filter out duplicates
        // Only save new mappings that don't already exist in allies table
        const alliesToSave = Object.entries(mapping)
          .map(([salesName, productId]) => ({
            salesName: normalizeName(salesName), // Normalize for consistent matching
            productId,
          }))
          .filter(({ salesName }) => !existingSalesNames.has(salesName))

        if (alliesToSave.length > 0) {
          await saveProductAllies(workspace, alliesToSave, user.userId)
        }
      }

      // Save mappings and trigger reprocessing by setting status to 'uploaded'
      // Keep unmappedProducts as is - Cloud Function will use the mappings to process them
      await updateSalesReport(workspace, reportId, {
        status: 'uploaded', // Trigger Cloud Function to reprocess with mappings
        productMapping: mapping,
      })

      setReport((prev) =>
        prev ? {
          ...prev,
          status: 'uploaded',
          productMapping: mapping,
        } : prev
      )
      setFeedback('Mappings saved to workspace and allies table. Report is being reprocessed...')

      // Reload report after a short delay to see updated status
      setTimeout(async () => {
        try {
          const updatedReport = await getSalesReport(workspace, reportId!)
          if (updatedReport) {
            setReport(updatedReport)
            if (updatedReport.status === 'processed') {
              setFeedback('Report processed successfully!')
              // Reload sales lines
              const lines = await fetchSalesLines(workspace, { reportId })
              setSalesLines(lines)
            } else if (updatedReport.status === 'needs_mapping') {
              setFeedback('Some products still need mapping. Please review and try again.')
            }
          }
        } catch (error) {
          console.error('Error reloading report:', error)
        }
      }, 2000)
    } catch (error) {
      console.error('Error saving mappings:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setFeedback(`Unable to update report: ${errorMessage}. Please try again.`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="app-card text-sm text-slate-500">Loading report...</div>
  }

  if (!report) {
    return <div className="app-card text-sm text-slate-500">Report not found.</div>
  }

  return (
    <section className="space-y-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 px-6 py-8 shadow-xl">
        <div className="absolute inset-0 bg-grid-white/10" />
        <div className="relative">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-white">Report Detail</h1>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${report.status === 'processed' ? 'bg-emerald-500 text-white' :
                  report.status === 'processing' ? 'bg-amber-500 text-white' :
                    report.status === 'needs_mapping' ? 'bg-purple-500 text-white' :
                      report.status === 'error' ? 'bg-red-500 text-white' :
                        'bg-slate-500 text-white'
                  }`}>
                  {report.status === 'processing' && <div className="h-2 w-2 animate-pulse rounded-full bg-white" />}
                  {report.status.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-blue-100">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span className="font-medium">
                    {report.reportDate instanceof Date && !isNaN(report.reportDate.getTime())
                      ? format(report.reportDate, 'd MMM yyyy')
                      : 'Invalid date'}
                  </span>
                </div>
                <div className="h-4 w-px bg-blue-400/30" />
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  <span>Period: <span className="font-medium">{report.periodKey || '—'}</span></span>
                </div>
                <div className="h-4 w-px bg-blue-400/30" />
                <div className="text-xs opacity-75">
                  ID: {reportId}
                </div>
              </div>
              {report.status === 'error' && report.errorMessage && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-900/30 border border-red-400/30 px-3 py-2">
                  <AlertCircle className="h-4 w-4 text-red-200 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-100">{report.errorMessage}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* KPI Cards - 3 Columns */}
      {salesLines.length > 0 && reportMetrics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Sales</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {formatCurrency(workspace.currency, displayTotalAmount)}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {displayTotalQuantity.toLocaleString()} items sold
                </p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 transition-transform group-hover:scale-110">
                <DollarSign className="h-7 w-7" />
              </div>
            </div>
          </div>
          <div className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Average Price</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {formatCurrency(workspace.currency, reportMetrics.avgPrice)}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  per item
                </p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 transition-transform group-hover:scale-110">
                <TrendingUp className="h-7 w-7" />
              </div>
            </div>
          </div>
          <div className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-br from-purple-50 to-white p-6 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unique Products</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {reportMetrics.uniqueProducts}
                </p>
                {reportMetrics.topProduct && (
                  <p className="mt-1 text-sm text-slate-500 truncate">
                    Top: {reportMetrics.topProduct.productName}
                  </p>
                )}
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-600 transition-transform group-hover:scale-110">
                <BarChart3 className="h-7 w-7" />
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Charts Section */}
      {salesLines.length > 0 && reportMetrics && (
        <>
          {/* Category Breakdown - Full Width */}
          {reportMetrics.categories.length > 0 && (
            <div className="app-card">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="section-title">Category Breakdown</h2>
                  <p className="text-sm text-slate-500">Sales distribution by category</p>
                </div>
              </div>
              <div className="mb-6 flex justify-center">
                <div className="w-full max-w-2xl">
                  <PieChart
                    data={reportMetrics.categories}
                    nameKey="label"
                    valueKey="share"
                    colors={reportMetrics.categories.map(c => c.color || '#0F8BFD')}
                    formatter={(value, name) => {
                      const category = reportMetrics.categories.find(c => c.label === name)
                      const amount = category?.amount || 0
                      return `${name}: ${formatCurrency(workspace.currency, amount)} (${(Number(value) * 100).toFixed(1)}%)`
                    }}
                    height={320}
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {reportMetrics.categories
                  .sort((a, b) => b.amount - a.amount)
                  .map((category) => (
                    <div key={category.menuGroupId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className="h-4 w-4 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: category.color || '#0F8BFD' }}
                        />
                        <span className="min-w-0 flex-1 text-sm font-medium text-slate-700 truncate">{category.label}</span>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-semibold text-slate-900 whitespace-nowrap">
                          {formatCurrency(workspace.currency, category.amount)}
                        </p>
                        <p className="text-xs text-slate-500 whitespace-nowrap">
                          ({(category.share * 100).toFixed(1)}%)
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Top Products Charts - Side by Side */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Top Products by Amount */}
            {reportMetrics.topProductsByAmount.length > 0 && (
              <div className="app-card">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="section-title">Top Products by Revenue</h2>
                    <p className="text-sm text-slate-500">Best performing products</p>
                  </div>
                  <span className="text-xs text-slate-500">Top 10</span>
                </div>
                <BarChart
                  data={reportMetrics.topProductsByAmount}
                  xKey="productName"
                  yKey="amount"
                  color="#7C3AED"
                  height={280}
                  formatter={(value) => formatCurrency(workspace.currency, value)}
                />
                <div className="mt-4 space-y-3">
                  {reportMetrics.topProductsByAmount.slice(0, 5).map((product, idx) => (
                    <div key={product.productId} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-semibold text-purple-700">
                          {idx + 1}
                        </span>
                        <span className="min-w-0 flex-1 font-medium text-slate-700 truncate">{product.productName}</span>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className="block font-semibold text-slate-900 whitespace-nowrap">
                          {formatCurrency(workspace.currency, product.amount)}
                        </span>
                        <span className="block text-xs text-slate-500 whitespace-nowrap">
                          ({(product.percentOfTotal * 100).toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Products by Quantity */}
            {reportMetrics.topProductsByQty.length > 0 && (
              <div className="app-card">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="section-title">Top Products by Quantity</h2>
                    <p className="text-sm text-slate-500">Most sold products</p>
                  </div>
                  <span className="text-xs text-slate-500">Top 10</span>
                </div>
                <BarChart
                  data={reportMetrics.topProductsByQty}
                  xKey="productName"
                  yKey="quantity"
                  color="#0F8BFD"
                  height={280}
                  formatter={(value) => value.toLocaleString()}
                />
                <div className="mt-4 space-y-3">
                  {reportMetrics.topProductsByQty.slice(0, 5).map((product, idx) => (
                    <div key={product.productId} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                          {idx + 1}
                        </span>
                        <span className="min-w-0 flex-1 font-medium text-slate-700 truncate">{product.productName}</span>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className="block font-semibold text-slate-900 whitespace-nowrap">
                          {product.quantity.toLocaleString()}
                        </span>
                        <span className="block text-xs text-slate-500 whitespace-nowrap">
                          {formatCurrency(workspace.currency, product.amount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}


      {report.status === 'processing' && (
        <div className="app-card space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500"></div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Processing report</h2>
              <p className="text-sm text-slate-600">
                The report is being processed. This page will automatically update when processing is complete.
                {report.unmappedProducts && report.unmappedProducts.length > 0 && (
                  <span className="block mt-1">
                    If unmapped products are found, you'll be able to map them here.
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {salesLines.length > 0 && (
        <div className="app-card space-y-4 overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Report lines</h2>
              <p className="text-sm text-slate-600">
                {salesLines.length} line{salesLines.length !== 1 ? 's' : ''} found
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <DataTable
              columns={salesLinesColumns}
              data={salesLines}
            />
          </div>
        </div>
      )}

      {needsMapping && (
        <div className="app-card space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Product mapping required</h2>
              <p className="text-sm text-slate-600">
                {report.unmappedProducts?.length ?? 0} unmapped product(s) need to be assigned
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!report.unmappedProducts || !reportId) return
                  await exportMappingReport(
                    report.unmappedProducts,
                    products,
                    mapping,
                    reportId,
                  )
                }}
                className="btn-secondary"
              >
                <Download className="h-4 w-4" />
                Export Excel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!report.unmappedProducts) return
                  const allies = await getProductAllies(workspace)
                  const autoMapped = autoMatchProducts(report.unmappedProducts, products, 0.7, allies)
                  setMapping((prev) => ({ ...prev, ...autoMapped }))
                }}
                className="btn-secondary"
              >
                <Sparkles className="h-4 w-4" />
                Auto-match
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleResolveMapping}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Confirm mappings'}
              </button>
              {unmappedStillPending.length > 0 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    if (!reportId || !user?.userId) {
                      console.error('[ReportDetailPage] Missing reportId or userId')
                      return
                    }

                    console.log('[ReportDetailPage] Process without mapping clicked', {
                      reportId,
                      mappingCount: Object.keys(mapping).length,
                      unmappedCount: unmappedStillPending.length,
                    })

                    setSaving(true)
                    setFeedback(null)
                    try {
                      // Save existing mappings if any
                      if (Object.keys(mapping).length > 0) {
                        console.log('[ReportDetailPage] Saving product mappings...')
                        await saveProductMappings(workspace, mapping, user.userId)
                        console.log('[ReportDetailPage] Product mappings saved')
                      }

                      // Remove unmapped products from unmappedProducts array so Cloud Function can process
                      // Only keep products that are truly unmapped (not in mapping)
                      const remainingUnmapped = unmappedStillPending.filter(
                        (name) => !mapping[name]
                      )

                      console.log('[ReportDetailPage] Updating report:', {
                        status: 'uploaded',
                        productMappingCount: Object.keys(mapping).length,
                        remainingUnmappedCount: remainingUnmapped.length,
                        originalUnmappedCount: report?.unmappedProducts?.length ?? 0,
                      })

                      // Process report with existing mappings only (skip unmapped products)
                      // Set unmappedProducts to empty array so Cloud Function processes mapped products
                      // Cloud Function will use productMapping to match products
                      await updateSalesReport(workspace, reportId, {
                        status: 'uploaded',
                        productMapping: mapping,
                        unmappedProducts: [], // Empty array so Cloud Function processes with productMapping
                      })

                      console.log('[ReportDetailPage] Report updated, waiting for Cloud Function...')

                      setReport((prev) =>
                        prev ? {
                          ...prev,
                          status: 'uploaded',
                          productMapping: mapping,
                          unmappedProducts: remainingUnmapped,
                        } : prev
                      )
                      setFeedback('Report is being processed with existing mappings. Unmapped products will be skipped.')

                      // Poll for status updates
                      let attempts = 0
                      const maxAttempts = 30 // 30 seconds max
                      const pollInterval = setInterval(async () => {
                        attempts++
                        try {
                          const updatedReport = await getSalesReport(workspace, reportId!)
                          console.log('[ReportDetailPage] Polling report status:', {
                            attempt: attempts,
                            status: updatedReport?.status,
                          })

                          if (updatedReport) {
                            setReport(updatedReport)
                            if (updatedReport.status === 'processed') {
                              clearInterval(pollInterval)
                              setFeedback('Report processed successfully!')
                              const lines = await fetchSalesLines(workspace, { reportId })
                              setSalesLines(lines)
                              console.log('[ReportDetailPage] Report processed, salesLines:', lines.length)
                            } else if (updatedReport.status === 'needs_mapping') {
                              clearInterval(pollInterval)
                              setFeedback('Some products still need mapping. Please review and try again.')
                            } else if (updatedReport.status === 'error') {
                              clearInterval(pollInterval)
                              const errorMsg = updatedReport.errorMessage || 'Unknown error'
                              console.error('[ReportDetailPage] Cloud Function error:', errorMsg)
                              setFeedback(`Cloud Function error: ${errorMsg}. Please check Firebase Functions logs.`)
                            }
                          }

                          if (attempts >= maxAttempts) {
                            clearInterval(pollInterval)
                            setFeedback('Processing is taking longer than expected. Please refresh the page.')
                          }
                        } catch (error) {
                          console.error('[ReportDetailPage] Error polling report:', error)
                          if (attempts >= maxAttempts) {
                            clearInterval(pollInterval)
                          }
                        }
                      }, 1000)
                    } catch (error) {
                      console.error('[ReportDetailPage] Error processing report:', error)
                      setFeedback(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
                    } finally {
                      setSaving(false)
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Process without mapping ({unmappedStillPending.length} unmapped will be skipped)
                </button>
              )}
            </div>
          </div>

          <div className="app-card">
            <div className="mb-4 flex items-center gap-3 text-sm font-semibold text-gray-500">
              <Filter className="h-4 w-4" />
              Filters
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search unmapped products..."
                    className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <Select
                label="Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'mapped' | 'unmapped')}
                options={[
                  { label: 'All', value: 'all' },
                  { label: 'Mapped', value: 'mapped' },
                  { label: 'Unmapped', value: 'unmapped' },
                ]}
              />
              <Select
                label="Confidence Score"
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value as 'all' | 'high' | 'medium' | 'low')}
                options={[
                  { label: 'All', value: 'all' },
                  { label: 'High (≥80%)', value: 'high' },
                  { label: 'Medium (50-79%)', value: 'medium' },
                  { label: 'Low (<50%)', value: 'low' },
                ]}
                helperText="Filter by best match confidence"
              />
            </div>
            {filteredUnmappedProducts.length !== (report.unmappedProducts?.length ?? 0) && (
              <div className="mt-3 text-xs text-gray-500">
                Showing {filteredUnmappedProducts.length} of {report.unmappedProducts?.length ?? 0} products
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Unmapped Product
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Suggestions
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Assign To
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredUnmappedProducts.map((name) => {
                    const suggestions = findBestMatches(name, products, 3)
                    const isMapped = !!mapping[name]

                    return (
                      <tr
                        key={name}
                        className={`transition ${isMapped
                          ? 'bg-emerald-50/50'
                          : 'bg-white hover:bg-gray-50'
                          }`}
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-gray-900">{name}</p>
                        </td>
                        <td className="px-4 py-3">
                          {suggestions.length > 0 ? (
                            <div className="space-y-1">
                              {suggestions.map((match) => (
                                <button
                                  key={match.product.id}
                                  type="button"
                                  onClick={() =>
                                    setMapping((prev) => ({
                                      ...prev,
                                      [name]: match.product.id,
                                    }))
                                  }
                                  className={`w-full text-left inline-flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition ${mapping[name] === match.product.id
                                    ? 'bg-primary text-white'
                                    : match.score > 0.8
                                      ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                  title={`${match.reason} (${Math.round(match.score * 100)}% match)`}
                                >
                                  <span className="flex items-center gap-1">
                                    {match.product.name}
                                    {match.score > 0.8 && (
                                      <span className="text-[10px]">✨</span>
                                    )}
                                  </span>
                                  <span className="text-[10px] opacity-75">
                                    {Math.round(match.score * 100)}%
                                  </span>
                                </button>
                              ))}
                              <details className="mt-1">
                                <summary className="cursor-pointer text-[10px] text-gray-500 hover:text-gray-700">
                                  Show details
                                </summary>
                                <div className="mt-1 space-y-0.5 text-[10px] text-gray-600">
                                  {suggestions.map((match) => (
                                    <div key={match.product.id} className="pl-2">
                                      <span className="font-semibold">{match.product.name}:</span>{' '}
                                      {match.reason} ({Math.round(match.score * 100)}%)
                                    </div>
                                  ))}
                                </div>
                              </details>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">No suggestions</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <SearchableSelect
                            value={mapping[name] ?? ''}
                            onChange={(selectedValue) =>
                              setMapping((prev) => ({
                                ...prev,
                                [name]: selectedValue,
                              }))
                            }
                            options={[
                              { label: 'Select product...', value: '' },
                              ...products.map((product) => ({
                                label: product.name,
                                value: product.id,
                              })),
                            ]}
                            placeholder="Select product..."
                            searchPlaceholder="Search products..."
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isMapped ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                              <Check className="h-3 w-3" />
                              Mapped
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                              <X className="h-3 w-3" />
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">
                {(report.unmappedProducts?.length ?? 0) - unmappedStillPending.length}
              </span>{' '}
              of {report.unmappedProducts?.length ?? 0} mapped
            </div>
            {unmappedStillPending.length > 0 && (
              <p className="text-xs text-amber-600">
                {unmappedStillPending.length} product(s) still need mapping
              </p>
            )}
          </div>

          {feedback && (
            <div
              className={`rounded-xl border p-3 text-sm ${feedback.includes('saved')
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
                }`}
            >
              {feedback}
            </div>
          )}
        </div>
      )}
    </section>
  )
}


