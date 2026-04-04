import { useEffect, useMemo, useState } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useWorkspace } from '../../context/WorkspaceContext'
import { formatCurrency } from '../../lib/utils/formatting'
import { getMenuGroups } from '../../lib/api/menuGroups'
import { Select } from '../../components/forms/Select'
import type { MenuGroup } from '../../lib/types'
import { format } from 'date-fns'

export function CategoryCorrelation({ dateRange }: { dateRange: { start: Date; end: Date } }) {
    const workspace = useWorkspace()
    const [loading, setLoading] = useState(true)
    const [groups, setGroups] = useState<MenuGroup[]>([])
    const [data, setData] = useState<any[]>([])

    const [categoryA, setCategoryA] = useState<string>('')
    const [categoryB, setCategoryB] = useState<string>('')

    useEffect(() => {
        async function loadData() {
            setLoading(true)
            try {
                const { fetchSalesLines } = await import('../../lib/api/analytics')
                const [lines, menuGroups] = await Promise.all([
                    fetchSalesLines(workspace, { dateRange }),
                    getMenuGroups(workspace)
                ])

                setGroups(menuGroups)

                // Default selections if available
                if (menuGroups.length >= 2) {
                    setCategoryA(prev => prev || menuGroups[0].id)
                    setCategoryB(prev => prev || menuGroups[1].id)
                } else if (menuGroups.length === 1) {
                    setCategoryA(prev => prev || menuGroups[0].id)
                }

                // Aggregate sales by Date AND Category
                // Map<DateString, Map<CategoryId, Amount>>
                const dailySales = new Map<string, Map<string, number>>()

                lines.forEach(line => {
                    // Assuming line.reportDate is available and is a Date object or string
                    // We need to normalize to YYYY-MM-DD
                    const dateObj = new Date(line.reportDate)
                    if (isNaN(dateObj.getTime())) return // Skip invalid dates

                    const dateKey = format(dateObj, 'yyyy-MM-dd')

                    if (!dailySales.has(dateKey)) {
                        dailySales.set(dateKey, new Map())
                    }

                    const dayMap = dailySales.get(dateKey)!
                    const currentAmount = dayMap.get(line.menuGroupAtSale) || 0
                    dayMap.set(line.menuGroupAtSale, currentAmount + line.amount)
                })

                // Convert to array for Recharts
                const chartData = Array.from(dailySales.entries()).map(([date, catMap]) => {
                    const entry: any = { date }
                    menuGroups.forEach(g => {
                        entry[g.id] = catMap.get(g.id) || 0
                    })
                    // Also handle raw IDs if they don't match current groups (historical data)
                    catMap.forEach((amount, catId) => {
                        if (!entry[catId]) entry[catId] = amount
                    })
                    return entry
                })

                setData(chartData)

            } catch (error) {
                console.error('Error loading correlation data:', error)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [workspace, dateRange])

    // Calculate correlation coefficient (Pearson)
    const correlation = useMemo(() => {
        if (!categoryA || !categoryB || data.length === 0) return 0

        const n = data.length
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0

        data.forEach(item => {
            const x = item[categoryA] || 0
            const y = item[categoryB] || 0
            sumX += x
            sumY += y
            sumXY += x * y
            sumX2 += x * x
            sumY2 += y * y
        })

        const numerator = (n * sumXY) - (sumX * sumY)
        const denominator = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)))

        if (denominator === 0) return 0
        return numerator / denominator
    }, [data, categoryA, categoryB])

    const getLabel = (id: string) => groups.find(g => g.id === id)?.label || id

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const item = payload[0].payload
            return (
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                    <p className="font-semibold text-slate-900">{format(new Date(item.date), 'MMM d, yyyy')}</p>
                    <p className="text-sm text-slate-600">
                        {getLabel(categoryA)}: {formatCurrency(workspace.currency, item[categoryA] || 0)}
                    </p>
                    <p className="text-sm text-slate-600">
                        {getLabel(categoryB)}: {formatCurrency(workspace.currency, item[categoryB] || 0)}
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
            <div className="app-card p-6">
                <div className="mb-6">
                    <h2 className="section-title">Category Correlation</h2>
                    <p className="text-sm text-slate-500">
                        Analyze how sales of one category relate to another. Each dot represents one day of sales.
                    </p>
                </div>

                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
                    <div className="w-full sm:w-64">
                        <Select
                            label="Category X (Horizontal)"
                            value={categoryA}
                            onChange={(e) => setCategoryA(e.target.value)}
                            options={groups.map(g => ({ value: g.id, label: g.label }))}
                        />
                    </div>
                    <div className="flex items-center justify-center pb-3 text-slate-400">
                        vs
                    </div>
                    <div className="w-full sm:w-64">
                        <Select
                            label="Category Y (Vertical)"
                            value={categoryB}
                            onChange={(e) => setCategoryB(e.target.value)}
                            options={groups.map(g => ({ value: g.id, label: g.label }))}
                        />
                    </div>
                </div>

                <div className="h-[500px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart
                            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                            <XAxis
                                type="number"
                                dataKey={categoryA}
                                name={getLabel(categoryA)}
                                unit=""
                                label={{ value: getLabel(categoryA), position: 'bottom', offset: 0 }}
                                tickFormatter={(val) => formatCurrency(workspace.currency, val).replace(workspace.currency, '').trim()}
                            />
                            <YAxis
                                type="number"
                                dataKey={categoryB}
                                name={getLabel(categoryB)}
                                unit=""
                                label={{ value: getLabel(categoryB), angle: -90, position: 'insideLeft' }}
                                tickFormatter={(val) => formatCurrency(workspace.currency, val).replace(workspace.currency, '').trim()}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                            <Scatter name="Daily Sales" data={data} fill="#8884d8" />
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>

                <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-semibold text-slate-900">Correlation Coefficient</h4>
                            <p className="text-sm text-slate-500">
                                Measures the strength of the relationship (-1 to 1).
                            </p>
                        </div>
                        <div className="text-right">
                            <span className={`text-2xl font-bold ${correlation > 0.7 ? 'text-emerald-600' :
                                    correlation > 0.3 ? 'text-blue-600' :
                                        correlation > -0.3 ? 'text-slate-600' :
                                            'text-red-600'
                                }`}>
                                {correlation.toFixed(2)}
                            </span>
                            <p className="text-xs font-medium text-slate-600">
                                {correlation > 0.7 ? 'Strong Positive' :
                                    correlation > 0.3 ? 'Weak Positive' :
                                        correlation > -0.3 ? 'No Correlation' :
                                            'Negative Correlation'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
