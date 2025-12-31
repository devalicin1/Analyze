import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { useWorkspace } from '../../context/WorkspaceContext'
import { formatCurrency, formatPercent } from '../../lib/utils/formatting'
import type { ProductPerformance } from '../../lib/types'
import { DataTable } from '../../components/tables/DataTable'

export function ParetoAnalysis({ dateRange }: { dateRange: { start: Date; end: Date } }) {
    const workspace = useWorkspace()
    const [data, setData] = useState<(ProductPerformance & { cumulativeAmount: number; cumulativePercent: number })[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadData() {
            setLoading(true)
            try {
                const { fetchSalesLines } = await import('../../lib/api/analytics')
                const lines = await fetchSalesLines(workspace, { dateRange })

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

                // Sort by amount descending
                const sortedProducts = Array.from(productTotals.values())
                    .sort((a, b) => b.amount - a.amount)

                let runningTotal = 0
                const paretoData = sortedProducts.map((item) => {
                    runningTotal += item.amount
                    return {
                        ...item,
                        avgPrice: item.quantity > 0 ? item.amount / item.quantity : 0,
                        percentOfTotal: totalAmount > 0 ? item.amount / totalAmount : 0,
                        cumulativeAmount: runningTotal,
                        cumulativePercent: totalAmount > 0 ? (runningTotal / totalAmount) * 100 : 0
                    }
                })

                setData(paretoData)
            } catch (error) {
                console.error('Error loading pareto data:', error)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [workspace, dateRange])

    const criticalFew = useMemo(() => {
        // Find the index where cumulative percent crosses 80%
        const cutoffIndex = data.findIndex(item => item.cumulativePercent >= 80)
        return data.slice(0, cutoffIndex + 1)
    }, [data])

    const columns = useMemo(() => [
        {
            header: 'Product',
            accessor: (item: ProductPerformance) => <span className="font-medium text-slate-900">{item.productName}</span>,
        },
        {
            header: 'Revenue',
            accessor: (item: ProductPerformance) => formatCurrency(workspace.currency, item.amount),
            align: 'right' as const,
        },
        {
            header: '% of Total',
            accessor: (item: ProductPerformance) => formatPercent(item.percentOfTotal * 100),
            align: 'right' as const,
        },
        {
            header: 'Cumulative %',
            accessor: (item: any) => formatPercent(item.cumulativePercent),
            align: 'right' as const,
        },
    ], [workspace.currency])

    // Custom Tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const item = payload[0].payload
            return (
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                    <p className="font-semibold text-slate-900">{item.productName}</p>
                    <p className="text-sm text-slate-600">
                        Revenue: {formatCurrency(workspace.currency, item.amount)}
                    </p>
                    <p className="text-sm text-emerald-600">
                        Cumulative: {item.cumulativePercent.toFixed(1)}%
                    </p>
                </div>
            )
        }
        return null
    }

    if (loading) {
        return <div className="app-card p-8 text-center text-slate-500">Loading analysis...</div>
    }

    return (
        <div className="space-y-6">
            <div className="app-card">
                <div className="mb-6">
                    <h2 className="section-title">Pareto Analysis (80/20 Rule)</h2>
                    <p className="text-sm text-slate-500">
                        Identify the "Critical Few" products that drive the majority of your revenue.
                        Typically, 20% of products generate 80% of sales.
                    </p>
                </div>

                <div className="h-[500px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={data.slice(0, 50)} // Show top 50 for readability in chart
                            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                            <XAxis
                                dataKey="productName"
                                angle={-45}
                                textAnchor="end"
                                height={100}
                                interval={0}
                                tick={{ fontSize: 10 }}
                            />
                            <YAxis
                                yAxisId="left"
                                orientation="left"
                                stroke="#8884d8"
                                tickFormatter={(val) => formatCurrency(workspace.currency, val).replace(workspace.currency, '').trim()} // Shorten for axis
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke="#10b981"
                                unit="%"
                                domain={[0, 100]}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar yAxisId="left" dataKey="amount" name="Revenue" fill="#8884d8" barSize={20} />
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="cumulativePercent"
                                name="Cumulative %"
                                stroke="#10b981"
                                strokeWidth={2}
                                dot={false}
                            />
                            <ReferenceLine yAxisId="right" y={80} stroke="#f59e0b" strokeDasharray="3 3" label="80% Cutoff" />
                        </ComposedChart>
                    </ResponsiveContainer>
                    <p className="text-center text-xs text-slate-400 mt-2">* Chart shows top 50 products for clarity</p>
                </div>

                <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                        <h4 className="text-lg font-bold text-emerald-900">{criticalFew.length}</h4>
                        <p className="text-sm font-medium text-emerald-800">Critical Products</p>
                        <p className="text-xs text-emerald-600 mt-1">
                            Products generating 80% of revenue
                        </p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                        <h4 className="text-lg font-bold text-slate-900">{data.length}</h4>
                        <p className="text-sm font-medium text-slate-800">Total Products</p>
                        <p className="text-xs text-slate-600 mt-1">
                            Active menu items sold
                        </p>
                    </div>
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                        <h4 className="text-lg font-bold text-blue-900">
                            {((criticalFew.length / data.length) * 100).toFixed(1)}%
                        </h4>
                        <p className="text-sm font-medium text-blue-800">Concentration</p>
                        <p className="text-xs text-blue-600 mt-1">
                            % of menu driving 80% of sales
                        </p>
                    </div>
                </div>

                <div className="mt-8">
                    <h3 className="mb-4 text-lg font-semibold text-slate-900">The Critical Few (Top 80% Revenue)</h3>
                    <DataTable
                        columns={columns}
                        data={criticalFew}
                        emptyLabel="No sales data available."
                    />
                </div>
            </div>
        </div>
    )
}
