import { useEffect, useMemo, useState } from 'react'
import {
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { fetchCategoryTrends } from '../../lib/api/analytics'
import { formatCurrency, formatPercent } from '../../lib/utils/formatting'

type MonthlyMetric = {
    periodKey: string
    label: string
    totalAmount: number
    totalQuantity: number
    avgPrice: number
    amountChange: number
    quantityChange: number
}

export function MonthlyOverview({ dateRange }: { dateRange: { start: Date; end: Date } }) {
    const workspace = useWorkspace()
    const [data, setData] = useState<MonthlyMetric[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadData() {
            setLoading(true)
            try {
                // Fetch category trends to get aggregated monthly data
                const trends = await fetchCategoryTrends(workspace, dateRange)

                // Aggregate by period
                const periodMap = new Map<string, {
                    label: string
                    amount: number
                    quantity: number
                }>()

                trends.forEach(point => {
                    const existing = periodMap.get(point.periodKey) ?? {
                        label: point.label,
                        amount: 0,
                        quantity: 0
                    }
                    existing.amount += point.amount
                    existing.quantity += point.quantity
                    periodMap.set(point.periodKey, existing)
                })

                // Convert to array and sort chronologically
                const sortedPeriods = Array.from(periodMap.entries())
                    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                    .map(([key, val]) => ({ periodKey: key, ...val }))

                // Calculate MoM changes
                const metrics: MonthlyMetric[] = sortedPeriods.map((current, index) => {
                    const prev = sortedPeriods[index - 1]

                    let amountChange = 0
                    let quantityChange = 0

                    if (prev && prev.amount > 0) {
                        amountChange = ((current.amount - prev.amount) / prev.amount) * 100
                    }
                    if (prev && prev.quantity > 0) {
                        quantityChange = ((current.quantity - prev.quantity) / prev.quantity) * 100
                    }

                    return {
                        ...current,
                        totalAmount: current.amount,
                        totalQuantity: current.quantity,
                        avgPrice: current.quantity > 0 ? current.amount / current.quantity : 0,
                        amountChange,
                        quantityChange
                    }
                })

                setData(metrics)
            } catch (error) {
                console.error('Error loading monthly overview:', error)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [workspace, dateRange])

    const currentMonth = data[data.length - 1]

    // Find best month
    const bestMonth = useMemo(() => {
        if (data.length === 0) return null
        return data.reduce((max, curr) => curr.totalAmount > max.totalAmount ? curr : max, data[0])
    }, [data])

    const kpis = [
        {
            label: 'Total Revenue',
            value: currentMonth ? formatCurrency(workspace.currency, currentMonth.totalAmount) : '-',
            change: currentMonth?.amountChange,
            icon: (
                <div className="rounded-lg bg-emerald-100 p-2 text-emerald-600">
                    <span className="text-xl">💰</span>
                </div>
            )
        },
        {
            label: 'Total Items Sold',
            value: currentMonth ? currentMonth.totalQuantity.toLocaleString() : '-',
            change: currentMonth?.quantityChange,
            icon: (
                <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
                    <span className="text-xl">📦</span>
                </div>
            )
        },
        {
            label: 'Avg Price / Item',
            value: currentMonth ? formatCurrency(workspace.currency, currentMonth.avgPrice) : '-',
            change: 0, // Complex to calc MoM for avg without more data, skipping for now
            icon: (
                <div className="rounded-lg bg-violet-100 p-2 text-violet-600">
                    <span className="text-xl">🏷️</span>
                </div>
            )
        }
    ]

    if (loading) {
        return <div className="app-card p-8 text-center text-slate-500">Loading overview...</div>
    }

    if (data.length === 0) {
        return <div className="app-card p-8 text-center text-slate-500">No data available for the selected range.</div>
    }

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                {kpis.map((kpi, i) => (
                    <div key={i} className="app-card flex items-start justify-between p-6">
                        <div>
                            <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
                            <h3 className="mt-2 text-2xl font-bold text-slate-900">{kpi.value}</h3>
                            {kpi.change !== undefined && kpi.change !== 0 && (
                                <div className={`mt-2 flex items-center text-sm ${kpi.change > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {kpi.change > 0 ? <ArrowUpRight className="mr-1 h-4 w-4" /> : <ArrowDownRight className="mr-1 h-4 w-4" />}
                                    <span className="font-medium">{formatPercent(kpi.change)}</span>
                                    <span className="ml-1 text-slate-400">vs last month</span>
                                </div>
                            )}
                            {kpi.change === 0 && (
                                <div className="mt-2 flex items-center text-sm text-slate-400">
                                    <Minus className="mr-1 h-4 w-4" />
                                    <span>Stable</span>
                                </div>
                            )}
                        </div>
                        {kpi.icon}
                    </div>
                ))}

                {/* Best Month Card */}
                {bestMonth && (
                    <div className="app-card flex flex-col justify-between bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-white">
                        <div>
                            <p className="text-sm font-medium text-indigo-100">Best Month</p>
                            <h3 className="mt-2 text-2xl font-bold">{bestMonth.label}</h3>
                            <p className="mt-1 text-sm text-indigo-100">
                                {formatCurrency(workspace.currency, bestMonth.totalAmount)} Revenue
                            </p>
                        </div>
                        <div className="mt-4 flex items-center text-sm text-indigo-100">
                            <span className="rounded-full bg-white/20 px-2 py-1 text-xs backdrop-blur-sm">
                                Top Performance
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Revenue Trend Chart */}
            <div className="app-card p-6">
                <div className="mb-6">
                    <h3 className="text-lg font-bold text-slate-900">Revenue Trend</h3>
                    <p className="text-sm text-slate-500">Monthly revenue performance with month-over-month growth</p>
                </div>
                <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <defs>
                                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                            <XAxis
                                dataKey="label"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#64748b', fontSize: 12 }}
                                dy={10}
                            />
                            <YAxis
                                yAxisId="left"
                                orientation="left"
                                stroke="#8b5cf6"
                                tickFormatter={(val) => formatCurrency(workspace.currency, val).replace(workspace.currency, '').trim()}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#64748b', fontSize: 12 }}
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke="#10b981"
                                unit="%"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#64748b', fontSize: 12 }}
                            />
                            <Tooltip
                                formatter={(value: any, name: string) => {
                                    if (name === 'Revenue') return formatCurrency(workspace.currency, value)
                                    if (name === 'Growth') return formatPercent(value)
                                    return value
                                }}
                                contentStyle={{ borderRadius: '0.75rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                cursor={{ fill: '#f1f5f9' }}
                            />
                            <Legend iconType="circle" />
                            <Bar
                                yAxisId="left"
                                dataKey="totalAmount"
                                name="Revenue"
                                fill="url(#colorRevenue)"
                                barSize={40}
                                radius={[8, 8, 0, 0]}
                            />
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="amountChange"
                                name="Growth"
                                stroke="#10b981"
                                strokeWidth={3}
                                dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                                activeDot={{ r: 6 }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    )
}
