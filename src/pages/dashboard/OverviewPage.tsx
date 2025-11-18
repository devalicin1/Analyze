import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { BarChart } from '../../components/charts/BarChart'
import { PieChart } from '../../components/charts/PieChart'
import { DataTable, type TableColumn } from '../../components/tables/DataTable'
import { Select } from '../../components/forms/Select'
import { fetchOverview } from '../../lib/api/analytics'
import type { CategoryBreakdown, MenuGroup, ProductPerformance } from '../../lib/types'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getMenuGroups } from '../../lib/api/menuGroups'

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

const formatCurrency = (currency: string, value: number) => {
  // Format currency with proper decimal places
  // For amounts >= 1000, show no decimals; for smaller amounts, show 2 decimals
  const decimals = value >= 1000 ? 0 : 2
  return `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

const formatCompactNumber = (value: number) => {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M'
  if (value >= 1_000) return (value / 1_000).toFixed(1) + 'K'
  return value.toLocaleString()
}

export function OverviewPage() {
  const workspace = useWorkspace()
  const [data, setData] = useState<OverviewData | null>(null)
  const [menuGroupId, setMenuGroupId] = useState('all')
  const [includeExtras, setIncludeExtras] = useState(true)
  const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showAllCategories, setShowAllCategories] = useState(false)

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
    [data, includeExtras, menuGroupId]
  )

  const filteredTopByAmount = useMemo(
    () =>
      (data?.topProductsByAmount ?? []).filter((product) => {
        if (!includeExtras && product.menuGroup === 'extras') return false
        if (menuGroupId !== 'all' && product.menuGroup !== menuGroupId) return false
        return true
      }),
    [data, includeExtras, menuGroupId]
  )

  const filteredProducts = filteredTopByAmount

  const productColumns: TableColumn<ProductPerformance>[] = useMemo(() => {
    // Helper function to get category and subcategory labels
    const getCategoryLabels = (product: ProductPerformance) => {
      const categoryGroup = menuGroups.find((g) => g.id === product.menuGroup)
      const categoryLabel = categoryGroup?.label || product.menuGroup
      
      let subcategoryLabel: string | undefined
      if (product.menuSubGroup && categoryGroup) {
        const subGroup = categoryGroup.subGroups.find((sg) => sg.id === product.menuSubGroup)
        subcategoryLabel = subGroup?.label || product.menuSubGroup
      }
      
      return { categoryLabel, subcategoryLabel }
    }

    return [
      {
        header: 'Product',
        accessor: (row) => {
          const { categoryLabel, subcategoryLabel } = getCategoryLabels(row)
          return (
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{row.productName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {categoryLabel}
                </span>
                {subcategoryLabel && (
                  <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {subcategoryLabel}
                  </span>
                )}
              </div>
            </div>
          )
        },
      },
      {
        header: 'Category',
        accessor: (row) => {
          const { categoryLabel, subcategoryLabel } = getCategoryLabels(row)
          return (
            <div className="min-w-0">
              <p className="font-medium text-slate-900">{categoryLabel}</p>
              {subcategoryLabel && (
                <p className="mt-0.5 text-xs text-slate-500">{subcategoryLabel}</p>
              )}
            </div>
          )
        },
      },
      {
        header: 'Quantity',
        accessor: (row) => (
          <span className="font-semibold text-slate-700">
            {row.quantity.toLocaleString()}
          </span>
        ),
        align: 'right',
      },
      {
        header: 'Revenue',
        accessor: (row) => (
          <span className="font-bold text-slate-900">
            {formatCurrency(workspace.currency, row.amount)}
          </span>
        ),
        align: 'right',
      },
      {
        header: 'Avg. Price',
        accessor: (row) => (
          <span className="text-slate-600">
            {formatCurrency(workspace.currency, row.avgPrice)}
          </span>
        ),
        align: 'right',
      },
      {
        header: 'Share',
        accessor: (row) => (
          <div className="text-right">
            <span className="font-semibold text-slate-700">
              {(row.percentOfTotal * 100).toFixed(1)}%
            </span>
          </div>
        ),
        align: 'right',
      },
    ]
  }, [workspace.currency, menuGroups])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
          <p className="text-sm text-slate-500">Loading performance overview…</p>
        </div>
      </div>
    )
  }

  if (!data || !hasData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6">
          <div className="max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100">
            <h1 className="text-xl font-semibold text-slate-900">
              No sales data for this period
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Try expanding your date range or checking back after new sales have been
              imported.
            </p>
            <p className="mt-4 text-xs text-slate-400">
              Selected period:{' '}
              {format(workspace.dateRange.start, 'MMM d')} –{' '}
              {format(workspace.dateRange.end, 'MMM d, yyyy')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const sortedCategories = [...(data.categories ?? [])].sort(
    (a, b) => b.amount - a.amount
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Performance Overview
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {format(workspace.dateRange.start, 'MMM d')} –{' '}
                  {format(workspace.dateRange.end, 'MMM d, yyyy')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Select
                  value={menuGroupId}
                  onChange={(event) => setMenuGroupId(event.target.value)}
                  options={[
                    { label: 'All Categories', value: 'all' },
                    ...menuGroups.map((group) => ({
                      label: group.label,
                      value: group.id,
                    })),
                  ]}
                  className="w-48"
                />
                <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={includeExtras}
                    onChange={(event) => setIncludeExtras(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Include extras
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6 p-6">
          {/* Key Metrics Grid */}
          <section>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
               <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                 <div className="flex items-center justify-between gap-3">
                   <div>
                     <p className="mb-1 text-sm font-medium text-slate-500">
                       Total Revenue
                     </p>
                     <p className="text-2xl font-bold text-slate-900">
                       {workspace.currency}{' '}
                       {data.metrics.totalAmount.toLocaleString(undefined, {
                         maximumFractionDigits: 0,
                       })}
                     </p>
                     <p className="mt-1 text-xs text-slate-400">
                       Qty: {data.metrics.totalQuantity.toLocaleString()}
                     </p>
                   </div>
                   <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-lg">
                     <span className="text-blue-600">💎</span>
                   </div>
                 </div>
               </div>

               <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                 <div className="flex items-center justify-between gap-3">
                   <div>
                     <p className="mb-1 text-sm font-medium text-slate-500">
                       Items Sold
                     </p>
                     <p className="text-2xl font-bold text-slate-900">
                       {data.metrics.totalQuantity.toLocaleString(undefined, {
                         maximumFractionDigits: 0,
                       })}
                     </p>
                     <p className="mt-1 text-xs text-slate-400">
                       units
                     </p>
                   </div>
                   <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-lg">
                     <span className="text-emerald-600">📦</span>
                   </div>
                 </div>
               </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="mb-1 text-sm font-medium text-slate-500">
                      Avg. Price
                    </p>
                    <p className="text-2xl font-bold text-slate-900">
                      {formatCurrency(
                        workspace.currency,
                        data.metrics.averageSellingPrice || 0
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">per item</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-lg">
                    <span className="text-violet-600">⚡</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="mb-1 text-sm font-medium text-slate-500">
                      Active Products
                    </p>
                    <p className="text-2xl font-bold text-slate-900">
                      {data.metrics.activeProducts}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      in {data.categories.length} categories
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-lg">
                    <span className="text-amber-600">🔥</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Charts Section */}
          <section className="grid gap-6 lg:grid-cols-2">
            {/* Top Products by Quantity */}
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                        <span className="text-xl">📦</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">
                          Volume Leaders
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Most sold products by quantity
                        </p>
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    Top 8
                  </span>
                </div>
                {filteredTopByQty.length > 0 && (
                  <div className="flex items-center gap-4 rounded-lg bg-gradient-to-r from-blue-50 to-blue-50/50 p-4">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-600">
                        Total Volume
                      </p>
                      <p className="mt-1 text-xl font-bold text-slate-900">
                        {formatCompactNumber(
                          filteredTopByQty
                            .slice(0, 8)
                            .reduce((sum, p) => sum + p.quantity, 0)
                        )}
                      </p>
                    </div>
                    <div className="h-12 w-px bg-slate-200" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-600">
                        Top Product
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                        {filteredTopByQty[0]?.productName || 'N/A'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="h-80">
                {filteredTopByQty.length ? (
                  <BarChart
                    data={filteredTopByQty.slice(0, 8)}
                    xKey="productName"
                    yKey="quantity"
                    color="#2563eb"
                    height={320}
                    formatter={(value: number) => value.toLocaleString()}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-400">
                    No products found for the selected filters
                  </div>
                )}
              </div>
            </div>

            {/* Top Products by Revenue */}
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                        <span className="text-xl">💎</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">
                          Revenue Drivers
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Highest revenue generating products
                        </p>
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                    Top 8
                  </span>
                </div>
                {filteredTopByAmount.length > 0 && (
                  <div className="flex items-center gap-4 rounded-lg bg-gradient-to-r from-violet-50 to-violet-50/50 p-4">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-600">
                        Total Revenue
                      </p>
                      <p className="mt-1 text-xl font-bold text-slate-900">
                        {formatCompactNumber(
                          filteredTopByAmount
                            .slice(0, 8)
                            .reduce((sum, p) => sum + p.amount, 0)
                        )}
                      </p>
                    </div>
                    <div className="h-12 w-px bg-slate-200" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-600">
                        Top Product
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                        {filteredTopByAmount[0]?.productName || 'N/A'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="h-80">
                {filteredTopByAmount.length ? (
                  <BarChart
                    data={filteredTopByAmount.slice(0, 8)}
                    xKey="productName"
                    yKey="amount"
                    color="#7c3aed"
                    height={320}
                    formatter={(value: number) =>
                      formatCurrency(workspace.currency, value)
                    }
                  />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-400">
                    No products found for the selected filters
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Category Analysis */}
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Category Performance
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Revenue distribution across categories
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {data.categories.length} Categories
                </span>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {formatCurrency(
                    workspace.currency,
                    sortedCategories.reduce((sum, c) => sum + c.amount, 0)
                  )}
                </span>
              </div>
            </div>

            <div className="grid items-start gap-8 lg:grid-cols-2">
              {/* Pie Chart */}
              <div className="relative">
                {sortedCategories.length ? (
                  <div className="relative">
                    <PieChart
                      data={sortedCategories}
                      nameKey="label"
                      valueKey="share"
                      colors={[
                        '#2563eb',
                        '#7c3aed',
                        '#059669',
                        '#d97706',
                        '#dc2626',
                        '#4b5563',
                        '#ec4899',
                        '#14b8a6',
                        '#f59e0b',
                        '#8b5cf6',
                      ]}
                      formatter={(value: number, name: string) => {
                        const category = sortedCategories.find(
                          (c) => c.label === name
                        )
                        const amount = category?.amount || 0
                        const percentage = (Number(value) * 100).toFixed(1)
                        return `${formatCurrency(workspace.currency, amount)} (${percentage}%)`
                      }}
                      height={360}
                      innerRadius={75}
                      outerRadius={125}
                      centerLabel={
                        <text
                          x="50%"
                          y="50%"
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x="50%"
                            dy="-10"
                            style={{ fontSize: '24px', fontWeight: 700 }}
                            className="fill-slate-900"
                          >
                            {formatCompactNumber(
                              sortedCategories.reduce(
                                (sum, c) => sum + c.amount,
                                0
                              )
                            )}
                          </tspan>
                          <tspan
                            x="50%"
                            dy="20"
                            style={{ fontSize: '12px', fontWeight: 500 }}
                            className="fill-slate-500"
                          >
                            Total Revenue
                          </tspan>
                        </text>
                      }
                    />
                    <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-2 pt-4">
                      {sortedCategories.slice(0, 6).map((category, idx) => {
                        const colors = [
                          '#2563eb',
                          '#7c3aed',
                          '#059669',
                          '#d97706',
                          '#dc2626',
                          '#4b5563',
                        ]
                        return (
                          <div
                            key={category.menuGroupId}
                            className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1"
                            title={category.label}
                          >
                            <div
                              className="h-2 w-2 rounded-full"
                              style={{
                                backgroundColor: colors[idx % colors.length],
                              }}
                            />
                            <span className="text-xs font-medium text-slate-600">
                              {((category.share || 0) * 100).toFixed(0)}%
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-[360px] items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-400">
                    No category data available
                  </div>
                )}
              </div>

              {/* Category Rankings */}
              <div className="space-y-2">
                {(showAllCategories
                  ? sortedCategories
                  : sortedCategories.slice(0, 6)
                ).map((category, index) => {
                  const colors = [
                    '#2563eb',
                    '#7c3aed',
                    '#059669',
                    '#d97706',
                    '#dc2626',
                    '#4b5563',
                  ]
                  const percentage = (category.share || 0) * 100
                  return (
                    <div
                      key={category.menuGroupId}
                      className="group rounded-xl border border-slate-100 bg-gradient-to-r from-white to-slate-50/50 p-4 transition-all hover:border-slate-200 hover:shadow-md"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div
                            className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm"
                            style={{
                              backgroundColor: colors[index % colors.length],
                            }}
                          >
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-slate-900">
                              {category.label}
                            </p>
                            <div className="mt-1 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full rounded-full transition-all group-hover:opacity-90"
                                  style={{
                                    width: `${percentage}%`,
                                    backgroundColor: colors[index % colors.length],
                                  }}
                                />
                              </div>
                              <span className="text-xs font-medium text-slate-500">
                                {percentage.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="ml-4 text-right">
                          <p className="text-lg font-bold text-slate-900">
                            {formatCurrency(workspace.currency, category.amount)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {percentage.toFixed(1)}% share
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {!sortedCategories.length && (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
                    <p className="text-sm text-slate-400">
                      No categories for the selected filters.
                    </p>
                  </div>
                )}
                {sortedCategories.length > 6 && (
                  <button
                    onClick={() => setShowAllCategories(!showAllCategories)}
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 hover:shadow-sm"
                  >
                    {showAllCategories
                      ? `Show less (Top 6)`
                      : `View all categories (+${sortedCategories.length - 6} more)`}
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Product Performance Table */}
          <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Product Performance
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Detailed metrics for {filteredProducts.length} products
                  </p>
                </div>
                <div className="text-sm text-slate-500">
                  Sorted by revenue (after filters)
                </div>
              </div>
            </div>
             <DataTable
               data={filteredProducts}
               columns={productColumns}
             />
          </section>
        </div>
      </div>
    </div>
  )
}
