import type { SelectHTMLAttributes } from 'react'
import clsx from 'clsx'

type SelectOption = {
  label: string
  value: string
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
  options?: SelectOption[]
  helperText?: string
}

export function Select({ label, options, helperText, className, ...props }: SelectProps) {
  return (
    <label className="flex flex-col gap-1 text-sm text-gray-700">
      {label && <span className="font-semibold text-gray-900">{label}</span>}
      <select
        className={clsx(
          'rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20',
          className,
        )}
        {...props}
      >
        {options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText && <span className="text-xs text-gray-500">{helperText}</span>}
    </label>
  )
}


