import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, TrendingUp, Info, AlertTriangle } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { DataTable } from '../../components/tables/DataTable'

type CorrelationResult = {
    productA: string
    productAName: string
    productACategory: string
    productB: string
    productBName: string
    productBCategory: string
    score: number // Pearson r (-1 to 1)
    strength: 'Strong Positive' | 'Moderate Positive' | 'Moderate Negative' | 'Strong Negative'
    monthsActive: number // How many months both products were active
    avgQtyA: number
    avgQtyB: number
}

// Minimum monthly average quantity for a product to be included
const MIN_MONTHLY_AVG_QTY = 5
// Minimum percentage of months a product must be active
const MIN_ACTIVITY_RATIO = 0.5
// Minimum correlation strength to display
const MIN_CORRELATION = 0.7
// Minimum months needed for statistical validity
const MIN_MONTHS = 4

export function ProductCorrelation({ dateRange }: { dateRange: { start: Date; end: Date } }) {
    const workspace = useWorkspace()
    const [loading, setLoading] = useState(true)
    const [correlations, setCorrelations] = useState<CorrelationResult[]>([])

    useEffect(() => {
        async function analyzeTrends() {
            setLoading(true)
            try {
                const { fetchSalesLines } = await import('../../lib/api/analytics')
                const { listProducts } = await import('../../lib/api/products')
                const { getMenuGroups } = await import('../../lib/api/menuGroups')

                const [lines, products, groups] = await Promise.all([
                    fetchSalesLines(workspace, { dateRange }),
                    listProducts(workspace),
                    getMenuGroups(workspace)
                ])

                if (lines.length === 0) {
                    setCorrelations([])
                    setLoading(false)
                    return
                }

                // 1. Build Period Keys
                const allPeriods = Array.from(new Set(lines.map(l => l.periodKey))).sort()

                if (allPeriods.length < MIN_MONTHS) {
                    setCorrelations([])
                    setLoading(false)
                    return
                }

                // 2. Build Product Vectors: Map<ProductId, Map<PeriodKey, Quantity>>
                const productVectors = new Map<string, Map<string, number>>()
                const productInfo = new Map<string, { name: string, category: string, categoryId: string }>()

                const getCategoryLabel = (id: string) => groups.find(g => g.id === id)?.label || 'Uncategorized'

                products.forEach(p => {
                    productInfo.set(p.id, {
                        name: p.name,
                        category: getCategoryLabel(p.menuGroupId),
                        categoryId: p.menuGroupId
                    })
                })

                lines.forEach(line => {
                    if (!productVectors.has(line.productId)) {
                        productVectors.set(line.productId, new Map())
                        if (!productInfo.has(line.productId)) {
                            productInfo.set(line.productId, {
                                name: line.productNameAtSale,
                                category: line.menuGroupAtSale ? getCategoryLabel(line.menuGroupAtSale) : 'Unknown',
                                categoryId: line.menuGroupAtSale || ''
                            })
                        }
                    }
                    const vec = productVectors.get(line.productId)!
                    vec.set(line.periodKey, (vec.get(line.periodKey) || 0) + line.quantity)
                })

                // 3. Filter products: must be active in >= 50% of months AND have avg monthly qty >= 5
                const validProductIds: string[] = []
                productVectors.forEach((vec, pid) => {
                    const activeMonths = vec.size
                    const totalQty = Array.from(vec.values()).reduce((s, v) => s + v, 0)
                    const avgMonthlyQty = totalQty / allPeriods.length

                    if (activeMonths >= allPeriods.length * MIN_ACTIVITY_RATIO && avgMonthlyQty >= MIN_MONTHLY_AVG_QTY) {
                        validProductIds.push(pid)
                    }
                })

                // 4. Helper: normalize product name for similarity check
                function normalizeForComparison(name: string): string {
                    return name.toLowerCase()
                        .replace(/\(extra\)/gi, '')
                        .replace(/\(side\)/gi, '')
                        .replace(/\(add[- ]?on\)/gi, '')
                        .replace(/\s+/g, ' ')
                        .trim()
                }

                // 5. Calculate Pearson Correlation
                const results: CorrelationResult[] = []

                for (let i = 0; i < validProductIds.length; i++) {
                    for (let j = i + 1; j < validProductIds.length; j++) {
                        const idA = validProductIds[i]
                        const idB = validProductIds[j]
                        const infoA = productInfo.get(idA)
                        const infoB = productInfo.get(idB)

                        // Skip trivially related products:
                        // Same normalized name (e.g., "Fries" vs "Fries (Extra)")
                        if (infoA && infoB) {
                            const normA = normalizeForComparison(infoA.name)
                            const normB = normalizeForComparison(infoB.name)
                            if (normA === normB) continue
                            // Skip if one name contains the other (e.g., "Curly Fries" vs "Curly Fries (Extra)")
                            if (normA.includes(normB) || normB.includes(normA)) continue
                        }

                        // Prepare aligned vectors
                        const x: number[] = []
                        const y: number[] = []

                        allPeriods.forEach(period => {
                            x.push(productVectors.get(idA)?.get(period) || 0)
                            y.push(productVectors.get(idB)?.get(period) || 0)
                        })

                        const r = calculatePearsonCorrelation(x, y)

                        if (!isNaN(r) && Math.abs(r) >= MIN_CORRELATION) {
                            let strength: CorrelationResult['strength']
                            if (r >= 0.85) strength = 'Strong Positive'
                            else if (r >= 0.7) strength = 'Moderate Positive'
                            else if (r <= -0.85) strength = 'Strong Negative'
                            else strength = 'Moderate Negative'

                            // Count months where both products had sales
                            const bothActiveMonths = allPeriods.filter(p => {
                                const qA = productVectors.get(idA)?.get(p) || 0
                                const qB = productVectors.get(idB)?.get(p) || 0
                                return qA > 0 && qB > 0
                            }).length

                            const totalQtyA = Array.from(productVectors.get(idA)?.values() || []).reduce((s, v) => s + v, 0)
                            const totalQtyB = Array.from(productVectors.get(idB)?.values() || []).reduce((s, v) => s + v, 0)

                            results.push({
                                productA: idA,
                                productAName: infoA?.name || idA,
                                productACategory: infoA?.category || '',
                                productB: idB,
                                productBName: infoB?.name || idB,
                                productBCategory: infoB?.category || '',
                                score: r,
                                strength,
                                monthsActive: bothActiveMonths,
                                avgQtyA: totalQtyA / allPeriods.length,
                                avgQtyB: totalQtyB / allPeriods.length,
                            })
                        }
                    }
                }

                setCorrelations(results.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)))

            } catch (error) {
                console.error('Error in correlation analysis:', error)
            } finally {
                setLoading(false)
            }
        }

        analyzeTrends()
    }, [workspace, dateRange])

    function calculatePearsonCorrelation(x: number[], y: number[]): number {
        const n = x.length
        if (n === 0) return 0

        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0

        for (let i = 0; i < n; i++) {
            sumX += x[i]
            sumY += y[i]
            sumXY += x[i] * y[i]
            sumX2 += x[i] * x[i]
            sumY2 += y[i] * y[i]
        }

        const numerator = n * sumXY - sumX * sumY
        const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))

        if (denominator === 0) return 0
        return numerator / denominator
    }

    const columns = useMemo(() => [
        {
            header: 'Product A',
            accessor: (row: CorrelationResult) => (
                <div>
                    <div className="font-medium text-slate-900">{row.productAName}</div>
                    <div className="text-xs text-slate-500">{row.productACategory}</div>
                </div>
            )
        },
        {
            header: '',
            accessor: () => <ArrowLeftRight className="h-4 w-4 text-slate-400" />,
            align: 'center' as const
        },
        {
            header: 'Product B',
            accessor: (row: CorrelationResult) => (
                <div>
                    <div className="font-medium text-slate-900">{row.productBName}</div>
                    <div className="text-xs text-slate-500">{row.productBCategory}</div>
                </div>
            )
        },
        {
            header: 'Trend',
            accessor: (row: CorrelationResult) => {
                const isPositive = row.score > 0
                const color = isPositive ? 'text-emerald-700' : 'text-rose-700'
                const bg = isPositive ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
                const label = isPositive ? 'Co-trending' : 'Inverse'
                return (
                    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${bg} ${color}`}>
                        {label}
                    </div>
                )
            },
            align: 'center' as const
        },
        {
            header: 'Strength (r)',
            accessor: (row: CorrelationResult) => (
                <div className="flex flex-col items-end">
                    <span className={`font-bold ${Math.abs(row.score) >= 0.85 ? 'text-slate-900' : 'text-slate-600'}`}>
                        {row.score.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400">{row.strength}</span>
                </div>
            ),
            align: 'right' as const
        },
        {
            header: 'Active Months',
            accessor: (row: CorrelationResult) => (
                <span className="text-xs text-slate-500">{row.monthsActive}</span>
            ),
            align: 'right' as const
        }
    ], [])

    if (loading) {
        return <div className="app-card p-12 text-center text-slate-500">
            <p>Analyzing monthly sales trends...</p>
            <p className="text-sm mt-2">Calculating correlation coefficients across periods.</p>
        </div>
    }

    return (
        <div className="space-y-6">
            {/* Methodology Note */}
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800">
                    <p className="font-semibold">How to read this analysis</p>
                    <p className="mt-1 text-amber-700">
                        This shows <strong>monthly sales trend correlation</strong> — products whose sales volumes rise and fall in the same months.
                        <strong> Co-trending</strong> means both products have high/low sales in the same periods (seasonal similarity).
                        <strong> Inverse</strong> means when one rises, the other falls (possible substitutes).
                        This is <em>not</em> a basket/transaction analysis.
                    </p>
                </div>
            </div>

            <div className="app-card p-6">
                <div className="mb-6">
                    <h2 className="section-title flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-indigo-600" />
                        Monthly Sales Trend Correlation
                    </h2>
                    <p className="text-sm text-slate-500">
                        Products with similar monthly sales patterns (|r| &ge; {MIN_CORRELATION}).
                        Filtered to products averaging &ge; {MIN_MONTHLY_AVG_QTY} units/month, active in &ge; {Math.round(MIN_ACTIVITY_RATIO * 100)}% of months.
                    </p>
                </div>

                {correlations.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                        <Info className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                        <h3 className="text-lg font-medium text-slate-900">No significant correlations found</h3>
                        <p className="text-slate-500">
                            We need at least {MIN_MONTHS} months of data with sufficient product volume.
                            Try expanding your date range or lowering filters.
                        </p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <DataTable
                            data={correlations.slice(0, 50)}
                            columns={columns}
                        />
                        {correlations.length > 50 && (
                            <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50 border-t border-slate-200 text-center">
                                Showing top 50 strongest correlations out of {correlations.length} found.
                            </p>
                        )}
                    </div>
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="app-card p-4">
                    <h4 className="font-medium text-emerald-800 mb-1">Co-trending (r &ge; 0.7)</h4>
                    <p className="text-xs text-slate-500">
                        Sales volumes move in the same direction across months. Could indicate shared seasonality, complementary appeal, or similar customer segments.
                    </p>
                </div>
                <div className="app-card p-4">
                    <h4 className="font-medium text-rose-800 mb-1">Inverse (r &le; -0.7)</h4>
                    <p className="text-xs text-slate-500">
                        When one product's sales rise, the other's fall. May indicate substitute products competing for the same demand.
                    </p>
                </div>
                <div className="app-card p-4">
                    <h4 className="font-medium text-slate-800 mb-1">Filters Applied</h4>
                    <p className="text-xs text-slate-500">
                        Products with similar names (e.g., "Fries" vs "Fries Extra") are excluded.
                        Only products with meaningful volume are shown.
                    </p>
                </div>
            </div>
        </div>
    )
}
