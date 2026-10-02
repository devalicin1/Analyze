import { useState, useEffect } from 'react'
import { addMonths, endOfMonth, startOfMonth, subMonths } from 'date-fns'
import type { DateRange } from '../../context/WorkspaceContext'
import { useWorkspace } from '../../context/WorkspaceContext'

type DateRangePickerProps = {
  value: DateRange
  onChange: (range: DateRange) => void
}

const toInputValue = (d: Date | undefined | null): string => {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

const presetBuilders = [
  {
    label: 'This month',
    compute: () => {
      const start = startOfMonth(new Date())
      return { label: 'This month', start, end: new Date() }
    },
  },
  {
    label: 'Last month',
    compute: () => {
      const start = startOfMonth(subMonths(new Date(), 1))
      const end = endOfMonth(start)
      return { label: 'Last month', start, end }
    },
  },
  {
    label: 'Last 3 months',
    compute: () => {
      const end = new Date()
      const start = addMonths(end, -3)
      return { label: 'Last 3 months', start, end }
    },
  },
  {
    label: 'Year to date',
    compute: () => {
      const start = startOfMonth(new Date(new Date().getFullYear(), 0, 1))
      return { label: 'Year to date', start, end: new Date() }
    },
  },
]

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const { dataRange } = useWorkspace()
  // Local draft state for date inputs — only pushed to parent on blur
  const [draftStart, setDraftStart] = useState(() => toInputValue(value.start))
  const [draftEnd, setDraftEnd] = useState(() => toInputValue(value.end))

  // Sync drafts when parent value changes (e.g. preset selected)
  useEffect(() => {
    setDraftStart(toInputValue(value.start))
    setDraftEnd(toInputValue(value.end))
  }, [value.start, value.end])

  function applyDraft(field: 'start' | 'end', val: string) {
    // Parse YYYY-MM-DD as local time so the day boundary lines up with how
    // sales records are timestamped. Using `new Date(val)` would parse as UTC
    // midnight, which can drop entire days near the range boundaries.
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val)
    if (!match) return
    const [, y, m, d] = match
    const date = field === 'start'
      ? new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0)
      : new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999)
    if (isNaN(date.getTime())) return
    onChange({
      ...value,
      [field]: date,
      label: 'Custom range',
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap gap-2">
        {dataRange && (
          <button
            type="button"
            onClick={() => onChange(dataRange)}
            className="rounded-full border border-gray-300 bg-gray-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-700"
          >
            All data
          </button>
        )}
        {presetBuilders.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange(preset.compute())}
            className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Start date
          <input
            type="date"
            value={draftStart}
            onChange={(e) => {
              setDraftStart(e.target.value)
              applyDraft('start', e.target.value)
            }}
            onBlur={() => applyDraft('start', draftStart)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
          />
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          End date
          <input
            type="date"
            value={draftEnd}
            onChange={(e) => {
              setDraftEnd(e.target.value)
              applyDraft('end', e.target.value)
            }}
            onBlur={() => applyDraft('end', draftEnd)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
          />
        </label>
      </div>
    </div>
  )
}
