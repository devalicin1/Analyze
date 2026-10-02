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
import { Star, Target, Megaphone, Trash2, Search, X } from 'lucide-react'
import { DataTable } from '../../components/tables/DataTable'
import { Select } from '../../components/forms/Select'
import { useWorkspace } from '../../context/WorkspaceContext'
import { formatCurrency } from '../../lib/utils/formatting'
import { getMenuGroups } from '../../lib/api/menuGroups'
import type { MenuGroup } from '../../lib/types'

type Quadrant = 'star' | 'plowhorse' | 'puzzle' | 'dog'
type Mode = 'category' | 'menu'

type RawProduct = {
    productId: string
    productName: string
    menuGroup: string
    quantity: number
    amount: number
    avgPrice: number
}

type ClassifiedProduct = RawProduct & {
    quadrant: Quadrant
    percentOfTotal: number
    xVal: number
    yVal: number
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
        ring: string
        icon: typeof Star
        recommendation: string
    }
> = {
    star: {
        label: 'Stars', color: '#10b981', border: 'border-emerald-400', bg: 'bg-emerald-50',
        textColor: 'text-emerald-700', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-700',
        ring: 'ring-emerald-400', icon: Star,
        recommendation: 'High demand & high price — keep prominent, protect quality.',
    },
    plowhorse: {
        label: 'Plowhorses', color: '#3b82f6', border: 'border-blue-400', bg: 'bg-blue-50',
        textColor: 'text-blue-700', badgeBg: 'bg-blue-100', badgeText: 'text-blue-700',
        ring: 'ring-blue-400', icon: Target,
        recommendation: 'Popular but cheap — nudge price up or cut portion cost.',
    },
    puzzle: {
        label: 'Puzzles', color: '#f59e0b', border: 'border-amber-400', bg: 'bg-amber-50',
        textColor: 'text-amber-700', badgeBg: 'bg-amber-100', badgeText: 'text-amber-700',
        ring: 'ring-amber-400', icon: Megaphone,
        recommendation: 'High price, low sales — promote, reposition, or rename.',
    },
    dog: {
        label: 'Dogs', color: '#ef4444', border: 'border-red-400', bg: 'bg-red-50',
        textColor: 'text-red-700', badgeBg: 'bg-red-100', badgeText: 'text-red-700',
        ring: 'ring-red-400', icon: Trash2,
        recommendation: 'Low demand & low price — re-engineer or remove.',
    },
}

const QUADRANT_ORDER: Quadrant[] = ['star', 'plowhorse', 'puzzle', 'dog']

function classify(popular: boolean, highProfit: boolean): Quadrant {
    if (popular && highProfit) return 'star'
    if (popular && !highProfit) return 'plowhorse'
    if (!popular && highProfit) return 'puzzle'
    return 'dog'
}

// Menu-engineering "70% rule": an item is popular if its unit share ≥ 70% of an
// equal share, i.e. quantity ≥ 0.7 × (average units of the peer set).
const POP_RULE = 0.7

