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
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {safeColumns.map((column) => (
              <th
                key={column.header}
                className={clsx(
                  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500',
                  column.align === 'right' && 'text-right',
                  column.align === 'center' && 'text-center',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white text-sm">
          {safeData.length === 0 && (
            <tr>
              <td colSpan={safeColumns.length} className="px-4 py-8 text-center text-gray-500">
                {emptyLabel}
              </td>
            </tr>
          )}
          {safeData.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="transition hover:bg-gray-50"
            >
              {safeColumns.map((column) => (
                <td
                  key={column.header}
                  className={clsx(
                    'px-4 py-3 text-gray-700',
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
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={safeColumns.length} className="px-4 py-3">
                {footer}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}


