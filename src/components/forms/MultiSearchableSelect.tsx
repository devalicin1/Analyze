import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, X, Search, Check } from 'lucide-react'
import clsx from 'clsx'

type SelectOption = {
  label: string
  value: string
}

type MultiSearchableSelectProps = {
  label?: string
  options?: SelectOption[]
  values?: string[]
  onChange?: (values: string[]) => void
  placeholder?: string
  helperText?: string
  className?: string
  searchPlaceholder?: string
  emptyText?: string
}

export function MultiSearchableSelect({
  label,
  options = [],
  values = [],
  onChange,
  placeholder = 'Select items...',
  helperText,
  className,
  searchPlaceholder = 'Search...',
  emptyText = 'No items found',
}: MultiSearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const valueSet = useMemo(() => new Set(values), [values])
  const selectedOptions = useMemo(
    () => options.filter((o) => valueSet.has(o.value)),
    [options, valueSet],
  )

  const filteredOptions = useMemo(
    () =>
      options.filter((option) =>
        option.label.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [options, searchQuery],
  )

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  function toggleValue(v: string) {
    if (valueSet.has(v)) {
      onChange?.(values.filter((x) => x !== v))
    } else {
      onChange?.([...values, v])
    }
  }

  function removeValue(v: string, e: React.MouseEvent) {
    e.stopPropagation()
    onChange?.(values.filter((x) => x !== v))
  }

  function clearAll(e: React.MouseEvent) {
    e.stopPropagation()
    onChange?.([])
  }

  function handleToggle() {
    setIsOpen(!isOpen)
    if (!isOpen) setTimeout(() => inputRef.current?.focus(), 0)
    else setSearchQuery('')
  }

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      {label && (
        <label className="block text-sm font-semibold text-gray-900 mb-1">{label}</label>
      )}
      <div className="relative">
        <div
          onClick={handleToggle}
          className={clsx(
            'w-full min-h-[42px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-900 shadow-sm outline-none transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 cursor-pointer',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5 min-w-0 flex-1">
              {selectedOptions.length === 0 ? (
                <span className="text-gray-500">{placeholder}</span>
              ) : (
                selectedOptions.map((opt) => (
                  <span
                    key={opt.value}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    <span className="max-w-[180px] truncate">{opt.label}</span>
                    <button
                      type="button"
                      onClick={(e) => removeValue(opt.value, e)}
                      className="rounded hover:bg-primary/20"
                      title="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {values.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Clear all"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <ChevronDown
                className={clsx(
                  'h-4 w-4 text-gray-400 transition-transform',
                  isOpen && 'rotate-180',
                )}
              />
            </div>
          </div>
        </div>

        {isOpen && (
          <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-200 p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-900 placeholder-gray-500 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div
              className="max-h-60 overflow-y-auto p-1"
              style={{ scrollbarWidth: 'thin' }}
            >
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">{emptyText}</div>
              ) : (
                filteredOptions.map((option) => {
                  const checked = valueSet.has(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleValue(option.value)}
                      className={clsx(
                        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition',
                        checked ? 'bg-primary/10 text-primary' : 'text-gray-900 hover:bg-gray-100',
                      )}
                    >
                      <span
                        className={clsx(
                          'flex h-4 w-4 items-center justify-center rounded border',
                          checked ? 'border-primary bg-primary text-white' : 'border-gray-300 bg-white',
                        )}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{option.label}</span>
                    </button>
                  )
                })
              )}
            </div>
            {filteredOptions.length > 0 && values.length > 0 && (
              <div className="border-t border-gray-200 px-3 py-2 text-xs text-gray-500">
                {values.length} selected
              </div>
            )}
          </div>
        )}
      </div>
      {helperText && <span className="mt-1 block text-xs text-gray-500">{helperText}</span>}
    </div>
  )
}
