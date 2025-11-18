import { addMonths, endOfMonth, startOfMonth, subMonths } from 'date-fns'
import type { DateRange } from '../../context/WorkspaceContext'

type DateRangePickerProps = {
  value: DateRange
  onChange: (range: DateRange) => void
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
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value: val } = e.target
    onChange({
      ...value,
      [name]: new Date(val),
      label: 'Custom range',
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap gap-2">
        {presetBuilders.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange(preset.compute())}
            className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 transition hover:border-primary hover:text-primary"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold text-gray-500">
          Start date
          <input
            type="date"
            name="start"
            value={value.start.toISOString().split('T')[0]}
            onChange={handleInputChange}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="text-xs font-semibold text-gray-500">
          End date
          <input
            type="date"
            name="end"
            value={value.end.toISOString().split('T')[0]}
            onChange={handleInputChange}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900"
          />
        </label>
      </div>
    </div>
  )
}


