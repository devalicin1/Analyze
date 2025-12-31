import { useEffect, useState, useMemo } from 'react'
import { DataTable } from '../../components/tables/DataTable'
import { useWorkspace } from '../../context/WorkspaceContext'
import { formatCurrency, formatPercent } from '../../lib/utils/formatting'
import { getMenuGroups } from '../../lib/api/menuGroups'
import {
    Info,
    TrendingUp,
    TrendingDown,
    ChevronRight,
    Star,
    DollarSign,
    HelpCircle,
    Dog,
    Zap
} from 'lucide-react'
import {
    LineChart,
    Line,
    ResponsiveContainer
} from 'recharts'

type MonthlyPoint = {
    month: string
    revenue: number
}

type MatrixPoint = {
    id: string
    name: string
    growthRate: number
    marketShare: number
    totalRevenue: number
    color: string
    status: 'Star' | 'Cash Cow' | 'Question Mark' | 'Dog'
    firstHalfAvg: number
    secondHalfAvg: number
    monthlyHistory: MonthlyPoint[]
}

const QUADRANTS = {
    'Star': {
        label: 'Stars',
        icon: Star,
        bg: 'bg-[#10b981]',
        desc: 'High Growth, High Share',
        iconColor: 'text-white/20',
        strategy: 'Strategic Driver. Optimize inventory and staffing to support this high-velocity growth.'
    },
    'Cash Cow': {
        label: 'Cash Cows',
        icon: DollarSign,
        bg: 'bg-[#1d4ed8]',
        desc: 'Low Growth, High Share',
        iconColor: 'text-white/20',
        strategy: 'Reliable Foundation. Focus on operational efficiency to maximize margins.'
    },
    'Question Mark': {
        label: 'Question Marks',
        icon: HelpCircle,
        bg: 'bg-[#d97706]',
        desc: 'High Growth, Low Share',
        iconColor: 'text-white/20',
        strategy: 'Potential Breakthrough. Increase promotion or menu visibility to push it to Star status.'
    },
    'Dog': {
        label: 'Dogs',
        icon: Dog,
        bg: 'bg-[#475569]',
        desc: 'Low Growth, Low Share',
        iconColor: 'text-white/10',
        strategy: 'Underperforming Area. Review menu variety or pricing. Consider if this group needs a refresh.'
    }
}

