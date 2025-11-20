import { useEffect, useMemo, useState, useRef } from 'react'
import { format } from 'date-fns'
import { LineChart } from '../../components/charts/LineChart'
import { DateRangePicker } from '../../components/forms/DateRangePicker'
import { Select } from '../../components/forms/Select'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import {
  fetchProductTrends,
  fetchCategoryTrends,
  fetchSubcategoryTrends,
  fetchSalesLines,
  type CategoryTrendPoint,
  type SubcategoryTrendPoint,
} from '../../lib/api/analytics'
import { getMenuGroups } from '../../lib/api/menuGroups'
import { listProducts } from '../../lib/api/products'
import { useWorkspace, type DateRange } from '../../context/WorkspaceContext'
import type { MenuGroup, Product, TrendPoint } from '../../lib/types'
import { TrendingUp, TrendingDown, Minus, Download } from 'lucide-react'
import { exportPerformanceReportToPDF } from '../../lib/utils/exportPerformanceReport'

type ReportType = 'category' | 'subcategory' | 'product'

type PerformanceMetrics = {
  totalAmount: number
  totalQuantity: number
  averagePrice: number
  firstPeriodAmount: number
  firstPeriodQuantity: number
  lastPeriodAmount: number
  lastPeriodQuantity: number
  amountChangePercent: number
  quantityChangePercent: number
  trendDirection: 'up' | 'down' | 'stable'
}

type ProductPeriodData = {
  productId: string
  productName: string
  periods: Array<{
    periodKey: string
    label: string
    quantity: number
    amount: number
    quantityChange?: number
    amountChange?: number
  }>
}

import { formatCurrency, formatPercent } from '../../lib/utils/formatting'

