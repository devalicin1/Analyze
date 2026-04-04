import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { DataTable, type TableColumn } from '../../components/tables/DataTable'
import { Select } from '../../components/forms/Select'
import { fetchLifecycleInsights } from '../../lib/api/analytics'
import type { LifecycleItem } from '../../lib/types'
import { useWorkspace } from '../../context/WorkspaceContext'
import { formatCurrency } from '../../lib/utils/formatting'

const windowOptions = [
  { label: 'Last 3 months', value: '3' },
  { label: 'Last 6 months', value: '6' },
  { label: 'Last 12 months', value: '12' },
]

export function LifecyclePage() {
  const workspace = useWorkspace()
  const [windowLength, setWindowLength] = useState('3')
  const [data, setData] = useState<{ newItems: LifecycleItem[]; deadItems: LifecycleItem[] }>({
    newItems: [],
    deadItems: [],
  })

  useEffect(() => {
    fetchLifecycleInsights(workspace, Number(windowLength)).then((insights) =>
      setData(insights),
    )
  }, [workspace, windowLength])

  const columns: TableColumn<LifecycleItem>[] = [
    {
      header: 'Product',
      accessor: (row) => (
        <div>
          <p className="font-semibold text-gray-900">{row.productName}</p>
          <p className="text-xs text-gray-500">{row.menuGroup}</p>
        </div>
      ),
    },
    {
      header: 'First sold',
      accessor: (row) => {
        const d = new Date(row.firstSold)
        return d instanceof Date && !isNaN(d.getTime()) ? format(d, 'd MMM yyyy') : '—'
      },
    },
    {
      header: 'Last sold',
      accessor: (row) => {
        const d = new Date(row.lastSold)
        return d instanceof Date && !isNaN(d.getTime()) ? format(d, 'd MMM yyyy') : '—'
      },
    },
    {
      header: 'Last window qty',
      accessor: (row) => row.lastWindowQty.toLocaleString(),
      align: 'right',
    },
    {
      header: 'Lifetime amount',
      accessor: (row) => formatCurrency(workspace.currency, row.lifetimeAmount),
      align: 'right',
    },
  ]

  return (
    <section className="space-y-8">
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>Product Lifecycle</h1>
            <p>Track new arrivals and discontinued items</p>
          </div>
          <Select
            value={windowLength}
            onChange={(event) => setWindowLength(event.target.value)}
            options={windowOptions}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="section-title mb-3">New items</h2>
          <DataTable data={data.newItems} columns={columns} emptyLabel="No new items" />
        </div>
        <div>
          <h2 className="section-title mb-3">Dead items</h2>
          <DataTable data={data.deadItems} columns={columns} emptyLabel="No dead items" />
        </div>
      </div>
    </section>
  )
}


