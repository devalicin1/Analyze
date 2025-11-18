import { useState } from 'react'
import { Download, Upload, X } from 'lucide-react'
import { FileUpload } from '../forms/FileUpload'
import { Modal } from '../forms/Modal'
import { downloadMenuGroupsTemplate, parseMenuGroupsExcel } from '../../lib/utils/menuGroupsTemplate'
import { saveMenuGroups } from '../../lib/api/menuGroups'
import type { MenuGroup, WorkspaceScope } from '../../lib/types'

type MenuGroupsBulkUploadModalProps = {
  isOpen: boolean
  onClose: () => void
  workspace: WorkspaceScope
  currentGroups: MenuGroup[]
  onSuccess: () => void
}

export function MenuGroupsBulkUploadModal({
  isOpen,
  onClose,
  workspace,
  currentGroups,
  onSuccess,
}: MenuGroupsBulkUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<MenuGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDownloadTemplate() {
    try {
      await downloadMenuGroupsTemplate(currentGroups)
    } catch (err) {
      console.error('Failed to download template:', err)
      alert('Failed to download template. Please try again.')
    }
  }

  async function handleFileSelected(selectedFile: File) {
    setFile(selectedFile)
    setPreview(null)
    setError(null)

    try {
      const groups = await parseMenuGroupsExcel(selectedFile)
      if (groups.length === 0) {
        setError('No menu groups found in the file. Please check the format.')
        setFile(null)
        return
      }
      setPreview(groups)
    } catch (err) {
      console.error('Failed to parse file:', err)
      setError(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setFile(null)
    }
  }

  async function handleUpload() {
    if (!file || !preview) return

    setUploading(true)
    setError(null)

    try {
      await saveMenuGroups(workspace, preview)
      onSuccess()
      handleClose()
    } catch (err) {
      console.error('Upload failed:', err)
      setError(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
    }
  }

  function handleClose() {
    if (!uploading) {
      setFile(null)
      setPreview(null)
      setError(null)
      onClose()
    }
  }

  const canUpload = file && preview && preview.length > 0 && !uploading

  return (
    <Modal open={isOpen} onClose={handleClose} title="Bulk Upload Menu Groups" widthClass="max-w-3xl">
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Download the template, fill it with your menu groups, and upload it here.
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

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-900">Error</p>
              <p className="mt-1 text-xs text-red-700">{error}</p>
            </div>
          )}

          {file && preview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">File: {file.name}</p>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null)
                    setPreview(null)
                    setError(null)
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="mb-3 text-sm font-semibold text-gray-900">
                  Preview ({preview.length} menu group{preview.length !== 1 ? 's' : ''})
                </p>
                <div className="max-h-96 space-y-3 overflow-y-auto">
                  {preview.map((group, index) => (
                    <div key={index} className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-6 w-6 rounded"
                          style={{ backgroundColor: group.color }}
                        />
                        <span className="text-sm font-semibold text-gray-900">{group.label}</span>
                        <span className="text-xs text-gray-500">({group.id})</span>
                      </div>
                      {group.subGroups.length > 0 && (
                        <div className="mt-2 ml-8 space-y-1">
                          {group.subGroups.map((sub, subIndex) => (
                            <div key={subIndex} className="text-xs text-gray-600">
                              └─ {sub.label} ({sub.id})
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
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
            Cancel
          </button>
          {canUpload && (
            <button
              type="button"
              onClick={handleUpload}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm"
            >
              <Upload className="h-4 w-4" />
              Upload Menu Groups
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

