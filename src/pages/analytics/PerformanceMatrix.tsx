import { useEffect, useMemo, useState } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Label } from 'recharts'
import { DataTable } from '../../components/tables/DataTable'
import { useWorkspace } from '../../context/WorkspaceContext'

import { formatCurrency } from '../../lib/utils/formatting'
import type { ProductPerformance } from '../../lib/types'

import { getMenuGroups } from '../../lib/api/menuGroups'

export function PerformanceMatrix({ dateRange }: { dateRange: { start: Date; end: Date } }) {
    const workspace = useWorkspace()
    const [data, setData] = useState<ProductPerformance[]>([])
    const [loading, setLoading] = useState(true)
    const [menuGroupsMap, setMenuGroupsMap] = useState<Record<string, string>>({})

    useEffect(() => {
        async function loadAllProducts() {
            setLoading(true)
            try {
                const { fetchSalesLines } = await import('../../lib/api/analytics')
                const [lines, groups] = await Promise.all([
                    fetchSalesLines(workspace, { dateRange }),
                    getMenuGroups(workspace)
                ])

                // Create map of group ID to label
                const groupMap: Record<string, string> = {}
                groups.forEach(g => {
                    groupMap[g.id] = g.label
                })
                setMenuGroupsMap(groupMap)

                const productTotals = new Map<string, ProductPerformance>()
                lines.forEach((line) => {
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

                const totalAmount = Array.from(productTotals.values()).reduce((sum, p) => sum + p.amount, 0)

                const allProducts = Array.from(productTotals.values()).map((item) => ({
                    ...item,
                    avgPrice: item.quantity > 0 ? item.amount / item.quantity : 0,
                    percentOfTotal: totalAmount > 0 ? item.amount / totalAmount : 0,
                }))

                setData(allProducts)
            } catch (error) {
                console.error('Error loading matrix data:', error)
            } finally {
                setLoading(false)
            }
        }
        loadAllProducts()
    }, [workspace, dateRange])

    const { avgQuantity, avgAmount } = useMemo(() => {
        if (data.length === 0) return { avgQuantity: 0, avgAmount: 0 }
        const totalQty = data.reduce((sum, item) => sum + item.quantity, 0)
        const totalAmt = data.reduce((sum, item) => sum + item.amount, 0)
        return {
            avgQuantity: totalQty / data.length,
            avgAmount: totalAmt / data.length,
        }
    }, [data])

    // Custom Tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const item = payload[0].payload
            return (
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                    <p className="font-semibold text-slate-900">{item.productName}</p>
                    <p className="text-sm text-slate-600">
                        Sales: {formatCurrency(workspace.currency, item.amount)}
                    </p>
                    <p className="text-sm text-slate-600">
                        Quantity: {item.quantity.toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                        {menuGroupsMap[item.menuGroup] || item.menuGroup}
                    </p>
                </div>
            )
        }
        return null
    }

    const quadrants = useMemo(() => {
        const stars: ProductPerformance[] = []
        const cashCows: ProductPerformance[] = []
        const hiddenGems: ProductPerformance[] = []
        const underperformers: ProductPerformance[] = []

        data.forEach(item => {
            if (item.quantity >= avgQuantity && item.amount >= avgAmount) stars.push(item)
            else if (item.quantity < avgQuantity && item.amount >= avgAmount) hiddenGems.push(item)
            else if (item.quantity >= avgQuantity && item.amount < avgAmount) cashCows.push(item)
            else underperformers.push(item)
        })

        // Sort by amount desc
        const sortFn = (a: ProductPerformance, b: ProductPerformance) => b.amount - a.amount
        return {
            stars: stars.sort(sortFn),
            cashCows: cashCows.sort(sortFn),
            hiddenGems: hiddenGems.sort(sortFn),
            underperformers: underperformers.sort(sortFn),
        }
    }, [data, avgQuantity, avgAmount])

    const [activeTab, setActiveTab] = useState<'stars' | 'cashCows' | 'hiddenGems' | 'underperformers'>('stars')

    const columns = useMemo(() => [
        {
            header: 'Product',
            accessor: (item: ProductPerformance) => <span className="font-medium text-slate-900">{item.productName}</span>,
        },
        {
            header: 'Category',
            accessor: (item: ProductPerformance) => <span className="text-slate-500">{menuGroupsMap[item.menuGroup] || item.menuGroup}</span>,
        },
        {
            header: 'Quantity',
            accessor: (item: ProductPerformance) => item.quantity.toLocaleString(),
            align: 'right' as const,
        },
        {
            header: 'Revenue',
            accessor: (item: ProductPerformance) => formatCurrency(workspace.currency, item.amount),
            align: 'right' as const,
        },
        {
            header: 'Avg Price',
            accessor: (item: ProductPerformance) => formatCurrency(workspace.currency, item.avgPrice),
            align: 'right' as const,
        },
    ], [workspace.currency, menuGroupsMap])

    if (loading) {
        return <div className="app-card p-8 text-center text-slate-500">Loading analysis...</div>
    }

    return (
        <div className="space-y-6">
            <div className="app-card p-6">
                <div className="mb-6">
                    <h2 className="section-title">Product Performance Matrix</h2>
                    <p className="text-sm text-slate-500">
                        Analyze your menu items based on popularity (Quantity) and profitability (Revenue).
                    </p>
                </div>

                <div className="h-[500px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart
                            margin={{ top: 20, right: 20, bottom: 30, left: 40 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis
                                type="number"
                                dataKey="quantity"
                                name="Quantity"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#64748b', fontSize: 12 }}
                                label={{ value: 'Quantity Sold (Popularity)', position: 'bottom', offset: 10, fill: '#475569', fontSize: 13, fontWeight: 600 }}
                            />
                            <YAxis
                                type="number"
                                dataKey="amount"
                                name="Revenue"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#64748b', fontSize: 12 }}
                                label={{ value: 'Total Revenue', angle: -90, position: 'insideLeft', dx: -20, fill: '#475569', fontSize: 13, fontWeight: 600 }}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />

                            {/* Reference Lines for Quadrants */}
                            <ReferenceLine x={avgQuantity} stroke="#94a3b8" strokeDasharray="3 3">
                                <Label value="Avg Volume" position="insideTopRight" fill="#94a3b8" fontSize={12} />
                            </ReferenceLine>
                            <ReferenceLine y={avgAmount} stroke="#94a3b8" strokeDasharray="3 3">
                                <Label value="Avg Revenue" position="insideTopRight" fill="#94a3b8" fontSize={12} />
                            </ReferenceLine>

                            {/* Quadrant Labels (Approximate positioning) */}
                            {/* Top Right: Stars */}
                            <ReferenceLine y={avgAmount * 1.5} stroke="none">
                                <Label value="STARS" position="insideTopRight" fill="#10b981" opacity={0.2} fontSize={24} fontWeight="bold" />
                            </ReferenceLine>

                            <Scatter name="Products" data={data} fill="#8884d8">
                                {data.map((entry, index) => {
                                    // Determine color based on quadrant
                                    let color = '#94a3b8' // Default gray
                                    if (entry.quantity >= avgQuantity && entry.amount >= avgAmount) color = '#10b981' // Star (Green)
                                    else if (entry.quantity < avgQuantity && entry.amount >= avgAmount) color = '#f59e0b' // Hidden Gem (Amber)
                                    else if (entry.quantity >= avgQuantity && entry.amount < avgAmount) color = '#3b82f6' // Cash Cow (Blue)
                                    else color = '#ef4444' // Underperformer (Red)

                                    return <Cell key={`cell-${index}`} fill={color} />
                                })}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>

                <div className="mt-8">
                    <h3 className="mb-4 text-lg font-semibold text-slate-900">Detailed Breakdown</h3>

                    {/* Tabs */}
                    <div className="mb-6 flex flex-wrap gap-2">
                        <button
                            onClick={() => setActiveTab('stars')}
                            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${activeTab === 'stars'
                                ? 'bg-emerald-100 text-emerald-800 ring-2 ring-emerald-500 ring-offset-2'
                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                }`}
                        >
                            <div className={`h-2 w-2 rounded-full ${activeTab === 'stars' ? 'bg-emerald-500' : 'bg-emerald-400'}`} />
                            Stars ({quadrants.stars.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('cashCows')}
                            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${activeTab === 'cashCows'
                                ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-500 ring-offset-2'
                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                }`}
                        >
                            <div className={`h-2 w-2 rounded-full ${activeTab === 'cashCows' ? 'bg-blue-500' : 'bg-blue-400'}`} />
                            Cash Cows ({quadrants.cashCows.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('hiddenGems')}
                            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${activeTab === 'hiddenGems'
                                ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-500 ring-offset-2'
                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                }`}
                        >
                            <div className={`h-2 w-2 rounded-full ${activeTab === 'hiddenGems' ? 'bg-amber-500' : 'bg-amber-400'}`} />
                            Hidden Gems ({quadrants.hiddenGems.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('underperformers')}
                            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${activeTab === 'underperformers'
                                ? 'bg-red-100 text-red-800 ring-2 ring-red-500 ring-offset-2'
                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                }`}
                        >
                            <div className={`h-2 w-2 rounded-full ${activeTab === 'underperformers' ? 'bg-red-500' : 'bg-red-400'}`} />
                            Underperformers ({quadrants.underperformers.length})
                        </button>
                    </div>

                    {/* Description Card */}
                    <div className={`mb-6 rounded-lg border p-4 ${activeTab === 'stars' ? 'border-emerald-100 bg-emerald-50/50' :
                        activeTab === 'cashCows' ? 'border-blue-100 bg-blue-50/50' :
                            activeTab === 'hiddenGems' ? 'border-amber-100 bg-amber-50/50' :
                                'border-red-100 bg-red-50/50'
                        }`}>
                        <h4 className={`font-semibold ${activeTab === 'stars' ? 'text-emerald-900' :
                            activeTab === 'cashCows' ? 'text-blue-900' :
                                activeTab === 'hiddenGems' ? 'text-amber-900' :
                                    'text-red-900'
                            }`}>
                            {activeTab === 'stars' ? 'High Volume, High Revenue' :
                                activeTab === 'cashCows' ? 'High Volume, Low Revenue' :
                                    activeTab === 'hiddenGems' ? 'Low Volume, High Revenue' :
                                        'Low Volume, Low Revenue'}
                        </h4>
                        <p className={`text-sm ${activeTab === 'stars' ? 'text-emerald-700' :
                            activeTab === 'cashCows' ? 'text-blue-700' :
                                activeTab === 'hiddenGems' ? 'text-amber-700' :
                                    'text-red-700'
                            }`}>
                            {activeTab === 'stars' ? 'These are your best performing products. Focus on maintaining their quality and availability.' :
                                activeTab === 'cashCows' ? 'These items sell well but have lower revenue contribution. Consider small price increases or bundling.' :
                                    activeTab === 'hiddenGems' ? 'These items bring good revenue but low volume. Try marketing them more aggressively.' :
                                        'These items are not performing well. Consider removing them from the menu or re-engineering the recipe.'}
                        </p>
                    </div>

                    {/* Table */}
                    <DataTable
                        columns={columns}
                        data={quadrants[activeTab]}
                        emptyLabel={`No products found in ${activeTab} category.`}
                    />
                </div>
            </div>
        </div>
    )
}
