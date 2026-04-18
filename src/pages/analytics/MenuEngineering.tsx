import { useEffect, useMemo, useState } from 'react'
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceLine,
    Label,
} from 'recharts'
import { Star, Target, Megaphone, Trash2 } from 'lucide-react'
import { DataTable } from '../../components/tables/DataTable'
import { Select } from '../../components/forms/Select'
import { useWorkspace } from '../../context/WorkspaceContext'
import { formatCurrency, formatPercent } from '../../lib/utils/formatting'
import { getMenuGroups } from '../../lib/api/menuGroups'
import type { MenuGroup, ProductPerformance } from '../../lib/types'

type Quadrant = 'star' | 'plowhorse' | 'puzzle' | 'dog'

type ClassifiedProduct = ProductPerformance & {
    quadrant: Quadrant
}

const QUADRANT_META: Record<
    Quadrant,
    {
        label: string
        color: string
        border: string
        bg: string
        textColor: string
        badgeBg: string
        badgeText: string
        icon: typeof Star
        recommendation: string
    }
> = {
    star: {
        label: 'Stars',
        color: '#10b981',
        border: 'border-emerald-400',
        bg: 'bg-emerald-50',
        textColor: 'text-emerald-700',
        badgeBg: 'bg-emerald-100',
        badgeText: 'text-emerald-700',
        icon: Star,
        recommendation: 'Maintain quality and prominence on menu',
    },
    plowhorse: {
        label: 'Plowhorses',
        color: '#3b82f6',
        border: 'border-blue-400',
        bg: 'bg-blue-50',
        textColor: 'text-blue-700',
        badgeBg: 'bg-blue-100',
        badgeText: 'text-blue-700',
        icon: Target,
        recommendation: 'Consider raising price or reducing cost',
    },
    puzzle: {
        label: 'Puzzles',
        color: '#f59e0b',
        border: 'border-amber-400',
        bg: 'bg-amber-50',
        textColor: 'text-amber-700',
        badgeBg: 'bg-amber-100',
        badgeText: 'text-amber-700',
        icon: Megaphone,
        recommendation: 'Increase visibility and promotion',
    },
    dog: {
        label: 'Dogs',
        color: '#ef4444',
        border: 'border-red-400',
        bg: 'bg-red-50',
        textColor: 'text-red-700',
        badgeBg: 'bg-red-100',
        badgeText: 'text-red-700',
        icon: Trash2,
        recommendation: 'Re-engineer or consider removing',
    },
}

function classifyProduct(
    qty: number,
    avgPrice: number,
    avgQty: number,
    avgAvgPrice: number,
): Quadrant {
    if (qty >= avgQty && avgPrice >= avgAvgPrice) return 'star'
    if (qty >= avgQty && avgPrice < avgAvgPrice) return 'plowhorse'
    if (qty < avgQty && avgPrice >= avgAvgPrice) return 'puzzle'
    return 'dog'
}

