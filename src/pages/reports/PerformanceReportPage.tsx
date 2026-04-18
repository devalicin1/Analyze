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
import { TrendingUp, TrendingDown, Minus, Download, DollarSign, BarChart3, Activity, Package, ArrowRight, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react'
import { exportPerformanceReportToPDF } from '../../lib/utils/exportPerformanceReport'
import { SalesLinesModal } from '../../components/reports/SalesLinesModal'
import type { SalesLine } from '../../lib/types'
import { formatCurrency, formatPercent } from '../../lib/utils/formatting'

type ReportType = 'category' | 'subcategory' | 'product'

type PerformanceMetrics = {
  totalAmount: number
  totalQuantity: number
  averagePrice: number
  firstPeriodAmount: number
  firstPeriodQuantity: number
  firstPeriodLabel: string
  lastPeriodAmount: number
  lastPeriodQuantity: number
  lastPeriodLabel: string
  amountChangePercent: number
  quantityChangePercent: number
  trendDirection: 'up' | 'down' | 'stable'
  periodsCount: number
}

type ProductPeriodData = {
  productId: string
  productName: string
  totalAmount: number
  totalQuantity: number
  periods: Array<{
    periodKey: string
    label: string
    quantity: number
    amount: number
    quantityChange?: number
    amountChange?: number
  }>
}

export function PerformanceReportPage() {
  const workspace = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [reportType, setReportType] = useState<ReportType>('category')
  const [dateRange, setDateRange] = useState<DateRange>(workspace.dateRange)
  const [categoryId, setCategoryId] = useState<string>('')
  const [subcategoryId, setSubcategoryId] = useState<string>('')
  const [productId, setProductId] = useState<string>('')
  const [filtersOpen, setFiltersOpen] = useState(true)

  const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [trendData, setTrendData] = useState<TrendPoint[] | CategoryTrendPoint[] | SubcategoryTrendPoint[]>([])
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [productBreakdown, setProductBreakdown] = useState<ProductPeriodData[]>([])
  const [exportingPDF, setExportingPDF] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  // Drill-down state
  const [allSalesLines, setAllSalesLines] = useState<SalesLine[]>([])
  const [drillDownLines, setDrillDownLines] = useState<SalesLine[]>([])
  const [drillDownTitle, setDrillDownTitle] = useState('')
  const [isDrillDownOpen, setIsDrillDownOpen] = useState(false)

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
            { start: dateRange.start, end: dateRange.end }
          )
        } else {
          const categoryTrends = await fetchCategoryTrends(workspace, {
            start: dateRange.start,
            end: dateRange.end,
          })
          data = categoryId ? categoryTrends.filter((t) => t.menuGroup === categoryId) : categoryTrends
        }

        setTrendData(data)

        // Calculate metrics
        if (data.length > 0) {
          const sortedData = [...data].sort((a, b) => a.periodKey.localeCompare(b.periodKey))

          // Aggregate by period for metrics
          const periodTotals = new Map<string, { amount: number; quantity: number; label: string }>()
          sortedData.forEach(item => {
            const existing = periodTotals.get(item.periodKey) ?? { amount: 0, quantity: 0, label: item.label }
            existing.amount += item.amount
            existing.quantity += item.quantity
            periodTotals.set(item.periodKey, existing)
          })

          const sortedPeriods = Array.from(periodTotals.entries()).sort(([a], [b]) => a.localeCompare(b))

          const firstPeriod = sortedPeriods[0]
          const lastPeriod = sortedPeriods[sortedPeriods.length - 1]

          const totalAmount = sortedPeriods.reduce((sum, [, p]) => sum + p.amount, 0)
          const totalQuantity = sortedPeriods.reduce((sum, [, p]) => sum + p.quantity, 0)
          const averagePrice = totalQuantity > 0 ? totalAmount / totalQuantity : 0

          const amountChangePercent = firstPeriod[1].amount > 0
            ? ((lastPeriod[1].amount - firstPeriod[1].amount) / firstPeriod[1].amount) * 100
            : 0
          const quantityChangePercent = firstPeriod[1].quantity > 0
            ? ((lastPeriod[1].quantity - firstPeriod[1].quantity) / firstPeriod[1].quantity) * 100
            : 0

          let trendDirection: 'up' | 'down' | 'stable' = 'stable'
          if (amountChangePercent > 5) trendDirection = 'up'
          else if (amountChangePercent < -5) trendDirection = 'down'

          setMetrics({
            totalAmount,
            totalQuantity,
            averagePrice,
            firstPeriodAmount: firstPeriod[1].amount,
            firstPeriodQuantity: firstPeriod[1].quantity,
            firstPeriodLabel: firstPeriod[1].label,
            lastPeriodAmount: lastPeriod[1].amount,
            lastPeriodQuantity: lastPeriod[1].quantity,
            lastPeriodLabel: lastPeriod[1].label,
            amountChangePercent,
            quantityChangePercent,
            trendDirection,
            periodsCount: sortedPeriods.length,
          })
        } else {
          setMetrics(null)
        }

        // Fetch product breakdown if viewing a category or subcategory
        if ((reportType === 'category' && categoryId) || (reportType === 'subcategory' && subcategoryId)) {
          const salesLines = await fetchSalesLines(workspace, {
            dateRange: { start: dateRange.start, end: dateRange.end },
          })
          setAllSalesLines(salesLines)

          let filteredLines = salesLines
          if (reportType === 'category') {
            filteredLines = salesLines.filter((line) => line.menuGroupAtSale === categoryId)
          } else if (reportType === 'subcategory') {
            filteredLines = salesLines.filter((line) => line.menuSubGroupAtSale === subcategoryId)
          }

          // Aggregate by product and period
          const productPeriodMap = new Map<string, Map<string, { quantity: number; amount: number }>>()

          filteredLines.forEach((line) => {
            if (!productPeriodMap.has(line.productId)) {
              productPeriodMap.set(line.productId, new Map())
            }
            const periodMap = productPeriodMap.get(line.productId)!
            const existing = periodMap.get(line.periodKey) ?? { quantity: 0, amount: 0 }
            existing.quantity += line.quantity
            existing.amount += line.amount
            periodMap.set(line.periodKey, existing)
          })

          const allPeriodKeys = new Set<string>()
          productPeriodMap.forEach((periodMap) => {
            periodMap.forEach((_, periodKey) => allPeriodKeys.add(periodKey))
          })
          const sortedPeriodKeys = Array.from(allPeriodKeys).sort()

          const breakdown: ProductPeriodData[] = []
          productPeriodMap.forEach((periodMap, pid) => {
            const product = products.find((p) => p.id === pid)
            const productName = product?.name || filteredLines.find((l) => l.productId === pid)?.productNameAtSale || pid

            let totalAmount = 0
            let totalQuantity = 0

            const periods = sortedPeriodKeys.map((periodKey, index) => {
              const data = periodMap.get(periodKey) ?? { quantity: 0, amount: 0 }
              totalAmount += data.amount
              totalQuantity += data.quantity

              const [year, month] = periodKey.split('-').map(Number)
              const date = new Date(year, (month ?? 1) - 1)
              const label = !isNaN(date.getTime()) ? format(date, 'MMM yyyy') : periodKey

              let quantityChange: number | undefined
              let amountChange: number | undefined
              if (index > 0) {
                const prevData = periodMap.get(sortedPeriodKeys[index - 1]) ?? { quantity: 0, amount: 0 }
                if (prevData.quantity > 0) quantityChange = ((data.quantity - prevData.quantity) / prevData.quantity) * 100
                if (prevData.amount > 0) amountChange = ((data.amount - prevData.amount) / prevData.amount) * 100
              }

              return { periodKey, label, quantity: data.quantity, amount: data.amount, quantityChange, amountChange }
            })

            breakdown.push({ productId: pid, productName, totalAmount, totalQuantity, periods })
          })

          breakdown.sort((a, b) => b.totalAmount - a.totalAmount)
          setProductBreakdown(breakdown)
        } else {
          setProductBreakdown([])
        }
      } catch (error) {
        console.error('[PerformanceReportPage] Error fetching trend data:', error)
        setTrendData([])
        setMetrics(null)
        setProductBreakdown([])
        setAllSalesLines([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [workspace, reportType, dateRange, categoryId, subcategoryId, productId, products])

  // Quarter comparison data
  type QuarterRow = {
    key: string
    label: string
    qNum: number // 1-4
    year: number
    amount: number
    quantity: number
    avgPrice: number
    // Sequential QoQ (vs previous quarter)
    seqAmountChange?: number
    seqQuantityChange?: number
    // Year-over-Year same quarter (e.g. Q1 2026 vs Q1 2025)
    yoyAmountChange?: number
    yoyQuantityChange?: number
    yoyLabel?: string // e.g. "vs Q1 2025"
  }

  const quarterComparison = useMemo(() => {
    if (trendData.length === 0) return null

    // Group periods into quarters
    const quarterMap = new Map<string, { amount: number; quantity: number }>()
    const sortedData = [...trendData].sort((a, b) => a.periodKey.localeCompare(b.periodKey))

    sortedData.forEach(item => {
      const [yearStr, monthStr] = item.periodKey.split('-')
      const year = parseInt(yearStr)
      const month = parseInt(monthStr)
      const q = Math.ceil(month / 3)
      const qKey = `${year}-Q${q}`
      const existing = quarterMap.get(qKey) ?? { amount: 0, quantity: 0 }
      existing.amount += item.amount
      existing.quantity += item.quantity
      quarterMap.set(qKey, existing)
    })

    const quarters = Array.from(quarterMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => {
        const [yearStr, qStr] = key.split('-')
        const year = parseInt(yearStr)
        const qNum = parseInt(qStr.replace('Q', ''))
        return {
          key,
          label: `Q${qNum} ${year}`,
          qNum,
          year,
          amount: data.amount,
          quantity: data.quantity,
          avgPrice: data.quantity > 0 ? data.amount / data.quantity : 0,
        }
      })

    if (quarters.length < 2) return null

    // Build lookup for YoY: same quarter previous year
    const qLookup = new Map(quarters.map(q => [q.key, q]))

    const rows: QuarterRow[] = quarters.map((q, i) => {
      // Sequential QoQ
      let seqAmountChange: number | undefined
      let seqQuantityChange: number | undefined
      if (i > 0) {
        const prev = quarters[i - 1]
        if (prev.amount > 0) seqAmountChange = ((q.amount - prev.amount) / prev.amount) * 100
        if (prev.quantity > 0) seqQuantityChange = ((q.quantity - prev.quantity) / prev.quantity) * 100
      }

      // YoY same quarter
      let yoyAmountChange: number | undefined
      let yoyQuantityChange: number | undefined
      let yoyLabel: string | undefined
      const sameQLastYear = qLookup.get(`${q.year - 1}-Q${q.qNum}`)
      if (sameQLastYear) {
        yoyLabel = `vs Q${q.qNum} ${q.year - 1}`
        if (sameQLastYear.amount > 0) yoyAmountChange = ((q.amount - sameQLastYear.amount) / sameQLastYear.amount) * 100
        if (sameQLastYear.quantity > 0) yoyQuantityChange = ((q.quantity - sameQLastYear.quantity) / sameQLastYear.quantity) * 100
      }

      return { ...q, seqAmountChange, seqQuantityChange, yoyAmountChange, yoyQuantityChange, yoyLabel }
    })

    return rows
  }, [trendData])

  const availableSubcategories = useMemo(() => {
    if (!categoryId) return []
    return menuGroups.find((g) => g.id === categoryId)?.subGroups || []
  }, [categoryId, menuGroups])

  const availableProducts = useMemo(() => {
    let filtered = products
    if (categoryId) filtered = filtered.filter((p) => p.menuGroupId === categoryId)
    if (subcategoryId) filtered = filtered.filter((p) => p.menuSubGroupId === subcategoryId)
    return filtered
  }, [products, categoryId, subcategoryId])

  // Prepare chart data
  const chartData = useMemo(() => {
    if (trendData.length === 0) return []
    const sortedData = [...trendData].sort((a, b) => a.periodKey.localeCompare(b.periodKey))

    if (reportType === 'category') {
      const categoryTrends = sortedData as CategoryTrendPoint[]
      const periodMap = new Map<string, Record<string, unknown>>()
      categoryTrends.forEach((entry) => {
        if (!periodMap.has(entry.periodKey)) {
          periodMap.set(entry.periodKey, { label: entry.label, periodKey: entry.periodKey })
        }
        periodMap.get(entry.periodKey)![entry.menuGroup] = entry.amount
      })
      return Array.from(periodMap.values()).sort((a, b) => ((a.periodKey as string) || '').localeCompare((b.periodKey as string) || ''))
    } else if (reportType === 'subcategory') {
      const subcategoryTrends = sortedData as SubcategoryTrendPoint[]
      const periodMap = new Map<string, Record<string, unknown>>()
      subcategoryTrends.forEach((entry) => {
        const key = `${entry.menuGroup}_${entry.menuSubGroup}`
        if (!periodMap.has(entry.periodKey)) {
          periodMap.set(entry.periodKey, { label: entry.label, periodKey: entry.periodKey })
        }
        periodMap.get(entry.periodKey)![key] = entry.amount
      })
      return Array.from(periodMap.values()).sort((a, b) => ((a.periodKey as string) || '').localeCompare((b.periodKey as string) || ''))
    } else {
      return (sortedData as TrendPoint[]).map((point) => ({
        label: point.label, periodKey: point.periodKey, amount: point.amount, quantity: point.quantity,
      }))
    }
  }, [trendData, reportType])

  const chartSeries = useMemo(() => {
    if (reportType === 'product') {
      return [
        { dataKey: 'amount', label: 'Revenue', color: '#2563eb', yAxisId: 'left' as const },
        { dataKey: 'quantity', label: 'Quantity', color: '#7c3aed', yAxisId: 'right' as const },
      ]
    } else if (reportType === 'category') {
      const categoryTrends = trendData as CategoryTrendPoint[]
      const uniqueCategories = Array.from(new Set(categoryTrends.map((t) => t.menuGroup)))
      const colors = ['#2563eb', '#7c3aed', '#16a34a', '#f97316', '#dc2626', '#8b5cf6', '#0891b2', '#db2777']
      return uniqueCategories.map((catId, index) => ({
        dataKey: catId,
        label: menuGroups.find((g) => g.id === catId)?.label || catId,
        color: colors[index % colors.length],
      }))
    } else {
      const subcategoryTrends = trendData as SubcategoryTrendPoint[]
      const uniqueSubcategories = Array.from(new Set(subcategoryTrends.map((t) => `${t.menuGroup}_${t.menuSubGroup}`)))
      const colors = ['#2563eb', '#7c3aed', '#16a34a', '#f97316', '#dc2626', '#8b5cf6']
      return uniqueSubcategories.map((key, index) => {
        const [menuGroupId, menuSubGroupId] = key.split('_')
        const category = menuGroups.find((g) => g.id === menuGroupId)
        const subcategory = category?.subGroups.find((sg) => sg.id === menuSubGroupId)
        return { dataKey: key, label: subcategory?.label || menuSubGroupId, color: colors[index % colors.length] }
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
    if (reportType === 'product' && productId) return products.find((p) => p.id === productId)?.name || 'Selected Product'
    if (reportType === 'subcategory' && subcategoryId) {
      const category = menuGroups.find((g) => g.id === categoryId)
      return category?.subGroups.find((sg) => sg.id === subcategoryId)?.label || 'Selected Subcategory'
    }
    if (reportType === 'category' && categoryId) return menuGroups.find((g) => g.id === categoryId)?.label || 'Selected Category'
    return 'All Categories'
  }

  // Generate smart insights based on metrics
  const insights = useMemo(() => {
    if (!metrics) return []
    const result: Array<{ text: string; type: 'positive' | 'negative' | 'neutral' }> = []

    if (metrics.amountChangePercent > 10) {
      result.push({ text: `Revenue grew ${formatPercent(metrics.amountChangePercent)} from ${metrics.firstPeriodLabel} to ${metrics.lastPeriodLabel}. Strong upward momentum.`, type: 'positive' })
    } else if (metrics.amountChangePercent < -10) {
      result.push({ text: `Revenue declined ${Math.abs(metrics.amountChangePercent).toFixed(1)}% from ${metrics.firstPeriodLabel} to ${metrics.lastPeriodLabel}. Investigate root causes.`, type: 'negative' })
    } else {
      result.push({ text: `Revenue remained stable between ${metrics.firstPeriodLabel} and ${metrics.lastPeriodLabel}.`, type: 'neutral' })
    }

    // Price vs Volume insight
    if (metrics.quantityChangePercent < -5 && metrics.amountChangePercent > 0) {
      result.push({ text: 'Volume is declining but revenue is up — likely driven by price increases. Monitor customer retention.', type: 'neutral' })
    } else if (metrics.quantityChangePercent > 5 && metrics.amountChangePercent < 0) {
      result.push({ text: 'Volume is growing but revenue is down — possible heavy discounting or mix shift to cheaper items.', type: 'negative' })
    }

    if (metrics.periodsCount <= 2) {
      result.push({ text: `Only ${metrics.periodsCount} period(s) of data. Upload more reports for meaningful trend analysis.`, type: 'neutral' })
    }

    return result
  }, [metrics])

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
    } finally {
      setExportingPDF(false)
    }
  }

  const handleCellClick = (pid: string, periodKey: string, productName: string, periodLabel: string) => {
    const lines = allSalesLines.filter((line) => line.productId === pid && line.periodKey === periodKey)
    if (lines.length > 0) {
      setDrillDownLines(lines)
      setDrillDownTitle(`${productName} — ${periodLabel}`)
      setIsDrillDownOpen(true)
    }
  }

  if (loading && !metrics) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <p className="text-sm text-slate-500">Loading performance data...</p>
        </div>
      </div>
    )
  }

  return (
    <section className="space-y-6 overflow-hidden">
      {/* Header */}
      <div className="page-header">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1>Performance Report</h1>
            <p>
              Analyze trends over time with period-over-period comparisons
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
              <Activity className="h-3.5 w-3.5" />
              <span>
                {dateRange.start instanceof Date && !isNaN(dateRange.start.getTime()) ? format(dateRange.start, 'd MMM yyyy') : '—'}
                {' — '}
                {dateRange.end instanceof Date && !isNaN(dateRange.end.getTime()) ? format(dateRange.end, 'd MMM yyyy') : '—'}
              </span>
              <span className="mx-1">|</span>
              <span>{reportType === 'category' ? 'Category' : reportType === 'subcategory' ? 'Subcategory' : 'Product'}: {getSelectedLabel()}</span>
            </div>
          </div>
          {metrics && (
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={exportingPDF}
              className="btn-secondary disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exportingPDF ? 'Exporting...' : 'Export PDF'}
            </button>
          )}
        </div>
      </div>

      {/* Filters - Collapsible */}
      <div className="app-card overflow-hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex w-full items-center justify-between px-6 py-4 text-left"
        >
          <h2 className="text-base font-semibold text-slate-900">Filters</h2>
          {filtersOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {filtersOpen && (
          <div className="border-t border-slate-100 px-6 pb-6 pt-4 space-y-4">
            {/* Report Type */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Report Type</label>
              <div className="flex gap-2">
                {(['category', 'subcategory', 'product'] as ReportType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleReportTypeChange(type)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${reportType === type
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Horizontal filter row */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date Range</label>
                <DateRangePicker value={dateRange} onChange={setDateRange} />
              </div>

              {reportType !== 'product' && (
                <Select
                  label="Category"
                  value={categoryId}
                  onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId('') }}
                  options={[
                    { label: 'All Categories', value: '' },
                    ...menuGroups.map((g) => ({ label: g.label, value: g.id })),
                  ]}
                />
              )}

              {reportType === 'subcategory' && (
                <Select
                  label="Subcategory"
                  value={subcategoryId}
                  onChange={(e) => setSubcategoryId(e.target.value)}
                  options={[
                    { label: 'All Subcategories', value: '' },
                    ...availableSubcategories.map((sub) => ({ label: sub.label, value: sub.id })),
                  ]}
                  disabled={!categoryId || availableSubcategories.length === 0}
                />
              )}

              {reportType === 'product' && (
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Product</label>
                  <SearchableSelect
                    value={productId}
                    onChange={setProductId}
                    options={availableProducts.map((p) => ({ label: p.name, value: p.id }))}
                    placeholder="Select a product..."
                    searchPlaceholder="Search products..."
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      {metrics && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-5 transition-colors duration-150 hover:border-gray-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Revenue</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(workspace.currency, metrics.totalAmount)}</p>
                  <p className="mt-1 text-xs text-slate-500">{metrics.totalQuantity.toLocaleString()} items across {metrics.periodsCount} periods</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  <DollarSign className="h-6 w-6" />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-5 transition-colors duration-150 hover:border-gray-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg. Price</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(workspace.currency, metrics.averagePrice)}</p>
                  <p className="mt-1 text-xs text-slate-500">per item sold</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  <BarChart3 className="h-6 w-6" />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-5 transition-colors duration-150 hover:border-gray-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revenue Change</p>
                  <div className="mt-2 flex items-center gap-2">
                    <p className={`text-2xl font-bold ${metrics.amountChangePercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatPercent(metrics.amountChangePercent)}
                    </p>
                    {metrics.trendDirection === 'up' && <TrendingUp className="h-5 w-5 text-emerald-600" />}
                    {metrics.trendDirection === 'down' && <TrendingDown className="h-5 w-5 text-red-600" />}
                    {metrics.trendDirection === 'stable' && <Minus className="h-5 w-5 text-slate-400" />}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{metrics.firstPeriodLabel} vs {metrics.lastPeriodLabel}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  <Activity className="h-6 w-6" />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-5 transition-colors duration-150 hover:border-gray-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Volume Change</p>
                  <div className="mt-2 flex items-center gap-2">
                    <p className={`text-2xl font-bold ${metrics.quantityChangePercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatPercent(metrics.quantityChangePercent)}
                    </p>
                    {metrics.quantityChangePercent >= 0 ? <TrendingUp className="h-5 w-5 text-emerald-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{metrics.firstPeriodLabel} vs {metrics.lastPeriodLabel}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  <Package className="h-6 w-6" />
                </div>
              </div>
            </div>
          </div>

          {/* Insights */}
          {insights.length > 0 && (
            <div className="app-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-900">Insights</h3>
              </div>
              <div className="space-y-2">
                {insights.map((insight, i) => (
                  <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                    insight.type === 'positive' ? 'bg-emerald-50 text-emerald-800' :
                    insight.type === 'negative' ? 'bg-red-50 text-red-800' :
                    'bg-slate-50 text-slate-700'
                  }`}>
                    <span className="mt-0.5">{insight.type === 'positive' ? '↑' : insight.type === 'negative' ? '↓' : '→'}</span>
                    <span>{insight.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Period Comparison */}
          <div className="app-card p-6">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Period Comparison</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{metrics.firstPeriodLabel}</p>
                <p className="text-xl font-bold text-slate-900">{formatCurrency(workspace.currency, metrics.firstPeriodAmount)}</p>
                <p className="text-sm text-slate-600">{metrics.firstPeriodQuantity.toLocaleString()} units</p>
              </div>
              <div className="flex items-center justify-center">
                <div className="flex flex-col items-center gap-1">
                  <ArrowRight className="h-5 w-5 text-slate-400" />
                  <span className={`text-sm font-bold ${metrics.amountChangePercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatPercent(metrics.amountChangePercent)}
                  </span>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{metrics.lastPeriodLabel}</p>
                <p className="text-xl font-bold text-slate-900">{formatCurrency(workspace.currency, metrics.lastPeriodAmount)}</p>
                <p className="text-sm text-slate-600">{metrics.lastPeriodQuantity.toLocaleString()} units</p>
              </div>
            </div>
          </div>

          {/* Quarter Comparison */}
          {quarterComparison && quarterComparison.length >= 2 && (
            <div className="app-card p-6">
              <h3 className="mb-1 text-base font-semibold text-gray-900">Quarterly Performance</h3>
              <p className="mb-4 text-sm text-gray-500">
                {reportType === 'category' ? 'Category' : reportType === 'subcategory' ? 'Subcategory' : 'Product'}: {getSelectedLabel()}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Quarter</th>
                      <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Revenue</th>
                      <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Volume</th>
                      <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Avg. Price</th>
                      <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        <div>Sequential</div>
                        <div className="font-normal normal-case tracking-normal text-[10px] text-gray-300">vs prev quarter</div>
                      </th>
                      <th className="py-2 pl-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        <div>Year-over-Year</div>
                        <div className="font-normal normal-case tracking-normal text-[10px] text-gray-300">vs same quarter</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {quarterComparison.map((q) => (
                      <tr key={q.key} className="hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 pr-4 font-medium text-gray-900">{q.label}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-gray-900">{formatCurrency(workspace.currency, q.amount)}</td>
                        <td className="py-2.5 px-3 text-right text-gray-600">{q.quantity.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-gray-600">{formatCurrency(workspace.currency, q.avgPrice)}</td>
                        {/* Sequential QoQ */}
                        <td className="py-2.5 px-3 text-right">
                          {q.seqAmountChange !== undefined ? (
                            <div>
                              <span className={`font-medium ${q.seqAmountChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatPercent(q.seqAmountChange)}
                              </span>
                              {q.seqQuantityChange !== undefined && (
                                <div className={`text-[10px] ${q.seqQuantityChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                  vol {formatPercent(q.seqQuantityChange)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        {/* YoY same quarter */}
                        <td className="py-2.5 pl-3 text-right">
                          {q.yoyAmountChange !== undefined ? (
                            <div>
                              <span className={`font-medium ${q.yoyAmountChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatPercent(q.yoyAmountChange)}
                              </span>
                              {q.yoyQuantityChange !== undefined && (
                                <div className={`text-[10px] ${q.yoyQuantityChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                  vol {formatPercent(q.yoyQuantityChange)}
                                </div>
                              )}
                              {q.yoyLabel && (
                                <div className="text-[10px] text-gray-400">{q.yoyLabel}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-[10px]">no prior year</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Trend Chart */}
          {chartData.length > 0 && chartSeries.length > 0 && (
            <div className="app-card p-6">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-slate-900">Performance Trend: {getSelectedLabel()}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {dateRange.start instanceof Date && !isNaN(dateRange.start.getTime()) ? format(dateRange.start, 'MMM d, yyyy') : '—'}
                  {' – '}
                  {dateRange.end instanceof Date && !isNaN(dateRange.end.getTime()) ? format(dateRange.end, 'MMM d, yyyy') : '—'}
                </p>
              </div>
              <div ref={chartRef} className="h-96">
                <LineChart
                  data={chartData}
                  xKey="label"
                  series={chartSeries}
                  height={384}
                  dualAxis={reportType === 'product'}
                  formatter={(value: number) => formatCurrency(workspace.currency, value)}
                />
              </div>
            </div>
          )}

          {/* Product Breakdown Table */}
          {((reportType === 'category' && categoryId) || (reportType === 'subcategory' && subcategoryId)) && productBreakdown.length > 0 && (
            <div className="app-card p-6">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-slate-900">Product Performance Breakdown</h3>
                <p className="mt-1 text-sm text-slate-500">Click any cell to view transaction details</p>
              </div>
              <div className="max-h-[600px] overflow-auto rounded-lg border border-slate-200">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-30 bg-slate-50 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
                    <tr>
                      <th className="sticky left-0 top-0 z-40 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 after:absolute after:bottom-0 after:right-0 after:top-0 after:w-px after:bg-slate-200 after:content-['']">
                        Product
                      </th>
                      {productBreakdown[0]?.periods.map((period) => (
                        <th key={period.periodKey} className="min-w-[140px] px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
                          {period.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {productBreakdown.map((product) => (
                      <tr key={product.productId} className="hover:bg-slate-50/80">
                        <td className="sticky left-0 z-20 bg-white px-4 py-3 font-semibold text-slate-900 after:absolute after:bottom-0 after:right-0 after:top-0 after:w-px after:bg-slate-200 after:content-['']">
                          <div>
                            <div>{product.productName}</div>
                            <div className="text-[10px] font-normal text-slate-400">Total: {formatCurrency(workspace.currency, product.totalAmount)}</div>
                          </div>
                        </td>
                        {product.periods.map((period, idx) => (
                          <td
                            key={period.periodKey}
                            className="px-3 py-3 text-center cursor-pointer transition hover:bg-blue-50"
                            onClick={() => handleCellClick(product.productId, period.periodKey, product.productName, period.label)}
                            title="Click to view details"
                          >
                            <div className="space-y-1">
                              <div className="font-semibold text-slate-900">{formatCurrency(workspace.currency, period.amount)}</div>
                              <div className="text-xs text-slate-500">{period.quantity.toLocaleString()} units</div>
                              {idx > 0 && period.amountChange !== undefined && (
                                <div className="flex items-center justify-center gap-1">
                                  {period.amountChange >= 0 ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-red-600" />}
                                  <span className={`text-[11px] font-medium ${period.amountChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {formatPercent(period.amountChange)}
                                  </span>
                                </div>
                              )}
                              {idx === 0 && <div className="text-xs text-slate-300">—</div>}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {chartData.length === 0 && (
            <div className="app-card p-12 text-center">
              <BarChart3 className="mx-auto h-10 w-10 text-slate-300 mb-3" />
              <p className="text-lg font-semibold text-slate-900">No data found</p>
              <p className="mt-1 text-sm text-slate-500">Try adjusting your filters or expanding the date range</p>
            </div>
          )}
        </>
      )}

      <SalesLinesModal
        isOpen={isDrillDownOpen}
        onClose={() => setIsDrillDownOpen(false)}
        title={drillDownTitle}
        salesLines={drillDownLines}
      />
    </section>
  )
}
