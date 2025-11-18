import { useState, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { CalendarRange, ChevronDown, Menu, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { DateRangePicker } from '../forms/DateRangePicker'

export function Topbar() {
  const { workspaceName, dateRange, setDateRange } = useWorkspace()
  const auth = useAuth()
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const rangeLabel =
    dateRange.label ??
    `${format(dateRange.start, 'd MMM yyyy')} – ${format(dateRange.end, 'd MMM yyyy')}`

  // Close picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsPickerOpen(false)
      }
    }

    if (isPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isPickerOpen])

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="flex items-center gap-4 px-4 py-4 lg:px-10">
        <button className="inline-flex items-center justify-center rounded-xl border border-gray-200 p-2 text-gray-500 lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex flex-1 flex-col">
          <span className="text-xs uppercase tracking-[0.2em] text-gray-400">
            Workspace
          </span>
          <span className="text-lg font-semibold text-gray-900">{workspaceName}</span>
        </div>
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setIsPickerOpen(!isPickerOpen)}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <CalendarRange className="h-4 w-4 text-gray-500" />
            {rangeLabel}
            <ChevronDown
              className={`h-4 w-4 text-gray-500 transition-transform ${
                isPickerOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {isPickerOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-96">
              <div className="rounded-xl border border-gray-200 bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">Select date range</h3>
                  <button
                    type="button"
                    onClick={() => setIsPickerOpen(false)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-4">
                  <DateRangePicker value={dateRange} onChange={setDateRange} />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="hidden items-center gap-3 lg:flex">
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900">{auth.name}</p>
            <p className="text-xs text-gray-500">{auth.role}</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary-muted text-center text-sm font-semibold uppercase leading-10 text-primary">
            {auth.name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)}
          </div>
        </div>
      </div>
    </header>
  )
}


