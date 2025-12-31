import { useState, useRef, useEffect } from 'react'
import { Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { DateRangePicker } from './DateRangePicker'
import type { DateRange } from '../../context/WorkspaceContext'

type DateRangePopoverProps = {
    value: DateRange
    onChange: (range: DateRange) => void
}

export function DateRangePopover({ value, onChange }: DateRangePopoverProps) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [])

    const formatDateRange = () => {
        if (value.label && value.label !== 'Custom range') return value.label
        return `${format(value.start, 'MMM d, yyyy')} - ${format(value.end, 'MMM d, yyyy')}`
    }

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${isOpen
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600 ring-2 ring-indigo-100'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
            >
                <Calendar className="h-4 w-4" />
                <span>{formatDateRange()}</span>
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-[320px] origin-top-right">
                    <DateRangePicker value={value} onChange={(v) => {
                        onChange(v)
                        // Optional: close on selection if it's a preset, but maybe keep open for custom dates
                        // For now, let's keep it open to allow date tweaking
                    }} />
                </div>
            )}
        </div>
    )
}
