import { useState, useEffect } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { SearchableSelect } from '../forms/SearchableSelect'
import type { Product } from '../../lib/types'

type RemapModalProps = {
    isOpen: boolean
    onClose: () => void
    onSave: (newMapping: Record<string, string>, updateGlobal: boolean) => Promise<void>
    products: Product[]
    currentMapping: Record<string, string>
    unmappedProducts: string[]
    salesLines: any[] // Using any[] to avoid circular dependency, but it's SalesLine[]
}

export function RemapModal({
    isOpen,
    onClose,
    onSave,
    products,
    currentMapping,
    unmappedProducts,
    salesLines,
}: RemapModalProps) {
    const [mapping, setMapping] = useState<Record<string, string>>({})
    const [updateGlobal, setUpdateGlobal] = useState(true)
    const [saving, setSaving] = useState(false)

    // Initialize mapping state when modal opens
    useEffect(() => {
        if (isOpen) {
            const initialMapping = { ...currentMapping }

            // Fallback: populate from salesLines if missing in currentMapping
            // This ensures we show the actual effective mapping even if the mapping object is incomplete
            if (salesLines && salesLines.length > 0) {
                salesLines.forEach(line => {
                    if (!initialMapping[line.productNameAtSale] && line.productId) {
                        initialMapping[line.productNameAtSale] = line.productId
                    }
                })
            }

            setMapping(initialMapping)
        }
    }, [isOpen, currentMapping, salesLines])

    if (!isOpen) return null

    // Get all unique product names from sales lines that are NOT in unmappedProducts
    // (unmappedProducts are handled separately in the main flow, but we want to allow remapping EVERYTHING)
    const allSalesNames = Array.from(new Set(salesLines.map(line => line.productNameAtSale)))

    // Combine unmapped products and mapped products
    const allItems = Array.from(new Set([...unmappedProducts, ...allSalesNames])).sort()

    const productOptions = products.map(p => ({
        label: p.name,
        value: p.id
    }))

    const handleSave = async () => {
        setSaving(true)
        try {
            await onSave(mapping, updateGlobal)
            onClose()
        } catch (error) {
            console.error('Error saving mappings:', error)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Remap Products</h2>
                        <p className="text-sm text-slate-500">
                            Correct product associations. Changes will trigger a report reprocessing.
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
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800 border border-amber-200 flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
                        <div>
                            <p className="font-semibold">Warning: Reprocessing Required</p>
                            <p>Saving changes will reset the report status to "Uploaded" and trigger a full recalculation. This may take a few moments.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {allItems.map((salesName) => (
                            <div key={salesName} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center">
                                <div className="flex-1">
                                    <p className="font-medium text-slate-900">{salesName}</p>
                                    <p className="text-xs text-slate-500">Original Name from POS</p>
                                </div>
                                <div className="w-full sm:w-80">
                                    <SearchableSelect
                                        value={mapping[salesName] || ''}
                                        onChange={(value) => setMapping(prev => ({ ...prev, [salesName]: value }))}
                                        options={productOptions}
                                        placeholder="Select matching product..."
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-slate-100 px-6 py-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={updateGlobal}
                                onChange={(e) => setUpdateGlobal(e.target.checked)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            Update global aliases (apply to future reports)
                        </label>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onClose}
                                className="btn-secondary"
                                disabled={saving}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="btn-primary min-w-[120px]"
                            >
                                {saving ? 'Saving...' : 'Save & Reprocess'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
