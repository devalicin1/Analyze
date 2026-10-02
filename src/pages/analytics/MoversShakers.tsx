import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Calendar } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { fetchSalesLines } from '../../lib/api/analytics'
import { getMenuGroups } from '../../lib/api/menuGroups'
import { formatCurrency } from '../../lib/utils/formatting'
import type { MenuGroup, SalesLine } from '../../lib/types'

import { format, subMonths } from 'date-fns'

type ProductVariance = {
    productId: string
    productName: string
    currentAmount: number
    previousAmount: number
    varianceAmount: number
    variancePercent: number
    currentQty: number
    previousQty: number
    menuGroupId?: string
    menuGroupName?: string
    menuSubGroupId?: string
    menuSubGroupName?: string
}

type SubCategoryStats = {
    id: string
    name: string
    parentGroupId: string
    parentGroupName: string
    variancePercent: number
    varianceAmount: number
    currentAmount: number
}

type CategoryStats = {
    id: string
    name: string
    variancePercent: number
    varianceAmount: number
    currentAmount: number
}

type WorkspaceStats = {
    variancePercent: number
    varianceAmount: number
    currentAmount: number
}

export function MoversShakers() {
    const workspace = useWorkspace()
    const [loading, setLoading] = useState(true)
    const [periods, setPeriods] = useState<string[]>([])
    const [currentPeriod, setCurrentPeriod] = useState<string>('')
    const [previousPeriod, setPreviousPeriod] = useState<string>('')
    const [data, setData] = useState<ProductVariance[]>([])
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
    const [categoryStats, setCategoryStats] = useState<Map<string, CategoryStats>>(new Map())
    const [subCategoryStats, setSubCategoryStats] = useState<Map<string, SubCategoryStats>>(new Map())
    const [workspaceStats, setWorkspaceStats] = useState<WorkspaceStats | null>(null)

    const selectedProduct = useMemo(() =>
        data.find(p => p.productId === selectedProductId),
        [data, selectedProductId])

    // Initialize periods
    useEffect(() => {
        const today = new Date()
        const last13Months = Array.from({ length: 13 }).map((_, i) => {
            const d = subMonths(today, i)
            return format(d, 'yyyy-MM')
        })
        setPeriods(last13Months)
        setCurrentPeriod(last13Months[0])
        setPreviousPeriod(last13Months[1])
    }, [])

    useEffect(() => {
        async function loadComparison() {
            if (!currentPeriod || !previousPeriod) return

            setLoading(true)
            try {
                const [currentLines, previousLines, mGroups] = await Promise.all([
                    fetchSalesLines(workspace, { periodKey: currentPeriod }),
                    fetchSalesLines(workspace, { periodKey: previousPeriod }),
                    getMenuGroups(workspace)
                ])

                // Build a global map for sub-category labels to ensure robust lookup
                const subCategoryLabels = new Map<string, string>()
                mGroups.forEach(g => {
                    g.subGroups?.forEach(s => {
                        subCategoryLabels.set(s.id, s.label)
                    })
                })

                // Aggregate by product
                const currentTotals = new Map<string, { amount: number, qty: number }>()
                const previousTotals = new Map<string, { amount: number, qty: number }>()
                const productNames = new Map<string, string>()

                currentLines.forEach(line => {
                    const existing = currentTotals.get(line.productId) || { amount: 0, qty: 0 }
                    currentTotals.set(line.productId, {
                        amount: existing.amount + line.amount,
                        qty: existing.qty + line.quantity
                    })
                    productNames.set(line.productId, line.productNameAtSale)
                })

                previousLines.forEach(line => {
                    const existing = previousTotals.get(line.productId) || { amount: 0, qty: 0 }
                    previousTotals.set(line.productId, {
                        amount: existing.amount + line.amount,
                        qty: existing.qty + line.quantity
                    })
                    if (!productNames.has(line.productId)) {
                        productNames.set(line.productId, line.productNameAtSale)
                    }
                })

                // Calculate variances
                const variances: ProductVariance[] = []
                const catMap = new Map<string, { curr: number, prev: number, name: string }>()
                const subCatMap = new Map<string, { curr: number, prev: number, name: string, pId: string, pName: string }>()
                let totalCurr = 0
                let totalPrev = 0

                productNames.forEach((name, id) => {
                    const curr = currentTotals.get(id) || { amount: 0, qty: 0 }
                    const prev = previousTotals.get(id) || { amount: 0, qty: 0 }
                    const diff = curr.amount - prev.amount
                    const pct = prev.amount > 0 ? diff / prev.amount : curr.amount > 0 ? 1 : 0

                    totalCurr += curr.amount
                    totalPrev += prev.amount

                    // Find category info from lines
                    const sampleLine = [...currentLines, ...previousLines].find((l: SalesLine) => l.productId === id)
                    const mgId = sampleLine?.menuGroupAtSale || 'unknown'
                    const group = mGroups.find((g: MenuGroup) => g.id === mgId)
                    const mgLabel = group?.label || mgId

                    const subMgId = sampleLine?.menuSubGroupAtSale || 'unknown'
                    const subMgLabel = subCategoryLabels.get(subMgId) || subMgId

                    if (mgId !== 'unknown') {
                        const mg = catMap.get(mgId) || { curr: 0, prev: 0, name: mgLabel }
                        mg.curr += curr.amount
                        mg.prev += prev.amount
                        catMap.set(mgId, mg)
                    }

                    if (subMgId !== 'unknown') {
                        const subMg = subCatMap.get(subMgId) || { curr: 0, prev: 0, name: subMgLabel, pId: mgId, pName: mgLabel }
                        subMg.curr += curr.amount
                        subMg.prev += prev.amount
                        subCatMap.set(subMgId, subMg)
                    }

                    if (curr.amount > 0 || prev.amount > 0) {
                        variances.push({
                            productId: id,
                            productName: name,
                            currentAmount: curr.amount,
                            previousAmount: prev.amount,
                            currentQty: curr.qty,
                            previousQty: prev.qty,
                            varianceAmount: diff,
                            variancePercent: pct,
                            menuGroupId: mgId !== 'unknown' ? mgId : undefined,
                            menuGroupName: mgLabel !== 'unknown' ? mgLabel : undefined,
                            menuSubGroupId: subMgId !== 'unknown' ? subMgId : undefined,
                            menuSubGroupName: subMgLabel !== 'unknown' ? subMgLabel : undefined
                        })
                    }
                })

                // Finalize category stats
                const finalizedCatStats = new Map<string, CategoryStats>()
                catMap.forEach((v, k) => {
                    finalizedCatStats.set(k, {
                        id: k,
                        name: v.name,
                        varianceAmount: v.curr - v.prev,
                        currentAmount: v.curr,
                        variancePercent: v.prev > 0 ? (v.curr - v.prev) / v.prev : 0
                    })
                })

                // Finalize sub-category stats
                const finalizedSubCatStats = new Map<string, SubCategoryStats>()
                subCatMap.forEach((v, k) => {
                    finalizedSubCatStats.set(k, {
                        id: k,
                        name: v.name,
                        parentGroupId: v.pId,
                        parentGroupName: v.pName,
                        varianceAmount: v.curr - v.prev,
                        currentAmount: v.curr,
                        variancePercent: v.prev > 0 ? (v.curr - v.prev) / v.prev : 0
                    })
                })

                setCategoryStats(finalizedCatStats)
                setSubCategoryStats(finalizedSubCatStats)
                setWorkspaceStats({
                    varianceAmount: totalCurr - totalPrev,
                    currentAmount: totalCurr,
                    variancePercent: totalPrev > 0 ? (totalCurr - totalPrev) / totalPrev : 0
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
                                    <button
                                        key={item.productId}
                                        onClick={() => setSelectedProductId(item.productId)}
                                        className={`w-full flex items-center justify-between rounded-lg bg-white p-3 shadow-sm transition-all hover:ring-2 hover:ring-red-200 ${selectedProductId === item.productId ? 'ring-2 ring-red-500' : ''}`}
                                    >
                                        <div className="min-w-0 flex-1 text-left">
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
                                    </button>
                                ))}
                                {losers.length === 0 && (
                                    <p className="text-center text-sm text-slate-500 py-4">No losers found in this period.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Deep Dive Modal */}
            {selectedProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
                        onClick={() => setSelectedProductId(null)}
                    />

                    {/* Modal Content */}
                    <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-300">
                        <div className="flex flex-col max-h-[90vh]">
                            {/* Header */}
                            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-6">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">Deep Dive: {selectedProduct.productName}</h2>
                                    <p className="text-sm text-slate-500">Comprehensive performance analysis and recommendations.</p>
                                </div>
                                <button
                                    onClick={() => setSelectedProductId(null)}
                                    className="rounded-full p-2 hover:bg-white hover:shadow-sm text-slate-400 transition-all"
                                >
                                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>

                            {/* Body */}
                            <div className="flex-1 overflow-y-auto p-6">
                                <div className="grid gap-6 lg:grid-cols-12">
                                    {/* Left Column: Metrics & Correlation */}
                                    <div className="space-y-6 lg:col-span-5">
                                        {/* Status Chip */}
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${selectedProduct.variancePercent < -0.2 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                                }`}>
                                                {selectedProduct.variancePercent < -0.2 ? 'Critical Decline' : 'Moderate Decline'}
                                            </span>
                                            <span className="text-xs text-slate-400 font-medium">Comparison vs Previous Period</span>
                                        </div>

                                        {/* Core Variance Table */}
                                        <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-4">
                                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Metric Breakdown</h3>
                                            <div className="space-y-4">
                                                {(() => {
                                                    const formatKey = (key: string) => {
                                                        const [y, m] = key.split('-').map(Number)
                                                        return format(new Date(y, m - 1), 'MMM yy')
                                                    }
                                                    const currMonth = formatKey(currentPeriod)
                                                    const prevMonth = formatKey(previousPeriod)

                                                    return [
                                                        { label: 'Revenue', prev: selectedProduct.previousAmount, curr: selectedProduct.currentAmount, type: 'currency' },
                                                        { label: 'Volume (Qty)', prev: selectedProduct.previousQty, curr: selectedProduct.currentQty, type: 'number' },
                                                    ].map((m) => {
                                                        const diff = m.curr - m.prev
                                                        const varP = m.prev > 0 ? (m.curr - m.prev) / m.prev : 0
                                                        return (
                                                            <div key={m.label} className="space-y-2 pb-3 mb-3 border-b border-slate-100 last:border-0 last:pb-0 last:mb-0">
                                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{m.label}</div>
                                                                <div className="grid grid-cols-3 gap-2">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] text-slate-400 font-medium">{currMonth} (Curr)</span>
                                                                        <span className="text-sm font-bold text-slate-900">
                                                                            {m.type === 'currency' ? formatCurrency(workspace.currency, m.curr) : m.curr}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] text-slate-400 font-medium">{prevMonth} (Prev)</span>
                                                                        <span className="text-sm font-medium text-slate-600">
                                                                            {m.type === 'currency' ? formatCurrency(workspace.currency, m.prev) : m.prev}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex flex-col items-end">
                                                                        <span className="text-[9px] text-slate-400 font-medium text-right">Change</span>
                                                                        <div className="text-right">
                                                                            <p className={`text-sm font-black ${diff < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                                                {diff > 0 ? '+' : ''}{m.type === 'currency' ? formatCurrency(workspace.currency, diff) : diff}
                                                                            </p>
                                                                            <p className={`text-[9px] font-bold ${varP < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                                                                ({varP > 0 ? '+' : ''}{Math.round(varP * 100)}%)
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })
                                                })()}
                                            </div>
                                        </div>

                                        {/* Performance Correlation */}
                                        <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Correlation</h3>
                                            <div className="space-y-4">
                                                {[
                                                    { label: 'Product', value: selectedProduct.variancePercent, amount: selectedProduct.currentAmount, color: 'bg-red-500' },
                                                    {
                                                        label: `Sub-Cat: ${selectedProduct.menuSubGroupName || 'Other'}`,
                                                        value: subCategoryStats.get(selectedProduct.menuSubGroupId || selectedProduct.menuSubGroupName || '')?.variancePercent || 0,
                                                        amount: subCategoryStats.get(selectedProduct.menuSubGroupId || selectedProduct.menuSubGroupName || '')?.currentAmount || 0,
                                                        color: 'bg-slate-500'
                                                    },
                                                    {
                                                        label: `Category: ${selectedProduct.menuGroupName || 'Other'}`,
                                                        value: categoryStats.get(selectedProduct.menuGroupId || '')?.variancePercent || 0,
                                                        amount: categoryStats.get(selectedProduct.menuGroupId || '')?.currentAmount || 0,
                                                        color: 'bg-slate-400'
                                                    },
                                                    { label: 'Workspace', value: workspaceStats?.variancePercent || 0, amount: workspaceStats?.currentAmount || 0, color: 'bg-slate-300' }
                                                ].map((item) => (
                                                    <div key={item.label}>
                                                        <div className="flex justify-between text-[10px] mb-1">
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold text-slate-700">{item.label}</span>
                                                                <span className="text-slate-400 font-medium">{formatCurrency(workspace.currency, item.amount)}</span>
                                                            </div>
                                                            <span className={`font-bold self-end ${item.value < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                                {item.value > 0 ? '+' : ''}{Math.round(item.value * 100)}%
                                                            </span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full ${item.color} transition-all duration-1000`}
                                                                style={{ width: `${Math.min(100, Math.abs(item.value) * 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Diagnosis & Recommendations */}
                                    <div className="space-y-6 lg:col-span-7">
                                        <div className="h-full rounded-2xl border border-indigo-100 bg-indigo-50/30 p-6 flex flex-col">
                                            <h3 className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">
                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                                                Automated Diagnosis
                                            </h3>

                                            {(() => {
                                                const prodVar = selectedProduct.variancePercent
                                                const subCatStat = subCategoryStats.get(selectedProduct.menuSubGroupId || selectedProduct.menuSubGroupName || '')
                                                const subCatVar = subCatStat?.variancePercent || 0
                                                const catStat = categoryStats.get(selectedProduct.menuGroupId || '')
                                                const catVar = catStat?.variancePercent || 0
                                                const workVar = workspaceStats?.variancePercent || 0

                                                const currentAvgPrice = selectedProduct.currentQty > 0 ? selectedProduct.currentAmount / selectedProduct.currentQty : 0
                                                const previousAvgPrice = selectedProduct.previousQty > 0 ? selectedProduct.previousAmount / selectedProduct.previousQty : 0
                                                const priceVar = previousAvgPrice > 0 ? (currentAvgPrice - previousAvgPrice) / previousAvgPrice : 0
                                                const qtyVar = selectedProduct.previousQty > 0 ? (selectedProduct.currentQty - selectedProduct.previousQty) / selectedProduct.previousQty : 0

                                                // Determination logic
                                                let diagnosis = ""
                                                let logic = ""
                                                let recommendation = ""

                                                if (prodVar < subCatVar - 0.08) {
                                                    diagnosis = "Internal Cannibalization"
                                                    logic = `${selectedProduct.productName} is losing significantly more ground (${Math.round(prodVar * 100)}%) than its sub-category neighbors (${Math.round(subCatVar * 100)}%). This indicates that customers are switching to specific alternatives within the ${selectedProduct.menuSubGroupName} list.`
                                                    recommendation = "Review the top gainers within this sub-category. Consider a promotional bundle with a rising item or refresh the product's menu visibility."
                                                } else if (subCatVar < catVar - 0.05) {
                                                    diagnosis = "Sub-Category Trend Shift"
                                                    logic = `The entire ${selectedProduct.menuSubGroupName || 'sub-category'} is declining (${Math.round(subCatVar * 100)}%), while the broader ${selectedProduct.menuGroupName} category is more resilient (${Math.round(catVar * 100)}%). This is a shift in specific consumer taste.`
                                                    recommendation = "Don't blame the product; the trend is broader. Evaluate if this product type is losing seasonal relevance or if a competitor has launched a targeted offer."
                                                } else if (catVar < workVar - 0.05) {
                                                    diagnosis = "Category Fatigue"
                                                    logic = `The entire ${selectedProduct.menuGroupName || 'category'} is trending downward while the rest of the business is resilient. This isn't just a product issue; it's a structural shift in category demand.`
                                                    recommendation = "Analyze if the entire category needs a seasonal refresh or if promotional budget should be reallocated to growing categories."
                                                } else if (Math.abs(priceVar) > 0.08 && Math.abs(qtyVar) < 0.05) {
                                                    diagnosis = "Yield Erasure"
                                                    logic = "Sales amount dropped primarily due to a lower average price points, even though volume remained stable. This usually happens after excessive discounting or unit-price changes."
                                                    recommendation = "Your volume is healthy! However, you're making less per unit. Review active discounts or 'hidden' price reductions that might be eroding your margins."
                                                } else if (workVar < -0.05 && Math.abs(prodVar - workVar) < 0.1) {
                                                    diagnosis = "Systemic Market Drop"
                                                    logic = "This decline perfectly mirrors your overall business trend for this period. External factors (weather, local events, or general economy) are likely the primary drivers."
                                                    recommendation = "Monitor costs and labor during this period. The drop is not unique to this product, so focus on high-margin items to weather the seasonal downturn."
                                                } else {
                                                    diagnosis = "Isolated Decline"
                                                    logic = "This product's drop is unique. Neither the sub-category, category, nor the workspace shares this trajectory. This typically points to quality or consistency issues."
                                                    recommendation = "Investigate kitchen/bar consistency or look into recent customer feedback specific to this item. Ensure the product is correctly listed on digital menus."
                                                }

                                                const subCatSubstitutes = data
                                                    .filter(p =>
                                                        p.menuSubGroupId === selectedProduct.menuSubGroupId &&
                                                        p.varianceAmount > 0 &&
                                                        p.productId !== selectedProduct.productId
                                                    )
                                                    .sort((a, b) => b.varianceAmount - a.varianceAmount)

                                                const substitutes = subCatSubstitutes.length > 0
                                                    ? subCatSubstitutes.slice(0, 3)
                                                    : data
                                                        .filter(p =>
                                                            p.menuGroupId === selectedProduct.menuGroupId &&
                                                            p.varianceAmount > 0 &&
                                                            p.productId !== selectedProduct.productId
                                                        )
                                                        .sort((a, b) => b.varianceAmount - a.varianceAmount)
                                                        .slice(0, 3)

                                                const subCatGainers = Array.from(subCategoryStats.values())
                                                    .filter(s => s.varianceAmount > 0 && s.id !== selectedProduct.menuSubGroupId && s.parentGroupId === selectedProduct.menuGroupId)
                                                    .sort((a, b) => b.varianceAmount - a.varianceAmount)
                                                    .slice(0, 3)

                                                const catGainers = Array.from(categoryStats.values())
                                                    .filter(c => c.varianceAmount > 0 && c.id !== selectedProduct.menuGroupId)
                                                    .sort((a, b) => b.varianceAmount - a.varianceAmount)
                                                    .slice(0, 3)

                                                return (
                                                    <div className="space-y-6 flex-1 flex flex-col">
                                                        <div>
                                                            <div className="text-2xl font-black text-indigo-900 mb-2 leading-tight">{diagnosis}</div>
                                                            <p className="text-sm text-slate-700 leading-relaxed italic border-l-2 border-indigo-200 pl-4">{logic}</p>
                                                        </div>

                                                        {diagnosis === "Internal Cannibalization" && substitutes.length > 0 && (
                                                            <div className="bg-white/60 rounded-xl p-4 border border-indigo-100">
                                                                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-3">Product Migration Targets</p>
                                                                <div className="space-y-2">
                                                                    {substitutes.map(p => (
                                                                        <div key={p.productId} className="flex items-center justify-between group/item">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-xs font-bold text-slate-700">{p.productName}</span>
                                                                                <span className="text-[9px] text-slate-400 font-medium">
                                                                                    {p.menuGroupName} {p.menuSubGroupName && p.menuSubGroupName !== 'None' ? `> ${p.menuSubGroupName}` : ''}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex flex-col items-end">
                                                                                <span className="text-[10px] font-black text-emerald-600">+{formatCurrency(workspace.currency, p.varianceAmount)}</span>
                                                                                <span className="text-[9px] font-bold text-emerald-500/80">+{Math.round(p.variancePercent * 100)}% Growth</span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {diagnosis === "Sub-Category Trend Shift" && subCatGainers.length > 0 && (
                                                            <div className="bg-white/60 rounded-xl p-4 border border-indigo-100">
                                                                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-3">Gaining Sub-Categories</p>
                                                                <div className="space-y-2">
                                                                    {subCatGainers.map(s => (
                                                                        <div key={s.id} className="flex items-center justify-between group/item">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-xs font-bold text-slate-700">{s.name}</span>
                                                                                <span className="text-[9px] text-slate-400 font-medium">Inside {s.parentGroupName}</span>
                                                                            </div>
                                                                            <div className="flex flex-col items-end">
                                                                                <span className="text-[10px] font-black text-emerald-600">+{formatCurrency(workspace.currency, s.varianceAmount)}</span>
                                                                                <span className="text-[9px] font-bold text-emerald-500/80">+{Math.round(s.variancePercent * 100)}% Growth</span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {diagnosis === "Category Fatigue" && catGainers.length > 0 && (
                                                            <div className="bg-white/60 rounded-xl p-4 border border-indigo-100">
                                                                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-3">Sector Migration Targets (Categories)</p>
                                                                <div className="space-y-2">
                                                                    {catGainers.map(c => (
                                                                        <div key={c.id} className="flex items-center justify-between group/item">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-xs font-bold text-slate-700">{c.name}</span>
                                                                                <span className="text-[9px] text-slate-400 font-medium">Cross-Category Shift</span>
                                                                            </div>
                                                                            <div className="flex flex-col items-end">
                                                                                <span className="text-[10px] font-black text-emerald-600">+{formatCurrency(workspace.currency, c.varianceAmount)}</span>
                                                                                <span className="text-[9px] font-bold text-emerald-500/80">+{Math.round(c.variancePercent * 100)}% Growth</span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="mt-auto pt-6 border-t border-indigo-200/50">
                                                            <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Recommended Strategy</h4>
                                                            <p className="text-sm font-medium text-indigo-900 bg-indigo-100/50 p-4 rounded-xl">
                                                                {recommendation}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="border-t border-slate-100 bg-slate-50/50 p-4 text-center">
                                <button
                                    onClick={() => setSelectedProductId(null)}
                                    className="px-8 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                                >
                                    Dismiss Analysis
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
