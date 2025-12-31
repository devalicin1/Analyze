import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, TrendingUp, Info } from 'lucide-react'
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
    strength: 'Strong Positive' | 'Moderate Positive' | 'Strong Negative' | 'None'
    monthsCount: number
}

export function ProductCorrelation({ dateRange }: { dateRange: { start: Date; end: Date } }) {
    const workspace = useWorkspace()
    const [loading, setLoading] = useState(true)
    const [correlations, setCorrelations] = useState<CorrelationResult[]>([])
    const [minMonths] = useState(4) // Need at least 4 data points for valid correlation

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

                // 1. Build Period Keys (e.g., "2023-01", "2023-02")
                // We need a consistent timeline for all vectors
                const allPeriods = Array.from(new Set(lines.map(l => l.periodKey))).sort()

                if (allPeriods.length < minMonths) {
                    console.warn('Not enough months for correlation analysis')
                    setCorrelations([])
                    setLoading(false)
                    return
                }

                // 2. Build Product Vectors
                // Map<ProductId, Map<PeriodKey, Quantity>>
                const productVectors = new Map<string, Map<string, number>>()
                const productInfo = new Map<string, { name: string, category: string }>()

                // Helper to get category label
                const getCategoryLabel = (id: string) => groups.find(g => g.id === id)?.label || 'Uncategorized'

                // Pre-fill categories
                products.forEach(p => {
                    productInfo.set(p.id, {
                        name: p.name,
                        category: getCategoryLabel(p.menuGroupId)
                    })
                })

                lines.forEach(line => {
                    if (!productVectors.has(line.productId)) {
                        productVectors.set(line.productId, new Map())
                        // Fallback if product not in list
                        if (!productInfo.has(line.productId)) {
                            productInfo.set(line.productId, {
                                name: line.productNameAtSale,
                                category: line.menuGroupAtSale ? getCategoryLabel(line.menuGroupAtSale) : 'Unknown'
                            })
                        }
                    }
                    const vec = productVectors.get(line.productId)!
                    vec.set(line.periodKey, (vec.get(line.periodKey) || 0) + line.quantity)
                })

                // 3. Filter Low Volume Products
                // Remove products that sold in fewer than 50% of periods to reduce noise
                const validProductIds: string[] = []
                productVectors.forEach((vec, pid) => {
                    if (vec.size >= allPeriods.length * 0.3) { // Active in at least 30% of months
                        validProductIds.push(pid)
                    }
                })

                // 4. Calculate Pearson Correlation
                const results: CorrelationResult[] = []

                for (let i = 0; i < validProductIds.length; i++) {
                    for (let j = i + 1; j < validProductIds.length; j++) {
                        const idA = validProductIds[i]
                        const idB = validProductIds[j]

                        // Prepare aligned vectors
                        const x: number[] = []
                        const y: number[] = []

                        allPeriods.forEach(period => {
                            x.push(productVectors.get(idA)?.get(period) || 0)
                            y.push(productVectors.get(idB)?.get(period) || 0)
                        })

                        const r = calculatePearsonCorrelation(x, y)

                        if (!isNaN(r) && Math.abs(r) >= 0.7) { // Only show significant correlations
                            let strength: CorrelationResult['strength'] = 'None'
                            if (r >= 0.85) strength = 'Strong Positive'
                            else if (r >= 0.7) strength = 'Moderate Positive'
                            else if (r <= -0.85) strength = 'Strong Negative'

                            results.push({
                                productA: idA,
                                productAName: productInfo.get(idA)?.name || idA,
                                productACategory: productInfo.get(idA)?.category || '',
                                productB: idB,
                                productBName: productInfo.get(idB)?.name || idB,
                                productBCategory: productInfo.get(idB)?.category || '',
                                score: r,
                                strength,
                                monthsCount: allPeriods.length
                            })
                        }
                    }
                }

                // Sort by absolute strength
                setCorrelations(results.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)))

            } catch (error) {
                console.error('Error in correlation analysis:', error)
            } finally {
                setLoading(false)
            }
        }

        analyzeTrends()
    }, [workspace, dateRange, minMonths])

    // Pearson Correlation Function
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
            header: 'Correlation Trend',
            accessor: (row: CorrelationResult) => {
                const color = row.score > 0 ? 'text-emerald-600' : 'text-rose-600'
                const bg = row.score > 0 ? 'bg-emerald-50' : 'bg-rose-50'
                const label = row.score > 0 ? 'Moves Together' : 'Inverse'
                return (
                    <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${bg} ${color}`}>
                        {label}
                    </div>
                )
            },
            align: 'center' as const
        },
        {
            header: 'Strength (r)',
            accessor: (row: CorrelationResult) => (
                <div className="flex flex-col">
                    <span className={`font-bold ${Math.abs(row.score) > 0.8 ? 'text-slate-900' : 'text-slate-600'}`}>
                        {row.score.toFixed(2)}
                    </span>
                </div>
            ),
            align: 'right' as const
        }
    ], [])

    if (loading) {
        return <div className="app-card p-12 text-center text-slate-500">
            <p>Analyzing sales trends...</p>
            <p className="text-sm mt-2">Calculating correlation coefficients for monthly periods.</p>
        </div>
    }

    return (
        <div className="space-y-6">
            <div className="app-card">
                <div className="mb-6">
                    <h2 className="section-title flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-indigo-600" />
                        Trend Correlation Analysis
                    </h2>
                    <p className="text-sm text-slate-500">
                        Identifying products that sell together over time (High Correlation &gt; 0.7).
                        Based on monthly sales patterns.
                    </p>
                </div>

                {correlations.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                        <Info className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                        <h3 className="text-lg font-medium text-slate-900">Insufficient Data for Correlation</h3>
                        <p className="text-slate-500">
                            We need at least {minMonths} months of sales data to find meaningful patterns.
                            Try expanding your date range.
                        </p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <DataTable
                            data={correlations.slice(0, 50)}
                            columns={columns}
                        />
                        <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50 border-t border-slate-200 text-center">
                            Showing top 50 strongest correlations out of {correlations.length} found.
                        </p>
                    </div>
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="app-card p-4">
                    <h4 className="font-medium text-slate-900 mb-1">Strong Positive (0.8 - 1.0)</h4>
                    <p className="text-xs text-slate-500">These items almost always sell well in the same months. Likely complementary products or seasonal favorites.</p>
                </div>
                <div className="app-card p-4">
                    <h4 className="font-medium text-slate-900 mb-1">Moderate Positive (0.7 - 0.8)</h4>
                    <p className="text-xs text-slate-500">There is a noticeable pattern of them selling together, but not strictly bound.</p>
                </div>
                <div className="app-card p-4">
                    <h4 className="font-medium text-slate-900 mb-1">Inverse Trend (Negative)</h4>
                    <p className="text-xs text-slate-500">When one sells well, the other drops. Could indicate substitute items or seasonality conflict.</p>
                </div>
            </div>
        </div>
    )
}
