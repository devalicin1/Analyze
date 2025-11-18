import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { LineChart } from '../../components/charts/LineChart'
import { Select } from '../../components/forms/Select'
import {
  fetchCategoryTrends,
  fetchProductTrends,
  type CategoryTrendPoint,
} from '../../lib/api/analytics'
import { listProducts } from '../../lib/api/products'
import { useWorkspace } from '../../context/WorkspaceContext'
import type { Product, TrendPoint } from '../../lib/types'

const PRODUCT_COLOR_PALETTE = ['#0F8BFD', '#7C3AED', '#16A34A'] as const
const CATEGORY_COLOR_PALETTE = ['#0F8BFD', '#7C3AED', '#16A34A', '#F97316'] as const

export function TrendsPage() {
  const workspace = useWorkspace()

  const [products, setProducts] = useState<Product[]>([])
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])

  const [productTrendData, setProductTrendData] = useState<TrendPoint[]>([])
  const [categoryTrends, setCategoryTrends] = useState<CategoryTrendPoint[]>([])

  const [isLoadingInit, setIsLoadingInit] = useState(false)
  const [isLoadingProductTrends, setIsLoadingProductTrends] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Date range text (üst bilgi için)
  const dateRangeLabel = useMemo(() => {
    try {
      if (!workspace?.dateRange?.start || !workspace?.dateRange?.end) return ''
      const start = format(workspace.dateRange.start, 'dd MMM yyyy')
      const end = format(workspace.dateRange.end, 'dd MMM yyyy')
      return `${start} – ${end}`
    } catch {
      return ''
    }
  }, [workspace?.dateRange?.start, workspace?.dateRange?.end])

  // İlk yükleme: ürün listesi + kategori trendleri
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setIsLoadingInit(true)
      setError(null)

      try {
        const [productList, categoryTrendResponse] = await Promise.all([
          listProducts(workspace),
          fetchCategoryTrends(workspace, {
            start: workspace.dateRange.start,
            end: workspace.dateRange.end,
          }),
        ])

        if (cancelled) return

        setProducts(productList)

        // Varsayılan olarak ilk 2 ürünü seç
        setSelectedProducts((prev) => {
          if (prev.length > 0) return prev
          return productList.slice(0, 2).map((product) => product.id)
        })

        setCategoryTrends(categoryTrendResponse)
      } catch (err) {
        if (!cancelled) {
          console.error(err)
          setError('Trend verileri yüklenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingInit(false)
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [workspace, workspace.dateRange])

  // Seçili ürünler için trend verisi
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (selectedProducts.length === 0) {
        if (!cancelled) setProductTrendData([])
        return
      }

      setIsLoadingProductTrends(true)

      try {
        const data = await fetchProductTrends(workspace, selectedProducts, {
          start: workspace.dateRange.start,
          end: workspace.dateRange.end,
        })
        if (!cancelled) setProductTrendData(data)
      } catch (err) {
        if (!cancelled) {
          console.error(err)
          setError(
            'Ürün trend verileri alınırken bir sorun oluştu. Farklı ürünler veya tarih aralığı deneyin.',
          )
        }
      } finally {
        if (!cancelled) setIsLoadingProductTrends(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [workspace, workspace.dateRange, selectedProducts])

  // Product line series config
  const trendSeries = useMemo(() => {
    if (selectedProducts.length === 0) return []

    return selectedProducts.map((productId, index) => {
      const product = products.find((p) => p.id === productId)
      return {
        dataKey: productId,
        label: product?.name ?? productId,
        color: PRODUCT_COLOR_PALETTE[index % PRODUCT_COLOR_PALETTE.length],
      }
    })
  }, [selectedProducts, products])

  // Chart data: period bazlı tablo
  const productChartData = useMemo(() => {
    const periodMap = new Map<string, Record<string, unknown>>()

    productTrendData.forEach((point) => {
      if (!point.productId) return

      if (!periodMap.has(point.periodKey)) {
        periodMap.set(point.periodKey, { periodKey: point.periodKey })
      }
      const row = periodMap.get(point.periodKey)!
      // Şu an quantity üzerine kurulu; ileride amount için burası genişletilebilir
      row[point.productId] = point.quantity
    })

    return Array.from(periodMap.values())
  }, [productTrendData])

  // Kategori bazlı chart data
  const categoryChart = useMemo(() => {
    const periodMap = new Map<string, Record<string, unknown>>()

    categoryTrends.forEach((entry) => {
      if (!periodMap.has(entry.periodKey)) {
        periodMap.set(entry.periodKey, {
          label: entry.label,
          periodKey: entry.periodKey,
        })
      }
      const row = periodMap.get(entry.periodKey)!
      row[entry.menuGroup] = entry.amount
    })

    return Array.from(periodMap.values())
  }, [categoryTrends])

  // Kategori line series config
  const categorySeries = useMemo(
    () =>
      Array.from(new Set(categoryTrends.map((entry) => entry.menuGroup))).map(
        (groupId, index) => ({
          dataKey: groupId,
          label: groupId,
          color: CATEGORY_COLOR_PALETTE[index % CATEGORY_COLOR_PALETTE.length],
        }),
      ),
    [categoryTrends],
  )

  // Basit ürün içgörüsü: toplam adet
  const productInsights = useMemo(() => {
    if (productTrendData.length === 0) return []

    const totals = new Map<string, number>() // productId -> total quantity

    productTrendData.forEach((point) => {
      if (!point.productId) return
      const prev = totals.get(point.productId) ?? 0
      totals.set(point.productId, prev + (point.quantity ?? 0))
    })

    return Array.from(totals.entries())
      .map(([productId, total]) => ({
        productId,
        total,
        name: products.find((p) => p.id === productId)?.name ?? productId,
      }))
      .sort((a, b) => b.total - a.total)
  }, [productTrendData, products])

  function updateSelection(position: number, value: string) {
    setSelectedProducts((prev) => {
      const next = [...prev]
      next[position] = value

      const normalized = next.filter(Boolean)
      // Aynı ürün birden fazla combobox'ta seçilmesin
      const unique = Array.from(new Set(normalized))
      return unique.slice(0, 3)
    })
  }

  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        label: product.name,
        value: product.id,
      })),
    [products],
  )

  const hasProductData = productChartData.length > 0 && trendSeries.length > 0
  const hasCategoryData = categoryChart.length > 0 && categorySeries.length > 0

  return (
    <section className="space-y-6 md:space-y-8">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="page-title">Trends</h1>
          <p className="text-sm text-gray-500">
            Track how key products and menu groups evolve over time.
          </p>
        </div>

        {dateRangeLabel && (
          <div className="text-xs md:text-sm text-gray-500 md:text-right">
            <span className="font-medium text-gray-700">Date range:</span>{' '}
            <span>{dateRangeLabel}</span>
          </div>
        )}
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Ürün trendleri kartı (2/3 genişlik) */}
        <div className="app-card space-y-4 lg:col-span-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="section-title">Product trends</h2>
              <p className="text-sm text-gray-500">
                Select up to three products to compare monthly quantities.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Select
                value={selectedProducts[0] ?? ''}
                onChange={(event) => updateSelection(0, event.target.value)}
                options={productOptions}
              />
              <Select
                value={selectedProducts[1] ?? ''}
                onChange={(event) => updateSelection(1, event.target.value)}
                options={[
                  { label: 'None', value: '' },
                  ...productOptions,
                ]}
              />
              <Select
                value={selectedProducts[2] ?? ''}
                onChange={(event) => updateSelection(2, event.target.value)}
                options={[
                  { label: 'None', value: '' },
                  ...productOptions,
                ]}
              />
            </div>
          </div>

          <div className="h-[260px] md:h-[320px]">
            {isLoadingInit || isLoadingProductTrends ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                Loading product trends…
              </div>
            ) : hasProductData ? (
              <LineChart data={productChartData} xKey="periodKey" series={trendSeries} />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-gray-400">
                No product trend data for the selected period and products.
              </div>
            )}
          </div>
        </div>

        {/* Hızlı içgörüler kartı (1/3 genişlik) */}
        <div className="app-card space-y-3">
          <h2 className="section-title">Highlights</h2>
          <p className="text-sm text-gray-500">
            Quick view of your strongest products in the selected period.
          </p>

          {isLoadingInit ? (
            <p className="text-xs text-gray-400">Calculating highlights…</p>
          ) : productInsights.length === 0 ? (
            <p className="text-xs text-gray-400">
              We&apos;ll show key products here once there is enough data in this period.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {productInsights.slice(0, 4).map((item, index) => (
                <li
                  key={item.productId}
                  className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-medium text-gray-500">
                      {index + 1}
                    </span>
                    <span className="font-medium text-gray-800">{item.name}</span>
                  </div>
                  <span className="font-semibold text-gray-700">
                    {item.total.toLocaleString()} qty
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="app-card space-y-4">
        <div>
          <h2 className="section-title">Category trends</h2>
          <p className="text-sm text-gray-500">
            Monthly evolution of revenue per menu group.
          </p>
        </div>

        <div className="h-[260px] md:h-[320px]">
          {isLoadingInit ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              Loading category trends…
            </div>
          ) : hasCategoryData ? (
            <LineChart data={categoryChart} xKey="label" series={categorySeries} />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-gray-400">
              No category trend data for the selected period.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
