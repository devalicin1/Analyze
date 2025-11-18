import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X, Search } from 'lucide-react'
import clsx from 'clsx'

type SelectOption = {
  label: string
  value: string
}

type SearchableSelectProps = {
  label?: string
  options?: SelectOption[]
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  helperText?: string
  className?: string
  searchPlaceholder?: string
}

export function SearchableSelect({
  label,
  options = [],
  value,
  onChange,
  placeholder = 'Select product...',
  helperText,
  className,
  searchPlaceholder = 'Search products...',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  // Filter options based on search query
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Reset highlighted index when filtered options change
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [searchQuery, isOpen])

  // Close dropdown when clicking outside
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

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev,
        )
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1))
      } else if (event.key === 'Enter' && highlightedIndex >= 0) {
        event.preventDefault()
        const option = filteredOptions[highlightedIndex]
        if (option) {
          handleSelect(option.value)
        }
      } else if (event.key === 'Escape') {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, highlightedIndex, filteredOptions])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const highlightedElement = dropdownRef.current.children[highlightedIndex] as HTMLElement
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex])

  function handleSelect(selectedValue: string) {
    onChange?.(selectedValue)
    setIsOpen(false)
    setSearchQuery('')
    setHighlightedIndex(-1)
  }

  function handleClear(event: React.MouseEvent) {
    event.stopPropagation()
    onChange?.('')
    setSearchQuery('')
  }

  function handleToggle() {
    setIsOpen(!isOpen)
    if (!isOpen) {
      // Focus input when opening
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      setSearchQuery('')
    }
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
            'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-900 shadow-sm outline-none transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 cursor-pointer',
            !selectedOption && 'text-gray-500',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              {value && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleClear(e)
                  }}
                  className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Clear selection"
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
              ref={dropdownRef}
              className="max-h-60 overflow-y-auto p-1"
              style={{ scrollbarWidth: 'thin' }}
            >
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No products found</div>
              ) : (
                filteredOptions.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={clsx(
                      'w-full rounded-lg px-3 py-2 text-left text-sm transition',
                      index === highlightedIndex
                        ? 'bg-primary text-white'
                        : option.value === value
                          ? 'bg-primary/10 text-primary'
                          : 'text-gray-900 hover:bg-gray-100',
                    )}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    {option.label}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {helperText && <span className="mt-1 block text-xs text-gray-500">{helperText}</span>}
    </div>
  )
}

