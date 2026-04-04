import { useEffect, useState } from 'react'
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
    ReferenceLine,
    Area
} from 'recharts'
import { format, addMonths, subMonths, startOfMonth } from 'date-fns'
import { TrendingUp, AlertCircle, Calendar } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { formatCurrency } from '../../lib/utils/formatting'

type ChartDataPoint = {
    date: string // YYYY-MM
    label: string
    actualAmount: number | null
    forecastAmount: number | null
    isProjection: boolean
    confidenceLow?: number
    confidenceHigh?: number
}

export function SalesForecast() {
    const workspace = useWorkspace()
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<ChartDataPoint[]>([])
    const [trendInfo, setTrendInfo] = useState<{ growthRate: number; nextMonth: number; nextMonthLabel: string } | null>(null)

    useEffect(() => {
        async function calculateForecast() {
            setLoading(true)
            try {
                const { fetchSalesLines } = await import('../../lib/api/analytics')

                // 1. Fetch up to 24 months of data (but work with less if available)
                const endDate = new Date()
                const startDate = subMonths(startOfMonth(endDate), 23) // Try to get 24 months

                const lines = await fetchSalesLines(workspace, {
                    dateRange: { start: startDate, end: endDate }
                })

                // 2. Aggregate by Month
                const monthlyTotals = new Map<string, number>()

                lines.forEach(line => {
                    let key = line.periodKey
                    if (!key && line.reportDate) {
                        const d = line.reportDate instanceof Date ? line.reportDate : new Date(line.reportDate)
                        key = format(d, 'yyyy-MM')
                    }

                    if (key) {
                        monthlyTotals.set(key, (monthlyTotals.get(key) || 0) + line.amount)
                    }
                })

                // Convert to sorted array
                const historicalData = Array.from(monthlyTotals.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([dateKey, amount], index) => ({
                        index,
                        dateKey,
                        amount,
                        month: new Date(dateKey + '-01').getMonth() // 0-11
                    }))

                if (historicalData.length < 3) {
                    // Not enough data for any meaningful forecast
                    setData([])
                    setTrendInfo(null)
                    setLoading(false)
                    return
                }

                // 3. Linear Regression on RAW data to find global trend first
                const n = historicalData.length
                let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0

                historicalData.forEach(p => {
                    sumX += p.index
                    sumY += p.amount
                    sumXY += p.index * p.amount
                    sumXX += p.index * p.index
                })

                const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
                const intercept = (sumY - slope * sumX) / n

                // 4. Calculate Seasonal Offsets (Additive) from the trend line
                const seasonalOffsets = new Map<number, number>() // month (0-11) => average deviation

                const monthlyDeviations = new Map<number, number[]>()
                historicalData.forEach(p => {
                    const trendValue = slope * p.index + intercept
                    const deviation = p.amount - trendValue
                    if (!monthlyDeviations.has(p.month)) {
                        monthlyDeviations.set(p.month, [])
                    }
                    monthlyDeviations.get(p.month)!.push(deviation)
                })

                for (let month = 0; month < 12; month++) {
                    const devs = monthlyDeviations.get(month) || []
                    if (devs.length > 0) {
                        const avgDev = devs.reduce((sum, v) => sum + v, 0) / devs.length
                        seasonalOffsets.set(month, avgDev)
                    } else {
                        seasonalOffsets.set(month, 0)
                    }
                }

                // 6. Generate Chart Data (Historical + 3 Months Forecast)
                const chartData: ChartDataPoint[] = []

                // Add Historical with trend + seasonal component
                historicalData.forEach(p => {
                    const d = new Date(p.dateKey + '-01')
                    const trendValue = (slope * p.index + intercept) + (seasonalOffsets.get(p.month) || 0)

                    chartData.push({
                        date: p.dateKey,
                        label: format(d, 'MMM'),
                        actualAmount: p.amount,
                        forecastAmount: trendValue,
                        isProjection: false
                    })
                })

                // 7. Add Projection (Next 3 months) with seasonality
                const lastIndex = historicalData.length - 1
                const errors: number[] = []

                // Calculate historical prediction errors for confidence interval
                historicalData.forEach((p, i) => {
                    const trendValue = (slope * i + intercept) + (seasonalOffsets.get(p.month) || 0)
                    errors.push(Math.abs(p.amount - trendValue))
                })
                const avgError = errors.reduce((sum, e) => sum + e, 0) / errors.length

                for (let i = 1; i <= 3; i++) {
                    const nextIndex = lastIndex + i
                    const nextDate = addMonths(new Date(historicalData[lastIndex].dateKey + '-01'), i)
                    const nextMonth = nextDate.getMonth()

                    const trendForecast = slope * nextIndex + intercept
                    const forecast = trendForecast + (seasonalOffsets.get(nextMonth) || 0)

                    // Confidence interval based on historical error + increasing uncertainty
                    const margin = avgError * (1 + i * 0.15)

                    chartData.push({
                        date: format(nextDate, 'yyyy-MM'),
                        label: format(nextDate, 'MMM'),
                        actualAmount: null,
                        forecastAmount: forecast,
                        isProjection: true,
                        confidenceLow: Math.max(0, forecast - margin),
                        confidenceHigh: forecast + margin
                    })
                }

                setData(chartData)

                // 8. Calculate summary stats
                const recentMonths = historicalData.slice(-3)
                const recentAvg = recentMonths.reduce((sum, p) => sum + p.amount, 0) / recentMonths.length
                const nextMonthDate = addMonths(new Date(historicalData[lastIndex].dateKey + '-01'), 1)
                const nextMonthSeasonalOffset = seasonalOffsets.get(nextMonthDate.getMonth()) || 0
                const nextMonthForecast = (slope * (lastIndex + 1) + intercept) + nextMonthSeasonalOffset
                const growthRate = recentAvg > 0 ? ((nextMonthForecast - recentAvg) / recentAvg) : 0

                setTrendInfo({
                    growthRate,
                    nextMonth: nextMonthForecast,
                    nextMonthLabel: format(nextMonthDate, 'MMMM yyyy')
                })

            } catch (error) {
                console.error('Error calculating forecast:', error)
            } finally {
                setLoading(false)
            }
        }

        calculateForecast()
    }, [workspace])

    if (loading) {
        return <div className="app-card p-12 text-center text-slate-500">Calculating trajectory...</div>
    }

    if (!trendInfo || data.length === 0) {
        return <div className="app-card p-12 text-center text-slate-500">Not enough data to generate a forecast.</div>
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-6 md:grid-cols-3">
                <div className="app-card p-5">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                            <Calendar className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500">Forecast for {trendInfo.nextMonthLabel}</p>
                            <p className="text-2xl font-bold text-slate-900">
                                {formatCurrency(workspace.currency, trendInfo.nextMonth)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="app-card p-5">
                    <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${trendInfo.growthRate >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                            <TrendingUp className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500">Projected Monthly Growth</p>
                            <p className={`text-2xl font-bold ${trendInfo.growthRate >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {trendInfo.growthRate >= 0 ? '+' : ''}{(trendInfo.growthRate * 100).toFixed(1)}%
                            </p>
                        </div>
                    </div>
                </div>

                <div className="app-card p-5 bg-indigo-50/50 border-indigo-100">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-indigo-600 mt-1" />
                        <div>
                            <p className="text-base font-semibold text-indigo-900">Forecast Insight</p>
                            <p className="text-sm text-indigo-700 mt-1">
                                {trendInfo.growthRate > 0
                                    ? "Based on historical trends and seasonal patterns, your business is on an upward trajectory. Ensure inventory levels match projected demand."
                                    : "Revenue shows a slight downward trend. Consider seasonal promotions or review your menu pricing and offerings."}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="app-card p-6">
                <div className="mb-6">
                    <h2 className="section-title">Revenue Forecast (3 Months)</h2>
                    <p className="text-sm text-slate-500">
                        Forecast accounts for seasonal patterns and historical trends.
                    </p>
                </div>

                <div className="h-[500px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={data}
                            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(val) => {
                                    const d = new Date(val + '-01');
                                    return format(d, 'MMM');
                                }}
                                tick={{ fontSize: 12 }}
                            />
                            <YAxis
                                tickFormatter={(val) => formatCurrency(workspace.currency, val).replace(workspace.currency, '').trim()}
                            />
                            <Tooltip
                                labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                                labelFormatter={(label) => {
                                    const d = new Date(label + '-01');
                                    return format(d, 'MMM yyyy');
                                }}
                                formatter={(value: number, name: string) => {
                                    if (name === 'confidenceLow' || name === 'confidenceHigh' || name === 'HideBase') return [null, null]
                                    return [formatCurrency(workspace.currency, value), name]
                                }}
                            />
                            <Legend />

                            {/* Confidence Range Area */}
                            <Area
                                type="monotone"
                                dataKey="confidenceHigh"
                                stroke="none"
                                fill="#818cf8"
                                fillOpacity={0.1}
                                name="Confidence Interval"
                            />
                            <Area
                                type="monotone"
                                dataKey="confidenceLow"
                                stroke="none"
                                fill="#ffffff" // Hack to mask the bottom part of area chart to create a "range" look
                                fillOpacity={1}
                                name="HideBase"
                                legendType="none"
                                tooltipType="none"
                            />

                            <Bar
                                dataKey="actualAmount"
                                name="Actual Revenue"
                                fill="#1e3a8a"
                                barSize={40}
                                radius={[4, 4, 0, 0]}
                            />

                            <Line
                                type="monotone"
                                dataKey="forecastAmount"
                                name="Trend / Forecast"
                                stroke="#4f46e5"
                                strokeWidth={3}
                                strokeDasharray="5 5"
                                dot={({ payload, cx, cy }) => {
                                    if (payload.isProjection) {
                                        return <circle cx={cx} cy={cy} r={4} fill="#4f46e5" stroke="#fff" strokeWidth={2} />
                                    }
                                    return <></>
                                }}
                            />

                            <ReferenceLine x={data.filter(d => !d.isProjection).pop()?.date} stroke="#94a3b8" strokeDasharray="3 3" label="Today" />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    )
}
