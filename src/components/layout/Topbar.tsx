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

  const rangeLabel = dateRange.label ??
    (dateRange.start instanceof Date && !isNaN(dateRange.start.getTime()) && dateRange.end instanceof Date && !isNaN(dateRange.end.getTime())
      ? `${format(dateRange.start, 'd MMM yyyy')} – ${format(dateRange.end, 'd MMM yyyy')}`
      : 'Select range')

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
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-5 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 lg:hidden">
          <button className="inline-flex items-center justify-center rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50">
            <Menu className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 items-center gap-3">
          <span className="hidden text-[13px] font-medium text-gray-500 lg:block">{workspaceName}</span>

          <span className="hidden text-gray-300 lg:block">/</span>

          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setIsPickerOpen(!isPickerOpen)}
              className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              <CalendarRange className="h-3.5 w-3.5 text-gray-400" />
              {rangeLabel}
              <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-150 ${isPickerOpen ? 'rotate-180' : ''}`} />
            </button>
            {isPickerOpen && (
              <div className="absolute left-0 top-full z-50 mt-1.5 w-80">
                <div className="rounded-lg border border-gray-200 bg-white shadow-lg">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
                    <h3 className="text-[13px] font-semibold text-gray-900">Date range</h3>
                    <button
                      type="button"
                      onClick={() => setIsPickerOpen(false)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <X className="h-3.5 w-3.5" />
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

        <div className="flex items-center gap-3">
          <div className="hidden text-right lg:block">
            <p className="text-[13px] font-medium text-gray-700">{user.name}</p>
          </div>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white">
            {user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
          </div>
        </div>
      </div>
    </header>
  )
}
