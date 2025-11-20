import { useState } from 'react'
import { Download, Upload, X } from 'lucide-react'
import { FileUpload } from '../forms/FileUpload'
import { Modal } from '../forms/Modal'
import { downloadProductTemplate, parseProductExcel } from '../../lib/utils/excelTemplate'
import { saveProduct } from '../../lib/api/products'
import type { MenuGroup, WorkspaceScope } from '../../lib/types'

type BulkUploadModalProps = {
  isOpen: boolean
  onClose: () => void
  workspace: WorkspaceScope
  menuGroups: MenuGroup[]
  onSuccess: () => void
}

export function BulkUploadModal({
  isOpen,
  onClose,
  workspace,
  menuGroups,
  onSuccess,
}: BulkUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{
    total: number
    processed: number
    success: number
    errors: number
    errorsList: Array<{ row: number; name: string; error: string }>
  } | null>(null)
  const [preview, setPreview] = useState<Array<{
    name: string
    menuGroupId: string
    menuSubGroupId?: string
    isExtra: boolean
    posCode?: string
    defaultUnitPrice?: number
    activeFrom?: string
    activeTo?: string
  }> | null>(null)
  const [totalProducts, setTotalProducts] = useState(0)
  const [parseErrors, setParseErrors] = useState<Array<{ row: number; productName: string; error: string }>>([])

  async function handleDownloadTemplate() {
    try {
      await downloadProductTemplate(menuGroups)
    } catch (error) {
      console.error('Failed to download template:', error)
      alert('Failed to download template. Please try again.')
    }
  }

  async function handleFileSelected(selectedFile: File) {
    setFile(selectedFile)
    setPreview(null)
    setProgress(null)
    setTotalProducts(0)

    try {
      const result = await parseProductExcel(selectedFile, menuGroups)
      console.log('Parsed products:', result.products)
      console.log('Parse errors:', result.errors)

      if (result.errors.length > 0) {
        console.warn('Parse errors found:', result.errors)
      }

      setParseErrors(result.errors)

      if (result.products.length === 0) {
        setPreview([])
        setTotalProducts(0)
        return
      }

      setTotalProducts(result.products.length)
      setPreview(result.products.slice(0, 10).map(p => ({
        ...p,
        activeFrom: p.activeFrom instanceof Date ? p.activeFrom.toISOString().split('T')[0] : (p.activeFrom || undefined),
        activeTo: p.activeTo instanceof Date ? p.activeTo.toISOString().split('T')[0] : (p.activeTo || undefined),
      }))) // Show first 10 for preview

      // Show warnings if there were errors but some products were parsed
      if (result.errors.length > 0) {
        console.warn(`${result.errors.length} rows had errors but ${result.products.length} products were parsed successfully`)
      }
    } catch (error) {
      console.error('Failed to parse file:', error)
      setPreview(null)
      setTotalProducts(0)
      alert(`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check:\n- File format is correct (.xlsx or .xls)\n- Products sheet exists\n- Data is in the correct columns`)
      setFile(null)
    }
  }

  async function handleUpload() {
    if (!file) return

    setUploading(true)
    setProgress({
      total: 0,
      processed: 0,
      success: 0,
      errors: 0,
      errorsList: [],
    })

    try {
      const result = await parseProductExcel(file, menuGroups)
      const products = result.products
      setProgress((prev) => prev && { ...prev, total: products.length })

      if (result.errors.length > 0) {
        console.warn('Upload errors:', result.errors)
      }

      const errorsList: Array<{ row: number; name: string; error: string }> = []

      for (let i = 0; i < products.length; i++) {
        const product = products[i]
        setProgress((prev) =>
          prev
            ? {
              ...prev,
              processed: i + 1,
            }
            : null,
        )

        try {
          // Validate menu group exists
          const menuGroup = menuGroups.find((g) => g.id === product.menuGroupId)
          if (!menuGroup) {
            errorsList.push({
              row: i + 2, // +2 because Excel rows start at 1 and we skip header
              name: product.name,
              error: `Menu Group ID "${product.menuGroupId}" not found`,
            })
            setProgress((prev) =>
              prev ? { ...prev, errors: prev.errors + 1 } : null,
            )
            continue
          }

          // Validate sub group if provided
          if (product.menuSubGroupId) {
            const subGroup = menuGroup.subGroups.find((sg) => sg.id === product.menuSubGroupId)
            if (!subGroup) {
              errorsList.push({
                row: i + 2,
                name: product.name,
                error: `Menu Sub Group ID "${product.menuSubGroupId}" not found in group "${menuGroup.label}"`,
              })
              setProgress((prev) =>
                prev ? { ...prev, errors: prev.errors + 1 } : null,
              )
              continue
            }
          }

          await saveProduct(workspace, {
            name: product.name,
            menuGroupId: product.menuGroupId,
            menuSubGroupId: product.menuSubGroupId,
            isExtra: product.isExtra,
            posCode: product.posCode,
            defaultUnitPrice: product.defaultUnitPrice,
            activeFrom: product.activeFrom || undefined,
            activeTo: product.activeTo || undefined,
          })

          setProgress((prev) =>
            prev ? { ...prev, success: prev.success + 1 } : null,
          )
        } catch (error) {
          errorsList.push({
            row: i + 2,
            name: product.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          setProgress((prev) =>
            prev ? { ...prev, errors: prev.errors + 1 } : null,
          )
        }
      }

      setProgress((prev) => (prev ? { ...prev, errorsList } : null))
    } catch (error) {
      console.error('Upload failed:', error)
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
    }
  }

  function handleClose() {
    if (!uploading) {
      setFile(null)
      setPreview(null)
      setProgress(null)
      setTotalProducts(0)
      setParseErrors([])
      onClose()
    }
  }

  const canUpload = file && preview && preview.length > 0 && !uploading && !progress

  return (
    <Modal open={isOpen} onClose={handleClose} title="Bulk Upload Products">
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Download the template, fill it with your products, and upload it here.
            </p>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              Download Template
            </button>
          </div>

          {!file && (
            <FileUpload
              label="Select Excel file"
              accept=".xlsx,.xls"
              onFileSelected={handleFileSelected}
              hint="Only .xlsx and .xls files are supported"
            />
          )}

          {file && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  File: {file.name}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null)
                    setPreview(null)
                    setProgress(null)
                    setTotalProducts(0)
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!preview && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm text-blue-900">Parsing file...</p>
                </div>
              )}

              {preview && preview.length === 0 && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-900">No products found</p>
                    <p className="mt-1 text-xs text-amber-700">
                      The file was parsed but no valid products were found.
                    </p>
                  </div>

                  {parseErrors.length > 0 && (
                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-red-200 bg-red-50 p-4">
                      <p className="text-sm font-semibold text-red-900">
                        Errors ({parseErrors.length}):
                      </p>
                      {parseErrors.slice(0, 10).map((error, index) => (
                        <div key={index} className="text-xs text-red-700">
                          <span className="font-semibold">Row {error.row}:</span> {error.productName} - {error.error}
                        </div>
                      ))}
                      {parseErrors.length > 10 && (
                        <p className="text-xs text-red-600 italic">
                          ... and {parseErrors.length - 10} more errors
                        </p>
                      )}
                      <p className="mt-2 text-xs font-semibold text-red-900">
                        💡 Tip: Check the "Categories" sheet in the template for available Category IDs and Labels.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {preview && preview.length > 0 && parseErrors.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-900">
                    ⚠️ {parseErrors.length} row(s) had errors
                  </p>
                  <p className="mt-1 text-xs text-amber-700">
                    {preview.length} product(s) were parsed successfully, but some rows were skipped due to errors.
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-amber-900">
                      Show errors ({parseErrors.length})
                    </summary>
                    <div className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-amber-700">
                      {parseErrors.slice(0, 5).map((error, index) => (
                        <div key={index}>
                          Row {error.row}: {error.productName} - {error.error}
                        </div>
                      ))}
                      {parseErrors.length > 5 && (
                        <p className="italic">... and {parseErrors.length - 5} more</p>
                      )}
                    </div>
                  </details>
                </div>
              )}

              {preview && preview.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="mb-2 text-sm font-semibold text-gray-900">
                    Preview (showing first {preview.length} of {totalProducts} products)
                  </p>
                  <div className="max-h-48 space-y-1 overflow-y-auto text-xs text-gray-600">
                    {preview.map((product, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="font-semibold">{product.name}</span>
                        <span className="text-gray-400">•</span>
                        <span>
                          {menuGroups.find((g) => g.id === product.menuGroupId)?.label ||
                            product.menuGroupId}
                        </span>
                        {product.isExtra && (
                          <>
                            <span className="text-gray-400">•</span>
                            <span className="text-amber-600">Extra</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {progress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-gray-900">Progress</span>
                    <span className="text-gray-600">
                      {progress.processed} / {progress.total}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${(progress.processed / progress.total) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span className="text-emerald-600">
                      ✓ {progress.success} successful
                    </span>
                    {progress.errors > 0 && (
                      <span className="text-red-600">
                        ✗ {progress.errors} errors
                      </span>
                    )}
                  </div>
                </div>
              )}

              {progress && progress.processed === progress.total && (
                <div className="space-y-2">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-semibold text-emerald-900">
                      Upload completed!
                    </p>
                    <p className="mt-1 text-xs text-emerald-700">
                      {progress.success} product(s) uploaded successfully.
                      {progress.errors > 0 && ` ${progress.errors} error(s) occurred.`}
                    </p>
                  </div>

                  {progress.errorsList.length > 0 && (
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-red-200 bg-red-50 p-4">
                      <p className="text-sm font-semibold text-red-900">Errors:</p>
                      {progress.errorsList.map((error, index) => (
                        <div key={index} className="text-xs text-red-700">
                          <span className="font-semibold">Row {error.row}:</span> {error.name} -{' '}
                          {error.error}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
          >
            {progress && progress.processed === progress.total ? 'Close' : 'Cancel'}
          </button>
          {canUpload && (
            <button
              type="button"
              onClick={handleUpload}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm"
            >
              <Upload className="h-4 w-4" />
              Upload Products
            </button>
          )}
          {progress && progress.processed === progress.total && (
            <button
              type="button"
              onClick={() => {
                handleClose()
                onSuccess()
              }}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

