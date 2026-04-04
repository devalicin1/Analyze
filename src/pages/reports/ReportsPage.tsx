import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DataTable, type TableColumn } from '../../components/tables/DataTable'
import { DateRangePicker } from '../../components/forms/DateRangePicker'
import { Select } from '../../components/forms/Select'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { fetchSalesLines } from '../../lib/api/analytics'
import { getMenuGroups } from '../../lib/api/menuGroups'
import { listProducts } from '../../lib/api/products'
import { useWorkspace, type DateRange } from '../../context/WorkspaceContext'
import type { SalesLine, MenuGroup, Product } from '../../lib/types'

type ReportFilters = {
  dateRange: DateRange
  categoryId: string
  subcategoryId: string
  productId: string
  includeExtras: boolean
}

type ReportData = {
  salesLines: SalesLine[]
  totalAmount: number
  totalQuantity: number
  averagePrice: number
  uniqueProducts: number
  categoryBreakdown: Array<{
    categoryId: string
    categoryLabel: string
    amount: number
    quantity: number
    share: number
  }>
  subcategoryBreakdown: Array<{
    subcategoryId: string
    subcategoryLabel: string
    amount: number
    quantity: number
    share: number
  }>
  productBreakdown: Array<{
    productId: string
    productName: string
    categoryLabel: string
    subcategoryLabel?: string
    amount: number
    quantity: number
    avgPrice: number
    share: number
  }>
}

import { formatCurrency } from '../../lib/utils/formatting'

