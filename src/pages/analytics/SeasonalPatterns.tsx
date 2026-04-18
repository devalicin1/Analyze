import { useEffect, useMemo, useState } from 'react'
import {
    BarChart as RechartsBarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceLine,
} from 'recharts'
import { Sun, Snowflake, Calendar } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getMenuGroups } from '../../lib/api/menuGroups'
import { formatCurrency } from '../../lib/utils/formatting'
import { Select } from '../../components/forms/Select'
import type { MenuGroup, SalesLine } from '../../lib/types'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type MonthlyIndex = {
    month: string
    index: number
    avgRevenue: number
}

type SeasonalItem = {
    name: string
    id: string
    totalRevenue: number
    annualAvg: number
    months: MonthlyIndex[]
    peakMonths: number[]
    lowMonths: number[]
}

function getHeatColor(index: number): { bg: string; text: string } {
    if (index > 130) return { bg: '#16a34a', text: '#ffffff' }
    if (index > 115) return { bg: '#4ade80', text: '#14532d' }
    if (index > 100) return { bg: '#bbf7d0', text: '#14532d' }
    if (index > 85) return { bg: '#f0fdf4', text: '#166534' }
    return { bg: '#fef2f2', text: '#991b1b' }
}

function describeMonthRange(monthIndices: number[]): string {
    if (monthIndices.length === 0) return ''
    const sorted = [...monthIndices].sort((a, b) => a - b)
    const ranges: string[] = []
    let start = sorted[0]
    let end = sorted[0]

    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === end + 1 || (end === 11 && sorted[i] === 0)) {
            end = sorted[i]
        } else {
            ranges.push(start === end ? MONTH_NAMES[start] : `${MONTH_NAMES[start]}-${MONTH_NAMES[end]}`)
            start = sorted[i]
            end = sorted[i]
        }
    }
    ranges.push(start === end ? MONTH_NAMES[start] : `${MONTH_NAMES[start]}-${MONTH_NAMES[end]}`)
    return ranges.join(', ')
}

function computeSeasonalData(
    lines: SalesLine[],
    groupBy: 'product' | 'category',
    menuGroups: MenuGroup[],
): SeasonalItem[] {
    // Group by item, then by calendar month
    const itemMap = new Map<string, { name: string; monthData: Map<string, number[]> }>()

    for (const line of lines) {
        const key = groupBy === 'product' ? line.productId : line.menuGroupAtSale
        const name = groupBy === 'product'
            ? line.productNameAtSale || line.productNameRaw
            : (menuGroups.find(g => g.id === line.menuGroupAtSale)?.label || line.menuGroupAtSale)

        if (!itemMap.has(key)) {
            itemMap.set(key, { name, monthData: new Map() })
        }

        const item = itemMap.get(key)!
        const parts = line.periodKey.split('-')
        const calMonth = parts[1] // "01" - "12"
        if (!calMonth) return []

        if (!item.monthData.has(calMonth)) {
            item.monthData.set(calMonth, [])
        }
        item.monthData.get(calMonth)!.push(line.amount)
    }

    // Calculate indices
    const results: SeasonalItem[] = []

    for (const [id, item] of itemMap.entries()) {
        // Calculate monthly averages
        const monthlyAvgs: { month: string; avg: number }[] = []
        let totalRevenue = 0

        for (let m = 1; m <= 12; m++) {
            const key = String(m).padStart(2, '0')
            const values = item.monthData.get(key) || []
            const sum = values.reduce((a, b) => a + b, 0)
            totalRevenue += sum
            const avg = values.length > 0 ? sum / values.length : 0
            monthlyAvgs.push({ month: key, avg })
        }

        const annualAvg = monthlyAvgs.reduce((sum, m) => sum + m.avg, 0) / 12

        if (annualAvg === 0) continue

        const months: MonthlyIndex[] = monthlyAvgs.map(m => ({
            month: m.month,
            index: Math.round((m.avg / annualAvg) * 100),
            avgRevenue: m.avg,
        }))

        const peakMonths = months
            .filter(m => m.index > 120)
            .map(m => parseInt(m.month, 10) - 1)
        const lowMonths = months
            .filter(m => m.index < 80)
            .map(m => parseInt(m.month, 10) - 1)

        results.push({
            name: item.name,
            id,
            totalRevenue,
            annualAvg,
            months,
            peakMonths,
            lowMonths,
        })
    }

    // Sort by total revenue, take top 20
    results.sort((a, b) => b.totalRevenue - a.totalRevenue)
    return results.slice(0, 20)
}

