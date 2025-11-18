import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { DataTable, type TableColumn } from '../../components/tables/DataTable'
import { Select } from '../../components/forms/Select'
import { fetchLifecycleInsights } from '../../lib/api/analytics'
import type { LifecycleItem } from '../../lib/types'
import { useWorkspace } from '../../context/WorkspaceContext'

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
      accessor: (row) => format(new Date(row.firstSold), 'd MMM yyyy'),
    },
    {
      header: 'Last sold',
      accessor: (row) => format(new Date(row.lastSold), 'd MMM yyyy'),
    },
    {
      header: 'Last window qty',
      accessor: (row) => row.lastWindowQty.toLocaleString(),
      align: 'right',
    },
    {
      header: 'Lifetime amount',
      accessor: (row) =>
        `${workspace.currency} ${row.lifetimeAmount.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })}`,
      align: 'right',
    },
  ]

  return (
    <section className="space-y-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="page-title">Lifecycle</h1>
          <p className="text-sm text-gray-500">
            Identify new and declining items in your menu.
          </p>
        </div>
        <Select
          value={windowLength}
          onChange={(event) => setWindowLength(event.target.value)}
          options={windowOptions}
        />
      </header>

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


