import { UploadCloud } from 'lucide-react'
import type { ChangeEvent } from 'react'

type FileUploadProps = {
  label: string
  accept?: string
  onFileSelected: (file: File) => void
  hint?: string
}

export function FileUpload({ label, accept, onFileSelected, hint }: FileUploadProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onFileSelected(file)
  }

  return (
    <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-gray-600 shadow-card transition hover:border-primary hover:bg-primary-muted/40">
      <UploadCloud className="h-8 w-8 text-primary" />
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
    </label>
  )
}


