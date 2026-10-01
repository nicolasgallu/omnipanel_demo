import { useCallback, useEffect, useState } from 'react'
import { inventoryApi } from '../../lib/api/endpoints'
import type {
  Product,
  ProductDetail,
  ProductImage as ProductImageType,
  ProductListing,
} from '../../lib/api/types'
import { fmtDate, fmtMoney, fmtTime, marginPct } from '../../lib/format'
import { ErrorBox, ProductImage, SpinnerText } from '../../components/ui'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { GeneralTab } from './GeneralTab'
import { MLChannelPanel } from './MLChannelPanel'
import { TNChannelPanel } from './TNChannelPanel'
import { ImageUploadModal } from './ImageUploadModal'

type Tab = 'producto' | 'ml' | 'tn'

const TABS: { key: Tab; label: string }[] = [
  { key: 'producto', label: 'Datos generales' },
  { key: 'ml', label: 'MercadoLibre' },
  { key: 'tn', label: 'Tienda Nube' },
]

function TrashIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 4h11M6 4V2.8A.8.8 0 0 1 6.8 2h2.4a.8.8 0 0 1 .8.8V4M12.5 4l-.6 8.4a1 1 0 0 1-1 .9H5.1a1 1 0 0 1-1-.9L3.5 4M6.5 6.8v4M9.5 6.8v4" />
    </svg>
  )
}

