import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMenuGroups } from '../../lib/api/menuGroups'
import { getProduct, saveProduct } from '../../lib/api/products'
import type { MenuGroup, Product } from '../../lib/types'
import { useWorkspace } from '../../context/WorkspaceContext'
import { Select } from '../../components/forms/Select'

type ProductFormState = {
  name: string
  menuGroupId: string
  menuSubGroupId?: string
  isExtra: boolean
  posCode?: string
  defaultUnitPrice?: number
  activeFrom?: string
  activeTo?: string
}

const emptyForm: ProductFormState = {
  name: '',
  menuGroupId: '',
  menuSubGroupId: undefined,
  isExtra: false,
  posCode: '',
  defaultUnitPrice: undefined,
  activeFrom: undefined,
  activeTo: undefined,
}

export function EditProductPage() {
  const { productId } = useParams()
  const isNew = !productId || productId === 'new'
  const workspace = useWorkspace()
  const navigate = useNavigate()
  const [form, setForm] = useState<ProductFormState>(emptyForm)
  const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [groups, product] = await Promise.all([
        getMenuGroups(workspace),
        isNew ? Promise.resolve<Product | null>(null) : getProduct(workspace, productId!),
      ])
      setMenuGroups(groups)
      if (product) {
        setForm({
          name: product.name,
          menuGroupId: product.menuGroupId,
          menuSubGroupId: product.menuSubGroupId,
          isExtra: product.isExtra,
          posCode: product.posCode,
          defaultUnitPrice: product.defaultUnitPrice,
          activeFrom: product.activeFrom
            ? new Date(product.activeFrom).toISOString().split('T')[0]
            : undefined,
          activeTo: product.activeTo
            ? new Date(product.activeTo).toISOString().split('T')[0]
            : undefined,
        })
      } else if (groups.length > 0) {
        setForm((prev) => ({
          ...prev,
          menuGroupId: groups[0].id,
        }))
      }
      setLoading(false)
    }
    load()
  }, [workspace, productId, isNew])

  const subGroupOptions = useMemo(() => {
    return menuGroups.find((group) => group.id === form.menuGroupId)?.subGroups ?? []
  }, [menuGroups, form.menuGroupId])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSuccessMessage(null)
    try {
      await saveProduct(workspace, {
        id: isNew ? undefined : productId,
        ...form,
        defaultUnitPrice: form.defaultUnitPrice
          ? Number(form.defaultUnitPrice)
          : undefined,
        activeFrom: form.activeFrom ? new Date(form.activeFrom) : undefined,
        activeTo: form.activeTo ? new Date(form.activeTo) : undefined,
        updatedAt: new Date(),
        createdAt: isNew ? new Date() : undefined,
      } as Product)
      setSuccessMessage('Product saved successfully.')
      if (isNew) {
        setTimeout(() => {
          navigate('/products')
        }, 1200)
      }
    } catch (err) {
      console.error(err)
      setError('Unable to save product. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleChange<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="page-title">{isNew ? 'Add product' : 'Edit product'}</h1>
        <p className="text-sm text-gray-500">
          Configure menu group, pricing, and availability.
        </p>
      </header>
      {loading ? (
        <div className="app-card text-sm text-gray-500">Loading product...</div>
      ) : (
        <form onSubmit={handleSubmit} className="app-card space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-gray-700">
              Product name
              <input
                type="text"
                value={form.name}
                onChange={(event) => handleChange('name', event.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 shadow-sm"
              />
            </label>
            <label className="text-sm font-semibold text-gray-700">
              POS code
              <input
                type="text"
                value={form.posCode ?? ''}
                onChange={(event) => handleChange('posCode', event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 shadow-sm"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Select
              label="Menu group"
              value={form.menuGroupId}
              onChange={(event) => handleChange('menuGroupId', event.target.value)}
              options={menuGroups.map((group) => ({ label: group.label, value: group.id }))}
            />
            <Select
              label="Menu subgroup"
              value={form.menuSubGroupId ?? ''}
              onChange={(event) => handleChange('menuSubGroupId', event.target.value || undefined)}
              options={[
                { label: 'None', value: '' },
                ...subGroupOptions.map((sub) => ({
                  label: sub.label,
                  value: sub.id,
                })),
              ]}
            />
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={form.isExtra}
                onChange={(event) => handleChange('isExtra', event.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              Is extra / modifier
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-semibold text-gray-700">
              Default unit price ({workspace.currency})
              <input
                type="number"
                step="0.01"
                value={form.defaultUnitPrice ?? ''}
                onChange={(event) =>
                  handleChange(
                    'defaultUnitPrice',
                    event.target.value ? Number(event.target.value) : undefined,
                  )
                }
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 shadow-sm"
              />
            </label>
            <label className="text-sm font-semibold text-gray-700">
              Active from
              <input
                type="date"
                value={form.activeFrom ?? ''}
                onChange={(event) => handleChange('activeFrom', event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 shadow-sm"
              />
            </label>
            <label className="text-sm font-semibold text-gray-700">
              Active to
              <input
                type="date"
                value={form.activeTo ?? ''}
                onChange={(event) => handleChange('activeTo', event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 shadow-sm"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save product'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/products')}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
            >
              Cancel
            </button>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {successMessage && <p className="text-sm text-emerald-600">{successMessage}</p>}
        </form>
      )}
    </section>
  )
}


