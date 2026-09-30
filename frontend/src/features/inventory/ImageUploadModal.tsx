import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { inventoryApi } from '../../lib/api/endpoints'
import { fileToPngBlob } from '../../lib/image'
import { Spinner } from '../../components/ui'

const MAX_IMAGES = 10

export function ImageUploadModal({
  productId,
  count,
  onClose,
  onUploaded,
}: {
  productId: number
  count: number
  onClose: () => void
  onUploaded: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const remaining = MAX_IMAGES - count

  const pick = (f: File | null) => {
    if (!f) return
    setError(null)
    setFile(f)
    const url = URL.createObjectURL(f)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    pick(e.dataTransfer.files?.[0] ?? null)
  }

  const upload = async () => {
    if (!file || busy) return
    setBusy(true)
    setError(null)
    try {
      const png = await fileToPngBlob(file)
      await inventoryApi.uploadImage(productId, png, 'producto.png')
      onUploaded()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 animate-fade-in">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="relative w-full max-w-sm bg-white rounded-2xl p-5 flex flex-col gap-4 animate-fade-up"
        style={{ border: '1px solid #E2E8F0', boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-ink">Subir imagen</p>
            <p className="text-xs text-muted mt-0.5">
              PNG · máx 10 MB · {count}/{MAX_IMAGES} usadas
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-muted"
            aria-label="Cerrar"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {remaining <= 0 ? (
          <div
            className="px-3 py-2.5 rounded-xl text-xs font-medium"
            style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}
          >
            Este producto ya tiene el máximo de {MAX_IMAGES} imágenes.
          </div>
        ) : (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className="rounded-xl flex flex-col items-center justify-center gap-2 py-8 cursor-pointer transition-all"
            style={{
              background: dragging ? '#EEF2FF' : '#F8FAFC',
              border: `1.5px dashed ${dragging ? '#4F46E5' : '#E2E8F0'}`,
            }}
          >
            {preview ? (
              <img
                src={preview}
                alt="Vista previa"
                className="max-h-40 rounded-lg object-contain"
                style={{ border: '1px solid #E2E8F0', background: 'white' }}
              />
            ) : (
              <>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="3" fill="#E2E8F0" />
                  <circle cx="9" cy="9" r="2" fill="#CBD5E1" />
                  <path d="M3 16l5-5 4 4 3-3 6 6" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-xs font-semibold text-subtle">
                  Arrastrá una imagen o hacé click para elegir
                </p>
                <p className="text-[10px] text-muted">Se convierte a PNG automáticamente</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
          </div>
        )}

        {error && (
          <div
            className="px-3 py-2.5 rounded-xl text-xs font-medium"
            style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}
          >
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors text-subtle"
          >
            Cancelar
          </button>
          <button
            onClick={upload}
            disabled={!file || busy || remaining <= 0}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-95 disabled:opacity-60 flex items-center gap-2"
            style={{ background: '#4F46E5' }}
          >
            {busy ? (
              <>
                <Spinner size={12} /> Subiendo…
              </>
            ) : (
              'Subir imagen'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
