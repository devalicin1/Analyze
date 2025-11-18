import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Filter, Upload } from 'lucide-react'
import { Select } from '../../components/forms/Select'
import { DataTable, type TableColumn } from '../../components/tables/DataTable'
import { BulkUploadModal } from '../../components/products/BulkUploadModal'
import { getMenuGroups } from '../../lib/api/menuGroups'
import { listProducts } from '../../lib/api/products'
import type { MenuGroup, Product } from '../../lib/types'
import { useWorkspace } from '../../context/WorkspaceContext'

type StatusFilter = 'all' | 'active' | 'inactive'

function isActive(product: Product) {
  const now = new Date()
  const from = product.activeFrom ? new Date(product.activeFrom) : null
  const to = product.activeTo ? new Date(product.activeTo) : null
  if (from && now < from) return false
  if (to && now > to) return false
  return true
}

export function ProductsListPage() {
  const workspace = useWorkspace()
  const [products, setProducts] = useState<Product[]>([])
  const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([])
  const [menuGroupFilter, setMenuGroupFilter] = useState('all')
  const [onlyExtras, setOnlyExtras] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false)

  useEffect(() => {
    listProducts(workspace).then(setProducts)
    getMenuGroups(workspace).then(setMenuGroups)
  }, [workspace])

  function handleBulkUploadSuccess() {
    listProducts(workspace).then(setProducts)
    setBulkUploadOpen(false)
  }

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (menuGroupFilter !== 'all' && product.menuGroupId !== menuGroupFilter) return false
      if (onlyExtras && !product.isExtra) return false
      if (statusFilter === 'active' && !isActive(product)) return false
      if (statusFilter === 'inactive' && isActive(product)) return false
      return true
    })
  }, [products, menuGroupFilter, onlyExtras, statusFilter])

  const columns: TableColumn<Product>[] = [
    {
      header: 'Product',
      accessor: (row) => (
        <div>
          <p className="font-semibold text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">{row.posCode ?? '—'}</p>
        </div>
      ),
    },
    {
      header: 'Menu group',
      accessor: (row) => {
        const group = menuGroups.find((group) => group.id === row.menuGroupId)
        return (
          <div>
            <p className="text-sm font-semibold text-gray-900">{group?.label ?? '—'}</p>
            {row.menuSubGroupId && (
              <p className="text-xs text-gray-500">
                {group?.subGroups.find((sub) => sub.id === row.menuSubGroupId)?.label}
              </p>
            )}
          </div>
        )
      },
    },
    {
      header: 'Extra',
      accessor: (row) => (
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
          {row.isExtra ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: (row) => (
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isActive(row)
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {isActive(row) ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      header: 'Actions',
      accessor: (row) => (
        <Link to={`/products/${row.id}`} className="text-sm font-semibold text-primary">
          Edit
        </Link>
      ),
      align: 'right',
    },
  ]

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="page-title">Products</h1>
          <p className="text-sm text-gray-500">
            Manage menu items, extras, and availability.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setBulkUploadOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <Upload className="h-4 w-4" />
            Bulk Upload
          </button>
          <Link
            to="/products/new"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            Add product
          </Link>
        </div>
      </header>

      <div className="app-card">
        <div className="mb-4 flex items-center gap-3 text-sm font-semibold text-gray-500">
          <Filter className="h-4 w-4" />
          Filters
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Select
            label="Menu group"
            value={menuGroupFilter}
            onChange={(event) => setMenuGroupFilter(event.target.value)}
            options={[
              { label: 'All groups', value: 'all' },
              ...menuGroups.map((group) => ({ label: group.label, value: group.id })),
            ]}
          />
          <Select
            label="Status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ]}
          />
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <input
              type="checkbox"
              checked={onlyExtras}
              onChange={(event) => setOnlyExtras(event.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            Only extras
          </label>
        </div>
      </div>

      <DataTable data={filteredProducts} columns={columns} emptyLabel="No products yet" />

      <BulkUploadModal
        isOpen={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        workspace={workspace}
        menuGroups={menuGroups}
        onSuccess={handleBulkUploadSuccess}
      />
    </section>
  )
}