export function MenuEngineering({ dateRange }: { dateRange: { start: Date; end: Date } }) {
    const workspace = useWorkspace()
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<ClassifiedProduct[]>([])
    const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([])
    const [selectedCategory, setSelectedCategory] = useState('all')

    useEffect(() => {
        async function load() {
            setLoading(true)
            try {
                const { fetchSalesLines } = await import('../../lib/api/analytics')
                const [lines, groups] = await Promise.all([
                    fetchSalesLines(workspace, { dateRange }),
                    getMenuGroups(workspace),
                ])

                setMenuGroups(groups)

                // Aggregate per-product totals
                const productTotals = new Map<
                    string,
                    { productName: string; menuGroup: string; quantity: number; amount: number }
                >()
                lines.forEach((line) => {
                    const existing = productTotals.get(line.productId) ?? {
                        productName: line.productNameAtSale,
                        menuGroup: line.menuGroupAtSale,
                        quantity: 0,
                        amount: 0,
                    }
                    existing.quantity += line.quantity
                    existing.amount += line.amount
                    productTotals.set(line.productId, existing)
                })

                const products = Array.from(productTotals.entries()).map(([productId, item]) => ({
                    productId,
                    productName: item.productName,
                    menuGroup: item.menuGroup,
                    quantity: item.quantity,
                    amount: item.amount,
                    avgPrice: item.quantity > 0 ? item.amount / item.quantity : 0,
                }))

                const totalAmount = products.reduce((sum, p) => sum + p.amount, 0)

                // Compute averages across all products
                const avgQty =
                    products.length > 0
                        ? products.reduce((sum, p) => sum + p.quantity, 0) / products.length
                        : 0
                const avgAvgPrice =
                    products.length > 0
                        ? products.reduce((sum, p) => sum + p.avgPrice, 0) / products.length
                        : 0

                const classified: ClassifiedProduct[] = products.map((p) => ({
                    ...p,
                    percentOfTotal: totalAmount > 0 ? p.amount / totalAmount : 0,
                    quadrant: classifyProduct(p.quantity, p.avgPrice, avgQty, avgAvgPrice),
                }))

                setData(classified)
            } catch (error) {
                console.error('Error loading menu engineering data:', error)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [workspace, dateRange])

    // Menu group lookup
    const groupMap = useMemo(() => {
        const map: Record<string, string> = {}
        menuGroups.forEach((g) => {
            map[g.id] = g.label
        })
        return map
    }, [menuGroups])

    // Category filter options
    const categoryOptions = useMemo(() => {
        const options = [{ label: 'All Categories', value: 'all' }]
        menuGroups.forEach((g) => {
            options.push({ label: g.label, value: g.id })
        })
        return options
    }, [menuGroups])

    // Filtered data
    const filteredData = useMemo(() => {
        if (selectedCategory === 'all') return data
        return data.filter((item) => item.menuGroup === selectedCategory)
    }, [data, selectedCategory])

    // Recompute averages for the filtered set (used by chart reference lines)
    const { avgQuantity, avgAvgPrice } = useMemo(() => {
        if (filteredData.length === 0) return { avgQuantity: 0, avgAvgPrice: 0 }
        const totalQty = filteredData.reduce((sum, item) => sum + item.quantity, 0)
        const totalAvgP = filteredData.reduce((sum, item) => sum + item.avgPrice, 0)
        return {
            avgQuantity: totalQty / filteredData.length,
            avgAvgPrice: totalAvgP / filteredData.length,
        }
    }, [filteredData])

    // Quadrant counts
    const quadrantCounts = useMemo(() => {
        const counts: Record<Quadrant, number> = { star: 0, plowhorse: 0, puzzle: 0, dog: 0 }
        filteredData.forEach((item) => {
            counts[item.quadrant]++
        })
        return counts
    }, [filteredData])

    // Table sorted by revenue desc
    const sortedTableData = useMemo(
        () => [...filteredData].sort((a, b) => b.amount - a.amount),
        [filteredData],
    )

    // Custom tooltip for scatter chart
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const item: ClassifiedProduct = payload[0].payload
            const meta = QUADRANT_META[item.quadrant]
            return (
                <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                    <p className="font-semibold text-gray-900">{item.productName}</p>
                    <p className="text-sm text-gray-600">
                        Quantity: {item.quantity.toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-600">
                        Avg Price: {formatCurrency(workspace.currency, item.avgPrice)}
                    </p>
                    <p className="text-sm text-gray-600">
                        Revenue: {formatCurrency(workspace.currency, item.amount)}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: meta.color }}>
                        {meta.label}
                    </p>
                </div>
            )
        }
        return null
    }

    // Table columns
    const columns = useMemo(
        () => [
            {
                header: 'Product',
                accessor: (item: ClassifiedProduct) => (
                    <span className="font-medium text-gray-900">{item.productName}</span>
                ),
            },
            {
                header: 'Category',
                accessor: (item: ClassifiedProduct) => (
                    <span className="text-gray-500">
                        {groupMap[item.menuGroup] || item.menuGroup}
                    </span>
                ),
            },
            {
                header: 'Quadrant',
                accessor: (item: ClassifiedProduct) => {
                    const meta = QUADRANT_META[item.quadrant]
                    return (
                        <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.badgeBg} ${meta.badgeText}`}
                        >
                            {meta.label}
                        </span>
                    )
                },
            },
            {
                header: 'Qty',
                accessor: (item: ClassifiedProduct) => item.quantity.toLocaleString(),
                align: 'right' as const,
            },
            {
                header: 'Revenue',
                accessor: (item: ClassifiedProduct) =>
                    formatCurrency(workspace.currency, item.amount),
                align: 'right' as const,
            },
            {
                header: 'Avg Price',
                accessor: (item: ClassifiedProduct) =>
                    formatCurrency(workspace.currency, item.avgPrice),
                align: 'right' as const,
            },
            {
                header: '% of Total',
                accessor: (item: ClassifiedProduct) =>
                    formatPercent(item.percentOfTotal * 100),
                align: 'right' as const,
            },
        ],
        [workspace.currency, groupMap],
    )

    if (loading) {
        return (
            <div className="app-card p-8 text-center text-gray-500">
                Loading menu engineering analysis...
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header + Category Filter */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-base font-semibold text-gray-900">
                        Menu Engineering Matrix
                    </h3>
                    <p className="text-sm text-gray-500">
                        Classify products by popularity and profitability
                    </p>
                </div>
                <Select
                    options={categoryOptions}
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                />
            </div>

            {/* Summary Cards */}
            <div className="grid md:grid-cols-4 gap-4">
                {(Object.keys(QUADRANT_META) as Quadrant[]).map((q) => {
                    const meta = QUADRANT_META[q]
                    const Icon = meta.icon
                    return (
                        <div
                            key={q}
                            className={`app-card p-4 border-l-4 ${meta.border}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`rounded-lg p-2 ${meta.bg}`}>
                                    <Icon className={`h-4 w-4 ${meta.textColor}`} />
                                </div>
                                <div>
                                    <p className="text-2xl font-semibold text-gray-900">
                                        {quadrantCounts[q]}
                                    </p>
                                    <p className="text-sm font-medium text-gray-700">
                                        {meta.label}
                                    </p>
                                </div>
                            </div>
                            <p className="mt-2 text-xs text-gray-500">{meta.recommendation}</p>
                        </div>
                    )
                })}
            </div>

            {/* Scatter Chart */}
            <div className="app-card p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">
                    Popularity vs Profitability
                </h3>
                <div className="h-[500px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis
                                type="number"
                                dataKey="quantity"
                                name="Quantity"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6b7280', fontSize: 12 }}
                            >
                                <Label
                                    value="Quantity Sold (Popularity)"
                                    position="bottom"
                                    offset={10}
                                    fill="#374151"
                                    fontSize={13}
                                    fontWeight={600}
                                />
                            </XAxis>
                            <YAxis
                                type="number"
                                dataKey="avgPrice"
                                name="Avg Price"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6b7280', fontSize: 12 }}
                            >
                                <Label
                                    value="Average Price (Profitability)"
                                    angle={-90}
                                    position="insideLeft"
                                    dx={-20}
                                    fill="#374151"
                                    fontSize={13}
                                    fontWeight={600}
                                />
                            </YAxis>
                            <Tooltip
                                content={<CustomTooltip />}
                                cursor={{ strokeDasharray: '3 3' }}
                            />

                            {/* Reference lines for quadrant boundaries */}
                            <ReferenceLine
                                x={avgQuantity}
                                stroke="#9ca3af"
                                strokeDasharray="3 3"
                            >
                                <Label
                                    value="Avg Quantity"
                                    position="insideTopRight"
                                    fill="#9ca3af"
                                    fontSize={12}
                                />
                            </ReferenceLine>
                            <ReferenceLine
                                y={avgAvgPrice}
                                stroke="#9ca3af"
                                strokeDasharray="3 3"
                            >
                                <Label
                                    value="Avg Price"
                                    position="insideTopRight"
                                    fill="#9ca3af"
                                    fontSize={12}
                                />
                            </ReferenceLine>

                            <Scatter name="Products" data={filteredData} fill="#8884d8">
                                {filteredData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={QUADRANT_META[entry.quadrant].color}
                                    />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Data Table */}
            <div className="app-card p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Product Details</h3>
                <DataTable
                    columns={columns}
                    data={sortedTableData}
                    emptyLabel="No products found for the selected filters."
                />
            </div>
        </div>
    )
}
