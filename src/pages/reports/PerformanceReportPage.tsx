import { useEffect, useMemo, useState, useRef } from 'react'
import { format } from 'date-fns'
import { LineChart } from '../../components/charts/LineChart'
import { Select } from '../../components/forms/Select'
import { MultiSearchableSelect } from '../../components/forms/MultiSearchableSelect'
import { DateRangePopover } from '../../components/forms/DateRangePopover'
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
import { useWorkspace } from '../../context/WorkspaceContext'
import type { MenuGroup, Product, TrendPoint } from '../../lib/types'
import { TrendingUp, TrendingDown, Minus, Download, DollarSign, BarChart3, Activity, Package, ArrowRight, Lightbulb, ChevronDown, CalendarDays, FileSpreadsheet } from 'lucide-react'
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
  // Rolling average comparison (first 3 months avg vs last 3 months avg)
  rollingAmountChange?: number
  rollingQuantityChange?: number
  rollingFirstLabel?: string
  rollingLastLabel?: string
  hasYoYData: boolean
  // Price decomposition
  firstPeriodAvgPrice: number
  lastPeriodAvgPrice: number
  priceChangePercent: number
  // Revenue decomposition: how much of revenue change is from price vs volume
  priceEffect?: number   // % of revenue change attributable to price
  volumeEffect?: number  // % of revenue change attributable to volume
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
  const dateRange = workspace.dateRange
  const setDateRange = workspace.setDateRange
  const [categoryId, setCategoryId] = useState<string>('') // single — used by the Subcategory tab
  const [categoryIds, setCategoryIds] = useState<string[]>([]) // multi — used by the Category tab
  const [subcategoryId, setSubcategoryId] = useState<string>('')
  const [productIds, setProductIds] = useState<string[]>([])
  const [expandedQuarter, setExpandedQuarter] = useState<string | null>(null)

  const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [trendData, setTrendData] = useState<TrendPoint[] | CategoryTrendPoint[] | SubcategoryTrendPoint[]>([])
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [productBreakdown, setProductBreakdown] = useState<ProductPeriodData[]>([])
  const [exportingPDF, setExportingPDF] = useState(false)
  const [exportingCSV, setExportingCSV] = useState(false)
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

        if (reportType === 'product' && productIds.length > 0) {
          data = await fetchProductTrends(workspace, productIds, {
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
          data = categoryIds.length > 0
            ? categoryTrends.filter((t) => categoryIds.includes(t.menuGroup))
            : categoryTrends
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

          // Rolling average: first 3 months avg vs last 3 months avg (more reliable than single month)
          const n = sortedPeriods.length
          const windowSize = Math.min(3, Math.floor(n / 2)) // at least 2 periods needed
          let rollingAmountChange: number | undefined
          let rollingQuantityChange: number | undefined
          let rollingFirstLabel: string | undefined
          let rollingLastLabel: string | undefined

          if (n >= 4 && windowSize >= 2) {
            const firstWindow = sortedPeriods.slice(0, windowSize)
            const lastWindow = sortedPeriods.slice(n - windowSize)
            const firstAvgAmt = firstWindow.reduce((s, [, p]) => s + p.amount, 0) / windowSize
            const lastAvgAmt = lastWindow.reduce((s, [, p]) => s + p.amount, 0) / windowSize
            const firstAvgQty = firstWindow.reduce((s, [, p]) => s + p.quantity, 0) / windowSize
            const lastAvgQty = lastWindow.reduce((s, [, p]) => s + p.quantity, 0) / windowSize

            if (firstAvgAmt > 0) rollingAmountChange = ((lastAvgAmt - firstAvgAmt) / firstAvgAmt) * 100
            if (firstAvgQty > 0) rollingQuantityChange = ((lastAvgQty - firstAvgQty) / firstAvgQty) * 100
            rollingFirstLabel = `${firstWindow[0][1].label}–${firstWindow[windowSize - 1][1].label}`
            rollingLastLabel = `${lastWindow[0][1].label}–${lastWindow[windowSize - 1][1].label}`
          }

          // Use rolling average for trend direction (more reliable)
          const trendBasis = rollingAmountChange ?? amountChangePercent
          let trendDirection: 'up' | 'down' | 'stable' = 'stable'
          if (trendBasis > 5) trendDirection = 'up'
          else if (trendBasis < -5) trendDirection = 'down'

          // Check if YoY data exists in quarter comparison
          const hasYoYData = n >= 13

          // Price decomposition
          const firstAvgPrice = firstPeriod[1].quantity > 0 ? firstPeriod[1].amount / firstPeriod[1].quantity : 0
          const lastAvgPrice = lastPeriod[1].quantity > 0 ? lastPeriod[1].amount / lastPeriod[1].quantity : 0
          const priceChangePercent = firstAvgPrice > 0
            ? ((lastAvgPrice - firstAvgPrice) / firstAvgPrice) * 100
            : 0

          // Revenue change decomposition (Laspeyres-style):
          // Revenue = Price × Quantity
          // ΔRevenue = (ΔPrice × Q_base) + (ΔQuantity × P_base) + (ΔPrice × ΔQuantity)
          // Simplified: priceEffect ≈ priceChange%, volumeEffect ≈ quantityChange%
          // The interaction term goes to volume (convention)
          let priceEffect: number | undefined
          let volumeEffect: number | undefined
          if (firstPeriod[1].amount > 0 && firstPeriod[1].quantity > 0) {
            const baseQty = firstPeriod[1].quantity
            const basePrice = firstAvgPrice
            const priceDelta = lastAvgPrice - firstAvgPrice
            const qtyDelta = lastPeriod[1].quantity - baseQty
            const totalDelta = lastPeriod[1].amount - firstPeriod[1].amount

            if (Math.abs(totalDelta) > 0) {
              // Price effect: what if only price changed, volume stayed same
              const priceImpact = priceDelta * baseQty
              // Volume effect: what if only volume changed, price stayed same + interaction
              const volumeImpact = qtyDelta * basePrice + priceDelta * qtyDelta

              priceEffect = (priceImpact / firstPeriod[1].amount) * 100
              volumeEffect = (volumeImpact / firstPeriod[1].amount) * 100
            }
          }

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
            rollingAmountChange,
            rollingQuantityChange,
            rollingFirstLabel,
            rollingLastLabel,
            hasYoYData,
            firstPeriodAvgPrice: firstAvgPrice,
            lastPeriodAvgPrice: lastAvgPrice,
            priceChangePercent,
            priceEffect,
            volumeEffect,
          })
        } else {
          setMetrics(null)
        }

        // Fetch product breakdown if viewing a category or subcategory
        if ((reportType === 'category' && categoryIds.length > 0) || (reportType === 'subcategory' && subcategoryId)) {
          const salesLines = await fetchSalesLines(workspace, {
            dateRange: { start: dateRange.start, end: dateRange.end },
          })
          setAllSalesLines(salesLines)

          let filteredLines = salesLines
          if (reportType === 'category') {
            filteredLines = salesLines.filter((line) => categoryIds.includes(line.menuGroupAtSale))
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
  }, [workspace, reportType, dateRange, categoryId, categoryIds, subcategoryId, productIds, products])

  // Quarter comparison data
  type MonthDetail = { periodKey: string; label: string; amount: number; quantity: number; avgPrice: number }
  type QuarterRow = {
    key: string
    label: string
    qNum: number
    year: number
    amount: number
    quantity: number
    avgPrice: number
    seqAmountChange?: number
    seqQuantityChange?: number
    yoyAmountChange?: number
    yoyQuantityChange?: number
    yoyLabel?: string
    months: MonthDetail[]
  }

  const quarterComparison = useMemo(() => {
    if (trendData.length === 0) return null

    // Group periods into quarters + collect monthly details
    const quarterMap = new Map<string, { amount: number; quantity: number; months: Map<string, { amount: number; quantity: number }> }>()
    const sortedData = [...trendData].sort((a, b) => a.periodKey.localeCompare(b.periodKey))

    sortedData.forEach(item => {
      const [yearStr, monthStr] = item.periodKey.split('-')
      const year = parseInt(yearStr)
      const month = parseInt(monthStr)
      const q = Math.ceil(month / 3)
      const qKey = `${year}-Q${q}`
      const existing = quarterMap.get(qKey) ?? { amount: 0, quantity: 0, months: new Map() }
      existing.amount += item.amount
      existing.quantity += item.quantity
      // Monthly detail
      const monthData = existing.months.get(item.periodKey) ?? { amount: 0, quantity: 0 }
      monthData.amount += item.amount
      monthData.quantity += item.quantity
      existing.months.set(item.periodKey, monthData)
      quarterMap.set(qKey, existing)
    })

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    const quarters = Array.from(quarterMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => {
        const [yearStr, qStr] = key.split('-')
        const year = parseInt(yearStr)
        const qNum = parseInt(qStr.replace('Q', ''))
        const months: MonthDetail[] = Array.from(data.months.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([pk, md]) => {
            const mo = parseInt(pk.split('-')[1]) - 1
            return {
              periodKey: pk,
              label: `${monthNames[mo]} ${year}`,
              amount: md.amount,
              quantity: md.quantity,
              avgPrice: md.quantity > 0 ? md.amount / md.quantity : 0,
            }
          })
        return {
          key,
          label: `Q${qNum} ${year}`,
          qNum,
          year,
          amount: data.amount,
          quantity: data.quantity,
          avgPrice: data.quantity > 0 ? data.amount / data.quantity : 0,
          months,
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

  // Selection total per month (works for every report type) — used for CSV export.
  const monthlyRows = useMemo(() => {
    const map = new Map<string, { label: string; amount: number; quantity: number }>()
    trendData.forEach((t) => {
      const e = map.get(t.periodKey) ?? { label: t.label, amount: 0, quantity: 0 }
      e.amount += t.amount
      e.quantity += t.quantity
      map.set(t.periodKey, e)
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodKey, v]) => ({
        periodKey,
        label: v.label,
        amount: v.amount,
        quantity: v.quantity,
        avgPrice: v.quantity > 0 ? v.amount / v.quantity : 0,
      }))
  }, [trendData])

  const handleReportTypeChange = (type: ReportType) => {
    setReportType(type)
    setCategoryId('')
    setCategoryIds([])
    setSubcategoryId('')
    setProductIds([])
  }

  const getSelectedLabel = () => {
    if (reportType === 'product') {
      if (productIds.length === 0) return 'No products selected'
      if (productIds.length === 1) return products.find((p) => p.id === productIds[0])?.name || 'Selected Product'
      return `${productIds.length} products`
    }
    if (reportType === 'subcategory' && subcategoryId) {
      const category = menuGroups.find((g) => g.id === categoryId)
      return category?.subGroups.find((sg) => sg.id === subcategoryId)?.label || 'Selected Subcategory'
    }
    if (reportType === 'category') {
      if (categoryIds.length === 0) return 'All Categories'
      if (categoryIds.length === 1) return menuGroups.find((g) => g.id === categoryIds[0])?.label || 'Selected Category'
      return `${categoryIds.length} categories`
    }
    return 'All Categories'
  }

  // Generate smart insights based on metrics + quarter data
  const insights = useMemo(() => {
    if (!metrics) return []
    const result: Array<{ text: string; type: 'positive' | 'negative' | 'neutral' | 'warning' }> = []

    // 1. Primary trend — prefer rolling average over single-month comparison
    if (metrics.rollingAmountChange !== undefined && metrics.rollingFirstLabel && metrics.rollingLastLabel) {
      const rc = metrics.rollingAmountChange
      if (rc > 10) {
        result.push({ text: `Rolling average revenue grew ${formatPercent(rc)} (${metrics.rollingFirstLabel} avg → ${metrics.rollingLastLabel} avg). Consistent upward trend.`, type: 'positive' })
      } else if (rc < -10) {
        result.push({ text: `Rolling average revenue declined ${Math.abs(rc).toFixed(1)}% (${metrics.rollingFirstLabel} avg → ${metrics.rollingLastLabel} avg). Investigate root causes.`, type: 'negative' })
      } else {
        result.push({ text: `Rolling average revenue is stable (${formatPercent(rc)}) between ${metrics.rollingFirstLabel} and ${metrics.rollingLastLabel}.`, type: 'neutral' })
      }

      // Warn if single-month comparison diverges significantly from rolling
      const diff = Math.abs(metrics.amountChangePercent - rc)
      if (diff > 15) {
        result.push({ text: `Note: Single-month comparison (${metrics.firstPeriodLabel} vs ${metrics.lastPeriodLabel}) shows ${formatPercent(metrics.amountChangePercent)}, but this may be skewed by outlier months. The rolling average (${formatPercent(rc)}) is more reliable.`, type: 'warning' })
      }
    } else {
      // Fallback to single-month if not enough data for rolling
      if (metrics.amountChangePercent > 10) {
        result.push({ text: `Revenue grew ${formatPercent(metrics.amountChangePercent)} from ${metrics.firstPeriodLabel} to ${metrics.lastPeriodLabel}.`, type: 'positive' })
      } else if (metrics.amountChangePercent < -10) {
        result.push({ text: `Revenue declined ${Math.abs(metrics.amountChangePercent).toFixed(1)}% from ${metrics.firstPeriodLabel} to ${metrics.lastPeriodLabel}.`, type: 'negative' })
      } else {
        result.push({ text: `Revenue stable between ${metrics.firstPeriodLabel} and ${metrics.lastPeriodLabel}.`, type: 'neutral' })
      }
    }

    // 2. YoY insight from quarter data
    if (quarterComparison) {
      const yoyQuarters = quarterComparison.filter(q => q.yoyAmountChange !== undefined)
      if (yoyQuarters.length > 0) {
        const lastYoY = yoyQuarters[yoyQuarters.length - 1]
        const yoyChange = lastYoY.yoyAmountChange!
        if (yoyChange > 5) {
          result.push({ text: `Year-over-year: ${lastYoY.label} revenue is ${formatPercent(yoyChange)} above the same quarter last year. This confirms real growth beyond seasonality.`, type: 'positive' })
        } else if (yoyChange < -5) {
          result.push({ text: `Year-over-year: ${lastYoY.label} revenue is ${Math.abs(yoyChange).toFixed(1)}% below the same quarter last year. This suggests a structural decline, not just seasonal variation.`, type: 'negative' })
        }
      } else if (metrics.periodsCount >= 4) {
        result.push({ text: 'No year-over-year comparison available yet. Sequential quarter changes may reflect seasonality rather than real growth. At least 13 months of data needed for YoY.', type: 'warning' })
      }
    }

    // 3. Price-Volume Decomposition (most valuable insight)
    if (metrics.priceEffect !== undefined && metrics.volumeEffect !== undefined) {
      const pe = metrics.priceEffect
      const ve = metrics.volumeEffect
      const totalChange = metrics.amountChangePercent

      if (Math.abs(totalChange) > 3) {
        const pricePortion = Math.abs(totalChange) > 0 ? Math.abs(pe / totalChange) * 100 : 0
        const volumePortion = 100 - pricePortion

        if (totalChange > 0) {
          if (pe > 3 && ve > 3) {
            result.push({ text: `Revenue growth of ${formatPercent(totalChange)} is driven by both price (${formatPercent(pe)}) and volume (${formatPercent(ve)}). Healthy balanced growth.`, type: 'positive' })
          } else if (pe > 3 && ve <= 0) {
            result.push({ text: `Revenue grew ${formatPercent(totalChange)}, but this is ${pricePortion.toFixed(0)}% price-driven (${formatPercent(pe)}). Volume actually ${ve < -1 ? 'declined' : 'stagnated'} (${formatPercent(ve)}). Price increases may be pushing customers away.`, type: 'warning' })
          } else if (ve > 3 && pe <= 0) {
            result.push({ text: `Revenue grew ${formatPercent(totalChange)}, driven ${volumePortion.toFixed(0)}% by volume (${formatPercent(ve)}). However, avg price dropped (${formatPercent(pe)}) — check for excessive discounting or mix shift to cheaper items.`, type: 'neutral' })
          }
        } else {
          if (pe < -3 && ve < -3) {
            result.push({ text: `Revenue declined ${formatPercent(totalChange)} from both lower prices (${formatPercent(pe)}) and lower volume (${formatPercent(ve)}). Requires immediate attention.`, type: 'negative' })
          } else if (pe < -3 && ve >= 0) {
            result.push({ text: `Revenue declined ${formatPercent(totalChange)} despite stable volume. Price decreases (${formatPercent(pe)}) are eroding revenue. Review discount strategy.`, type: 'negative' })
          } else if (ve < -3 && pe >= 0) {
            result.push({ text: `Revenue declined ${formatPercent(totalChange)} due to volume drop (${formatPercent(ve)}) despite higher prices (${formatPercent(pe)}). Price increases may have reduced demand.`, type: 'warning' })
          }
        }
      }
    } else {
      // Fallback to simple price vs volume divergence
      const qtyBasis = metrics.rollingQuantityChange ?? metrics.quantityChangePercent
      const revBasis = metrics.rollingAmountChange ?? metrics.amountChangePercent
      if (qtyBasis < -5 && revBasis > 0) {
        result.push({ text: 'Volume is declining while revenue grows — likely driven by price increases. Monitor customer retention.', type: 'warning' })
      } else if (qtyBasis > 5 && revBasis < 0) {
        result.push({ text: 'Volume is growing but revenue is down — possible heavy discounting.', type: 'negative' })
      }
    }

    // 4. Avg price trend
    if (Math.abs(metrics.priceChangePercent) > 5) {
      const dir = metrics.priceChangePercent > 0 ? 'increased' : 'decreased'
      result.push({ text: `Average price ${dir} ${formatPercent(Math.abs(metrics.priceChangePercent))} (${formatCurrency(workspace.currency, metrics.firstPeriodAvgPrice)} → ${formatCurrency(workspace.currency, metrics.lastPeriodAvgPrice)}). ${metrics.priceChangePercent > 0 ? 'May reflect pricing adjustments or premium product shift.' : 'Possible discounting or mix shift to value items.'}`, type: metrics.priceChangePercent > 0 ? 'neutral' : 'warning' })
    }

    // 5. Data sufficiency warnings
    if (metrics.periodsCount <= 2) {
      result.push({ text: `Only ${metrics.periodsCount} period(s) of data available. Trends may not be statistically meaningful. Upload more reports for reliable analysis.`, type: 'warning' })
    }

    return result
  }, [metrics, quarterComparison])

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

  // CSV export reflecting the current filters: metadata + summary + monthly trend
  // (+ per-product breakdown when a category/subcategory is selected).
  const handleExportCSV = async () => {
    if (!metrics) return
    setExportingCSV(true)
    try {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const r2 = (n: number) => Math.round(n * 100) / 100
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`
    const rows: (string | number)[][] = []

    const rangeText = `${dateRange.start instanceof Date && !isNaN(dateRange.start.getTime()) ? format(dateRange.start, 'd MMM yyyy') : ''} - ${dateRange.end instanceof Date && !isNaN(dateRange.end.getTime()) ? format(dateRange.end, 'd MMM yyyy') : ''}`
    rows.push(['Performance Report'])
    rows.push(['Restaurant', workspace.workspaceName])
    rows.push(['View', reportType])
    rows.push(['Selection', getSelectedLabel()])
    rows.push(['Date range', rangeText])
    rows.push(['Currency', workspace.currency])
    rows.push([])

    rows.push(['Summary'])
    rows.push(['Total revenue', r2(metrics.totalAmount)])
    rows.push(['Total quantity', metrics.totalQuantity])
    rows.push(['Average price', r2(metrics.averagePrice)])
    rows.push(['Monthly avg revenue', r2(metrics.periodsCount > 0 ? metrics.totalAmount / metrics.periodsCount : 0)])
    rows.push(['Monthly avg quantity', metrics.periodsCount > 0 ? Math.round(metrics.totalQuantity / metrics.periodsCount) : 0])
    rows.push(['Revenue change %', r2(metrics.amountChangePercent)])
    rows.push(['Volume change %', r2(metrics.quantityChangePercent)])
    rows.push([])

    rows.push(['Monthly Trend'])
    rows.push(['Period', 'Revenue', 'Quantity', 'Avg Price'])
    monthlyRows.forEach((m) => rows.push([m.label, r2(m.amount), m.quantity, r2(m.avgPrice)]))

    if (productBreakdown.length > 0) {
      rows.push([])
      rows.push(['Product Breakdown'])
      const periods = productBreakdown[0].periods
      rows.push(['Product', 'Total Revenue', 'Total Quantity', ...periods.flatMap((p) => [`${p.label} Revenue`, `${p.label} Qty`])])
      productBreakdown.forEach((pb) =>
        rows.push([pb.productName, r2(pb.totalAmount), pb.totalQuantity, ...pb.periods.flatMap((p) => [r2(p.amount), p.quantity])]),
      )
    }

    // All products in the date range, grouped by category & subcategory
    const allLines = await fetchSalesLines(workspace, { dateRange: { start: dateRange.start, end: dateRange.end } })
    const gLabel = (id: string) => menuGroups.find((g) => g.id === id)?.label || id
    const sLabel = (gid: string, sid: string) => menuGroups.find((g) => g.id === gid)?.subGroups.find((s) => s.id === sid)?.label || sid || ''
    const prodAgg = new Map<string, { name: string; gid: string; sid: string; qty: number; amount: number }>()
    allLines.forEach((l) => {
      const e = prodAgg.get(l.productId) ?? { name: l.productNameAtSale, gid: l.menuGroupAtSale, sid: l.menuSubGroupAtSale || '', qty: 0, amount: 0 }
      e.qty += l.quantity
      e.amount += l.amount
      prodAgg.set(l.productId, e)
    })
    const allProducts = Array.from(prodAgg.values())
    const grand = allProducts.reduce((s, p) => s + p.amount, 0) || 1
    const catT = new Map<string, { qty: number; amount: number }>()
    const subT = new Map<string, { qty: number; amount: number }>()
    allProducts.forEach((p) => {
      const c = catT.get(p.gid) ?? { qty: 0, amount: 0 }
      c.qty += p.qty; c.amount += p.amount; catT.set(p.gid, c)
      const k = `${p.gid}||${p.sid}`
      const s = subT.get(k) ?? { qty: 0, amount: 0 }
      s.qty += p.qty; s.amount += p.amount; subT.set(k, s)
    })
    const orderedCats = Array.from(catT.entries()).sort((a, b) => b[1].amount - a[1].amount).map(([id]) => id)
    const catIdx = new Map(orderedCats.map((id, i) => [id, i] as const))
    const subAmt = (gid: string, sid: string) => subT.get(`${gid}||${sid}`)?.amount ?? 0

    rows.push([])
    rows.push(['Sales by Category (all products, in date range)'])
    rows.push(['Category', 'Subcategory', 'Quantity', 'Amount', '% of Total'])
    orderedCats.forEach((gid) => {
      const c = catT.get(gid)!
      rows.push([gLabel(gid), '', c.qty, r2(c.amount), pct(c.amount / grand)])
      Array.from(subT.entries())
        .filter(([k]) => k.startsWith(`${gid}||`) && k.slice(gid.length + 2) !== '')
        .sort((a, b) => b[1].amount - a[1].amount)
        .forEach(([k, v]) => rows.push([gLabel(gid), sLabel(gid, k.slice(gid.length + 2)), v.qty, r2(v.amount), pct(v.amount / grand)]))
    })

    rows.push([])
    rows.push(['All Products (totals, in date range)'])
    rows.push(['Category', 'Subcategory', 'Product', 'Quantity', 'Amount', 'Avg Price', '% of Total'])
    allProducts
      .slice()
      .sort((a, b) => {
        const ci = (catIdx.get(a.gid) ?? 999) - (catIdx.get(b.gid) ?? 999)
        if (ci !== 0) return ci
        const si = subAmt(b.gid, b.sid) - subAmt(a.gid, a.sid)
        if (si !== 0) return si
        return b.amount - a.amount
      })
      .forEach((p) => rows.push([gLabel(p.gid), sLabel(p.gid, p.sid), p.name, p.qty, r2(p.amount), r2(p.qty > 0 ? p.amount / p.qty : 0), pct(p.amount / grand)]))

    const csv = rows.map((row) => row.map(esc).join(',')).join('\r\n')
    // BOM so Excel reads UTF-8 (£, category names) correctly
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = (d: Date) => (d instanceof Date && !isNaN(d.getTime()) ? format(d, 'yyyyMMdd') : 'na')
    a.href = url
    a.download = `performance-${reportType}-${stamp(dateRange.start)}-${stamp(dateRange.end)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting CSV:', error)
    } finally {
      setExportingCSV(false)
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={exportingCSV}
                className="btn-secondary disabled:opacity-50"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {exportingCSV ? 'Exporting...' : 'Export CSV'}
              </button>
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={exportingPDF}
                className="btn-secondary disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {exportingPDF ? 'Exporting...' : 'Export PDF'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters — compact horizontal toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented control: Report Type */}
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            {(['category', 'subcategory', 'product'] as ReportType[]).map((type) => {
              const active = reportType === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleReportTypeChange(type)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              )
            })}
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-slate-200" aria-hidden />

          {/* Date Range */}
          <DateRangePopover value={dateRange} onChange={setDateRange} />

          {/* Divider — hidden when target row wraps */}
          {(reportType === 'category' || reportType === 'subcategory' || reportType === 'product') && (
            <div className="h-6 w-px bg-slate-200" aria-hidden />
          )}

          {/* Target selectors — adapt to report type */}
          {reportType === 'category' && (
            <div className="min-w-[260px] flex-1">
              <MultiSearchableSelect
                values={categoryIds}
                onChange={setCategoryIds}
                options={menuGroups.map((g) => ({ label: g.label, value: g.id }))}
                placeholder="All categories"
                searchPlaceholder="Search categories..."
                emptyText="No categories found"
              />
            </div>
          )}

          {reportType === 'subcategory' && (
            <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[300px]">
              <div className="min-w-[180px] flex-1">
                <Select
                  value={categoryId}
                  onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId('') }}
                  options={[
                    { label: 'All categories', value: '' },
                    ...menuGroups.map((g) => ({ label: g.label, value: g.id })),
                  ]}
                />
              </div>
              <div className="min-w-[180px] flex-1">
                <Select
                  value={subcategoryId}
                  onChange={(e) => setSubcategoryId(e.target.value)}
                  options={[
                    { label: 'All subcategories', value: '' },
                    ...availableSubcategories.map((sub) => ({ label: sub.label, value: sub.id })),
                  ]}
                  disabled={!categoryId || availableSubcategories.length === 0}
                />
              </div>
            </div>
          )}

          {reportType === 'product' && (
            <div className="min-w-[260px] flex-1">
              <MultiSearchableSelect
                values={productIds}
                onChange={setProductIds}
                options={availableProducts.map((p) => ({ label: p.name, value: p.id }))}
                placeholder="Select one or more products..."
                searchPlaceholder="Search products..."
                emptyText="No products found"
              />
            </div>
          )}

          {/* Clear button — visible only when something is set */}
          {(categoryId || categoryIds.length > 0 || subcategoryId || productIds.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setCategoryId('')
                setCategoryIds([])
                setSubcategoryId('')
                setProductIds([])
              }}
              className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Empty state — no data for the current selection (prevents a blank page) */}
      {!loading && !metrics && (
        <div className="app-card p-12 text-center">
          <BarChart3 className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          {reportType === 'subcategory' && categoryId && availableSubcategories.length === 0 ? (
            <>
              <p className="text-lg font-semibold text-slate-900">
                {menuGroups.find((g) => g.id === categoryId)?.label ?? 'This category'} has no subcategories
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                It's a flat category, so there's nothing to break down here. View its overall trend in the Category tab instead.
              </p>
              <button
                type="button"
                onClick={() => {
                  const cid = categoryId
                  setReportType('category')
                  setCategoryId('')
                  setSubcategoryId('')
                  setProductIds([])
                  setCategoryIds([cid])
                }}
                className="btn-primary mt-4 inline-flex"
              >
                View in Category tab
              </button>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-slate-900">No data found</p>
              <p className="mt-1 text-sm text-slate-500">Try adjusting your filters or expanding the date range.</p>
            </>
          )}
        </div>
      )}

      {/* KPI Cards */}
      {metrics && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Monthly Average</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {formatCurrency(workspace.currency, metrics.periodsCount > 0 ? metrics.totalAmount / metrics.periodsCount : 0)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {(metrics.periodsCount > 0 ? Math.round(metrics.totalQuantity / metrics.periodsCount) : 0).toLocaleString()} items / month
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  <CalendarDays className="h-6 w-6" />
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

            {/* Price Change KPI */}
            <div className="rounded-lg border border-gray-200 p-5 transition-colors duration-150 hover:border-gray-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg Price Change</p>
                  <div className="mt-2 flex items-center gap-2">
                    <p className={`text-2xl font-bold ${metrics.priceChangePercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatPercent(metrics.priceChangePercent)}
                    </p>
                    {metrics.priceChangePercent >= 0 ? <TrendingUp className="h-5 w-5 text-emerald-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatCurrency(workspace.currency, metrics.firstPeriodAvgPrice)} → {formatCurrency(workspace.currency, metrics.lastPeriodAvgPrice)}
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Revenue Decomposition — if available */}
            {metrics.priceEffect !== undefined && metrics.volumeEffect !== undefined && (
              <div className="rounded-lg border border-gray-200 p-5 sm:col-span-2 lg:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Revenue Breakdown</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Price effect</span>
                    <span className={`font-medium ${metrics.priceEffect >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatPercent(metrics.priceEffect)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Volume effect</span>
                    <span className={`font-medium ${metrics.volumeEffect >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatPercent(metrics.volumeEffect)}
                    </span>
                  </div>
                  <div className="border-t border-gray-100 pt-2 flex items-center justify-between text-sm">
                    <span className="text-gray-900 font-medium">Total change</span>
                    <span className={`font-bold ${metrics.amountChangePercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatPercent(metrics.amountChangePercent)}
                    </span>
                  </div>
                </div>
              </div>
            )}
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
                    insight.type === 'warning' ? 'bg-amber-50 text-amber-800' :
                    'bg-slate-50 text-slate-700'
                  }`}>
                    <span className="mt-0.5 flex-shrink-0">{insight.type === 'positive' ? '↑' : insight.type === 'negative' ? '↓' : insight.type === 'warning' ? '⚠' : '→'}</span>
                    <span>{insight.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Period Comparison */}
          <div className="app-card p-6">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Period Comparison</h3>

            {/* Rolling average comparison (more reliable) */}
            {metrics.rollingAmountChange !== undefined && metrics.rollingFirstLabel && metrics.rollingLastLabel && (
              <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3">
                <p className="text-xs font-semibold text-blue-800 mb-1">Rolling Average (recommended)</p>
                <p className="text-sm text-blue-700">
                  {metrics.rollingFirstLabel} avg → {metrics.rollingLastLabel} avg:{' '}
                  <span className={`font-bold ${metrics.rollingAmountChange >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatPercent(metrics.rollingAmountChange)} revenue
                  </span>
                  {metrics.rollingQuantityChange !== undefined && (
                    <span className={`ml-2 ${metrics.rollingQuantityChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      / {formatPercent(metrics.rollingQuantityChange)} volume
                    </span>
                  )}
                </p>
              </div>
            )}

            <p className="text-[11px] text-gray-400 mb-3">Single-month endpoints (may be affected by outliers)</p>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
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
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
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
                  <tbody>
                    {quarterComparison.map((q) => (<>
                      <tr
                        key={q.key}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedQuarter(expandedQuarter === q.key ? null : q.key)}
                      >
                        <td className="py-2.5 pr-4 font-medium text-gray-900">
                          <span className="flex items-center gap-1.5">
                            <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform duration-150 ${expandedQuarter === q.key ? 'rotate-180' : ''}`} />
                            {q.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-gray-900">{formatCurrency(workspace.currency, q.amount)}</td>
                        <td className="py-2.5 px-3 text-right text-gray-600">{q.quantity.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-gray-600">{formatCurrency(workspace.currency, q.avgPrice)}</td>
                        <td className="py-2.5 px-3 text-right">
                          {q.seqAmountChange !== undefined ? (
                            <div>
                              <span className={`font-medium ${q.seqAmountChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatPercent(q.seqAmountChange)}
                              </span>
                              {q.seqQuantityChange !== undefined && (
                                <div className={`text-[10px] ${q.seqQuantityChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                  qty {formatPercent(q.seqQuantityChange)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          {q.yoyAmountChange !== undefined ? (
                            <div>
                              <span className={`font-medium ${q.yoyAmountChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatPercent(q.yoyAmountChange)}
                              </span>
                              {q.yoyQuantityChange !== undefined && (
                                <div className={`text-[10px] ${q.yoyQuantityChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                  qty {formatPercent(q.yoyQuantityChange)}
                                </div>
                              )}
                              {q.yoyLabel && (
                                <div className="text-[10px] text-gray-400">{q.yoyLabel}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-[10px]">no prior year data</span>
                          )}
                        </td>
                      </tr>
                      {/* Monthly breakdown when expanded */}
                      {expandedQuarter === q.key && q.months.map((m) => (
                        <tr key={m.periodKey} className="border-b border-gray-50 bg-gray-50/50">
                          <td className="py-2 pr-4 pl-8 text-[13px] text-gray-500">{m.label}</td>
                          <td className="py-2 px-3 text-right text-[13px] text-gray-700">{formatCurrency(workspace.currency, m.amount)}</td>
                          <td className="py-2 px-3 text-right text-[13px] text-gray-500">{m.quantity.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-[13px] text-gray-500">{formatCurrency(workspace.currency, m.avgPrice)}</td>
                          <td className="py-2 px-3"></td>
                          <td className="py-2 pl-3"></td>
                        </tr>
                      ))}
                    </>))}
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
              {reportType === 'product' && (
                <p className="mt-2 text-[11px] text-gray-400">* Dual axes — left scale (Revenue) and right scale (Quantity) are independent. Visual proximity of lines does not imply proportional change.</p>
              )}
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