export function PerformanceReportPage() {
  const workspace = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [reportType, setReportType] = useState<ReportType>('category')
  const [dateRange, setDateRange] = useState<DateRange>(workspace.dateRange)
  const [categoryId, setCategoryId] = useState<string>('')
  const [subcategoryId, setSubcategoryId] = useState<string>('')
  const [productId, setProductId] = useState<string>('')

  const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [trendData, setTrendData] = useState<TrendPoint[] | CategoryTrendPoint[] | SubcategoryTrendPoint[]>([])
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [productBreakdown, setProductBreakdown] = useState<ProductPeriodData[]>([])
  const [exportingPDF, setExportingPDF] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  // Load initial data
  useEffect(() => {
    Promise.all([
      getMenuGroups(workspace),
      listProducts(workspace),
    ])
      .then(([groups, prods]) => {
        setMenuGroups(groups)
        setProducts(prods)
      })
      .catch((error) => {
        console.error('[PerformanceReportPage] Error loading data:', error)
      })
  }, [workspace])

  // Fetch trend data based on report type
  useEffect(() => {
    setLoading(true)

    const fetchData = async () => {
      try {
        let data: TrendPoint[] | CategoryTrendPoint[] | SubcategoryTrendPoint[]

        if (reportType === 'product' && productId) {
          data = await fetchProductTrends(workspace, [productId], {
            start: dateRange.start,
            end: dateRange.end,
          })
        } else if (reportType === 'subcategory') {
          data = await fetchSubcategoryTrends(
            workspace,
            categoryId || undefined,
            subcategoryId || undefined,
            {
              start: dateRange.start,
              end: dateRange.end,
            }
          )
        } else {
          // Category trends
          const categoryTrends = await fetchCategoryTrends(workspace, {
            start: dateRange.start,
            end: dateRange.end,
          })

          if (categoryId) {
            data = categoryTrends.filter((t) => t.menuGroup === categoryId)
          } else {
            data = categoryTrends
          }
        }

        setTrendData(data)

        // Calculate metrics
        if (data.length > 0) {
          const sortedData = [...data].sort((a, b) =>
            a.periodKey.localeCompare(b.periodKey)
          )

          const firstPeriod = sortedData[0]
          const lastPeriod = sortedData[sortedData.length - 1]

          const totalAmount = sortedData.reduce((sum, item) => sum + item.amount, 0)
          const totalQuantity = sortedData.reduce((sum, item) => sum + item.quantity, 0)
          const averagePrice = totalQuantity > 0 ? totalAmount / totalQuantity : 0

          const firstPeriodAmount = firstPeriod.amount
          const firstPeriodQuantity = firstPeriod.quantity
          const lastPeriodAmount = lastPeriod.amount
          const lastPeriodQuantity = lastPeriod.quantity

          const amountChangePercent = firstPeriodAmount > 0
            ? ((lastPeriodAmount - firstPeriodAmount) / firstPeriodAmount) * 100
            : 0
          const quantityChangePercent = firstPeriodQuantity > 0
            ? ((lastPeriodQuantity - firstPeriodQuantity) / firstPeriodQuantity) * 100
            : 0

          let trendDirection: 'up' | 'down' | 'stable' = 'stable'
          if (amountChangePercent > 5) trendDirection = 'up'
          else if (amountChangePercent < -5) trendDirection = 'down'

          setMetrics({
            totalAmount,
            totalQuantity,
            averagePrice,
            firstPeriodAmount,
            firstPeriodQuantity,
            lastPeriodAmount,
            lastPeriodQuantity,
            amountChangePercent,
            quantityChangePercent,
            trendDirection,
          })
        } else {
          setMetrics(null)
        }

        // Fetch product breakdown if viewing a category or subcategory
        if (
          (reportType === 'category' && categoryId) ||
          (reportType === 'subcategory' && subcategoryId)
        ) {
          const salesLines = await fetchSalesLines(workspace, {
            dateRange: {
              start: dateRange.start,
              end: dateRange.end,
            },
          })

          // Filter by category or subcategory
          let filteredLines = salesLines
          if (reportType === 'category') {
            filteredLines = salesLines.filter(
              (line) => line.menuGroupAtSale === categoryId
            )
          } else if (reportType === 'subcategory') {
            filteredLines = salesLines.filter(
              (line) => line.menuSubGroupAtSale === subcategoryId
            )
          }

          // Aggregate by product and period
          const productPeriodMap = new Map<
            string,
            Map<string, { quantity: number; amount: number }>
          >()

          filteredLines.forEach((line) => {
            if (!productPeriodMap.has(line.productId)) {
              productPeriodMap.set(
                line.productId,
                new Map<string, { quantity: number; amount: number }>()
              )
            }
            const periodMap = productPeriodMap.get(line.productId)!
            const existing = periodMap.get(line.periodKey) ?? {
              quantity: 0,
              amount: 0,
            }
            existing.quantity += line.quantity
            existing.amount += line.amount
            periodMap.set(line.periodKey, existing)
          })

          // Convert to array and calculate changes
          const breakdown: ProductPeriodData[] = []
          const allPeriodKeys = new Set<string>()
          productPeriodMap.forEach((periodMap) => {
            periodMap.forEach((_, periodKey) => {
              allPeriodKeys.add(periodKey)
            })
          })

          const sortedPeriodKeys = Array.from(allPeriodKeys).sort()

          productPeriodMap.forEach((periodMap, productId) => {
            const product = products.find((p) => p.id === productId)
            const productName =
              product?.name ||
              filteredLines.find((l) => l.productId === productId)
                ?.productNameAtSale ||
              productId

            const periods = sortedPeriodKeys.map((periodKey, index) => {
              const data = periodMap.get(periodKey) ?? { quantity: 0, amount: 0 }
              const [year, month] = periodKey.split('-').map(Number)
              const date = new Date(year, (month ?? 1) - 1)
              const label = format(date, 'MMM yyyy')

              // Calculate change from previous period
              let quantityChange: number | undefined
              let amountChange: number | undefined

              if (index > 0) {
                const prevPeriodKey = sortedPeriodKeys[index - 1]
                const prevData = periodMap.get(prevPeriodKey) ?? {
                  quantity: 0,
                  amount: 0,
                }

                if (prevData.quantity > 0) {
                  quantityChange =
                    ((data.quantity - prevData.quantity) / prevData.quantity) * 100
                }

                if (prevData.amount > 0) {
                  amountChange =
                    ((data.amount - prevData.amount) / prevData.amount) * 100
                }
              }

              return {
                periodKey,
                label,
                quantity: data.quantity,
                amount: data.amount,
                quantityChange,
                amountChange,
              }
            })

            breakdown.push({
              productId,
              productName,
              periods,
            })
          })

          // Sort by total amount descending
          breakdown.sort((a, b) => {
            const aTotal = a.periods.reduce((sum, p) => sum + p.amount, 0)
            const bTotal = b.periods.reduce((sum, p) => sum + p.amount, 0)
            return bTotal - aTotal
          })

          setProductBreakdown(breakdown)
        } else {
          setProductBreakdown([])
        }
      } catch (error) {
        console.error('[PerformanceReportPage] Error fetching trend data:', error)
        setTrendData([])
        setMetrics(null)
        setProductBreakdown([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [workspace, reportType, dateRange, categoryId, subcategoryId, productId, products])

  // Get available subcategories based on selected category
  const availableSubcategories = useMemo(() => {
    if (!categoryId) return []
    const category = menuGroups.find((g) => g.id === categoryId)
    return category?.subGroups || []
  }, [categoryId, menuGroups])

  // Get available products based on filters
  const availableProducts = useMemo(() => {
    let filtered = products

    if (categoryId) {
      filtered = filtered.filter((p) => p.menuGroupId === categoryId)
    }

    if (subcategoryId) {
      filtered = filtered.filter((p) => p.menuSubGroupId === subcategoryId)
    }

    return filtered
  }, [products, categoryId, subcategoryId])

  // Prepare chart data
  const chartData = useMemo(() => {
    if (trendData.length === 0) return []

    // Sort by periodKey to ensure chronological order
    const sortedData = [...trendData].sort((a, b) =>
      a.periodKey.localeCompare(b.periodKey)
    )

    if (reportType === 'category') {
      const categoryTrends = sortedData as CategoryTrendPoint[]
      const periodMap = new Map<string, Record<string, unknown>>()

      categoryTrends.forEach((entry) => {
        if (!periodMap.has(entry.periodKey)) {
          periodMap.set(entry.periodKey, {
            label: entry.label,
            periodKey: entry.periodKey,
          })
        }
        const row = periodMap.get(entry.periodKey)!
        row[entry.menuGroup] = entry.amount
      })

      // Convert to array and sort by periodKey to ensure chronological order
      return Array.from(periodMap.values()).sort((a, b) => {
        const aKey = (a.periodKey as string) || ''
        const bKey = (b.periodKey as string) || ''
        return aKey.localeCompare(bKey)
      })
    } else if (reportType === 'subcategory') {
      const subcategoryTrends = sortedData as SubcategoryTrendPoint[]
      const periodMap = new Map<string, Record<string, unknown>>()

      subcategoryTrends.forEach((entry) => {
        const key = `${entry.menuGroup}_${entry.menuSubGroup}`
        if (!periodMap.has(entry.periodKey)) {
          periodMap.set(entry.periodKey, {
            label: entry.label,
            periodKey: entry.periodKey,
          })
        }
        const row = periodMap.get(entry.periodKey)!
        row[key] = entry.amount
      })

      // Convert to array and sort by periodKey to ensure chronological order
      return Array.from(periodMap.values()).sort((a, b) => {
        const aKey = (a.periodKey as string) || ''
        const bKey = (b.periodKey as string) || ''
        return aKey.localeCompare(bKey)
      })
    } else {
      // Product
      const productTrends = sortedData as TrendPoint[]
      return productTrends.map((point) => ({
        label: point.label,
        periodKey: point.periodKey,
        amount: point.amount,
        quantity: point.quantity,
      }))
    }
  }, [trendData, reportType])

  // Prepare chart series
  const chartSeries = useMemo(() => {
    if (reportType === 'product') {
      return [
        {
          dataKey: 'amount',
          label: 'Revenue',
          color: '#2563eb',
        },
        {
          dataKey: 'quantity',
          label: 'Quantity',
          color: '#7c3aed',
        },
      ]
    } else if (reportType === 'category') {
      const categoryTrends = trendData as CategoryTrendPoint[]
      const uniqueCategories = Array.from(new Set(categoryTrends.map((t) => t.menuGroup)))
      const colors = ['#2563eb', '#7c3aed', '#16a34a', '#f97316', '#dc2626', '#8b5cf6']

      return uniqueCategories.map((categoryId, index) => {
        const category = menuGroups.find((g) => g.id === categoryId)
        return {
          dataKey: categoryId,
          label: category?.label || categoryId,
          color: colors[index % colors.length],
        }
      })
    } else {
      // Subcategory
      const subcategoryTrends = trendData as SubcategoryTrendPoint[]
      const uniqueSubcategories = Array.from(
        new Set(subcategoryTrends.map((t) => `${t.menuGroup}_${t.menuSubGroup}`))
      )
      const colors = ['#2563eb', '#7c3aed', '#16a34a', '#f97316', '#dc2626', '#8b5cf6']

      return uniqueSubcategories.map((key, index) => {
        const [menuGroupId, menuSubGroupId] = key.split('_')
        const category = menuGroups.find((g) => g.id === menuGroupId)
        const subcategory = category?.subGroups.find((sg) => sg.id === menuSubGroupId)
        return {
          dataKey: key,
          label: subcategory?.label || menuSubGroupId,
          color: colors[index % colors.length],
        }
      })
    }
  }, [trendData, reportType, menuGroups])

  const handleReportTypeChange = (type: ReportType) => {
    setReportType(type)
    setCategoryId('')
    setSubcategoryId('')
    setProductId('')
  }

  const getSelectedLabel = () => {
    if (reportType === 'product' && productId) {
      const product = products.find((p) => p.id === productId)
      return product?.name || 'Selected Product'
    } else if (reportType === 'subcategory' && subcategoryId) {
      const category = menuGroups.find((g) => g.id === categoryId)
      const subcategory = category?.subGroups.find((sg) => sg.id === subcategoryId)
      return subcategory?.label || 'Selected Subcategory'
    } else if (reportType === 'category' && categoryId) {
      const category = menuGroups.find((g) => g.id === categoryId)
      return category?.label || 'Selected Category'
    }
    return 'All Categories'
  }

  const handleExportPDF = async () => {
    if (!metrics || !chartRef.current) return

    setExportingPDF(true)
    try {
      await exportPerformanceReportToPDF({
        workspace,
        currency: workspace.currency,
        reportType,
        selectedLabel: getSelectedLabel(),
        dateRange,
        metrics,
        productBreakdown,
        chartElement: chartRef.current,
      })
    } catch (error) {
      console.error('Error exporting PDF:', error)
      alert('Failed to export PDF. Please try again.')
    } finally {
      setExportingPDF(false)
    }
  }

  if (loading && !metrics) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
          <p className="text-sm text-slate-500">Loading performance data…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Performance Report
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Analyze performance trends over time with percentage changes
                </p>
              </div>
              {metrics && (
                <button
                  type="button"
                  onClick={handleExportPDF}
                  disabled={exportingPDF}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {exportingPDF ? 'Exporting...' : 'Export PDF'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6 p-6">
          {/* Filters Section */}
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Filters</h2>
            <div className="space-y-4">
              {/* Report Type */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Report Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleReportTypeChange('category')}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${reportType === 'category'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                  >
                    Category
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReportTypeChange('subcategory')}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${reportType === 'subcategory'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                  >
                    Subcategory
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReportTypeChange('product')}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${reportType === 'product'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                  >
                    Product
                  </button>
                </div>
              </div>

              {/* Date Range */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Date Range
                </label>
                <DateRangePicker value={dateRange} onChange={setDateRange} />
              </div>

              {/* Category Filter */}
              {reportType !== 'product' && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Category
                  </label>
                  <Select
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value)
                      setSubcategoryId('')
                    }}
                    options={[
                      { label: 'All Categories', value: '' },
                      ...menuGroups.map((group) => ({
                        label: group.label,
                        value: group.id,
                      })),
                    ]}
                  />
                </div>
              )}

              {/* Subcategory Filter */}
              {reportType === 'subcategory' && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Subcategory
                  </label>
                  <Select
                    value={subcategoryId}
                    onChange={(e) => setSubcategoryId(e.target.value)}
                    options={[
                      { label: 'All Subcategories', value: '' },
                      ...availableSubcategories.map((sub) => ({
                        label: sub.label,
                        value: sub.id,
                      })),
                    ]}
                    disabled={!categoryId || availableSubcategories.length === 0}
                  />
                </div>
              )}

              {/* Product Filter */}
              {reportType === 'product' && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Product
                  </label>
                  <SearchableSelect
                    value={productId}
                    onChange={setProductId}
                    options={availableProducts.map((product) => ({
                      label: product.name,
                      value: product.id,
                    }))}
                    placeholder="Select a product..."
                    searchPlaceholder="Search products..."
                  />
                </div>
              )}
            </div>
          </section>

          {/* Metrics Section */}
          {metrics && (
            <>
              <section>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="mb-1 text-sm font-medium text-slate-500">
                          Total Revenue
                        </p>
                        <p className="text-2xl font-bold text-slate-900">
                          {formatCurrency(workspace.currency, metrics.totalAmount)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Qty: {metrics.totalQuantity.toLocaleString()}
                        </p>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-lg">
                        <span className="text-blue-600">💎</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="mb-1 text-sm font-medium text-slate-500">
                          Avg. Price
                        </p>
                        <p className="text-2xl font-bold text-slate-900">
                          {formatCurrency(workspace.currency, metrics.averagePrice)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">per item</p>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-lg">
                        <span className="text-violet-600">⚡</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="mb-1 text-sm font-medium text-slate-500">
                          Revenue Change
                        </p>
                        <div className="flex items-center gap-2">
                          <p
                            className={`text-2xl font-bold ${metrics.amountChangePercent >= 0
                              ? 'text-emerald-600'
                              : 'text-red-600'
                              }`}
                          >
                            {formatPercent(metrics.amountChangePercent)}
                          </p>
                          {metrics.trendDirection === 'up' && (
                            <TrendingUp className="h-5 w-5 text-emerald-600" />
                          )}
                          {metrics.trendDirection === 'down' && (
                            <TrendingDown className="h-5 w-5 text-red-600" />
                          )}
                          {metrics.trendDirection === 'stable' && (
                            <Minus className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          First vs Last period
                        </p>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-lg">
                        <span className="text-emerald-600">📈</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="mb-1 text-sm font-medium text-slate-500">
                          Quantity Change
                        </p>
                        <div className="flex items-center gap-2">
                          <p
                            className={`text-2xl font-bold ${metrics.quantityChangePercent >= 0
                              ? 'text-emerald-600'
                              : 'text-red-600'
                              }`}
                          >
                            {formatPercent(metrics.quantityChangePercent)}
                          </p>
                          {metrics.quantityChangePercent >= 0 ? (
                            <TrendingUp className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <TrendingDown className="h-5 w-5 text-red-600" />
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          First vs Last period
                        </p>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-lg">
                        <span className="text-amber-600">📦</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Period Comparison */}
              <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-slate-900">
                  Period Comparison
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-2 text-sm font-semibold text-slate-700">
                      First Period
                    </p>
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-slate-900">
                        {formatCurrency(workspace.currency, metrics.firstPeriodAmount)}
                      </p>
                      <p className="text-sm text-slate-600">
                        {metrics.firstPeriodQuantity.toLocaleString()} units
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-2 text-sm font-semibold text-slate-700">
                      Last Period
                    </p>
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-slate-900">
                        {formatCurrency(workspace.currency, metrics.lastPeriodAmount)}
                      </p>
                      <p className="text-sm text-slate-600">
                        {metrics.lastPeriodQuantity.toLocaleString()} units
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Chart Section */}
              {chartData.length > 0 && chartSeries.length > 0 && (
                <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">
                      Performance Trend: {getSelectedLabel()}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {format(dateRange.start, 'MMM d, yyyy')} –{' '}
                      {format(dateRange.end, 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div ref={chartRef} className="h-96">
                    <LineChart
                      data={chartData}
                      xKey="label"
                      series={chartSeries}
                      height={384}
                      formatter={(value: number) =>
                        formatCurrency(workspace.currency, value)
                      }
                    />
                  </div>
                </section>
              )}

              {/* Product Breakdown Table - For category and subcategory view */}
              {((reportType === 'category' && categoryId) ||
                (reportType === 'subcategory' && subcategoryId)) &&
                productBreakdown.length > 0 && (
                  <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-slate-900">
                        Product Performance Breakdown
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Comparative analysis by product and period
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                              Product
                            </th>
                            {productBreakdown[0]?.periods.map((period) => (
                              <th
                                key={period.periodKey}
                                className="min-w-[140px] px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600"
                              >
                                {period.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {productBreakdown.map((product) => (
                            <tr key={product.productId} className="hover:bg-slate-50/80">
                              <td className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold text-slate-900">
                                {product.productName}
                              </td>
                              {product.periods.map((period, idx) => (
                                <td
                                  key={period.periodKey}
                                  className="px-3 py-3 text-center"
                                >
                                  <div className="space-y-1.5">
                                    <div>
                                      <div className="font-semibold text-slate-900">
                                        {formatCurrency(workspace.currency, period.amount)}
                                      </div>
                                      <div className="text-xs text-slate-600">
                                        {period.quantity.toLocaleString()} units
                                      </div>
                                    </div>
                                    {idx > 0 && (
                                      <div className="space-y-0.5">
                                        {period.amountChange !== undefined && (
                                          <div className="flex items-center justify-center gap-1">
                                            {period.amountChange >= 0 ? (
                                              <TrendingUp className="h-3 w-3 text-emerald-600" />
                                            ) : (
                                              <TrendingDown className="h-3 w-3 text-red-600" />
                                            )}
                                            <span
                                              className={`text-xs font-medium ${period.amountChange >= 0
                                                ? 'text-emerald-600'
                                                : 'text-red-600'
                                                }`}
                                            >
                                              {formatPercent(period.amountChange)} revenue
                                            </span>
                                          </div>
                                        )}
                                        {period.quantityChange !== undefined && (
                                          <div className="flex items-center justify-center gap-1">
                                            {period.quantityChange >= 0 ? (
                                              <TrendingUp className="h-3 w-3 text-emerald-600" />
                                            ) : (
                                              <TrendingDown className="h-3 w-3 text-red-600" />
                                            )}
                                            <span
                                              className={`text-xs font-medium ${period.quantityChange >= 0
                                                ? 'text-emerald-600'
                                                : 'text-red-600'
                                                }`}
                                            >
                                              {formatPercent(period.quantityChange)} units
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {idx === 0 && (
                                      <div className="text-xs text-slate-400">—</div>
                                    )}
                                  </div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

              {chartData.length === 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
                  <p className="text-lg font-semibold text-slate-900">
                    No data found for the selected filters
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Try adjusting your filters or expanding the date range
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

