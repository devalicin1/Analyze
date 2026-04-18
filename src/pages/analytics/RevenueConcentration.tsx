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
    ReferenceLine,
    Legend,
} from 'recharts'
import { AlertTriangle, Shield, ShieldAlert } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { formatCurrency, formatPercent } from '../../lib/utils/formatting'
import { DataTable } from '../../components/tables/DataTable'
import type { SalesLine, MenuGroup } from '../../lib/types'

type ProductAggregate = {
    productId: string
    productName: string
    menuGroup: string
    quantity: number
    amount: number
}

type ParetoRow = ProductAggregate & {
    cumulativeAmount: number
    cumulativePercent: number
}

type CategoryRow = {
    category: string
    revenue: number
    share: number
}

export function RevenueConcentration({ dateRange }: { dateRange: { start: Date; end: Date } }) {
    const workspace = useWorkspace()
    const [productData, setProductData] = useState<ParetoRow[]>([])
    const [categoryData, setCategoryData] = useState<CategoryRow[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadData() {
            setLoading(true)
            try {
                const { fetchSalesLines } = await import('../../lib/api/analytics')
                const { getMenuGroups } = await import('../../lib/api/menuGroups')

                const [lines, menuGroups]: [SalesLine[], MenuGroup[]] = await Promise.all([
                    fetchSalesLines(workspace, { dateRange }),
                    getMenuGroups(workspace),
                ])

                // Aggregate by productId
                const productTotals = new Map<string, ProductAggregate>()
                lines.forEach((line) => {
                    const existing = productTotals.get(line.productId) ?? {
                        productId: line.productId,
                        productName: line.productNameAtSale,
                        menuGroup: line.menuGroupAtSale,
                        quantity: 0,
                        amount: 0,
                    }
                    existing.quantity += line.quantity
                    existing.amount += line.amount
                    productTotals.set(line.productId, existing)
                })

                const totalAmount = Array.from(productTotals.values()).reduce(
                    (sum, p) => sum + p.amount,
                    0,
                )

                // Sort by amount descending and calculate cumulative
                const sorted = Array.from(productTotals.values()).sort(
                    (a, b) => b.amount - a.amount,
                )

                let runningTotal = 0
                const paretoRows: ParetoRow[] = sorted.map((item) => {
                    runningTotal += item.amount
                    return {
                        ...item,
                        cumulativeAmount: runningTotal,
                        cumulativePercent:
                            totalAmount > 0
                                ? (runningTotal / totalAmount) * 100
                                : 0,
                    }
                })

                setProductData(paretoRows)

                // Aggregate by menuGroupAtSale for category concentration
                const categoryTotals = new Map<string, number>()
                lines.forEach((line) => {
                    const current = categoryTotals.get(line.menuGroupAtSale) ?? 0
                    categoryTotals.set(line.menuGroupAtSale, current + line.amount)
                })

                const categoryRows: CategoryRow[] = Array.from(categoryTotals.entries())
                    .map(([groupId, revenue]) => {
                        const group = menuGroups.find((g) => g.id === groupId)
                        return {
                            category: group?.label ?? groupId,
                            revenue,
                            share: totalAmount > 0 ? (revenue / totalAmount) * 100 : 0,
                        }
                    })
                    .sort((a, b) => b.share - a.share)

                setCategoryData(categoryRows)
            } catch (error) {
                console.error('Error loading revenue concentration data:', error)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [workspace, dateRange])

    // --- Key Calculations ---

    const totalRevenue = useMemo(
        () => productData.reduce((sum, p) => sum + p.amount, 0),
        [productData],
    )

    const hhi = useMemo(() => {
        if (totalRevenue === 0) return 0
        return productData.reduce((sum, p) => {
            const sharePercent = (p.amount / totalRevenue) * 100
            return sum + sharePercent * sharePercent
        }, 0)
    }, [productData, totalRevenue])

    const hhiRisk: 'Low' | 'Medium' | 'High' = useMemo(() => {
        if (hhi < 1500) return 'Low'
        if (hhi <= 2500) return 'Medium'
        return 'High'
    }, [hhi])

    const top5Share = useMemo(() => {
        if (totalRevenue === 0 || productData.length === 0) return 0
        const top5Amount = productData.slice(0, 5).reduce((sum, p) => sum + p.amount, 0)
        return (top5Amount / totalRevenue) * 100
    }, [productData, totalRevenue])

    const top10Share = useMemo(() => {
        if (totalRevenue === 0 || productData.length === 0) return 0
        const top10Amount = productData.slice(0, 10).reduce((sum, p) => sum + p.amount, 0)
        return (top10Amount / totalRevenue) * 100
    }, [productData, totalRevenue])

    // Scenario 1: #1 product drops 50%
    const scenario1 = useMemo(() => {
        if (productData.length === 0) return { name: '', impactGBP: 0, impactPercent: 0 }
        const top = productData[0]
        const impact = top.amount * 0.5
        return {
            name: top.productName,
            impactGBP: impact,
            impactPercent: totalRevenue > 0 ? (impact / totalRevenue) * 100 : 0,
        }
    }, [productData, totalRevenue])

    // Scenario 2: Top 3 products drop 30%
    const scenario2 = useMemo(() => {
        if (productData.length === 0) return { impactGBP: 0, impactPercent: 0 }
        const top3Amount = productData.slice(0, 3).reduce((sum, p) => sum + p.amount, 0)
        const impact = top3Amount * 0.3
        return {
            impactGBP: impact,
            impactPercent: totalRevenue > 0 ? (impact / totalRevenue) * 100 : 0,
        }
    }, [productData, totalRevenue])

    // --- Helpers ---

    function getTop5Color(share: number): string {
        if (share > 70) return 'text-red-600'
        if (share > 50) return 'text-amber-600'
        return 'text-emerald-600'
    }

    function getTop5Bg(share: number): string {
        if (share > 70) return 'border-red-100 bg-red-50'
        if (share > 50) return 'border-amber-100 bg-amber-50'
        return 'border-emerald-100 bg-emerald-50'
    }

    function getHHIBadge(risk: 'Low' | 'Medium' | 'High') {
        switch (risk) {
            case 'Low':
                return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <Shield className="h-3 w-3" /> Low
                    </span>
                )
            case 'Medium':
                return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <AlertTriangle className="h-3 w-3" /> Medium
                    </span>
                )
            case 'High':
                return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        <ShieldAlert className="h-3 w-3" /> High
                    </span>
                )
        }
    }

    // Custom Tooltip for chart
    const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ParetoRow }> }) => {
        if (active && payload && payload.length) {
            const item = payload[0].payload
            return (
                <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                    <p className="font-semibold text-gray-900">{item.productName}</p>
                    <p className="text-sm text-gray-600">
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

    // Category table columns
    const categoryColumns = useMemo(
        () => [
            {
                header: 'Category',
                accessor: (row: CategoryRow) => (
                    <span className="font-medium text-gray-900">{row.category}</span>
                ),
            },
            {
                header: 'Revenue',
                accessor: (row: CategoryRow) =>
                    formatCurrency(workspace.currency, row.revenue),
                align: 'right' as const,
            },
            {
                header: 'Share %',
                accessor: (row: CategoryRow) => `${row.share.toFixed(1)}%`,
                align: 'right' as const,
            },
            {
                header: 'Distribution',
                accessor: (row: CategoryRow) => (
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-full max-w-[120px] rounded-full bg-gray-100">
                            <div
                                className="h-2 rounded-full bg-gray-400"
                                style={{ width: `${Math.min(row.share, 100)}%` }}
                            />
                        </div>
                    </div>
                ),
            },
        ],
        [workspace.currency],
    )

    if (loading) {
        return (
            <div className="app-card p-8 text-center text-gray-500">
                Loading analysis...
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* 1. KPI Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <div
                    className={`app-card rounded-lg border p-4 ${getTop5Bg(top5Share)}`}
                >
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Top 5 Share
                    </p>
                    <p className={`mt-1 text-2xl font-bold ${getTop5Color(top5Share)}`}>
                        {top5Share.toFixed(1)}%
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                        of total revenue
                    </p>
                </div>

                <div className="app-card rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Top 10 Share
                    </p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                        {top10Share.toFixed(1)}%
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                        of total revenue
                    </p>
                </div>

                <div className="app-card rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                        HHI Score
                    </p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                        {Math.round(hhi).toLocaleString()}
                    </p>
                    <div className="mt-1">{getHHIBadge(hhiRisk)}</div>
                </div>
            </div>

            {/* 2. Cumulative Revenue Curve */}
            <div className="app-card p-6">
                <div className="mb-4">
                    <h2 className="section-title">Cumulative Revenue Curve</h2>
                    <p className="text-sm text-gray-500">
                        Individual product revenue and cumulative share across your top
                        products.
                    </p>
                </div>

                <div className="h-[500px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={productData.slice(0, 30)}
                            margin={{ top: 20, right: 60, bottom: 20, left: 40 }}
                        >
                            <CartesianGrid
                                strokeDasharray="3 3"
                                opacity={0.3}
                                vertical={false}
                            />
                            <XAxis
                                dataKey="productName"
                                angle={-45}
                                textAnchor="end"
                                height={100}
                                interval={0}
                                tick={{ fontSize: 11, fill: '#6b7280' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                yAxisId="left"
                                orientation="left"
                                stroke="#6b7280"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6b7280', fontSize: 12 }}
                                tickFormatter={(val: number) =>
                                    formatCurrency(workspace.currency, val)
                                        .replace(workspace.currency, '')
                                        .trim()
                                }
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke="#6b7280"
                                unit="%"
                                domain={[0, 100]}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6b7280', fontSize: 12 }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar
                                yAxisId="left"
                                dataKey="amount"
                                name="Revenue"
                                fill="#6b7280"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={40}
                            />
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="cumulativePercent"
                                name="Cumulative %"
                                stroke="#374151"
                                strokeWidth={2.5}
                                dot={false}
                            />
                            <ReferenceLine
                                yAxisId="right"
                                y={80}
                                stroke="#9ca3af"
                                strokeDasharray="5 5"
                                strokeWidth={1.5}
                                label={{
                                    value: '80%',
                                    position: 'right',
                                    fill: '#6b7280',
                                    fontSize: 12,
                                }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                    <p className="mt-2 text-center text-xs text-gray-400">
                        * Chart shows top 30 products for clarity
                    </p>
                </div>
            </div>

            {/* 3. Risk Scenarios */}
            <div className="grid gap-4 md:grid-cols-2">
                <div className="app-card rounded-lg border border-red-200 bg-red-50 p-5">
                    <div className="mb-2 flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-red-500" />
                        <h3 className="text-sm font-semibold text-red-900">
                            Scenario: #{1} product drops 50%
                        </h3>
                    </div>
                    <p className="text-xs text-red-700">
                        If <span className="font-semibold">{scenario1.name}</span> drops
                        50% in revenue
                    </p>
                    <div className="mt-3 flex gap-6">
                        <div>
                            <p className="text-xs text-red-500">GBP Impact</p>
                            <p className="text-lg font-bold text-red-800">
                                {formatCurrency(workspace.currency, scenario1.impactGBP)}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-red-500">Revenue Impact</p>
                            <p className="text-lg font-bold text-red-800">
                                {scenario1.impactPercent.toFixed(1)}%
                            </p>
                        </div>
                    </div>
                </div>

                <div className="app-card rounded-lg border border-amber-200 bg-amber-50 p-5">
                    <div className="mb-2 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        <h3 className="text-sm font-semibold text-amber-900">
                            Scenario: Top 3 products drop 30%
                        </h3>
                    </div>
                    <p className="text-xs text-amber-700">
                        If your top 3 products lose 30% of their revenue
                    </p>
                    <div className="mt-3 flex gap-6">
                        <div>
                            <p className="text-xs text-amber-500">GBP Impact</p>
                            <p className="text-lg font-bold text-amber-800">
                                {formatCurrency(workspace.currency, scenario2.impactGBP)}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-amber-500">Revenue Impact</p>
                            <p className="text-lg font-bold text-amber-800">
                                {scenario2.impactPercent.toFixed(1)}%
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. Category Concentration Table */}
            <div className="app-card p-6">
                <div className="mb-4">
                    <h2 className="section-title">Category Concentration</h2>
                    <p className="text-sm text-gray-500">
                        Revenue distribution across menu categories.
                    </p>
                </div>
                <DataTable
                    columns={categoryColumns}
                    data={categoryData}
                    emptyLabel="No category data available."
                />
            </div>
        </div>
    )
}
