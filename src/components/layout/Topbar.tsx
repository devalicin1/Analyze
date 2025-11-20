import { useState, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { CalendarRange, ChevronDown, Menu, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { DateRangePicker } from '../forms/DateRangePicker'

export function Topbar() {
  const { workspaceName, dateRange, setDateRange } = useWorkspace()
  const { user } = useAuth()
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

  if (!user) return null

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-white px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 lg:hidden">
          <button className="inline-flex items-center justify-center rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
            <Menu className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 items-center gap-4">
          <div className="hidden flex-col lg:flex">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Workspace
            </span>
            <span className="text-lg font-bold text-gray-900 leading-tight">{workspaceName}</span>
          </div>

          <div className="h-8 w-px bg-gray-200 hidden lg:block" />

          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setIsPickerOpen(!isPickerOpen)}
              className="group flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-primary hover:ring-1 hover:ring-primary/20"
            >
              <CalendarRange className="h-4 w-4 text-gray-500 group-hover:text-primary transition-colors" />
              {rangeLabel}
              <ChevronDown
                className={`h-4 w-4 text-gray-400 transition-transform ${isPickerOpen ? 'rotate-180' : ''
                  }`}
              />
            </button>
            {isPickerOpen && (
              <div className="absolute left-0 top-full z-50 mt-2 w-80">
                <div className="rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5">
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
                  <div className="p-2">
                    <DateRangePicker value={dateRange} onChange={setDateRange} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden text-right lg:block">
            <p className="text-sm font-semibold text-gray-900 leading-none">{user.name}</p>
            <p className="text-xs text-gray-500 mt-1 capitalize">{user.role}</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-md shadow-primary/20 ring-2 ring-white">
            {user.name
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
