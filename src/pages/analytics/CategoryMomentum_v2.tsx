import { useEffect, useState, useMemo } from 'react'
import { DataTable } from '../../components/tables/DataTable'
import { useWorkspace } from '../../context/WorkspaceContext'
import { formatCurrency, formatPercent } from '../../lib/utils/formatting'
import { getMenuGroups } from '../../lib/api/menuGroups'
import {
    Info,
    TrendingUp,
    TrendingDown,
    Target,
    Zap,
    AlertTriangle,
    ChevronRight,
    ArrowUpRight,
    ArrowDownRight,
    Star,
    CircleDollarSign,
    HelpCircle,
    LayoutGrid
} from 'lucide-react'

type MatrixPoint = {
    id: string
    name: string
    growthRate: number
    marketShare: number
    totalRevenue: number
    color: string
    status: 'Star' | 'Cash Cow' | 'Question Mark' | 'Dog'
    firstHalfAvg: number  // Average monthly revenue in first half of period
    secondHalfAvg: number // Average monthly revenue in second half of period
}

const QUADRANTS = {
    'Star': {
        label: 'Stars',
        icon: Star,
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
        border: 'border-emerald-100',
        desc: 'Market leaders with high growth. Essential for future expansion.',
        insight: 'Strong growth & share. Keep investing here.'
    },
    'Cash Cow': {
        label: 'Cash Cows',
        icon: CircleDollarSign,
        color: 'text-blue-600',
        bg: 'bg-blue-50',
        border: 'border-blue-100',
        desc: 'Steady revenue generators with low growth but high market share.',
        insight: 'Protect these stable revenue sources.'
    },
    'Question Mark': {
        label: 'Question Marks',
        icon: HelpCircle,
        color: 'text-amber-600',
        bg: 'bg-amber-50',
        border: 'border-amber-100',
        desc: 'Fast growers with low market share. Potential breakthrough candidates.',
        insight: 'Growing fast. Can they gain more share?'
    },
    'Dog': {
        label: 'Dogs',
        icon: AlertTriangle,
        color: 'text-slate-600',
        bg: 'bg-slate-50',
        border: 'border-slate-100',
        desc: 'Low growth and low share. May need a menu review or focus shift.',
        insight: 'Review performance or consider changes.'
    }
}

const COLORS = {
    'Star': '#10b981',
    'Cash Cow': '#3b82f6',
    'Question Mark': '#f59e0b',
    'Dog': '#64748b'
}

