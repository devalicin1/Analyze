import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Calendar, Minus } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { fetchSalesLines } from '../../lib/api/analytics'
import { formatCurrency } from '../../lib/utils/formatting'
import { Select } from '../../components/forms/Select'
import { format, subMonths } from 'date-fns'

type ProductVariance = {
    productId: string
    productName: string
    currentAmount: number
    previousAmount: number
    varianceAmount: number
    variancePercent: number
}

export function MoversShakers() {
    const workspace = useWorkspace()
    const [loading, setLoading] = useState(true)
    const [periods, setPeriods] = useState<string[]>([])
    const [currentPeriod, setCurrentPeriod] = useState<string>('')
    const [previousPeriod, setPreviousPeriod] = useState<string>('')
    const [data, setData] = useState<ProductVariance[]>([])

    // Initialize periods
    useEffect(() => {
        const today = new Date()
        const last12Months = Array.from({ length: 12 }).map((_, i) => {
            const d = subMonths(today, i)
            return format(d, 'yyyy-MM')
        })
        setPeriods(last12Months)
        setCurrentPeriod(last12Months[0])
        setPreviousPeriod(last12Months[1])
    }, [])

    useEffect(() => {
        async function loadComparison() {
            if (!currentPeriod || !previousPeriod) return

            setLoading(true)
            try {
                const [currentLines, previousLines] = await Promise.all([
                    fetchSalesLines(workspace, { periodKey: currentPeriod }),
                    fetchSalesLines(workspace, { periodKey: previousPeriod }),
                ])

                // Aggregate by product
                const currentTotals = new Map<string, number>()
                const previousTotals = new Map<string, number>()
                const productNames = new Map<string, string>()

                currentLines.forEach(line => {
                    currentTotals.set(line.productId, (currentTotals.get(line.productId) || 0) + line.amount)
                    productNames.set(line.productId, line.productNameAtSale)
                })

                previousLines.forEach(line => {
                    previousTotals.set(line.productId, (previousTotals.get(line.productId) || 0) + line.amount)
                    if (!productNames.has(line.productId)) {
                        productNames.set(line.productId, line.productNameAtSale)
                    }
                })

                // Calculate variance
                const variances: ProductVariance[] = []
                productNames.forEach((name, id) => {
                    const curr = currentTotals.get(id) || 0
                    const prev = previousTotals.get(id) || 0
                    const diff = curr - prev
                    const pct = prev > 0 ? diff / prev : curr > 0 ? 1 : 0

                    if (curr > 0 || prev > 0) {
                        variances.push({
                            productId: id,
                            productName: name,
                            currentAmount: curr,
                            previousAmount: prev,
                            varianceAmount: diff,
                            variancePercent: pct,
                        })
                    }
                })

                setData(variances)
            } catch (error) {
                console.error('Error loading movers data:', error)
            } finally {
                setLoading(false)
            }
        }

        loadComparison()
    }, [workspace, currentPeriod, previousPeriod])

    const { gainers, losers } = useMemo(() => {
        const sorted = [...data].sort((a, b) => b.varianceAmount - a.varianceAmount)
        return {
            gainers: sorted.slice(0, 10).filter(i => i.varianceAmount > 0),
            losers: sorted.slice(-10).reverse().filter(i => i.varianceAmount < 0),
        }
    }, [data])

    if (loading && periods.length === 0) {
        return <div className="app-card p-8 text-center text-slate-500">Loading periods...</div>
    }

    return (
        <div className="space-y-6">
            <div className="app-card">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="section-title">Movers & Shakers</h2>
                        <p className="text-sm text-slate-500">
                            Compare sales performance between two periods.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <Calendar className="h-4 w-4 text-slate-400" />
                            <select
                                value={currentPeriod}
                                onChange={(e) => setCurrentPeriod(e.target.value)}
                                className="bg-transparent text-sm font-medium text-slate-700 outline-none"
                            >
                                {periods.map(p => (
                                    <option key={p} value={p}>{format(new Date(p), 'MMM yyyy')}</option>
                                ))}
                            </select>
                        </div>
                        <span className="text-slate-400">vs</span>
                        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <Calendar className="h-4 w-4 text-slate-400" />
                            <select
                                value={previousPeriod}
                                onChange={(e) => setPreviousPeriod(e.target.value)}
                                className="bg-transparent text-sm font-medium text-slate-700 outline-none"
                            >
                                {periods.map(p => (
                                    <option key={p} value={p}>{format(new Date(p), 'MMM yyyy')}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="py-12 text-center text-slate-500">Calculating variance...</div>
                ) : (
                    <div className="grid gap-6 lg:grid-cols-2">
                        {/* Top Gainers */}
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                            <h3 className="mb-4 flex items-center gap-2 font-semibold text-emerald-900">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                                    <ArrowUp className="h-5 w-5" />
                                </div>
                                Top Gainers
                            </h3>
                            <div className="space-y-3">
                                {gainers.map((item) => (
                                    <div key={item.productId} className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-medium text-slate-900">{item.productName}</p>
                                            <p className="text-xs text-slate-500">
                                                {formatCurrency(workspace.currency, item.previousAmount)} → {formatCurrency(workspace.currency, item.currentAmount)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold text-emerald-600">
                                                +{formatCurrency(workspace.currency, item.varianceAmount)}
                                            </p>
                                            <p className="text-xs font-medium text-emerald-600">
                                                +{Math.round(item.variancePercent * 100)}%
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {gainers.length === 0 && (
                                    <p className="text-center text-sm text-slate-500 py-4">No gainers found in this period.</p>
                                )}
                            </div>
                        </div>

                        {/* Biggest Losers */}
                        <div className="rounded-xl border border-red-100 bg-red-50/50 p-4">
                            <h3 className="mb-4 flex items-center gap-2 font-semibold text-red-900">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600">
                                    <ArrowDown className="h-5 w-5" />
                                </div>
                                Biggest Losers
                            </h3>
                            <div className="space-y-3">
                                {losers.map((item) => (
                                    <div key={item.productId} className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-medium text-slate-900">{item.productName}</p>
                                            <p className="text-xs text-slate-500">
                                                {formatCurrency(workspace.currency, item.previousAmount)} → {formatCurrency(workspace.currency, item.currentAmount)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold text-red-600">
                                                {formatCurrency(workspace.currency, item.varianceAmount)}
                                            </p>
                                            <p className="text-xs font-medium text-red-600">
                                                {Math.round(item.variancePercent * 100)}%
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {losers.length === 0 && (
                                    <p className="text-center text-sm text-slate-500 py-4">No losers found in this period.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
