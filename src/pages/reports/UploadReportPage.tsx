import { useEffect, useMemo, useState } from 'react'
import { format, startOfMonth } from 'date-fns'
import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import { Link } from 'react-router-dom'
import { Filter, Trash2 } from 'lucide-react'
import { FileUpload } from '../../components/forms/FileUpload'
import { DateRangePicker } from '../../components/forms/DateRangePicker'
import { DataTable, type TableColumn } from '../../components/tables/DataTable'
import { Select } from '../../components/forms/Select'
import { createSalesReport, deleteSalesReport, listSalesReports } from '../../lib/api/salesReports'
import type { SalesReport, SalesReportStatus } from '../../lib/types'
import type { DateRange } from '../../context/WorkspaceContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useAuth } from '../../context/AuthContext'

type ColumnMapping = {
  productName: string
  quantity: string
  amount: string
}

type ParsedRow = Record<string, string | number>

const steps = ['Upload file', 'Configure report', 'Preview', 'Process']

type ReportType = 'daily' | 'monthly'

export function UploadReportPage() {
  const workspace = useWorkspace()
  const { user } = useAuth()
  const [currentStep, setCurrentStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [reportType, setReportType] = useState<ReportType>('daily')
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().split('T')[0])
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const now = new Date()
    const start = startOfMonth(now)
    return { label: 'This month', start, end: now }
  })
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([])
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    productName: '',
    quantity: '',
    amount: '',
  })
  const [reports, setReports] = useState<SalesReport[]>([])
  const [processing, setProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<SalesReportStatus | 'all'>('all')
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null)

  // Load column mapping from localStorage on mount
  useEffect(() => {
    const savedMapping = localStorage.getItem('lastColumnMapping')
    if (savedMapping) {
      try {
        setColumnMapping(JSON.parse(savedMapping))
      } catch (e) {
        console.error('Failed to parse saved column mapping', e)
      }
    }
  }, [])

  // Save column mapping to localStorage whenever it changes
  useEffect(() => {
    if (columnMapping.productName || columnMapping.quantity || columnMapping.amount) {
      localStorage.setItem('lastColumnMapping', JSON.stringify(columnMapping))
    }
  }, [columnMapping])

  useEffect(() => {
    listSalesReports(workspace).then((reports) => {
      console.log('[UploadReportPage] Loaded reports:', {
        count: reports.length,
        reports: reports.map((r) => ({
          id: r.id,
          reportDate: r.reportDate instanceof Date ? r.reportDate.toISOString() : r.reportDate,
          periodKey: r.periodKey,
          status: r.status,
          totalAmount: r.totalAmount,
          totalQuantity: r.totalQuantity,
          unmappedProductsCount: r.unmappedProducts?.length ?? 0,
        })),
      })
      setReports(reports)
    })
  }, [workspace])

  const filteredReports = useMemo(() => {
    if (statusFilter === 'all') return reports
    return reports.filter((report) => report.status === statusFilter)
  }, [reports, statusFilter])

  function resetFlow() {
    setCurrentStep(0)
    setFile(null)
    setPreviewRows([])
    setColumnMapping({
      productName: '',
      quantity: '',
      amount: '',
    })
    setStatusMessage(null)
  }

  async function handleFileSelected(file: File) {
    setFile(file)
    const rows = await parseFile(file)
    setPreviewRows(rows.slice(0, 20))
    setColumnMapping({
      productName: Object.keys(rows[0] ?? {})[0] ?? 'Product',
      quantity: Object.keys(rows[0] ?? {})[1] ?? 'Qty',
      amount: Object.keys(rows[0] ?? {})[2] ?? 'Amount',
    })
    setCurrentStep(1)
  }

  async function handleProcessReport() {
    if (!file) return
    setProcessing(true)
    setStatusMessage(null)
    try {
      // Calculate periodKey and reportDate based on report type
      let periodKey: string
      let reportDateValue: Date

      if (reportType === 'monthly') {
        // For monthly reports, use the start of the month as the period key
        periodKey = format(dateRange.start, 'yyyy-MM')
        reportDateValue = dateRange.start
      } else {
        // For daily reports, use the selected date
        periodKey = reportDate.slice(0, 7) // YYYY-MM format
        reportDateValue = new Date(reportDate)
      }

      // Create report with file upload to Firebase Storage
      const newReport = await createSalesReport(
        workspace,
        {
          reportDate: reportDateValue,
          periodKey,
          source: 'excel_upload',
          status: 'uploaded',
          originalFilePath: '', // Will be set by createSalesReport after upload
          createdByUserId: user?.userId || '',
          totalAmount: previewRows.reduce((sum, row) => sum + Number(row[columnMapping.amount] ?? 0), 0),
          totalQuantity: previewRows.reduce(
            (sum, row) => sum + Number(row[columnMapping.quantity] ?? 0),
            0,
          ),
          columnMapping,
        },
        file, // Pass file for Firebase Storage upload
      )
      setReports((prev) => [newReport, ...prev])
      setStatusMessage('Report uploaded successfully. Processing will start shortly.')
      setCurrentStep(0)
      setFile(null)
      resetFlow()
    } catch (error) {
      console.error('Failed to upload report:', error)
      setStatusMessage(
        `Failed to upload report: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    } finally {
      setProcessing(false)
    }
  }

  async function handleDeleteReport(reportId: string) {
    const report = reports.find((r) => r.id === reportId)
    const reportDate = report?.reportDate instanceof Date
      ? format(report.reportDate, 'd MMM yyyy')
      : report?.reportDate?.toString() || reportId

    if (!confirm(`Bu raporu silmek istediğinizden emin misiniz?\n\nRapor Tarihi: ${reportDate}\n\nBu işlem geri alınamaz ve rapor veritabanından ve depolamadan tamamen kaldırılacaktır.`)) {
      return
    }

    setDeletingReportId(reportId)
    try {
      await deleteSalesReport(workspace, reportId)
      setReports((prev) => prev.filter((r) => r.id !== reportId))
      setStatusMessage('Rapor başarıyla silindi.')
      setTimeout(() => setStatusMessage(null), 3000)
    } catch (error) {
      console.error('Failed to delete report:', error)
      setStatusMessage(`Rapor silinirken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`)
      setTimeout(() => setStatusMessage(null), 5000)
    } finally {
      setDeletingReportId(null)
    }
  }

  const reportColumns: TableColumn<SalesReport>[] = [
    {
      header: 'Report date',
      accessor: (row) => {
        const date = row.reportDate instanceof Date ? row.reportDate : new Date(row.reportDate)
        return date instanceof Date && !isNaN(date.getTime())
          ? format(date, 'd MMM yyyy')
          : 'Invalid date'
      },
    },
    {
      header: 'Period key',
      accessor: (row) => row.periodKey,
    },
    {
      header: 'Status',
      accessor: (row) => (
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-600">
          {row.status.replace('_', ' ')}
        </span>
      ),
    },
    {
      header: 'Totals',
      accessor: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {workspace.currency}{' '}
            {row.totalAmount?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—'}
          </p>
          <p className="text-xs text-slate-500">
            Qty: {row.totalQuantity?.toLocaleString() ?? '—'}
          </p>
        </div>
      ),
    },
    {
      header: 'Actions',
      accessor: (row) => (
        <div className="flex items-center gap-3 justify-end">
          <Link to={`/reports/${row.id}`} className="text-sm font-semibold text-primary hover:text-primary/80">
            View detail
          </Link>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleDeleteReport(row.id)
            }}
            disabled={deletingReportId === row.id}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete report"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
      align: 'right',
    },
  ]

  return (
    <section className="space-y-8">
      <header>
        <h1 className="page-title">Upload sales report</h1>
        <p className="text-sm text-slate-500">
          Upload POS exports and process them into analytics.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        {steps.map((label, index) => (
          <div
            key={label}
            className={`rounded-2xl border p-4 ${currentStep === index ? 'border-primary bg-primary-muted/60' : 'border-slate-200 bg-white'
              }`}
          >
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Step {index + 1}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{label}</p>
          </div>
        ))}
      </div>

      {currentStep === 0 && (
        <FileUpload
          label="Drag & drop POS export"
          hint="Supports CSV or XLSX files"
          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
          onFileSelected={handleFileSelected}
        />
      )}

      {currentStep === 1 && (
        <div className="app-card space-y-4">
          <p className="text-sm font-semibold text-slate-900">Configure report</p>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Report type
              <select
                value={reportType}
                onChange={(event) => setReportType(event.target.value as ReportType)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="daily">Daily</option>
                <option value="monthly">Monthly summary</option>
              </select>
            </label>
            {reportType === 'daily' ? (
              <label className="text-sm font-semibold text-slate-700">
                Report date
                <input
                  type="date"
                  value={reportDate}
                  onChange={(event) => setReportDate(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
            ) : (
              <div className="text-sm font-semibold text-slate-700">
                Report period
                <div className="mt-1">
                  <DateRangePicker value={dateRange} onChange={setDateRange} />
                </div>
              </div>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {(['productName', 'quantity', 'amount'] as const).map((key) => (
              <label key={key} className="text-sm font-semibold text-slate-700">
                Column for {key}
                <select
                  value={columnMapping[key]}
                  onChange={(event) =>
                    setColumnMapping((prev) => ({ ...prev, [key]: event.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {Object.keys(previewRows[0] ?? {}).map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="btn-primary"
            >
              Continue to preview
            </button>
            <button
              type="button"
              onClick={resetFlow}
              className="btn-secondary"
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="app-card space-y-4">
          <p className="text-sm font-semibold text-slate-900">Preview first 20 rows</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  {Object.keys(previewRows[0] ?? {}).map((header) => (
                    <th key={header} className="px-3 py-2 text-left text-xs uppercase text-slate-500">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={index} className="border-t border-slate-100">
                    {Object.values(row).map((value, idx) => (
                      <td key={idx} className="px-3 py-2 text-slate-700">
                        {String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="btn-primary"
            >
              Process report
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="btn-secondary"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {currentStep === 3 && (
        <div className="app-card space-y-4">
          <p className="text-sm text-slate-600">
            Processing uploads the file to Storage and triggers the Cloud Function. You can close
            the page safely—the function will continue in the background.
          </p>
          <button
            type="button"
            disabled={processing}
            onClick={handleProcessReport}
            className="btn-primary disabled:opacity-50"
          >
            {processing ? 'Processing...' : 'Confirm & process'}
          </button>
          <button
            type="button"
            onClick={resetFlow}
            className="btn-secondary"
          >
            Start over
          </button>
          {statusMessage && <p className="text-sm text-slate-600">{statusMessage}</p>}
        </div>
      )}

      <div>
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="section-title">Recent reports</h2>
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-slate-500" />
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as SalesReportStatus | 'all')}
              options={[
                { label: 'All statuses', value: 'all' },
                { label: 'Uploaded', value: 'uploaded' },
                { label: 'Needs mapping', value: 'needs_mapping' },
                { label: 'Processed', value: 'processed' },
                { label: 'Error', value: 'error' },
              ]}
            />
          </div>
        </div>
        {statusMessage && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${statusMessage.includes('hata') || statusMessage.includes('Failed')
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-green-50 border-green-200 text-green-800'
            }`}>
            {statusMessage}
          </div>
        )}
        <DataTable data={filteredReports} columns={reportColumns} emptyLabel="No reports yet" />
      </div>
    </section>
  )
}

async function parseFile(file: File): Promise<ParsedRow[]> {
  if (file.name.endsWith('.csv')) {
    return new Promise((resolve, reject) => {
      Papa.parse<ParsedRow>(file, {
        header: true,
        complete: (result: Papa.ParseResult<ParsedRow>) =>
          resolve(result.data.filter((row) => Object.keys(row).length > 0)),
        error: reject,
      })
    })
  }

  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) return []

  const rows: ParsedRow[] = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return // Skip header
    const rowData: ParsedRow = {}
    row.eachCell((cell, colNumber) => {
      const headerCell = worksheet.getRow(1).getCell(colNumber)
      const header = headerCell.text || `Column${colNumber}`
      rowData[header] = cell.value?.toString() ?? ''
    })
    if (Object.keys(rowData).length > 0) {
      rows.push(rowData)
    }
  })
  return rows
}