export function MenuEngineering({ dateRange }: { dateRange: { start: Date; end: Date } }) {
    const workspace = useWorkspace()
    const [loading, setLoading] = useState(true)
    const [rawProducts, setRawProducts] = useState<RawProduct[]>([])
    const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([])
    const [selectedCategory, setSelectedCategory] = useState('all')
    const [selectedQuadrant, setSelectedQuadrant] = useState<Quadrant | 'all'>('all')
    const [search, setSearch] = useState('')
    const [mode, setMode] = useState<Mode>('category') // classify vs category peers (default) or whole menu

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

                const totals = new Map<string, RawProduct>()
                lines.forEach((line) => {
                    const e = totals.get(line.productId) ?? {
                        productId: line.productId,
                        productName: line.productNameAtSale,
                        menuGroup: line.menuGroupAtSale,
                        quantity: 0,
                        amount: 0,
                        avgPrice: 0,
                    }
                    e.quantity += line.quantity
                    e.amount += line.amount
                    totals.set(line.productId, e)
                })
                setRawProducts(
                    Array.from(totals.values()).map((p) => ({ ...p, avgPrice: p.quantity > 0 ? p.amount / p.quantity : 0 })),
                )
            } catch (error) {
                console.error('Error loading menu engineering data:', error)
                setRawProducts([])
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [workspace, dateRange])

    const groupMap = useMemo(() => {
        const map: Record<string, string> = {}
        menuGroups.forEach((g) => { map[g.id] = g.label })
        return map
    }, [menuGroups])

    const categoryOptions = useMemo(() => {
        const options = [{ label: 'All Categories', value: 'all' }]
        const present = new Set(rawProducts.map((p) => p.menuGroup))
        menuGroups.filter((g) => present.has(g.id)).forEach((g) => options.push({ label: g.label, value: g.id }))
        return options
    }, [menuGroups, rawProducts])

    const categoryProducts = useMemo(
        () => (selectedCategory === 'all' ? rawProducts : rawProducts.filter((p) => p.menuGroup === selectedCategory)),
        [rawProducts, selectedCategory],
    )

    // Per-category thresholds: avg units (for the 70% rule) + sales-weighted avg
    // price (total revenue / total units) — the canonical menu-engineering cut.
    const perCatThresholds = useMemo(() => {
        const acc = new Map<string, { qty: number; revenue: number; count: number }>()
        categoryProducts.forEach((p) => {
            const e = acc.get(p.menuGroup) ?? { qty: 0, revenue: 0, count: 0 }
            e.qty += p.quantity; e.revenue += p.amount; e.count++
            acc.set(p.menuGroup, e)
        })
        const th = new Map<string, { avgQty: number; weightedPrice: number }>()
        acc.forEach((v, k) => th.set(k, {
            avgQty: v.count > 0 ? v.qty / v.count : 0,
            weightedPrice: v.qty > 0 ? v.revenue / v.qty : 0,
        }))
        return th
    }, [categoryProducts])

    // Whole-menu thresholds (used in "vs Whole menu" mode)
    const globalThreshold = useMemo(() => {
        const n = categoryProducts.length
        if (n === 0) return { avgQty: 0, weightedPrice: 0 }
        const qty = categoryProducts.reduce((s, p) => s + p.quantity, 0)
        const revenue = categoryProducts.reduce((s, p) => s + p.amount, 0)
        return { avgQty: qty / n, weightedPrice: qty > 0 ? revenue / qty : 0 }
    }, [categoryProducts])

    const totalAmount = useMemo(() => categoryProducts.reduce((s, p) => s + p.amount, 0), [categoryProducts])

    const classified = useMemo<ClassifiedProduct[]>(() => {
        return categoryProducts.map((p) => {
            const th = mode === 'category'
                ? perCatThresholds.get(p.menuGroup) ?? { avgQty: 0, weightedPrice: 0 }
                : globalThreshold
            const popular = th.avgQty > 0 && p.quantity >= POP_RULE * th.avgQty
            const highProfit = th.weightedPrice > 0 && p.avgPrice >= th.weightedPrice
            // In "vs category" mode plot everything on normalized axes (relative to
            // its category average) so one shared 2×2 works across categories.
            const xVal = mode === 'category' ? (th.avgQty > 0 ? p.quantity / th.avgQty : 0) : p.quantity
            const yVal = mode === 'category' ? (th.weightedPrice > 0 ? p.avgPrice / th.weightedPrice : 0) : p.avgPrice
            return {
                ...p,
                quadrant: classify(popular, highProfit),
                percentOfTotal: totalAmount > 0 ? p.amount / totalAmount : 0,
                xVal,
                yVal,
            }
        })
    }, [categoryProducts, mode, perCatThresholds, globalThreshold, totalAmount])

    // Chart reference-line positions per mode
    const chartRef = useMemo(
        () => (mode === 'category'
            ? { x: POP_RULE, y: 1 }
            : { x: globalThreshold.avgQty * POP_RULE, y: globalThreshold.weightedPrice }),
        [mode, globalThreshold],
    )

    const quadrantStats = useMemo(() => {
        const stats: Record<Quadrant, { count: number; revenue: number; share: number }> = {
            star: { count: 0, revenue: 0, share: 0 },
            plowhorse: { count: 0, revenue: 0, share: 0 },
            puzzle: { count: 0, revenue: 0, share: 0 },
            dog: { count: 0, revenue: 0, share: 0 },
        }
        classified.forEach((p) => { stats[p.quadrant].count++; stats[p.quadrant].revenue += p.amount })
        QUADRANT_ORDER.forEach((q) => { stats[q].share = totalAmount > 0 ? stats[q].revenue / totalAmount : 0 })
        return stats
    }, [classified, totalAmount])

    const tableData = useMemo(() => {
        const q = search.trim().toLowerCase()
        return classified
            .filter((p) => selectedQuadrant === 'all' || p.quadrant === selectedQuadrant)
            .filter((p) => !q || p.productName.toLowerCase().includes(q))
            .sort((a, b) => b.amount - a.amount)
    }, [classified, selectedQuadrant, search])

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const item: ClassifiedProduct = payload[0].payload
            const meta = QUADRANT_META[item.quadrant]
            return (
                <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                    <p className="font-semibold text-gray-900">{item.productName}</p>
                    <p className="text-sm text-gray-600">Quantity: {item.quantity.toLocaleString()}</p>
                    <p className="text-sm text-gray-600">Avg Price: {formatCurrency(workspace.currency, item.avgPrice)}</p>
                    <p className="text-sm text-gray-600">Revenue: {formatCurrency(workspace.currency, item.amount)}</p>
                    <p className="mt-1 text-xs font-medium" style={{ color: meta.color }}>
                        {meta.label}{mode === 'category' ? ` · in ${groupMap[item.menuGroup] || item.menuGroup}` : ''}
                    </p>
                </div>
            )
        }
        return null
    }

    const columns = useMemo(
        () => [
            { header: 'Product', accessor: (item: ClassifiedProduct) => <span className="font-medium text-gray-900">{item.productName}</span> },
            { header: 'Category', accessor: (item: ClassifiedProduct) => <span className="text-gray-500">{groupMap[item.menuGroup] || item.menuGroup}</span> },
            {
                header: 'Quadrant',
                accessor: (item: ClassifiedProduct) => {
                    const meta = QUADRANT_META[item.quadrant]
                    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.badgeBg} ${meta.badgeText}`}>{meta.label}</span>
                },
            },
            { header: 'Qty', accessor: (item: ClassifiedProduct) => item.quantity.toLocaleString(), align: 'right' as const },
            { header: 'Revenue', accessor: (item: ClassifiedProduct) => formatCurrency(workspace.currency, item.amount), align: 'right' as const },
            { header: 'Avg Price', accessor: (item: ClassifiedProduct) => formatCurrency(workspace.currency, item.avgPrice), align: 'right' as const },
            { header: '% of Total', accessor: (item: ClassifiedProduct) => `${(item.percentOfTotal * 100).toFixed(1)}%`, align: 'right' as const },
        ],
        [workspace.currency, groupMap],
    )

    if (loading) {
        return <div className="app-card p-8 text-center text-gray-500">Loading menu engineering analysis...</div>
    }

    if (rawProducts.length === 0) {
        return (
            <div className="app-card p-12 text-center">
                <Star className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="text-lg font-semibold text-slate-900">No sales to analyze</p>
                <p className="mt-1 text-sm text-slate-500">Upload reports or widen the date range to see the menu engineering matrix.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header + Mode + Category Filter */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h3 className="text-base font-semibold text-gray-900">Menu Engineering Matrix</h3>
                    <p className="text-sm text-gray-500">
                        {mode === 'category'
                            ? 'Each item scored against its own category (like-for-like). Click a quadrant to focus.'
                            : 'All items scored against one menu-wide threshold. Click a quadrant to focus.'}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex rounded-lg bg-slate-100 p-1">
                        {(['category', 'menu'] as Mode[]).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setMode(m)}
                                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                                {m === 'category' ? 'vs Category peers' : 'vs Whole menu'}
                            </button>
                        ))}
                    </div>
                    <Select options={categoryOptions} value={selectedCategory} onChange={(e) => { setSelectedCategory(e.target.value); setSelectedQuadrant('all') }} />
                </div>
            </div>

            {/* Clickable Quadrant Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                {QUADRANT_ORDER.map((q) => {
                    const meta = QUADRANT_META[q]
                    const Icon = meta.icon
                    const stat = quadrantStats[q]
                    const active = selectedQuadrant === q
                    return (
                        <button
                            key={q}
                            type="button"
                            onClick={() => setSelectedQuadrant(active ? 'all' : q)}
                            className={`app-card border-l-4 p-4 text-left transition ${meta.border} ${active ? `ring-2 ring-offset-1 ${meta.ring}` : 'hover:shadow-md'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`rounded-lg p-2 ${meta.bg}`}><Icon className={`h-4 w-4 ${meta.textColor}`} /></div>
                                <div>
                                    <p className="text-2xl font-semibold text-gray-900">{stat.count}</p>
                                    <p className="text-sm font-medium text-gray-700">{meta.label}</p>
                                </div>
                                <span className="ml-auto text-right">
                                    <span className="block text-sm font-semibold text-gray-900">{(stat.share * 100).toFixed(0)}%</span>
                                    <span className="block text-[10px] uppercase tracking-wide text-gray-400">of revenue</span>
                                </span>
                            </div>
                            <p className="mt-2 text-xs text-gray-500">{meta.recommendation}</p>
                        </button>
                    )
                })}
            </div>

            {selectedQuadrant !== 'all' && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span>Focused on <span className="font-semibold" style={{ color: QUADRANT_META[selectedQuadrant].color }}>{QUADRANT_META[selectedQuadrant].label}</span></span>
                    <button type="button" onClick={() => setSelectedQuadrant('all')} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200">
                        <X className="h-3 w-3" /> Clear
                    </button>
                </div>
            )}

            {/* Scatter Chart */}
            <div className="app-card p-6">
                <h3 className="mb-4 text-sm font-semibold text-gray-900">Popularity vs Profitability</h3>
                <div className="relative h-[500px] w-full">
                    <span className="pointer-events-none absolute right-6 top-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-400/70">Stars</span>
                    <span className="pointer-events-none absolute left-12 top-2 text-[11px] font-semibold uppercase tracking-wide text-amber-400/70">Puzzles</span>
                    <span className="pointer-events-none absolute bottom-10 right-6 text-[11px] font-semibold uppercase tracking-wide text-blue-400/70">Plowhorses</span>
                    <span className="pointer-events-none absolute bottom-10 left-12 text-[11px] font-semibold uppercase tracking-wide text-red-400/70">Dogs</span>
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis type="number" dataKey="xVal" name="Popularity" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }}>
                                <Label value={mode === 'category' ? 'Popularity (× category avg units)' : 'Quantity Sold (Popularity)'} position="bottom" offset={10} fill="#374151" fontSize={13} fontWeight={600} />
                            </XAxis>
                            <YAxis type="number" dataKey="yVal" name="Profitability" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }}>
                                <Label value={mode === 'category' ? 'Profitability (× category avg price)' : 'Average Price (Profitability)'} angle={-90} position="insideLeft" dx={-20} fill="#374151" fontSize={13} fontWeight={600} />
                            </YAxis>
                            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                            <ReferenceLine x={chartRef.x} stroke="#9ca3af" strokeDasharray="3 3">
                                <Label value="Popularity threshold" position="insideTopRight" fill="#9ca3af" fontSize={11} />
                            </ReferenceLine>
                            <ReferenceLine y={chartRef.y} stroke="#9ca3af" strokeDasharray="3 3">
                                <Label value={mode === 'category' ? 'Category avg price' : 'Weighted avg price'} position="insideTopRight" fill="#9ca3af" fontSize={11} />
                            </ReferenceLine>
                            <Scatter name="Products" data={classified} fill="#8884d8">
                                {classified.map((entry, index) => {
                                    const dim = selectedQuadrant !== 'all' && entry.quadrant !== selectedQuadrant
                                    return <Cell key={`cell-${index}`} fill={QUADRANT_META[entry.quadrant].color} fillOpacity={dim ? 0.12 : 0.85} />
                                })}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
                <p className="mt-2 text-[11px] text-gray-400">
                    {mode === 'category'
                        ? 'Axes are relative to each item’s category average. Popularity threshold = 0.7× category avg units; profitability threshold = sales-weighted category avg price. Profitability is proxied by price (food cost isn’t tracked).'
                        : `One menu-wide threshold: popularity = 70% of avg units (${globalThreshold.avgQty > 0 ? Math.round(globalThreshold.avgQty * POP_RULE).toLocaleString() : 0} units); profitability = sales-weighted avg price (${formatCurrency(workspace.currency, globalThreshold.weightedPrice)}). Profitability is proxied by price.`}
                </p>
            </div>

            {/* Data Table */}
            <div className="app-card p-6">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">
                        Product Details {selectedQuadrant !== 'all' && <span className="font-normal text-gray-400">· {QUADRANT_META[selectedQuadrant].label} only</span>}
                        <span className="ml-2 font-normal text-gray-400">({tableData.length})</span>
                    </h3>
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search products..."
                            className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none"
                        />
                    </div>
                </div>
                <DataTable columns={columns} data={tableData} emptyLabel="No products match the current filters." />
            </div>
        </div>
    )
}
