import { useEffect, useMemo, useState } from 'react'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts'
import { useWorkspace } from '../../context/WorkspaceContext'
import { fetchCategoryTrends } from '../../lib/api/analytics'
import { getMenuGroups } from '../../lib/api/menuGroups'
import { formatCurrency, formatPercent } from '../../lib/utils/formatting'
import type { MenuGroup } from '../../lib/types'

export function CategoryMixTrends({ dateRange }: { dateRange: { start: Date; end: Date } }) {
    const workspace = useWorkspace()
    const [data, setData] = useState<any[]>([])
    const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([])
    const [loading, setLoading] = useState(true)
    const [viewMode, setViewMode] = useState<'percent' | 'amount'>('percent')

    useEffect(() => {
        async function loadData() {
            setLoading(true)
            try {
                const [trends, groups] = await Promise.all([
                    fetchCategoryTrends(workspace, dateRange),
                    getMenuGroups(workspace)
                ])

                setMenuGroups(groups)

                // Transform data for stacked chart
                const periodMap = new Map<string, any>()

                trends.forEach(point => {
                    const group = groups.find(g => g.id === point.menuGroup)
                    const groupName = group?.label || point.menuGroup

                    if (!periodMap.has(point.periodKey)) {
                        periodMap.set(point.periodKey, {
                            periodKey: point.periodKey,
                            label: point.label,
                        })
                    }
                    const row = periodMap.get(point.periodKey)
                    row[groupName] = (row[groupName] || 0) + point.amount
                })

                const formattedData = Array.from(periodMap.values())
                    .sort((a, b) => a.periodKey.localeCompare(b.periodKey))
                    .map(row => {
                        const total = Object.keys(row).reduce((sum, key) => {
                            if (key !== 'periodKey' && key !== 'label') {
                                return sum + (row[key] as number)
                            }
                            return sum
                        }, 0)
                        return { ...row, total }
                    })

                setData(formattedData)
            } catch (error) {
                console.error('Error loading category trends:', error)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [workspace, dateRange])

    // Enhanced Color Palette
    const categoryColors = useMemo(() => {
        const palette = [
            '#2563eb', // Blue
            '#7c3aed', // Violet
            '#db2777', // Pink
            '#dc2626', // Red
            '#ea580c', // Orange
            '#d97706', // Amber
            '#65a30d', // Lime
            '#16a34a', // Green
            '#0891b2', // Cyan
            '#4f46e5', // Indigo
            '#9333ea', // Purple
            '#c026d3', // Fuchsia
            '#e11d48', // Rose
            '#ca8a04', // Yellow
            '#10b981', // Emerald
            '#06b6d4', // Cyan
            '#0ea5e9', // Sky
            '#3b82f6', // Blue
            '#6366f1', // Indigo
            '#8b5cf6', // Violet
        ]

        const colors: Record<string, string> = {}
        menuGroups.forEach((group, index) => {
            colors[group.label] = group.color || palette[index % palette.length]
        })
        return colors
    }, [menuGroups])

    if (loading) {
        return <div className="app-card p-8 text-center text-slate-500">Loading trends...</div>
    }

    if (data.length === 0) {
        return <div className="app-card p-8 text-center text-slate-500">No data available for the selected range.</div>
    }

    return (
        <div className="space-y-6">
            <div className="app-card p-6">
                <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Category Mix Trends</h3>
                        <p className="text-sm text-slate-500">
                            Evolution of category contribution over time.
                        </p>
                    </div>
                    <div className="flex rounded-lg bg-slate-100 p-1">
                        <button
                            onClick={() => setViewMode('percent')}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${viewMode === 'percent'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-900'
                                }`}
                        >
                            Percentage %
                        </button>
                        <button
                            onClick={() => setViewMode('amount')}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${viewMode === 'amount'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-900'
                                }`}
                        >
                            Revenue {workspace.currency}
                        </button>
                    </div>
                </div>

                <div className="h-[500px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={data}
                            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                            stackOffset={viewMode === 'percent' ? 'expand' : 'none'}
                        >
                            <defs>
                                {menuGroups.map(group => (
                                    <linearGradient key={group.id} id={`color-${group.id}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={categoryColors[group.label]} stopOpacity={0.8} />
                                        <stop offset="95%" stopColor={categoryColors[group.label]} stopOpacity={0.1} />
                                    </linearGradient>
                                ))}
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
                                tickFormatter={viewMode === 'percent' ? formatPercent : (val) => formatCurrency(workspace.currency, val).replace(workspace.currency, '').trim()}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#64748b', fontSize: 12 }}
                            />
                            <Tooltip
                                formatter={(value: number, name: string) => [
                                    formatCurrency(workspace.currency, value),
                                    name
                                ]}
                                contentStyle={{ borderRadius: '0.75rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                itemStyle={{ padding: 0 }}
                            />
                            <Legend iconType="circle" />
                            {menuGroups.map(group => (
                                <Area
                                    key={group.id}
                                    type="monotone"
                                    dataKey={group.label}
                                    stackId="1"
                                    stroke={categoryColors[group.label]}
                                    fill={`url(#color-${group.id})`}
                                    fillOpacity={1}
                                    strokeWidth={2}
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    )
}