export function CategoryMomentum({ dateRange }: { dateRange: { start: Date; end: Date } }) {
    const workspace = useWorkspace()
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<MatrixPoint[]>([])
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

    useEffect(() => {
        async function calculateMomentum() {
            setLoading(true)
            try {
                const { fetchSalesLines } = await import('../../lib/api/analytics')

                const currentStart = dateRange.start
                const currentEnd = dateRange.end

                const [salesLines, menuGroups] = await Promise.all([
                    fetchSalesLines(workspace, { dateRange: { start: currentStart, end: currentEnd } }),
                    getMenuGroups(workspace)
                ])

                interface MonthlyData {
                    [categoryId: string]: {
                        [monthKey: string]: number
                    }
                }

                const monthlyRevenue: MonthlyData = {}
                let totalRevenue = 0

                salesLines.forEach(line => {
                    const catId = line.menuGroupAtSale
                    const date = new Date(line.reportDate)
                    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

                    if (!monthlyRevenue[catId]) monthlyRevenue[catId] = {}
                    monthlyRevenue[catId][monthKey] = (monthlyRevenue[catId][monthKey] || 0) + line.amount
                    totalRevenue += line.amount
                })

                const points: MatrixPoint[] = []

                if (totalRevenue > 0) {
                    const periodStart = currentStart.getTime()
                    const periodEnd = currentEnd.getTime()
                    const midpoint = new Date((periodStart + periodEnd) / 2)
                    const midpointKey = `${midpoint.getFullYear()}-${String(midpoint.getMonth() + 1).padStart(2, '0')}`

                    menuGroups.forEach(group => {
                        const categoryMonths = monthlyRevenue[group.id] || {}
                        const monthKeys = Object.keys(categoryMonths).sort()

                        if (monthKeys.length === 0) return

                        const categoryRevenue = Object.values(categoryMonths).reduce((sum, val) => sum + val, 0)
                        const marketShare = categoryRevenue / totalRevenue

                        const firstHalfMonths = monthKeys.filter(key => key < midpointKey)
                        const secondHalfMonths = monthKeys.filter(key => key >= midpointKey)

                        const firstHalfAvg = firstHalfMonths.length > 0
                            ? firstHalfMonths.reduce((sum, key) => sum + categoryMonths[key], 0) / firstHalfMonths.length
                            : 0
                        const secondHalfAvg = secondHalfMonths.length > 0
                            ? secondHalfMonths.reduce((sum, key) => sum + categoryMonths[key], 0) / secondHalfMonths.length
                            : 0

                        let growthRate = 0
                        if (monthKeys.length >= 2) {
                            const growthRates: number[] = []
                            for (let i = 1; i < monthKeys.length; i++) {
                                const prevMonth = categoryMonths[monthKeys[i - 1]]
                                const currMonth = categoryMonths[monthKeys[i]]
                                if (prevMonth > 0) {
                                    growthRates.push((currMonth - prevMonth) / prevMonth)
                                }
                            }
                            growthRate = growthRates.length > 0
                                ? growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length
                                : 0
                        }

                        const isHighGrowth = growthRate > 0
                        const isHighShare = marketShare > 0.10

                        let status: MatrixPoint['status'] = 'Dog'
                        if (isHighGrowth && isHighShare) status = 'Star'
                        else if (!isHighGrowth && isHighShare) status = 'Cash Cow'
                        else if (isHighGrowth && !isHighShare) status = 'Question Mark'

                        points.push({
                            id: group.id,
                            name: group.label,
                            growthRate,
                            marketShare,
                            totalRevenue: categoryRevenue,
                            color: COLORS[status],
                            status,
                            firstHalfAvg,
                            secondHalfAvg
                        })
                    })
                }

                setData(points.sort((a, b) => b.totalRevenue - a.totalRevenue))

            } catch (error) {
                console.error('Error calculating momentum:', error)
            } finally {
                setLoading(false)
            }
        }

        calculateMomentum()
    }, [workspace, dateRange])

    const selectedCategoryData = useMemo(() => {
        if (!selectedCategory) return null
        return data.find(d => d.id === selectedCategory)
    }, [data, selectedCategory])

    if (loading) {
        return <div className="app-card p-12 text-center text-slate-500">Analyzing market position...</div>
    }

    if (data.length === 0) {
        return <div className="app-card p-12 text-center text-slate-500">Not enough data for momentum analysis.</div>
    }

    const columns = [
        {
            header: 'Category',
            accessor: (row: MatrixPoint) => (
                <button
                    onClick={() => setSelectedCategory(row.id === selectedCategory ? null : row.id)}
                    className="flex items-center gap-2 text-left hover:opacity-70 transition-opacity"
                >
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                    <span className="font-semibold text-slate-900">{row.name}</span>
                    <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${selectedCategory === row.id ? 'rotate-90' : ''}`} />
                </button>
            )
        },
        {
            header: 'Market Share',
            accessor: (row: MatrixPoint) => (
                <div className="flex flex-col">
                    <span className="font-medium text-slate-900">{formatPercent(row.marketShare * 100)}</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-tight">of total revenue</span>
                </div>
            )
        },
        {
            header: 'Monthly Trend',
            accessor: (row: MatrixPoint) => (
                <div className="flex items-center gap-1.5">
                    {row.growthRate >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                    <span className={`font-bold ${row.growthRate >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {row.growthRate > 0 ? '+' : ''}{formatPercent(row.growthRate * 100)}
                    </span>
                </div>
            )
        },
        {
            header: 'Total Revenue',
            accessor: (row: MatrixPoint) => (
                <div className="font-semibold text-slate-900">
                    {formatCurrency(workspace.currency, row.totalRevenue)}
                </div>
            ),
            align: 'right' as const
        },
        {
            header: 'Status',
            accessor: (row: MatrixPoint) => {
                const q = QUADRANTS[row.status]
                const Icon = q.icon
                return (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${q.bg} ${q.color}`}>
                        <Icon className="h-3 w-3" />
                        {row.status}
                    </span>
                )
            }
        }
    ]

    return (
        <div className="space-y-6">
            {/* Page Intro */}
            <div className="app-card">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="max-w-2xl">
                        <div className="flex items-center gap-2 mb-2">
                            <LayoutGrid className="h-5 w-5 text-indigo-600" />
                            <h2 className="text-xl font-bold text-slate-900">Category Momentum Analysis</h2>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Analyze how your product groups are performing relative to each other. We use a
                            <span className="font-semibold text-slate-900 mx-1">Mid-Point Comparison</span>
                            logic that compares the average monthly revenue of the first half vs. the second half of your selected period to determine growth trends and market position.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                        <Info className="h-4 w-4 text-indigo-500" />
                        <span>Trend = Avg. Half 2 - Avg. Half 1</span>
                    </div>
                </div>
            </div>

            {/* Quadrant Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {(['Star', 'Cash Cow', 'Question Mark', 'Dog'] as const).map(status => {
                    const q = QUADRANTS[status]
                    const Icon = q.icon
                    const count = data.filter(d => d.status === status).length
                    return (
                        <div key={status} className={`group relative rounded-2xl border transition-all duration-300 hover:shadow-md ${q.border} ${q.bg} p-5`}>
                            <div className="flex items-center justify-between mb-3">
                                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm border ${q.border}`}>
                                    <Icon className={`h-5 w-5 ${q.color}`} />
                                </div>
                                <div className="text-3xl font-extrabold text-slate-900 tabular-nums">
                                    {count}
                                </div>
                            </div>
                            <h4 className={`text-base font-bold ${q.color} mb-1`}>{q.label}</h4>
                            <p className="text-xs text-slate-500 leading-snug">{q.desc}</p>

                            <div className="mt-4 pt-4 border-t border-black/5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Prescriptive Insight</p>
                                <p className="text-xs font-medium text-slate-700">{q.insight}</p>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Top Analysis Cards */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* 🚀 Top Growing */}
                <div className="app-card !p-0 overflow-hidden border-emerald-100">
                    <div className="bg-emerald-600 px-5 py-4 text-white">
                        <div className="flex items-center gap-2">
                            <ArrowUpRight className="h-5 w-5" />
                            <h3 className="font-bold">Top Growing Categories</h3>
                        </div>
                        <p className="text-xs text-emerald-100 mt-1 opacity-90">Categories with highest positive trend</p>
                    </div>
                    <div className="p-4 space-y-2">
                        {data
                            .filter(d => d.growthRate > 0)
                            .sort((a, b) => b.growthRate - a.growthRate)
                            .slice(0, 5)
                            .map((cat, idx) => (
                                <div key={cat.id} className="group relative flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">{cat.name}</p>
                                            <p className="text-[10px] text-slate-500 font-medium">
                                                {formatCurrency(workspace.currency, cat.firstHalfAvg)} → {formatCurrency(workspace.currency, cat.secondHalfAvg)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="flex items-center gap-1 font-bold text-emerald-600 text-sm">
                                            <TrendingUp className="h-3 w-3" />
                                            {formatPercent(cat.growthRate * 100)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>

                {/* ⚠️ Needs Attention */}
                <div className="app-card !p-0 overflow-hidden border-rose-100">
                    <div className="bg-rose-600 px-5 py-4 text-white">
                        <div className="flex items-center gap-2">
                            <ArrowDownRight className="h-5 w-5" />
                            <h3 className="font-bold">Needs Attention</h3>
                        </div>
                        <p className="text-xs text-rose-100 mt-1 opacity-90">Categories showing negative movement</p>
                    </div>
                    <div className="p-4 space-y-2">
                        {data
                            .filter(d => d.growthRate < 0)
                            .sort((a, b) => a.growthRate - b.growthRate)
                            .slice(0, 5)
                            .map((cat, idx) => (
                                <div key={cat.id} className="group flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-xs font-bold">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">{cat.name}</p>
                                            <p className="text-[10px] text-slate-500 font-medium">
                                                {formatCurrency(workspace.currency, cat.firstHalfAvg)} → {formatCurrency(workspace.currency, cat.secondHalfAvg)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="flex items-center gap-1 font-bold text-rose-600 text-sm">
                                            <TrendingDown className="h-3 w-3" />
                                            {formatPercent(cat.growthRate * 100)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        {data.filter(d => d.growthRate < 0).length === 0 && (
                            <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                                <Zap className="h-8 w-8 text-amber-500 mb-2" />
                                <p className="text-sm font-medium text-slate-900">All categories are stable or growing!</p>
                                <p className="text-xs text-slate-500 mt-1">Excellent performance across the board.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 💰 Revenue Leaders */}
                <div className="app-card !p-0 overflow-hidden border-indigo-100">
                    <div className="bg-indigo-600 px-5 py-4 text-white">
                        <div className="flex items-center gap-2">
                            <Target className="h-5 w-5" />
                            <h3 className="font-bold">Revenue Leaders</h3>
                        </div>
                        <p className="text-xs text-indigo-100 mt-1 opacity-90">Top 5 categories by total volume</p>
                    </div>
                    <div className="p-4 space-y-2">
                        {data
                            .slice(0, 5)
                            .map((cat, idx) => (
                                <div key={cat.id} className="group flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">{cat.name}</p>
                                            <p className="text-[10px] text-slate-500 font-medium">{formatPercent(cat.marketShare * 100)} share</p>
                                        </div>
                                    </div>
                                    <div className="text-right tabular-nums">
                                        <div className="font-bold text-slate-900 text-sm">
                                            {formatCurrency(workspace.currency, cat.totalRevenue)}
                                        </div>
                                        <div className="text-[10px] text-indigo-600 font-bold uppercase tracking-tighter">Leader</div>
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            </div>

            {/* Detailed Table */}
            <div className="app-card !p-0 overflow-hidden border-slate-200 shadow-sm transition-all duration-300">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">All Categories Performance</h3>
                    <span className="text-xs font-medium text-slate-500">{data.length} Categories Analyzed</span>
                </div>
                <DataTable
                    data={data}
                    columns={columns}
                />
            </div>

            {/* Selection Detail View */}
            {selectedCategoryData && (
                <div className="app-card border-indigo-200 bg-gradient-to-br from-white to-indigo-50/30 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                                <Zap className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">{selectedCategoryData.name} Deep Dive</h3>
                                <p className="text-xs text-slate-500">Prescriptive analytics for this category</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedCategory(null)}
                            className="text-slate-400 hover:text-slate-600 transition-colors p-2"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="grid gap-6 md:grid-cols-3">
                        <div className="p-4 rounded-xl bg-white border border-slate-150 shadow-sm">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Trend Analysis</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900">
                                    {formatCurrency(workspace.currency, selectedCategoryData.secondHalfAvg)}
                                </span>
                                <span className="text-xs text-slate-400 font-medium">avg/mo</span>
                            </div>
                            <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${selectedCategoryData.growthRate >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                {selectedCategoryData.growthRate >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {formatPercent(selectedCategoryData.growthRate * 100)} growth vs start of period
                            </div>
                        </div>

                        <div className="p-4 rounded-xl bg-white border border-slate-150 shadow-sm">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Market Position</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900">{formatPercent(selectedCategoryData.marketShare * 100)}</span>
                                <span className="text-xs text-slate-400 font-medium">share</span>
                            </div>
                            <p className="mt-2 text-xs font-medium text-slate-600">
                                Ranked <span className="font-bold text-indigo-600">#{data.findIndex(d => d.id === selectedCategoryData.id) + 1}</span> in total revenue volume.
                            </p>
                        </div>

                        <div className="p-4 rounded-xl bg-indigo-600 text-white shadow-xl shadow-indigo-100 flex flex-col justify-center">
                            <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest mb-2">Actionable Strategy</p>
                            <p className="text-sm font-semibold leading-relaxed">
                                {selectedCategoryData.status === 'Star' ? "Strategic Driver. Optimize inventory and staffing to support this high-velocity growth." :
                                    selectedCategoryData.status === 'Cash Cow' ? "Reliable Foundation. Focus on operational efficiency to maximize margins." :
                                        selectedCategoryData.status === 'Question Mark' ? "Potential Breakthrough. Increase promotion or menu visibility to push it to Star status." :
                                            "Underperforming Area. Review menu variety or pricing. Consider if this group needs a refresh."}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
