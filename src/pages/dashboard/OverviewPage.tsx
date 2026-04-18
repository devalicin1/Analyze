import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Select } from '../../components/forms/Select'
import { fetchOverview } from '../../lib/api/analytics'
import type { CategoryBreakdown, MenuGroup, ProductPerformance } from '../../lib/types'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getMenuGroups } from '../../lib/api/menuGroups'
import { formatCurrency } from '../../lib/utils/formatting'

type OverviewData = {
  metrics: {
    totalAmount: number
    totalQuantity: number
    averageSellingPrice: number
    activeProducts: number
  }
  topProductsByQty: ProductPerformance[]
  topProductsByAmount: ProductPerformance[]
  categories: CategoryBreakdown[]
}

/* ---------- helpers ---------- */

function safeDateLabel(d: Date, fmt: string): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '\u2014'
  return format(d, fmt)
}

function pct(value: number): string {
  return (value * 100).toFixed(1) + '%'
}

/* ---------- insight generator ---------- */

function generateInsights(
  data: OverviewData,
  currency: string,
  sortedCategories: CategoryBreakdown[],
  topByAmount: ProductPerformance[],
): string[] {
  const insights: string[] = []

  // Revenue concentration: top 5 share
  if (topByAmount.length >= 5) {
    const top5Share = topByAmount
      .slice(0, 5)
      .reduce((s, p) => s + p.percentOfTotal, 0)
    insights.push(
      `Top 5 products drive ${pct(top5Share)} of revenue`,
    )
  }

  // Category dominance
  if (sortedCategories.length > 0) {
    const leader = sortedCategories[0]
    insights.push(
      `${leader.label} leads with ${pct(leader.share)} market share`,
    )
  }

  // Average basket
  const avg = data.metrics.averageSellingPrice
  if (avg > 0) {
    const qualifier = avg > 8 ? 'higher' : avg < 4 ? 'lower' : 'moderate compared'
    insights.push(
      `Avg price is ${formatCurrency(currency, avg)} \u2014 ${qualifier} than typical`,
    )
  }

  // Product diversity
  insights.push(
    `${data.metrics.activeProducts} active products across ${sortedCategories.length} categories`,
  )

  // Top performer
  if (topByAmount.length > 0) {
    const top = topByAmount[0]
    insights.push(
      `${top.productName} is the #1 revenue driver at ${formatCurrency(currency, top.amount)}`,
    )
  }

  return insights.slice(0, 5)
}

/* ---------- sub-components ---------- */

function KpiCard({
  label,
  value,
  subtext,
}: {
  label: string
  value: string
  subtext: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{subtext}</p>
    </div>
  )
}

function HorizontalBar({
  label,
  amount,
  share,
  color,
  maxShare,
  currency,
}: {
  label: string
  amount: number
  share: number
  color: string
  maxShare: number
  currency: string
}) {
  const widthPct = maxShare > 0 ? (share / maxShare) * 100 : 0
  return (
    <div className="flex items-center gap-4 py-2">
      <span className="w-36 shrink-0 truncate text-sm text-gray-900">
        {label}
      </span>
      <div className="flex-1">
        <div className="h-5 w-full rounded bg-gray-100">
          <div
            className="h-5 rounded"
            style={{ width: `${widthPct}%`, backgroundColor: color }}
          />
        </div>
      </div>
      <span className="w-28 shrink-0 text-right text-sm font-medium text-gray-900">
        {formatCurrency(currency, amount)}
      </span>
      <span className="w-14 shrink-0 text-right text-xs text-gray-500">
        {pct(share)}
      </span>
    </div>
  )
}

