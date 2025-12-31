import { useMemo } from 'react'
import { format } from 'date-fns'
import { X } from 'lucide-react'
import { DataTable } from '../tables/DataTable'
import { formatCurrency } from '../../lib/utils/formatting'
import type { SalesLine } from '../../lib/types'
import { useWorkspace } from '../../context/WorkspaceContext'

type SalesLinesModalProps = {
    isOpen: boolean
    onClose: () => void
    title: string
    salesLines: SalesLine[]
}

export function SalesLinesModal({
    isOpen,
    onClose,
    title,
    salesLines,
}: SalesLinesModalProps) {
    const workspace = useWorkspace()

    const columns = useMemo(() => [
        {
            header: 'Date',
            accessor: (line: SalesLine) => {
                const date = line.reportDate instanceof Date
                    ? line.reportDate
                    : new Date(line.reportDate as any) // Handle timestamp/string
                return <span className="whitespace-nowrap text-slate-700">{format(date, 'd MMM yyyy')}</span>
            },
        },
        {
            header: 'Original Product Name',
            accessor: (line: SalesLine) => (
                <span className="font-medium text-slate-900">{line.productNameRaw}</span>
            ),
        },
        {
            header: 'Quantity',
            accessor: (line: SalesLine) => (
                <span className="text-slate-700">{line.quantity.toLocaleString()}</span>
            ),
            align: 'right' as const,
        },
        {
            header: 'Amount',
            accessor: (line: SalesLine) => (
                <span className="font-semibold text-slate-900">
                    {formatCurrency(workspace.currency, line.amount)}
                </span>
            ),
            align: 'right' as const,
        },
        {
            header: 'Unit Price',
            accessor: (line: SalesLine) => {
                const price = line.quantity > 0 ? line.amount / line.quantity : 0
                return (
                    <span className="text-slate-600">
                        {formatCurrency(workspace.currency, price)}
                    </span>
                )
            },
            align: 'right' as const,
        },
    ], [workspace.currency])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="flex h-[80vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
                        <p className="text-sm text-slate-500">
                            {salesLines.length} record{salesLines.length !== 1 ? 's' : ''} found
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden p-6">
                    <div className="h-full overflow-auto rounded-lg border border-slate-200">
                        <DataTable
                            columns={columns}
                            data={salesLines}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-slate-100 px-6 py-4">
                    <div className="flex justify-end">
                        <button
                            onClick={onClose}
                            className="btn-secondary"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
