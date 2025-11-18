import { useEffect, useState } from 'react'
import { DataTable, type TableColumn } from '../../components/tables/DataTable'
import { fetchExtrasAnalytics } from '../../lib/api/analytics'
import type { ProductPerformance } from '../../lib/types'
import { useWorkspace } from '../../context/WorkspaceContext'

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
      accessor: (row) =>
        `${workspace.currency} ${row.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      align: 'right',
    },
    {
      header: 'Avg price',
      accessor: (row) =>
        `${workspace.currency} ${row.avgPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
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
      <header>
        <h1 className="page-title">Extras Analytics</h1>
        <p className="text-sm text-gray-500">
          Track attach performance of extras and modifiers.
        </p>
      </header>
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
              ? `${workspace.currency} ${extras.totalAmount.toLocaleString()}`
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


