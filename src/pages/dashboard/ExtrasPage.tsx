import { useEffect, useState } from 'react'
import { DataTable, type TableColumn } from '../../components/tables/DataTable'
import { fetchExtrasAnalytics } from '../../lib/api/analytics'
import type { ProductPerformance } from '../../lib/types'
import { useWorkspace } from '../../context/WorkspaceContext'
import { formatCurrency } from '../../lib/utils/formatting'

export function ExtrasPage() {
  const workspace = useWorkspace()
  const [extras, setExtras] = useState<{
    totalQuantity: number
    totalAmount: number
    shareOfSales: number
    perProduct: ProductPerformance[]
  } | null>(null)

  useEffect(() => {
    fetchExtrasAnalytics(workspace, {
      start: workspace.dateRange.start,
      end: workspace.dateRange.end,
    }).then((data) => setExtras(data))
  }, [workspace, workspace.dateRange])

  const columns: TableColumn<ProductPerformance>[] = [
    {
      header: 'Extra',
      accessor: (row) => (
        <div>
          <p className="font-semibold text-gray-900">{row.productName}</p>
          <p className="text-xs text-gray-500">{row.menuGroup}</p>
        </div>
      ),
    },
    {
      header: 'Quantity',
      accessor: (row) => row.quantity.toLocaleString(),
      align: 'right',
    },
    {
      header: 'Amount',
      accessor: (row) => formatCurrency(workspace.currency, row.amount),
      align: 'right',
    },
    {
      header: 'Avg price',
      accessor: (row) => formatCurrency(workspace.currency, row.avgPrice),
      align: 'right',
    },
    {
      header: '% of extras',
      accessor: (row) => `${(row.percentOfTotal * 100).toFixed(1)}%`,
      align: 'right',
    },
  ]

  return (
    <section className="space-y-8">
      <div className="page-hero bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800">
        <div className="relative">
          <h1 className="text-2xl font-bold text-white">Extras & Add-ons</h1>
          <p className="mt-1 text-sm text-teal-100">Analyze performance of extras and add-on items</p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="app-card">
          <p className="text-sm text-gray-500">Total Extras Quantity</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {extras?.totalQuantity.toLocaleString() ?? '—'}
          </p>
        </div>
        <div className="app-card">
          <p className="text-sm text-gray-500">Total Extras Amount</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {extras
              ? formatCurrency(workspace.currency, extras.totalAmount)
              : '—'}
          </p>
        </div>
        <div className="app-card">
          <p className="text-sm text-gray-500">Extras share of sales</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {extras ? `${(extras.shareOfSales * 100).toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>
      <div>
        <h2 className="section-title mb-4">Extras performance</h2>
        <DataTable data={extras?.perProduct ?? []} columns={columns} />
      </div>
    </section>
  )
}