export function SeasonalPatterns({ dateRange }: { dateRange: { start: Date; end: Date } }) {
    const workspace = useWorkspace()
    const [loading, setLoading] = useState(true)
    const [productData, setProductData] = useState<SeasonalItem[]>([])
    const [categoryData, setCategoryData] = useState<SeasonalItem[]>([])
    const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([])
    const [viewMode, setViewMode] = useState<'products' | 'categories'>('products')
    const [selectedProduct, setSelectedProduct] = useState<string>('')

    useEffect(() => {
        async function loadData() {
            setLoading(true)
            try {
                const { fetchSalesLines } = await import('../../lib/api/analytics')
                const [lines, groups] = await Promise.all([
                    fetchSalesLines(workspace, { dateRange }),
                    getMenuGroups(workspace),
                ])

                setMenuGroups(groups)

                const products = computeSeasonalData(lines, 'product', groups)
                const categories = computeSeasonalData(lines, 'category', groups)

                setProductData(products)
                setCategoryData(categories)

                if (products.length > 0 && !selectedProduct) {
                    setSelectedProduct(products[0].id)
                }
            } catch (error) {
                console.error('Error loading seasonal patterns:', error)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [workspace, dateRange])

    const activeData = viewMode === 'products' ? productData : categoryData

    // Count unique months across all data
    const uniqueMonths = useMemo(() => {
        const allLines = activeData.flatMap(item => item.months)
        const monthsWithData = new Set(allLines.filter(m => m.avgRevenue > 0).map(m => m.month))
        return monthsWithData.size
    }, [activeData])

    const selectedItem = useMemo(() => {
        const list = viewMode === 'products' ? productData : categoryData
        return list.find(p => p.id === selectedProduct)
    }, [viewMode, productData, categoryData, selectedProduct])

    const barChartData = useMemo(() => {
        if (!selectedItem) return []
        return selectedItem.months.map((m, i) => ({
            month: MONTH_NAMES[i],
            index: m.index,
            revenue: m.avgRevenue,
        }))
    }, [selectedItem])

    const selectOptions = useMemo(() => {
        const list = viewMode === 'products' ? productData : categoryData
        return list.map(item => ({ label: item.name, value: item.id }))
    }, [viewMode, productData, categoryData])

    // Top 10 items with seasonal insights
    const insightItems = useMemo(() => {
        return activeData.slice(0, 10).filter(item => item.peakMonths.length > 0 || item.lowMonths.length > 0)
    }, [activeData])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header + View Toggle */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-gray-500" />
                    <h2 className="text-lg font-semibold text-gray-900">Seasonal Patterns</h2>
                </div>

                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                    <button
                        onClick={() => setViewMode('products')}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                            viewMode === 'products'
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Products
                    </button>
                    <button
                        onClick={() => setViewMode('categories')}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                            viewMode === 'categories'
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Categories
                    </button>
                </div>
            </div>

            {/* Minimum data guard */}
            {uniqueMonths < 4 && (
                <div className="app-card p-4 text-center text-sm text-gray-500">
                    At least 6 months of data recommended for seasonal analysis
                </div>
            )}

            {activeData.length === 0 ? (
                <div className="app-card p-8 text-center text-sm text-gray-500">
                    No data available for seasonal analysis.
                </div>
            ) : (
                <>
                    {/* Heat Map Table */}
                    <div className="app-card p-6">
                        <h3 className="mb-4 text-sm font-semibold text-gray-900">
                            Seasonal Index Heat Map
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr>
                                        <th className="sticky left-0 z-10 bg-white py-2 pr-4 text-left font-medium text-gray-500">
                                            {viewMode === 'products' ? 'Product' : 'Category'}
                                        </th>
                                        {MONTH_NAMES.map(m => (
                                            <th key={m} className="px-2 py-2 text-center font-medium text-gray-500">
                                                {m}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeData.map(item => (
                                        <tr key={item.id} className="border-t border-gray-100">
                                            <td className="sticky left-0 z-10 bg-white py-2 pr-4 font-medium text-gray-900 whitespace-nowrap">
                                                {item.name}
                                            </td>
                                            {item.months.map((m, i) => {
                                                const colors = getHeatColor(m.index)
                                                return (
                                                    <td key={i} className="px-2 py-2 text-center">
                                                        <span
                                                            className="inline-block rounded px-2 py-1 text-xs font-medium"
                                                            style={{
                                                                backgroundColor: colors.bg,
                                                                color: colors.text,
                                                            }}
                                                        >
                                                            {m.index}
                                                        </span>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Monthly Index Bar Chart */}
                    <div className="app-card p-6">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-900">Monthly Index</h3>
                            <div className="w-64">
                                <Select
                                    options={selectOptions}
                                    value={selectedProduct}
                                    onChange={e => setSelectedProduct(e.target.value)}
                                />
                            </div>
                        </div>
                        <div style={{ height: 400 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <RechartsBarChart data={barChartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6b7280' }} />
                                    <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} domain={[0, 'auto']} />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || payload.length === 0) return null
                                            const data = payload[0].payload as { month: string; index: number; revenue: number }
                                            return (
                                                <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-sm">
                                                    <p className="font-medium text-gray-900">{label}</p>
                                                    <p className="text-gray-600">Index: {data.index}</p>
                                                    <p className="text-gray-600">
                                                        Avg Revenue: {formatCurrency(workspace.currency, data.revenue)}
                                                    </p>
                                                </div>
                                            )
                                        }}
                                    />
                                    <ReferenceLine y={100} stroke="#9ca3af" strokeDasharray="3 3" label={{ value: 'Avg (100)', fill: '#9ca3af', fontSize: 11 }} />
                                    <Bar dataKey="index" radius={[4, 4, 0, 0]}>
                                        {barChartData.map((entry, i) => (
                                            <Cell key={i} fill={entry.index >= 100 ? '#16a34a' : '#ef4444'} />
                                        ))}
                                    </Bar>
                                </RechartsBarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Seasonal Insights */}
                    {insightItems.length > 0 && (
                        <div className="app-card p-6">
                            <h3 className="mb-4 text-sm font-semibold text-gray-900">Seasonal Insights</h3>
                            <div className="space-y-3">
                                {insightItems.map(item => {
                                    const peakAvgIndex = item.peakMonths.length > 0
                                        ? Math.round(
                                            item.peakMonths.reduce((sum, mi) => sum + item.months[mi].index, 0) /
                                            item.peakMonths.length
                                        ) - 100
                                        : 0
                                    const lowAvgIndex = item.lowMonths.length > 0
                                        ? 100 - Math.round(
                                            item.lowMonths.reduce((sum, mi) => sum + item.months[mi].index, 0) /
                                            item.lowMonths.length
                                        )
                                        : 0

                                    return (
                                        <div
                                            key={item.id}
                                            className="flex items-center gap-4 rounded-lg border border-gray-100 px-4 py-3"
                                        >
                                            <span className="min-w-[160px] text-sm font-medium text-gray-900">
                                                {item.name}
                                            </span>
                                            <div className="flex flex-1 items-center gap-6">
                                                {item.peakMonths.length > 0 && (
                                                    <div className="flex items-center gap-1.5 text-sm text-green-700">
                                                        <Sun className="h-4 w-4" />
                                                        <span>
                                                            Peaks: {describeMonthRange(item.peakMonths)} (+{peakAvgIndex}%)
                                                        </span>
                                                    </div>
                                                )}
                                                {item.lowMonths.length > 0 && (
                                                    <div className="flex items-center gap-1.5 text-sm text-red-700">
                                                        <Snowflake className="h-4 w-4" />
                                                        <span>
                                                            Low: {describeMonthRange(item.lowMonths)} (-{lowAvgIndex}%)
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
