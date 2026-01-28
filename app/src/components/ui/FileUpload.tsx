import { useCallback, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface FileUploadProps {
  label: string
  value: string | null
  onChange: (url: string | null) => void
  bucket?: string
  accept?: string
  maxSizeMB?: number
}

export function FileUpload({
  label,
  value,
  onChange,
  bucket = 'project-assets',
  accept = 'image/*',
  maxSizeMB = 5,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleUpload = useCallback(
    async (file: File) => {
      if (!supabase) {
        setError('Upload nicht verfügbar')
        return
      }

      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`Datei zu groß (max. ${maxSizeMB} MB)`)
        return
      }

      setError(null)
      setUploading(true)

      try {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
        const filePath = `uploads/${fileName}`

        const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file)

        if (uploadError) throw uploadError

        const {
          data: { publicUrl },
        } = supabase.storage.from(bucket).getPublicUrl(filePath)

        onChange(publicUrl)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
      } finally {
        setUploading(false)
      }
    },
    [bucket, maxSizeMB, onChange],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleUpload(file)
    },
    [handleUpload],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleUpload(file)
    },
    [handleUpload],
  )

  const handleRemove = useCallback(() => {
    onChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [onChange])

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-primary">{label}</label>

      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt="Vorschau"
            className="h-24 w-24 rounded-xl border border-slate-200 object-contain"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
            aria-label="Entfernen"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors ${
            dragOver ? 'border-accent bg-accent/5' : 'border-slate-200 hover:border-accent'
          } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
        >
          {uploading ? (
            <div className="flex items-center gap-2 text-secondary">
              <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span>Wird hochgeladen…</span>
            </div>
          ) : (
            <>
              <svg className="h-10 w-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="mt-2 text-sm text-secondary">
                Klicken oder Datei hierher ziehen
              </p>
              <p className="mt-1 text-xs text-slate-400">Max. {maxSizeMB} MB</p>
            </>
          )}
        </div>
      )}

      <input ref={inputRef} type="file" accept={accept} onChange={handleFileChange} className="hidden" />

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
