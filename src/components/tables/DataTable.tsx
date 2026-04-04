import type { ReactNode } from 'react'
import clsx from 'clsx'

export type TableColumn<T> = {
  header: string
  accessor: (row: T) => ReactNode
  width?: string
  align?: 'left' | 'center' | 'right'
}

type DataTableProps<T> = {
  data: T[]
  columns: TableColumn<T>[]
  emptyLabel?: string
  footer?: ReactNode
}

export function DataTable<T>({
  data,
  columns,
  emptyLabel = 'No records found',
  footer,
}: DataTableProps<T>) {
  // Ensure data is always an array
  const safeData = Array.isArray(data) ? data : []
  const safeColumns = Array.isArray(columns) ? columns : []

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-gray-200">
            {safeColumns.map((column) => (
              <th
                key={column.header}
                className={clsx(
                  'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400',
                  column.align === 'right' && 'text-right',
                  column.align === 'center' && 'text-center',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 text-sm">
          {safeData.length === 0 && (
            <tr>
              <td colSpan={safeColumns.length} className="px-4 py-10 text-center text-[13px] text-gray-400">
                {emptyLabel}
              </td>
            </tr>
          )}
          {safeData.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="transition-colors duration-100 hover:bg-gray-50"
            >
              {safeColumns.map((column) => (
                <td
                  key={column.header}
                  className={clsx(
                    'px-4 py-2.5 text-gray-600',
                    column.align === 'right' && 'text-right',
                    column.align === 'center' && 'text-center',
                  )}
                >
                  {column.accessor(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="border-t border-gray-200">
              <td colSpan={safeColumns.length} className="px-4 py-2.5">
                {footer}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}


