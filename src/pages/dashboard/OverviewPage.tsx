import { useEffect, useMemo, useState } from 'react'
import { differenceInDays, subDays, format } from 'date-fns'
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { fetchSalesLines } from '../../lib/api/analytics'
import { getMenuGroups } from '../../lib/api/menuGroups'
import { formatCurrency, formatPercent } from '../../lib/utils/formatting'
import type { SalesLine, MenuGroup } from '../../lib/types'

/* ---------- types ---------- */

type ProductDelta = {
  productId: string
  productName: string
  menuGroup: string
  currentAmount: number
  previousAmount: number
  currentQty: number
  previousQty: number
  delta: number
  deltaPercent: number
}

type CategoryDelta = {
  menuGroupId: string
  label: string
  color: string
  currentAmount: number
  previousAmount: number
  currentQty: number
  previousQty: number
  delta: number
  deltaPercent: number
  share: number
}

type AttentionItem = {
  type: 'decline' | 'concentration' | 'dropout'
  severity: 'red' | 'amber'
  message: string
}

/* ---------- helpers ---------- */

function safeDateLabel(d: Date, fmt: string): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '\u2014'
  return format(d, fmt)
}

// Range label that keeps the start year when the range spans multiple years,
// so a full-history range reads "Jun 1, 2025 \u2013 Jun 30, 2026" not "Jun 1 \u2013 Jun 30, 2026".
function rangeLabel(start: Date, end: Date): string {
  const validStart = start instanceof Date && !isNaN(start.getTime())
  const validEnd = end instanceof Date && !isNaN(end.getTime())
  const sameYear = validStart && validEnd && start.getFullYear() === end.getFullYear()
  return `${safeDateLabel(start, sameYear ? 'MMM d' : 'MMM d, yyyy')} \u2013 ${safeDateLabel(end, 'MMM d, yyyy')}`
}

function aggregateByField(
  lines: SalesLine[],
  field: 'productId' | 'menuGroupAtSale',
): Map<string, { amount: number; quantity: number; name: string }> {
  const map = new Map<string, { amount: number; quantity: number; name: string }>()
  for (const line of lines) {
    const key = line[field]
    const existing = map.get(key)
    if (existing) {
      existing.amount += line.amount
      existing.quantity += line.quantity
    } else {
      map.set(key, {
        amount: line.amount,
        quantity: line.quantity,
        name: field === 'productId' ? line.productNameAtSale : line.menuGroupAtSale,
      })
    }
  }
  return map
}

/* ---------- sub-components ---------- */