function Sparkline({ data, color }: { data: MonthlyPoint[], color: string }) {
    return (
        <div className="h-8 w-16">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
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

                        const status = (growthRate > 0 && marketShare > 0.10) ? 'Star' :
                            (growthRate <= 0 && marketShare > 0.10) ? 'Cash Cow' :
                                (growthRate > 0 && marketShare <= 0.10) ? 'Question Mark' : 'Dog'

                        points.push({
                            id: group.id,
                            name: group.label,
                            growthRate,
                            marketShare,
                            totalRevenue: categoryRevenue,
                            color: '',
                            status,
                            firstHalfAvg,
                            secondHalfAvg,
                            monthlyHistory: monthKeys.map(m => ({ month: m, revenue: categoryMonths[m] }))
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

    if (loading) return <div className="p-12 text-center text-slate-500 font-medium">Analyzing market position...</div>

    const topGrowing = data.filter(d => d.growthRate > 0).sort((a, b) => b.growthRate - a.growthRate).slice(0, 8)
    const revenueLeaders = data.slice(0, 5)

    const columns = [
        {
            header: 'CATEGORY',
            accessor: (row: MatrixPoint) => (
                <button
                    onClick={() => setSelectedCategory(row.id === selectedCategory ? null : row.id)}
                    className="flex items-center gap-2 group hover:opacity-70 transition-opacity text-left"
                >
                    <div className={`h-1.5 w-1.5 rounded-full ${QUADRANTS[row.status].bg}`} />
                    <span className="font-bold text-slate-900 uppercase text-xs tracking-tight group-hover:text-indigo-600">
                        {row.name}
                    </span>
                    <ChevronRight className={`h-3 w-3 text-slate-300 transition-transform ${selectedCategory === row.id ? 'rotate-90' : ''}`} />
                </button>
            )
        },
        {
            header: 'MARKET SHARE',
            accessor: (row: MatrixPoint) => (
                <div className="flex flex-col">
                    <span className="font-bold text-slate-900 text-xs">{formatPercent(row.marketShare * 100)}</span>
                    <span className="text-[10px] text-slate-400 font-medium">of revenue</span>
                </div>
            )
        },
        {
            header: 'AVG MONTHLY GROWTH',
            accessor: (row: MatrixPoint) => (
                <div className="flex items-center gap-1 font-bold text-xs">
                    <span className={row.growthRate >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                        {row.growthRate > 0 ? '++' : ''}{formatPercent(row.growthRate * 100)}
                    </span>
                    {row.growthRate > 0 ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-rose-400" />}
                </div>
            )
        },
        {
            header: 'REVENUE',
            accessor: (row: MatrixPoint) => (
                <div className="text-right">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">GBP</div>
                    <div className="font-bold text-slate-900 text-xs">{Math.round(row.totalRevenue).toLocaleString()}</div>
                </div>
            ),
            align: 'right' as const
        },
        {
            header: 'QUADRANT',
            accessor: (row: MatrixPoint) => {
                const q = QUADRANTS[row.status]
                return (
                    <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold border border-black/5 ${q.bg.replace('bg-', 'bg-opacity-10 text-')}`}>
                        {row.status}
                        {row.status === 'Question Mark' && <span className="text-sm">?</span>}
                        {row.status === 'Dog' && <Dog className="h-3 w-3" />}
                    </div>
                )
            }
        }
    ]

    return (
        <div className="space-y-6">
            {/* Vibrant Quadrants */}
            <div className="grid gap-4 md:grid-cols-4">
                {(['Star', 'Cash Cow', 'Question Mark', 'Dog'] as const).map(status => {
                    const q = QUADRANTS[status]
                    const Icon = q.icon
                    const count = data.filter(d => d.status === status).length
                    return (
                        <div key={status} className={`relative overflow-hidden rounded-lg ${q.bg} p-6 h-32 text-white shadow-sm ring-1 ring-white/10`}>
                            <div className="relative z-10 flex flex-col h-full justify-between">
                                <div>
                                    <h3 className="text-sm font-bold tracking-tight uppercase text-white/90">{q.label}</h3>
                                    <p className="text-[10px] opacity-70 font-medium">{q.desc}</p>
                                </div>
                                <div className="text-3xl font-black">{count}</div>
                            </div>
                            <Icon className={`absolute -right-4 -bottom-4 h-24 w-24 ${q.iconColor} rotate-12 pointer-events-none`} />
                        </div>
                    )
                })}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Left Column: Overall Performance */}
                <div className="space-y-6">
                    <div className="app-card overflow-hidden">
                        <div className="flex items-center gap-2 mb-6 border-b border-slate-50 pb-4">
                            <span className="text-xl">🚀</span>
                            <h3 className="font-bold text-slate-900">Top Growing Categories</h3>
                        </div>
                        <div className="space-y-5 px-1">
                            {topGrowing.map((cat, idx) => {
                                // Clamp growth for progress bar visualization (max 50% for full bar)
                                const progress = Math.min(100, (cat.growthRate / 0.5) * 100)
                                return (
                                    <div key={cat.id} className="flex items-center gap-4">
                                        <div className="w-[120px] shrink-0">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter leading-none mb-1">#{idx + 1}</p>
                                            <p className="text-xs font-bold text-slate-700 truncate">{cat.name}</p>
                                        </div>
                                        <div className="flex-grow h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-out"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                        <div className="w-16 text-right shrink-0">
                                            <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black border border-emerald-100">
                                                +{formatPercent(cat.growthRate * 100)}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="app-card overflow-hidden">
                        <div className="flex items-center gap-2 mb-6 border-b border-slate-50 pb-4">
                            <span className="text-xl">💰</span>
                            <h3 className="font-bold text-slate-900">Revenue Leaders</h3>
                        </div>
                        <div className="space-y-6 px-1">
                            {revenueLeaders.map((cat, idx) => (
                                <div key={cat.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 max-w-[180px]">
                                        <span className="text-[10px] font-bold text-slate-300">#{idx + 1}</span>
                                        <span className="text-xs font-bold text-slate-800 uppercase tracking-tight truncate">{cat.name}</span>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <Sparkline data={cat.monthlyHistory} color="#6366f1" />
                                        <div className="text-right min-w-[100px]">
                                            <div className="text-[10px] text-slate-400 font-bold leading-none mb-1 uppercase tracking-widest">GBP</div>
                                            <div className="text-sm font-black text-slate-900 tabular-nums">
                                                {Math.round(cat.totalRevenue).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Category Details */}
                <div className="space-y-6 flex flex-col h-full">
                    <div className="app-card !p-0 overflow-hidden flex-grow shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-6 pb-4 border-b border-slate-50">
                            <h3 className="font-bold text-slate-900">Category Details</h3>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mt-1">Full breakdown sorted by revenue performance</p>
                        </div>
                        <DataTable data={data} columns={columns} />
                    </div>
                </div>
            </div>

            {/* Deep Dive Detail View */}
            {selectedCategoryData && (
                <div className="app-card border-indigo-200 bg-gradient-to-br from-white to-indigo-50/30 animate-in fade-in slide-in-from-bottom-2 shadow-xl">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className={`h-12 w-12 rounded-2xl ${QUADRANTS[selectedCategoryData.status].bg} flex items-center justify-center text-white shadow-lg ring-4 ring-white`}>
                                <Zap className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{selectedCategoryData.name} Deep Dive</h3>
                                <p className="text-xs text-slate-500 font-medium">Calculation breakdown and strategic guidance</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedCategory(null)}
                            className="h-10 w-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-all"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="grid gap-6 md:grid-cols-3">
                        <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                                <TrendingUp className="h-12 w-12 text-indigo-600" />
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Calculation Logic</p>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">1st Half Monthly Avg</span>
                                    <span className="font-bold text-slate-800">{formatCurrency(workspace.currency, selectedCategoryData.firstHalfAvg)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">2nd Half Monthly Avg</span>
                                    <span className="font-bold text-slate-800">{formatCurrency(workspace.currency, selectedCategoryData.secondHalfAvg)}</span>
                                </div>
                                <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-tighter">Resulting Trend</span>
                                    <span className={`text-sm font-black ${selectedCategoryData.growthRate >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {selectedCategoryData.growthRate > 0 ? '+' : ''}{formatPercent(selectedCategoryData.growthRate * 100)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Market Position</p>
                                <div className="flex items-baseline gap-2 mb-2">
                                    <span className="text-3xl font-black text-slate-900">{formatPercent(selectedCategoryData.marketShare * 100)}</span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Share</span>
                                </div>
                                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                                    Ranked <span className="font-bold text-indigo-600">#{data.findIndex(d => d.id === selectedCategoryData.id) + 1}</span> in total revenue volume for this period.
                                </p>
                            </div>
                            <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                <Info className="h-3.5 w-3.5 text-indigo-400" />
                                <span>Based on {selectedCategoryData.monthlyHistory.length} months of data</span>
                            </div>
                        </div>

                        <div className={`p-6 rounded-2xl ${QUADRANTS[selectedCategoryData.status].bg} text-white shadow-xl shadow-indigo-100 flex flex-col justify-center relative overflow-hidden`}>
                            <div className="absolute -right-4 -top-4 opacity-10">
                                <Info className="h-24 w-24" />
                            </div>
                            <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-3 relative z-10">Strategic Guidance</p>
                            <p className="text-sm font-bold leading-relaxed relative z-10">
                                {QUADRANTS[selectedCategoryData.status].strategy}
                            </p>
                            <div className="mt-5 inline-flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest w-fit relative z-10">
                                Status: {selectedCategoryData.status}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