export function ReportsPage() {
  const workspace = useWorkspace()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([])
  const [products, setProducts] = useState<Product[]>([])

  const [filters, setFilters] = useState<ReportFilters>({
    dateRange: workspace.dateRange,
    categoryId: 'all',
    subcategoryId: 'all',
    productId: '',
    includeExtras: true,
  })

  const isInitialLoading = loading && !reportData
  const isUpdating = loading && !!reportData

  const dateRangeLabel = useMemo(() => {
    const { start, end } = filters.dateRange
    if (!start || !end) return ''
    const startDate = start instanceof Date ? start : new Date(start)
    const endDate = end instanceof Date ? end : new Date(end)
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return ''
    return `${format(startDate, 'dd MMM yyyy')} – ${format(endDate, 'dd MMM yyyy')}`
  }, [filters.dateRange.start, filters.dateRange.end])

  // Load initial metadata
  useEffect(() => {
    Promise.all([getMenuGroups(workspace), listProducts(workspace)])
      .then(([groups, prods]) => {
        setMenuGroups(groups)
        setProducts(prods)
      })
      .catch((error) => {
        console.error('[ReportsPage] Error loading metadata:', error)
        setError('Failed to load menu groups or products. Please try again later.')
      })
  }, [workspace])

  // Fetch report data when filters change
  useEffect(() => {
    setLoading(true)
    setError(null)

    fetchSalesLines(workspace, {
      dateRange: {
        start: filters.dateRange.start,
        end: filters.dateRange.end,
      },
      includeExtras: filters.includeExtras ? undefined : false,
    })
      .then((salesLines) => {
        // Apply filters
        let filteredLines = salesLines

        if (filters.categoryId !== 'all') {
          filteredLines = filteredLines.filter(
            (line) => line.menuGroupAtSale === filters.categoryId,
          )
        }

        if (filters.subcategoryId !== 'all') {
          filteredLines = filteredLines.filter(
            (line) => line.menuSubGroupAtSale === filters.subcategoryId,
          )
        }

        if (filters.productId) {
          filteredLines = filteredLines.filter(
            (line) => line.productId === filters.productId,
          )
        }

        const totalAmount = filteredLines.reduce((sum, line) => sum + line.amount, 0)
        const totalQuantity = filteredLines.reduce(
          (sum, line) => sum + line.quantity,
          0,
        )
        const averagePrice = totalQuantity > 0 ? totalAmount / totalQuantity : 0
        const uniqueProducts = new Set(filteredLines.map((line) => line.productId)).size

        // Category breakdown
        const categoryMap = new Map<string, { amount: number; quantity: number }>()
        filteredLines.forEach((line) => {
          const existing = categoryMap.get(line.menuGroupAtSale) ?? {
            amount: 0,
            quantity: 0,
          }
          existing.amount += line.amount
          existing.quantity += line.quantity
          categoryMap.set(line.menuGroupAtSale, existing)
        })

        const categoryBreakdown = Array.from(categoryMap.entries()).map(
          ([categoryId, data]) => {
            const category = menuGroups.find((g) => g.id === categoryId)
            return {
              categoryId,
              categoryLabel: category?.label || categoryId,
              amount: data.amount,
              quantity: data.quantity,
              share: totalAmount > 0 ? data.amount / totalAmount : 0,
            }
          },
        )

        // Subcategory breakdown
        const subcategoryMap = new Map<
          string,
          { amount: number; quantity: number; categoryId: string }
        >()
        filteredLines.forEach((line) => {
          if (!line.menuSubGroupAtSale) return
          const key = `${line.menuGroupAtSale}_${line.menuSubGroupAtSale}`
          const existing = subcategoryMap.get(key) ?? {
            amount: 0,
            quantity: 0,
            categoryId: line.menuGroupAtSale,
          }
          existing.amount += line.amount
          existing.quantity += line.quantity
          subcategoryMap.set(key, existing)
        })

        const subcategoryBreakdown = Array.from(subcategoryMap.entries()).map(
          ([key, data]) => {
            const category = menuGroups.find((g) => g.id === data.categoryId)
            const subcategory = category?.subGroups.find((sg) => {
              const subKey = `${data.categoryId}_${sg.id}`
              return subKey === key
            })
            return {
              subcategoryId: key.split('_')[1],
              subcategoryLabel: subcategory?.label || key.split('_')[1],
              amount: data.amount,
              quantity: data.quantity,
              share: totalAmount > 0 ? data.amount / totalAmount : 0,
            }
          },
        )

        // Product breakdown
        const productMap = new Map<string, { amount: number; quantity: number }>()
        filteredLines.forEach((line) => {
          const existing = productMap.get(line.productId) ?? {
            amount: 0,
            quantity: 0,
          }
          existing.amount += line.amount
          existing.quantity += line.quantity
          productMap.set(line.productId, existing)
        })

        const productBreakdown = Array.from(productMap.entries()).map(
          ([productId, data]) => {
            const product = products.find((p) => p.id === productId)
            const category = menuGroups.find(
              (g) => g.id === (product?.menuGroupId || ''),
            )
            const subcategory = category?.subGroups.find(
              (sg) => sg.id === product?.menuSubGroupId,
            )

            return {
              productId,
              productName:
                product?.name ||
                filteredLines.find((l) => l.productId === productId)
                  ?.productNameAtSale ||
                productId,
              categoryLabel: category?.label || '',
              subcategoryLabel: subcategory?.label,
              amount: data.amount,
              quantity: data.quantity,
              avgPrice: data.quantity > 0 ? data.amount / data.quantity : 0,
              share: totalAmount > 0 ? data.amount / totalAmount : 0,
            }
          },
        )

        setReportData({
          salesLines: filteredLines,
          totalAmount,
          totalQuantity,
          averagePrice,
          uniqueProducts,
          categoryBreakdown: categoryBreakdown.sort((a, b) => b.amount - a.amount),
          subcategoryBreakdown: subcategoryBreakdown.sort(
            (a, b) => b.amount - a.amount,
          ),
          productBreakdown: productBreakdown.sort((a, b) => b.amount - a.amount),
        })
      })
      .catch((error) => {
        console.error('[ReportsPage] Error fetching report data:', error)
        setError(
          'There was a problem generating this report. Please adjust your filters or try again.',
        )
      })
      .finally(() => {
        setLoading(false)
      })
  }, [workspace, filters, menuGroups, products])

  // Available subcategories for selected category
  const availableSubcategories = useMemo(() => {
    if (filters.categoryId === 'all') return []
    const category = menuGroups.find((g) => g.id === filters.categoryId)
    return category?.subGroups ?? []
  }, [filters.categoryId, menuGroups])

  // Available products based on category & subcategory filters
  const availableProducts = useMemo(() => {
    let filtered = products

    if (filters.categoryId !== 'all') {
      filtered = filtered.filter((p) => p.menuGroupId === filters.categoryId)
    }

    if (filters.subcategoryId !== 'all') {
      filtered = filtered.filter((p) => p.menuSubGroupId === filters.subcategoryId)
    }

    return filtered
  }, [products, filters.categoryId, filters.subcategoryId])



  const handleDateRangeChange = (dateRange: DateRange) => {
    setFilters((prev) => ({ ...prev, dateRange }))
  }

  const handleCategoryChange = (categoryId: string) => {
    setFilters((prev) => ({
      ...prev,
      categoryId,
      subcategoryId: 'all',
      productId: '',
    }))
  }

  const handleSubcategoryChange = (subcategoryId: string) => {
    setFilters((prev) => ({
      ...prev,
      subcategoryId,
      productId: '',
    }))
  }

  const handleProductChange = (productId: string) => {
    setFilters((prev) => ({ ...prev, productId }))
  }

  const handleResetFilters = () => {
    setFilters({
      dateRange: workspace.dateRange,
      categoryId: 'all',
      subcategoryId: 'all',
      productId: '',
      includeExtras: true,
    })
  }

  const productColumns: TableColumn<ReportData['productBreakdown'][0]>[] = useMemo(
    () => [
      {
        header: 'Product',
        accessor: (row) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{row.productName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {row.categoryLabel && (
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {row.categoryLabel}
                </span>
              )}
              {row.subcategoryLabel && (
                <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {row.subcategoryLabel}
                </span>
              )}
            </div>
          </div>
        ),
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
              {(row.share * 100).toFixed(1)}%
            </span>
          </div>
        ),
        align: 'right',
      },
    ],
    [workspace.currency],
  )

  const salesLineColumns: TableColumn<SalesLine>[] = useMemo(
    () => [
      {
        header: 'Date',
        accessor: (row) => (
          <span className="text-sm text-slate-600">
            {row.reportDate && !isNaN(new Date(row.reportDate).getTime()) ? format(new Date(row.reportDate), 'MMM d, yyyy') : '—'}
          </span>
        ),
      },
      {
        header: 'Product',
        accessor: (row) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">
              {row.productNameAtSale}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {menuGroups.find((g) => g.id === row.menuGroupAtSale)?.label ||
                  row.menuGroupAtSale}
              </span>
              {row.menuSubGroupAtSale && (
                <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {menuGroups
                    .find((g) => g.id === row.menuGroupAtSale)
                    ?.subGroups.find((sg) => sg.id === row.menuSubGroupAtSale)?.label ||
                    row.menuSubGroupAtSale}
                </span>
              )}
            </div>
          </div>
        ),
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
        header: 'Amount',
        accessor: (row) => (
          <span className="font-bold text-slate-900">
            {formatCurrency(workspace.currency, row.amount)}
          </span>
        ),
        align: 'right',
      },
      {
        header: 'Unit Price',
        accessor: (row) => (
          <span className="text-slate-600">
            {formatCurrency(workspace.currency, row.unitPrice)}
          </span>
        ),
        align: 'right',
      },
    ],
    [workspace.currency, menuGroups],
  )

  if (isInitialLoading) {
    return (
      <section className="space-y-8 md:space-y-10">
        <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
            <p className="text-sm font-medium text-slate-500">Preparing your report…</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-8 pb-10 md:space-y-10">
      {/* Header */}
      <div className="page-header">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1>Detailed Reports</h1>
            <p>Deep dive into your sales data with filters</p>
          </div>

          <div className="flex flex-col items-start gap-2 text-sm text-gray-500 md:items-end">
            {dateRangeLabel && (
              <p>
                <span className="font-semibold text-gray-900">Date range:</span>{' '}
                <span>{dateRangeLabel}</span>
              </p>
            )}
            {reportData && (
              <p>
                <span className="font-semibold text-gray-900">Scope:</span>{' '}
                {reportData.salesLines.length.toLocaleString()} sales lines ·{' '}
                {reportData.productBreakdown.length.toLocaleString()} products
              </p>
            )}
            {isUpdating && (
              <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Updating…
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Filters */}
      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:p-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Filters</h2>
            <p className="mt-1 text-sm text-slate-500">
              Refine this report by date, menu structure and individual products.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100">
              <input
                type="checkbox"
                checked={filters.includeExtras}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, includeExtras: e.target.checked }))
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Include extras
            </label>
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              Reset filters
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-1">
              <label className="mb-2.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Date range
              </label>
              <DateRangePicker value={filters.dateRange} onChange={handleDateRangeChange} />
            </div>

            <div>
              <label className="mb-2.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Category
              </label>
              <Select
                value={filters.categoryId}
                onChange={(e) => handleCategoryChange(e.target.value)}
                options={[
                  { label: 'All categories', value: 'all' },
                  ...menuGroups.map((group) => ({
                    label: group.label,
                    value: group.id,
                  })),
                ]}
              />
            </div>

            <div>
              <label className="mb-2.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Subcategory
              </label>
              <Select
                value={filters.subcategoryId}
                onChange={(e) => handleSubcategoryChange(e.target.value)}
                options={[
                  { label: 'All subcategories', value: 'all' },
                  ...availableSubcategories.map((sub) => ({
                    label: sub.label,
                    value: sub.id,
                  })),
                ]}
                disabled={
                  filters.categoryId === 'all' || availableSubcategories.length === 0
                }
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-2.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Product
              </label>
              <SearchableSelect
                value={filters.productId}
                onChange={handleProductChange}
                options={[
                  { label: 'All products', value: '' },
                  ...availableProducts.map((product) => ({
                    label: product.name,
                    value: product.id,
                  })),
                ]}
                placeholder="Select a product..."
                searchPlaceholder="Search products..."
              />
            </div>
          </div>
        </div>
      </section>

      {reportData && (
        <>
          {/* Summary metrics */}
          <section>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-1 text-sm font-semibold text-slate-500">
                      Total revenue
                    </p>
                    <p className="text-3xl font-bold tracking-tight text-slate-900">
                      {formatCurrency(workspace.currency, reportData.totalAmount)}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Qty: <span className="font-medium text-slate-700">{reportData.totalQuantity.toLocaleString()}</span>
                    </p>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
                    <span className="text-blue-600">💎</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-1 text-sm font-semibold text-slate-500">
                      Items sold
                    </p>
                    <p className="text-3xl font-bold tracking-tight text-slate-900">
                      {reportData.totalQuantity.toLocaleString()}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">units</p>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
                    <span className="text-emerald-600">📦</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-1 text-sm font-semibold text-slate-500">
                      Avg. price
                    </p>
                    <p className="text-3xl font-bold tracking-tight text-slate-900">
                      {formatCurrency(workspace.currency, reportData.averagePrice)}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">per item</p>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-2xl">
                    <span className="text-violet-600">⚡</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-1 text-sm font-semibold text-slate-500">
                      Products
                    </p>
                    <p className="text-3xl font-bold tracking-tight text-slate-900">
                      {reportData.uniqueProducts}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">unique products</p>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-2xl">
                    <span className="text-amber-600">🔥</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Charts Section */}
          <section className="grid gap-6 lg:gap-8 lg:grid-cols-2">
            {/* Sales by Category Chart */}
            {reportData.categoryBreakdown.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:p-8">
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-slate-900">Sales by Category</h3>
                  <p className="mt-1 text-sm text-slate-500">Revenue distribution across categories</p>
                </div>
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reportData.categoryBreakdown}
                        dataKey="amount"
                        nameKey="categoryLabel"
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={120}
                        fill="#8884d8"
                        paddingAngle={2}
                        label={({ name, percent }) => `${name} ${(percent ? percent * 100 : 0).toFixed(0)}%`}
                      >
                        {reportData.categoryBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={['#0F8BFD', '#7C3AED', '#F59E0B', '#10B981', '#EF4444', '#6366F1'][index % 6]} strokeWidth={2} stroke="white" />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => formatCurrency(workspace.currency, value)}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -2px rgb(0 0 0 / 0.1)', padding: '12px' }}
                        itemStyle={{ color: '#1e293b', fontWeight: 600 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Top Products Chart */}
            {reportData.productBreakdown.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:p-8">
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-slate-900">Top 5 Products</h3>
                  <p className="mt-1 text-sm text-slate-500">Highest revenue generating products</p>
                </div>
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={reportData.productBreakdown.slice(0, 5)}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="productName"
                        width={120}
                        tick={{ fontSize: 13, fontWeight: 500, fill: '#475569' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: '#f1f5f9', radius: 4 }}
                        formatter={(value: number) => formatCurrency(workspace.currency, value)}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -2px rgb(0 0 0 / 0.1)', padding: '12px' }}
                        itemStyle={{ color: '#1e293b', fontWeight: 600 }}
                      />
                      <Bar dataKey="amount" fill="#7C3AED" radius={[0, 6, 6, 0]} barSize={32}>
                        {reportData.productBreakdown.slice(0, 5).map((_, index) => (
                          <Cell key={`cell-${index}`} fill="#7C3AED" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </section>

          {/* Category + Subcategory breakdown */}
          <section className="grid gap-6 lg:gap-8 lg:grid-cols-2">
            {reportData.categoryBreakdown.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-6 md:px-8">
                  <h3 className="text-lg font-bold text-slate-900">Category Breakdown</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Revenue distribution by category.
                  </p>
                </div>
                <div className="p-2">
                  <DataTable
                    data={reportData.categoryBreakdown}
                    columns={[
                      {
                        header: 'Category',
                        accessor: (row) => (
                          <span className="font-semibold text-slate-900">
                            {row.categoryLabel}
                          </span>
                        ),
                      },
                      {
                        header: 'Quantity',
                        accessor: (row) => row.quantity.toLocaleString(),
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
                        header: 'Share',
                        accessor: (row) => (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {(row.share * 100).toFixed(1)}%
                          </span>
                        ),
                        align: 'right',
                      },
                    ]}
                  />
                </div>
              </div>
            )}

            {reportData.subcategoryBreakdown.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-6 md:px-8">
                  <h3 className="text-lg font-bold text-slate-900">Subcategory Breakdown</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Revenue distribution by subcategory.
                  </p>
                </div>
                <div className="p-2">
                  <DataTable
                    data={reportData.subcategoryBreakdown}
                    columns={[
                      {
                        header: 'Subcategory',
                        accessor: (row) => (
                          <span className="font-semibold text-slate-900">
                            {row.subcategoryLabel}
                          </span>
                        ),
                      },
                      {
                        header: 'Quantity',
                        accessor: (row) => row.quantity.toLocaleString(),
                        align: 'right',
                      },
                      {
                        header: 'Revenue',
                        accessor: (row) => (
                          <span className="font-medium text-slate-900">
                            {formatCurrency(workspace.currency, row.amount)}
                          </span>
                        ),
                        align: 'right',
                      },
                      {
                        header: 'Share',
                        accessor: (row) => (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {(row.share * 100).toFixed(1)}%
                          </span>
                        ),
                        align: 'right',
                      },
                    ]}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Product breakdown */}
          {reportData.productBreakdown.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-6 md:px-8">
                <h3 className="text-lg font-bold text-slate-900">Product Performance</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Detailed metrics for {reportData.productBreakdown.length} products.
                </p>
              </div>
              <div className="p-2">
                <DataTable data={reportData.productBreakdown} columns={productColumns} />
              </div>
            </section>
          )}

          {/* Detailed sales lines */}
          {reportData.salesLines.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-6 md:px-8">
                <h3 className="text-lg font-bold text-slate-900">Detailed Sales Lines</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {reportData.salesLines.length} individual sales records.
                </p>
              </div>
              <div className="p-2">
                <DataTable data={reportData.salesLines} columns={salesLineColumns} />
              </div>
            </section>
          )}

          {reportData.salesLines.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
              <p className="text-lg font-semibold text-slate-900">
                No data found for the selected filters
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Try adjusting your filters or expanding the date range.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