export function ProductDrawer({
  product,
  initialTab = 'producto',
  onClose,
  onChanged,
}: {
  product: Product
  initialTab?: Tab
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [mainImage, setMainImage] = useState(0)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    inventoryApi
      .get(product.id)
      .then(setDetail)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [product.id])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    setMainImage(0)
    setTab(initialTab)
  }, [product.id, initialTab])

  const p = detail?.product ?? product
  const images: ProductImageType[] = detail?.images ?? []
  const mlListing: ProductListing | null =
    detail?.listings.find((l) => l.platform === 'mercadolibre') ?? null
  const tnListing: ProductListing | null =
    detail?.listings.find((l) => l.platform === 'tiendanube') ?? null
  const m = marginPct(p.cost, p.price)
  const mColor = m > 40 ? '#16A34A' : m > 20 ? '#D97706' : '#DC2626'

  const removeImage = async (imageId: number) => {
    try {
      await inventoryApi.removeImage(product.id, imageId)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la imagen')
    }
  }

  // Confirmación de borrado: solo la PRIMERA vez por sesión de navegador
  // (sessionStorage), después borra directo (Figma).
  const IMG_DEL_WARNED_KEY = 'omnipanel.imgdel.warned'
  const [confirmImg, setConfirmImg] = useState<ProductImageType | null>(null)
  const requestRemoveImage = (img: ProductImageType | undefined) => {
    if (!img) return
    let warned = false
    try {
      warned = sessionStorage.getItem(IMG_DEL_WARNED_KEY) === '1'
    } catch {
      // storage bloqueado: se pregunta siempre, no rompe
    }
    if (warned) removeImage(img.id)
    else setConfirmImg(img)
  }
  const confirmRemoveImage = () => {
    if (!confirmImg) return
    try {
      sessionStorage.setItem(IMG_DEL_WARNED_KEY, '1')
    } catch {
      // storage bloqueado: se pregunta cada vez, no rompe
    }
    removeImage(confirmImg.id)
    setConfirmImg(null)
  }

  const activeImage = images[Math.min(mainImage, Math.max(0, images.length - 1))]

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      <div
        className="w-[820px] max-w-full flex flex-col bg-white shadow-2xl animate-drawer"
        style={{ borderLeft: '1px solid #E2E8F0' }}
      >
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid #F1F5F9' }}
        >
          <span className="text-xs text-muted">Actualizado {fmtDate(p.updated_at)} · {fmtTime(p.updated_at)}</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-muted shrink-0"
            aria-label="Cerrar"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex flex-1 min-h-0">
          {/* Left: product identity panel */}
          <div
            className="w-56 flex-shrink-0 flex flex-col gap-5 px-5 py-5 overflow-y-auto scroll-slim"
            style={{ borderRight: '1px solid #F1F5F9', background: '#FAFBFC' }}
          >
            <div className="flex flex-col gap-2.5 w-full">
              {images.length === 0 ? (
                <>
                  <ProductImage url={null} fill />
                  <button
                    onClick={() => setUploadOpen(true)}
                    className="w-full py-2 rounded-lg text-xs font-medium transition-colors hover:bg-slate-100 flex items-center justify-center gap-1.5"
                    style={{ color: '#64748B', border: '1px solid #E2E8F0' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    Subir imagen
                  </button>
                </>
              ) : (
                <>
                  {/* Featured image */}
                  <div className="relative w-full aspect-square rounded-2xl overflow-hidden group" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>
                    <img src={activeImage?.url} alt={`${p.name_edited || p.name} — imagen ${Math.min(mainImage, images.length - 1) + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-white" style={{ fontSize: '10px', fontWeight: 600, background: 'rgba(10,22,40,0.55)', backdropFilter: 'blur(4px)' }}>
                      {Math.min(mainImage, images.length - 1) + 1}/{images.length}
                    </span>
                    <button
                      onClick={() => requestRemoveImage(activeImage)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(220,38,38,0.92)', backdropFilter: 'blur(4px)' }}
                      aria-label="Eliminar imagen"
                      title="Quitar imagen"
                    >
                      <TrashIcon size={13} />
                    </button>
                  </div>

                  {/* Horizontal filmstrip — single row, scrolls sideways.
                      Selección clara (anillo indigo) y patrón de dos pasos: el tacho aparece solo
                      en la miniatura ya seleccionada, con su propia zona de toque separada. */}
                  <div className="flex gap-3 overflow-x-auto pt-2.5 pb-1.5 px-1.5 -mx-1.5" style={{ scrollbarWidth: 'thin' }}>
                    {images.map((img, i) => {
                      const selected = i === mainImage
                      return (
                        <div key={img.id} className="relative flex-shrink-0" style={{ width: 62, height: 62 }}>
                          <button
                            onClick={() => setMainImage(i)}
                            title={`Imagen ${i + 1}`}
                            className="w-full h-full rounded-xl overflow-hidden transition-all block"
                            style={{
                              border: selected ? '2px solid #4F46E5' : '1px solid #E2E8F0',
                              boxShadow: selected ? '0 0 0 3px rgba(79,70,229,0.18), 0 4px 10px rgba(15,23,42,0.12)' : 'none',
                              opacity: selected ? 1 : 0.82,
                              transform: selected ? 'scale(1)' : 'scale(0.96)',
                            }}
                            onMouseEnter={(e) => { if (!selected) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)' } }}
                            onMouseLeave={(e) => { if (!selected) { e.currentTarget.style.opacity = '0.82'; e.currentTarget.style.transform = 'scale(0.96)' } }}
                          >
                            <img src={img.url} alt={`${p.name_edited || p.name} miniatura ${i + 1}`} className="w-full h-full object-cover" />
                          </button>
                          {selected && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setMainImage((m) => Math.min(m, images.length - 2)); requestRemoveImage(img) }}
                              title="Quitar imagen"
                              className="absolute flex items-center justify-center rounded-full transition-transform"
                              style={{ top: -9, right: -9, width: 24, height: 24, background: 'white', border: '1px solid #FECACA', color: '#DC2626', boxShadow: '0 2px 6px rgba(15,23,42,0.18)', animation: 'fadeUp 0.15s ease both' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.transform = 'scale(1.08)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.transform = 'scale(1)' }}
                            >
                              <TrashIcon size={11} />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <button
                    onClick={() => setUploadOpen(true)}
                    className="w-full py-2 rounded-lg text-xs font-medium transition-colors hover:bg-slate-100 flex items-center justify-center gap-1.5"
                    style={{ color: '#64748B', border: '1px solid #E2E8F0' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    Agregar imagen
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <p className="font-semibold text-sm leading-snug text-ink">{p.name_edited || p.name}</p>
              {[
                { label: 'Marca', value: p.brand || '—', mono: false },
                { label: 'SKU', value: p.sku || '—', mono: true },
                { label: 'Código interno', value: p.internal_code || '—', mono: true },
                { label: 'Categoría', value: p.category || '—', mono: false },
              ].map((f) => (
                <div key={f.label} className="flex flex-col gap-0.5">
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#CBD5E1',
                    }}
                  >
                    {f.label}
                  </span>
                  <span className={f.mono ? 'text-xs font-mono' : 'text-xs'} style={{ color: '#475569' }}>
                    {f.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              {[
                { label: 'Stock', value: `${p.stock} u.`, color: '#0A1628' },
                { label: 'Costo', value: fmtMoney(p.cost), color: '#64748B' },
                { label: 'Precio', value: fmtMoney(p.price), color: '#0A1628' },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="text-xs text-muted">{r.label}</span>
                  <span className="text-xs font-semibold tabular" style={{ color: r.color }}>
                    {r.value}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #E2E8F0' }}>
                <span className="text-xs text-muted">Margen</span>
                <span className="text-xs font-bold tabular" style={{ color: mColor }}>
                  {m}%
                </span>
              </div>
            </div>
          </div>

          {/* Right: tab content */}
          <div className="flex-1 flex flex-col min-w-0">
            <div
              className="flex items-center gap-0 px-6 flex-shrink-0"
              style={{ borderBottom: '1px solid #E2E8F0' }}
            >
              {TABS.map((tb) => (
                <button
                  key={tb.key}
                  onClick={() => setTab(tb.key)}
                  className="flex items-center gap-1.5 px-1 py-3 mr-5 text-xs font-semibold transition-all"
                  style={{
                    color: tab === tb.key ? '#0A1628' : '#94A3B8',
                    borderBottom: tab === tb.key ? '2px solid #4F46E5' : '2px solid transparent',
                    marginBottom: '-1px',
                    letterSpacing: '0.01em',
                  }}
                >
                  {tb.label}
                </button>
              ))}
            </div>

            {/* data-panel-scroll: lo usan los paneles de canal para medir el área
                y superponer la card de éxito de publicación (PublishSuccessCard). */}
            <div data-panel-scroll className="flex-1 overflow-y-auto px-6 py-6 scroll-slim">
              {error && (
                <div className="mb-4">
                  <ErrorBox message={error} onRetry={reload} />
                </div>
              )}
              {/* Solo la carga inicial muestra spinner: en reloads posteriores
                  (p. ej. tras publicar) los paneles quedan montados y no
                  pierden su estado interno (paso del wizard, celebración). */}
              {detail === null && loading ? (
                <SpinnerText />
              ) : (
                <ErrorBoundary label="el panel del producto">
                  {tab === 'producto' && (
                    <GeneralTab
                      product={p}
                      onSaved={(updated) => {
                        setDetail((prev) => (prev ? { ...prev, product: updated } : prev))
                      }}
                    />
                  )}
                  {/* Paneles de canal SIEMPRE montados (ocultos con CSS): el
                      estado del wizard (modo catálogo, ficha elegida, paso)
                      sobrevive al cambio de pestaña. Antes, cambiar de pestaña
                      desmontaba el panel y un "Publicar" podía salir como
                      tradicional con el estado reseteado en silencio. */}
                  <div style={{ display: tab === 'ml' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>
                    <MLChannelPanel
                      key={p.id}
                      product={p}
                      listing={mlListing}
                      onReload={reload}
                      onChanged={onChanged}
                    />
                  </div>
                  <div style={{ display: tab === 'tn' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>
                    <TNChannelPanel
                      key={p.id}
                      product={p}
                      listing={tnListing}
                      onReload={reload}
                      onChanged={onChanged}
                    />
                  </div>
                </ErrorBoundary>
              )}
            </div>

            <div
              className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0"
              style={{ borderTop: '1px solid #F1F5F9' }}
            >
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors text-subtle"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmación de borrado (solo la 1ª vez por sesión, Figma) */}
      {confirmImg && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)' }} onClick={() => setConfirmImg(null)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="imgdel-title" className="w-full max-w-md rounded-2xl bg-white p-6 flex flex-col gap-4" style={{ boxShadow: '0 24px 60px rgba(15,23,42,0.28)', animation: 'fadeUp 0.18s ease both' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: '#FEF2F2', color: '#DC2626' }}>
                <TrashIcon size={18} />
              </div>
              <h3 id="imgdel-title" className="text-lg font-bold" style={{ color: '#0A1628' }}>¿Eliminar esta imagen?</h3>
            </div>
            <div className="flex items-center gap-3">
              <img src={confirmImg.url} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" style={{ border: '1px solid #E2E8F0' }} />
              <p className="text-sm leading-relaxed" style={{ color: '#475569' }}>La imagen se va a quitar del producto y de la galería. Esta acción no se puede deshacer.</p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setConfirmImg(null)} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ border: '1px solid #E2E8F0', color: '#475569', background: 'white' }}>Cancelar</button>
              <button onClick={confirmRemoveImage} autoFocus className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors" style={{ background: '#DC2626' }}>Eliminar imagen</button>
            </div>
          </div>
        </div>
      )}

      {uploadOpen && (
        <ImageUploadModal
          productId={product.id}
          count={images.length}
          onClose={() => setUploadOpen(false)}
          onUploaded={reload}
        />
      )}
    </div>
  )
}
