import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Store } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'

export function WorkspaceSwitcher() {
  const { workspaces, workspaceId, workspaceName, setWorkspaceId, addWorkspace } =
    useWorkspace()
  const [isOpen, setIsOpen] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('GBP')
  const [timezone, setTimezone] = useState('Europe/London')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  function resetForm() {
    setIsAdding(false)
    setName('')
    setCurrency('GBP')
    setTimezone('Europe/London')
    setError(null)
  }

  function handleSelect(id: string) {
    setWorkspaceId(id)
    setIsOpen(false)
    resetForm()
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Restaurant name is required')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const created = await addWorkspace({
        name: trimmed,
        currency: currency.trim() || 'GBP',
        timezone: timezone.trim() || 'Europe/London',
      })
      setWorkspaceId(created.id)
      setIsOpen(false)
      resetForm()
    } catch (err) {
      console.error('Failed to create workspace', err)
      setError(err instanceof Error ? err.message : 'Failed to create restaurant')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        <Store className="h-3.5 w-3.5 text-gray-400" />
        <span className="max-w-[160px] truncate">{workspaceName}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-72">
          <div className="rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 px-3 py-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Restaurants
              </h3>
            </div>

            <ul className="max-h-64 overflow-y-auto py-1">
              {workspaces.map((ws) => {
                const selected = ws.id === workspaceId
                return (
                  <li key={ws.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(ws.id)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-gray-50 ${
                        selected ? 'font-semibold text-gray-900' : 'text-gray-700'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Store className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="truncate">{ws.name}</span>
                        <span className="shrink-0 text-[11px] text-gray-400">
                          {ws.currency}
                        </span>
                      </span>
                      {selected && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="border-t border-gray-100 p-2">
              {!isAdding ? (
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Plus className="h-3.5 w-3.5 text-gray-400" />
                  Add restaurant
                </button>
              ) : (
                <div className="space-y-2 p-1">
                  <input
                    type="text"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate()
                    }}
                    placeholder="Restaurant name"
                    className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-[13px] text-gray-900 focus:border-gray-400 focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      placeholder="Currency"
                      className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-[13px] text-gray-900 focus:border-gray-400 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      placeholder="Timezone"
                      className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-[13px] text-gray-900 focus:border-gray-400 focus:outline-none"
                    />
                  </div>
                  {error && <p className="text-[12px] text-red-500">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={creating}
                      onClick={handleCreate}
                      className="flex-1 rounded-md bg-gray-900 px-2.5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creating ? 'Creating…' : 'Create'}
                    </button>
                    <button
                      type="button"
                      disabled={creating}
                      onClick={resetForm}
                      className="rounded-md border border-gray-200 px-2.5 py-1.5 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="pt-0.5 text-[11px] leading-snug text-gray-400">
                    After creating, set up Menu Groups and Products, then upload its
                    reports.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