function ChangeIndicator({
  value,
  suffix,
}: {
  value: number
  suffix?: string
}) {
  const isPositive = value > 0
  const isZero = value === 0
  const color = isZero
    ? 'text-gray-400'
    : isPositive
      ? 'text-emerald-600'
      : 'text-red-600'
  const Icon = isPositive ? TrendingUp : TrendingDown

  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${color}`}>
      {!isZero && <Icon className="h-3.5 w-3.5" />}
      {formatPercent(value)}
      {suffix && <span className="font-normal text-gray-400">{suffix}</span>}
    </span>
  )
}

/* ---------- main component ---------- */

export function OverviewPage() {
  const workspace = useWorkspace()
  const { dateRange } = workspace

  const [loading, setLoading] = useState(true)
  const [currentLines, setCurrentLines] = useState<SalesLine[]>([])
  const [previousLines, setPreviousLines] = useState<SalesLine[]>([])
  const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([])

  useEffect(() => {
    setLoading(true)

    const days = differenceInDays(dateRange.end, dateRange.start)
    const prevEnd = subDays(dateRange.start, 1)
    const prevStart = subDays(prevEnd, days)

    Promise.all([
      fetchSalesLines(workspace, {
        dateRange: { start: dateRange.start, end: dateRange.end },
      }),
      fetchSalesLines(workspace, {
        dateRange: { start: prevStart, end: prevEnd },
      }),
      getMenuGroups(workspace),
    ])
      .then(([current, previous, groups]) => {
        setCurrentLines(current)
        setPreviousLines(previous)
        setMenuGroups(groups)
      })
      .catch((error) => {
        console.error('[OverviewPage] Error fetching data:', error)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [workspace, workspace.dateRange]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- derived metrics ---------- */

  const currentTotal = useMemo(
    () => currentLines.reduce((s, l) => s + l.amount, 0),
    [currentLines],
  )
  const previousTotal = useMemo(
    () => previousLines.reduce((s, l) => s + l.amount, 0),
    [previousLines],
  )
  const revenueChange = useMemo(
    () => (previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0),
    [currentTotal, previousTotal],
  )

  const currentQty = useMemo(
    () => currentLines.reduce((s, l) => s + l.quantity, 0),
    [currentLines],
  )
  const previousQty = useMemo(
    () => previousLines.reduce((s, l) => s + l.quantity, 0),
    [previousLines],
  )
  const qtyChange = useMemo(
    () => (previousQty > 0 ? ((currentQty - previousQty) / previousQty) * 100 : 0),
    [currentQty, previousQty],
  )

  const currentAvgPrice = useMemo(
    () => (currentQty > 0 ? currentTotal / currentQty : 0),
    [currentTotal, currentQty],
  )
  const previousAvgPrice = useMemo(
    () => (previousQty > 0 ? previousTotal / previousQty : 0),
    [previousTotal, previousQty],
  )
  const avgPriceChange = useMemo(
    () => (previousAvgPrice > 0 ? ((currentAvgPrice - previousAvgPrice) / previousAvgPrice) * 100 : 0),
    [currentAvgPrice, previousAvgPrice],
  )

  const activeProducts = useMemo(
    () => new Set(currentLines.map((l) => l.productId)).size,
    [currentLines],
  )
  const previousActiveProducts = useMemo(
    () => new Set(previousLines.map((l) => l.productId)).size,
    [previousLines],
  )
  const activeProductsDelta = activeProducts - previousActiveProducts

  /* ---------- per-product comparison ---------- */

  const productDeltas = useMemo<ProductDelta[]>(() => {
    const currentByProduct = aggregateByField(currentLines, 'productId')
    const previousByProduct = aggregateByField(previousLines, 'productId')

    const allProductIds = new Set([
      ...currentByProduct.keys(),
      ...previousByProduct.keys(),
    ])

    const deltas: ProductDelta[] = []
    for (const productId of allProductIds) {
      const curr = currentByProduct.get(productId)
      const prev = previousByProduct.get(productId)
      const currentAmount = curr?.amount ?? 0
      const previousAmount = prev?.amount ?? 0
      const delta = currentAmount - previousAmount
      const deltaPercent = previousAmount > 0
        ? ((currentAmount - previousAmount) / previousAmount) * 100
        : currentAmount > 0
          ? 100
          : 0

      deltas.push({
        productId,
        productName: curr?.name ?? prev?.name ?? productId,
        menuGroup: '',
        currentAmount,
        previousAmount,
        currentQty: curr?.quantity ?? 0,
        previousQty: prev?.quantity ?? 0,
        delta,
        deltaPercent,
      })
    }

    return deltas
  }, [currentLines, previousLines])

  /* ---------- per-category comparison ---------- */

  const categoryDeltas = useMemo<CategoryDelta[]>(() => {
    const currentByCat = aggregateByField(currentLines, 'menuGroupAtSale')
    const previousByCat = aggregateByField(previousLines, 'menuGroupAtSale')

    const allCatIds = new Set([
      ...currentByCat.keys(),
      ...previousByCat.keys(),
    ])

    const deltas: CategoryDelta[] = []
    for (const catId of allCatIds) {
      const curr = currentByCat.get(catId)
      const prev = previousByCat.get(catId)
      const currentAmount = curr?.amount ?? 0
      const previousAmount = prev?.amount ?? 0
      const delta = currentAmount - previousAmount
      const deltaPercent = previousAmount > 0
        ? ((currentAmount - previousAmount) / previousAmount) * 100
        : currentAmount > 0
          ? 100
          : 0

      const group = menuGroups.find((g) => g.id === catId)

      deltas.push({
        menuGroupId: catId,
        label: group?.label ?? curr?.name ?? prev?.name ?? catId,
        color: group?.color ?? '#6b7280',
        currentAmount,
        previousAmount,
        currentQty: curr?.quantity ?? 0,
        previousQty: prev?.quantity ?? 0,
        delta,
        deltaPercent,
        share: currentTotal > 0 ? currentAmount / currentTotal : 0,
      })
    }

    return deltas.sort((a, b) => b.currentAmount - a.currentAmount)
  }, [currentLines, previousLines, menuGroups, currentTotal])

  /* ---------- attention items ---------- */

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = []

    // Categories with >15% revenue decline
    for (const cat of categoryDeltas) {
      if (cat.previousAmount > 0 && cat.deltaPercent < -15) {
        items.push({
          type: 'decline',
          severity: cat.deltaPercent < -25 ? 'red' : 'amber',
          message: `${cat.label} revenue dropped ${formatPercent(cat.deltaPercent)} vs previous period`,
        })
      }
    }

    // Revenue concentration — top product > 25% share
    const sortedProducts = [...productDeltas].sort(
      (a, b) => b.currentAmount - a.currentAmount,
    )
    if (sortedProducts.length > 0 && currentTotal > 0) {
      const topShare = sortedProducts[0].currentAmount / currentTotal
      if (topShare > 0.25) {
        items.push({
          type: 'concentration',
          severity: topShare > 0.4 ? 'red' : 'amber',
          message: `${sortedProducts[0].productName} accounts for ${(topShare * 100).toFixed(1)}% of total revenue`,
        })
      }
    }

    // Products that dropped out of top 10
    const prevSorted = [...productDeltas]
      .filter((p) => p.previousAmount > 0)
      .sort((a, b) => b.previousAmount - a.previousAmount)
    const prevTop10Ids = new Set(prevSorted.slice(0, 10).map((p) => p.productId))
    const currTop10Ids = new Set(
      sortedProducts
        .filter((p) => p.currentAmount > 0)
        .slice(0, 10)
        .map((p) => p.productId),
    )

    for (const id of prevTop10Ids) {
      if (!currTop10Ids.has(id)) {
        const product = productDeltas.find((p) => p.productId === id)
        if (product) {
          items.push({
            type: 'dropout',
            severity: 'amber',
            message: `${product.productName} dropped out of the top 10 products`,
          })
        }
      }
    }

    return items
  }, [categoryDeltas, productDeltas, currentTotal])

  /* ---------- top movers ---------- */

  const gainers = useMemo(
    () =>
      [...productDeltas]
        .filter((p) => p.delta > 0 && p.previousAmount > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5),
    [productDeltas],
  )

  const decliners = useMemo(
    () =>
      [...productDeltas]
        .filter((p) => p.delta < 0 && p.previousAmount > 0)
        .sort((a, b) => a.delta - b.delta)
        .slice(0, 5),
    [productDeltas],
  )

  /* ---------- loading state ---------- */

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        <p className="mt-3 text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  /* ---------- empty state ---------- */

  if (currentLines.length === 0) {
    return (
      <section className="space-y-6">
        <div className="flex items-center justify-between pb-4">
          <h1 className="text-lg font-semibold text-gray-900">Overview</h1>
          <p className="text-sm text-gray-400">{rangeLabel(dateRange.start, dateRange.end)}</p>
        </div>
        <div className="py-20 text-center">
          {workspace.dataRange ? (
            <>
              <p className="font-medium text-gray-900">No sales in this window</p>
              <p className="mt-1 text-sm text-gray-400">
                Your data covers {safeDateLabel(workspace.dataRange.start, 'MMM yyyy')} &ndash;{' '}
                {safeDateLabel(workspace.dataRange.end, 'MMM yyyy')}.
              </p>
              <button
                type="button"
                onClick={() => workspace.setDateRange(workspace.dataRange!)}
                className="mt-4 inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
              >
                Show all data
              </button>
            </>
          ) : (
            <>
              <p className="font-medium text-gray-900">No data yet</p>
              <p className="mt-1 text-sm text-gray-400">
                Upload sales reports to see your analytics here.
              </p>
            </>
          )}
        </div>
      </section>
    )
  }

  /* ---------- date label ---------- */

  const dateLabel = rangeLabel(dateRange.start, dateRange.end)
  const hasPreviousData = previousLines.length > 0
  const maxCategoryShare = categoryDeltas.length > 0
    ? Math.max(...categoryDeltas.map((c) => c.share))
    : 1

  /* ---------- render ---------- */

  return (
    <section className="space-y-6 overflow-hidden">
      {/* Section 1: Header */}
      <div className="flex items-center justify-between pb-4">
        <h1 className="text-lg font-semibold text-gray-900">Overview</h1>
        <p className="text-sm text-gray-400">{dateLabel}</p>
      </div>

      {/* Section 2: Hero KPI — Revenue */}
      <div className="rounded-lg border border-gray-200 p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
          Revenue
        </p>
        <p className="mt-2 text-3xl font-bold text-gray-900">
          {formatCurrency(workspace.currency, currentTotal)}
        </p>
        <div className="mt-2 flex items-center gap-3">
          {hasPreviousData && (
            <ChangeIndicator value={revenueChange} suffix="vs previous period" />
          )}
          <span className="text-sm text-gray-400">
            {currentQty.toLocaleString()} items
          </span>
        </div>
      </div>

      {/* Section 3: Supporting KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Items Sold
          </p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {currentQty.toLocaleString()}
          </p>
          {hasPreviousData && (
            <div className="mt-1">
              <ChangeIndicator value={qtyChange} suffix="vs prev" />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Avg. Price
          </p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {formatCurrency(workspace.currency, currentAvgPrice)}
          </p>
          {hasPreviousData && (
            <div className="mt-1">
              <ChangeIndicator value={avgPriceChange} suffix="vs prev" />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Active Products
          </p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {activeProducts}
          </p>
          <p className="mt-1 text-sm text-gray-400">
            {activeProductsDelta > 0
              ? `+${activeProductsDelta} new this period`
              : activeProductsDelta < 0
                ? `${activeProductsDelta} fewer this period`
                : 'No change vs prev'}
          </p>
        </div>
      </div>

      {/* Section 4: Attention Required */}
      {attentionItems.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">
            Attention Required
          </h2>
          {attentionItems.map((item, i) => (
            <div
              key={i}
              className={`flex items-start gap-2.5 rounded-lg p-3 text-sm ${
                item.severity === 'red'
                  ? 'border-l-2 border-red-400 bg-red-50/50'
                  : 'border-l-2 border-amber-400 bg-amber-50/50'
              }`}
            >
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  item.severity === 'red' ? 'text-red-500' : 'text-amber-500'
                }`}
              />
              <span className="text-gray-700">{item.message}</span>
            </div>
          ))}
        </div>
      ) : hasPreviousData ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-gray-200 p-3 text-sm">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
          <span className="text-gray-500">
            All metrics within normal range
          </span>
        </div>
      ) : null}

      {/* Section 5: Category Performance */}
      {categoryDeltas.length > 0 && (
        <div className="app-card overflow-hidden">
          <div className="border-b border-gray-200 px-5 py-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Category Performance
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wider text-gray-400">
                <th className="py-3 pl-5 pr-2 text-left">Category</th>
                <th className="px-2 py-3 text-right">Revenue</th>
                <th className="px-2 py-3 text-right">vs Prev</th>
                <th className="hidden px-2 py-3 text-right sm:table-cell">Share</th>
                <th className="hidden py-3 pl-2 pr-5 sm:table-cell">
                  <span className="sr-only">Bar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categoryDeltas.map((cat) => {
                const barWidth = maxCategoryShare > 0
                  ? (cat.share / maxCategoryShare) * 100
                  : 0
                return (
                  <tr
                    key={cat.menuGroupId}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-2.5 pl-5 pr-2 text-gray-900">
                      {cat.label}
                    </td>
                    <td className="px-2 py-2.5 text-right font-medium text-gray-900">
                      {formatCurrency(workspace.currency, cat.currentAmount)}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {hasPreviousData && cat.previousAmount > 0 ? (
                        <span
                          className={`font-medium ${
                            cat.deltaPercent >= 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {formatPercent(cat.deltaPercent)}
                        </span>
                      ) : (
                        <span className="text-gray-400">&mdash;</span>
                      )}
                    </td>
                    <td className="hidden px-2 py-2.5 text-right text-gray-500 sm:table-cell">
                      {(cat.share * 100).toFixed(1)}%
                    </td>
                    <td className="hidden w-32 py-2.5 pl-2 pr-5 sm:table-cell">
                      <div className="h-2 w-full rounded bg-gray-100">
                        <div
                          className="h-2 rounded"
                          style={{
                            width: `${barWidth}%`,
                            backgroundColor: cat.color,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Section 6: Top Movers */}
      {hasPreviousData && (gainers.length > 0 || decliners.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Gainers */}
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              Biggest Gainers
            </h3>
            {gainers.length > 0 ? (
              <div className="space-y-2">
                {gainers.map((p) => (
                  <div
                    key={p.productId}
                    className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span className="truncate text-sm text-gray-900">
                        {p.productName}
                      </span>
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-3">
                      <span className="text-sm font-medium text-emerald-600">
                        {formatPercent(p.deltaPercent)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatCurrency(workspace.currency, p.delta)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No gainers this period</p>
            )}
          </div>

          {/* Decliners */}
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              Biggest Decliners
            </h3>
            {decliners.length > 0 ? (
              <div className="space-y-2">
                {decliners.map((p) => (
                  <div
                    key={p.productId}
                    className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <TrendingDown className="h-3.5 w-3.5 shrink-0 text-red-600" />
                      <span className="truncate text-sm text-gray-900">
                        {p.productName}
                      </span>
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-3">
                      <span className="text-sm font-medium text-red-600">
                        {formatPercent(p.deltaPercent)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatCurrency(workspace.currency, p.delta)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No decliners this period</p>
            )}
          </div>
        </div>
      )}

      {/* Section 7: Revenue Distribution — Compact bars */}
      {categoryDeltas.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">
            Revenue Distribution
          </h2>
          <div className="space-y-1.5">
            {categoryDeltas.map((cat) => {
              const sharePercent = cat.share * 100
              return (
                <div key={cat.menuGroupId} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 truncate text-sm text-gray-700">
                    {cat.label}
                  </span>
                  <div className="flex-1">
                    <div className="h-4 w-full rounded bg-gray-100">
                      <div
                        className="h-4 rounded"
                        style={{
                          width: `${sharePercent}%`,
                          backgroundColor: cat.color,
                        }}
                      />
                    </div>
                  </div>
                  <span className="w-20 shrink-0 text-right text-sm font-medium text-gray-900">
                    {formatCurrency(workspace.currency, cat.currentAmount)}
                  </span>
                  <span className="w-12 shrink-0 text-right text-xs text-gray-500">
                    {sharePercent.toFixed(1)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