function CompactProductTable({
  title,
  products,
  valueKey,
  valueHeader,
  formatValue,
}: {
  title: string
  products: ProductPerformance[]
  valueKey: 'amount' | 'quantity'
  valueHeader: string
  formatValue: (p: ProductPerformance) => string
}) {
  return (
    <div className="app-card overflow-hidden">
      <div className="border-b border-gray-200 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wider text-gray-400">
            <th className="py-3 pl-5 pr-2 text-left">#</th>
            <th className="px-2 py-3 text-left">Product</th>
            <th className="px-2 py-3 text-right">{valueHeader}</th>
            <th className="py-3 pl-2 pr-5 text-right">Share</th>
          </tr>
        </thead>
        <tbody>
          {products.slice(0, 10).map((p, i) => (
            <tr
              key={p.productId}
              className="border-b border-gray-50 last:border-0"
            >
              <td className="py-2.5 pl-5 pr-2 text-gray-400">{i + 1}</td>
              <td className="truncate px-2 py-2.5 text-gray-900">
                {p.productName}
              </td>
              <td className="px-2 py-2.5 text-right font-medium text-gray-900">
                {formatValue(p)}
              </td>
              <td className="py-2.5 pl-2 pr-5 text-right text-gray-500">
                {pct(p.percentOfTotal)}
              </td>
            </tr>
          ))}
          {products.length === 0 && (
            <tr>
              <td colSpan={4} className="px-5 py-6 text-center text-gray-400">
                No products match filters
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- main component ---------- */

export function OverviewPage() {
  const workspace = useWorkspace()
  const [data, setData] = useState<OverviewData | null>(null)
  const [menuGroupId, setMenuGroupId] = useState('all')
  const [includeExtras, setIncludeExtras] = useState(true)
  const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchOverview(workspace, {
        start: workspace.dateRange.start,
        end: workspace.dateRange.end,
      }),
      getMenuGroups(workspace),
    ])
      .then(([overviewData, groups]) => {
        setData(overviewData as OverviewData)
        setMenuGroups(groups)
      })
      .catch((error) => {
        console.error('[OverviewPage] Error fetching data:', error)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [workspace, workspace.dateRange])

  const hasData =
    !!data &&
    ((data.metrics.totalAmount ?? 0) > 0 ||
      (data.metrics.totalQuantity ?? 0) > 0)

  const filteredTopByQty = useMemo(
    () =>
      (data?.topProductsByQty ?? []).filter((product) => {
        if (!includeExtras && product.menuGroup === 'extras') return false
        if (menuGroupId !== 'all' && product.menuGroup !== menuGroupId) return false
        return true
      }),
    [data, includeExtras, menuGroupId],
  )

  const filteredTopByAmount = useMemo(
    () =>
      (data?.topProductsByAmount ?? []).filter((product) => {
        if (!includeExtras && product.menuGroup === 'extras') return false
        if (menuGroupId !== 'all' && product.menuGroup !== menuGroupId) return false
        return true
      }),
    [data, includeExtras, menuGroupId],
  )

  const sortedCategories = useMemo(
    () =>
      [...(data?.categories ?? [])].sort((a, b) => b.amount - a.amount),
    [data],
  )

  const categoryColors = [
    '#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626',
    '#4b5563', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6',
    '#0891b2', '#65a30d', '#e11d48', '#6366f1', '#ca8a04',
  ]

  /* --- loading state --- */
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading overview...</p>
        </div>
      </div>
    )
  }

  /* --- empty state --- */
  if (!data || !hasData) {
    return (
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-gray-200 pb-5">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Overview</h1>
            <p className="mt-1 text-sm text-gray-500">No data available</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="max-w-sm text-center">
            <h2 className="text-lg font-semibold text-gray-900">
              No sales data for this period
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Try expanding your date range or upload a new sales report.
            </p>
            <p className="mt-4 text-xs text-gray-400">
              {safeDateLabel(workspace.dateRange.start, 'MMM d')} &ndash;{' '}
              {safeDateLabel(workspace.dateRange.end, 'MMM d, yyyy')}
            </p>
          </div>
        </div>
      </section>
    )
  }

  const maxCategoryShare =
    sortedCategories.length > 0
      ? Math.max(...sortedCategories.map((c) => c.share))
      : 1

  const insights = generateInsights(
    data,
    workspace.currency,
    sortedCategories,
    filteredTopByAmount,
  )

  const totalCategoryRevenue = sortedCategories.reduce(
    (sum, c) => sum + c.amount,
    0,
  )

  return (
    <section className="space-y-6 overflow-hidden">
      {/* ---- 1. Page Header ---- */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Overview</h1>
          <p className="mt-1 text-sm text-gray-500">
            {workspace.dateRange.label} &middot; {workspace.workspaceName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={menuGroupId}
            onChange={(e) => setMenuGroupId(e.target.value)}
            options={[
              { label: 'All Categories', value: 'all' },
              ...menuGroups.map((g) => ({ label: g.label, value: g.id })),
            ]}
            className="w-48"
          />
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeExtras}
              onChange={(e) => setIncludeExtras(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Include extras
          </label>
        </div>
      </div>

      {/* ---- 2. KPI Row ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Revenue"
          value={formatCurrency(workspace.currency, data.metrics.totalAmount)}
          subtext={`${data.metrics.totalQuantity.toLocaleString()} items sold`}
        />
        <KpiCard
          label="Items Sold"
          value={data.metrics.totalQuantity.toLocaleString()}
          subtext="total units"
        />
        <KpiCard
          label="Avg. Price"
          value={formatCurrency(
            workspace.currency,
            data.metrics.averageSellingPrice || 0,
          )}
          subtext="per item"
        />
        <KpiCard
          label="Active Products"
          value={String(data.metrics.activeProducts)}
          subtext={`in ${sortedCategories.length} categories`}
        />
      </div>

      {/* ---- 3. Executive Insights ---- */}
      {insights.length > 0 && (
        <div className="app-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Insights
          </h3>
          <ul className="space-y-2">
            {insights.map((text, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                {text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- 4. Revenue by Category (horizontal bars) ---- */}
      <div className="app-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            Revenue by Category
          </h3>
          <span className="text-xs text-gray-400">
            {sortedCategories.length} categories &middot;{' '}
            {formatCurrency(workspace.currency, totalCategoryRevenue)}
          </span>
        </div>
        {sortedCategories.length > 0 ? (
          <div className="space-y-0">
            {sortedCategories.map((cat, idx) => (
              <HorizontalBar
                key={cat.menuGroupId}
                label={cat.label}
                amount={cat.amount}
                share={cat.share}
                color={cat.color || categoryColors[idx % categoryColors.length]}
                maxShare={maxCategoryShare}
                currency={workspace.currency}
              />
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">
            No category data available
          </p>
        )}
      </div>

      {/* ---- 5. Top Products — side-by-side ---- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CompactProductTable
          title="Top Products by Revenue"
          products={filteredTopByAmount}
          valueKey="amount"
          valueHeader="Revenue"
          formatValue={(p) => formatCurrency(workspace.currency, p.amount)}
        />
        <CompactProductTable
          title="Top Products by Volume"
          products={filteredTopByQty}
          valueKey="quantity"
          valueHeader="Quantity"
          formatValue={(p) => p.quantity.toLocaleString()}
        />
      </div>

      {/* ---- 6. Category Breakdown Table ---- */}
      <div className="app-card overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Category Breakdown
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wider text-gray-400">
              <th className="py-3 pl-5 pr-2 text-left">Category</th>
              <th className="px-2 py-3 text-right">Revenue</th>
              <th className="px-2 py-3 text-right">Qty</th>
              <th className="px-2 py-3 text-right">Avg Price</th>
              <th className="py-3 pl-2 pr-5 text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {sortedCategories.map((cat) => {
              // derive qty from amount / avg price, or approximate from share
              const catQty =
                cat.amount > 0 && data.metrics.averageSellingPrice > 0
                  ? Math.round(cat.amount / data.metrics.averageSellingPrice)
                  : 0
              const catAvgPrice =
                catQty > 0 ? cat.amount / catQty : 0

              return (
                <tr
                  key={cat.menuGroupId}
                  className="border-b border-gray-50 last:border-0"
                >
                  <td className="py-2.5 pl-5 pr-2 text-gray-900">
                    {cat.label}
                  </td>
                  <td className="px-2 py-2.5 text-right font-medium text-gray-900">
                    {formatCurrency(workspace.currency, cat.amount)}
                  </td>
                  <td className="px-2 py-2.5 text-right text-gray-500">
                    {catQty.toLocaleString()}
                  </td>
                  <td className="px-2 py-2.5 text-right text-gray-500">
                    {formatCurrency(workspace.currency, catAvgPrice)}
                  </td>
                  <td className="py-2.5 pl-2 pr-5 text-right text-gray-500">
                    {pct(cat.share)}
                  </td>
                </tr>
              )
            })}
            {sortedCategories.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-gray-400">
                  No categories available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
