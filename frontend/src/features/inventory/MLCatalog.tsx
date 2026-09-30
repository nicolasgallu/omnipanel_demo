// Componentes de catálogo de MercadoLibre (Figma): tag, matching, paso
// "Tipo de publicación", config simplificada y card del drawer con
// vincular/salir. Hablan con la API real (/api/mercadolibre/catalog/*).

import { useEffect, useState } from 'react'
import { catalogApi } from '../../lib/api/endpoints'
import { fmtMoney } from '../../lib/format'
import type { CatalogCompetition, CatalogProduct, MLListingType, Product, ProductListing } from '../../lib/api/types'
import { ErrorBox, SpinnerText } from '../../components/ui'
import { ListingTypePicker } from './shared'

const ACCENT = '#4F46E5'


// Mapa de estados del buy box (Meli price_to_win) → pill visual.
const COMP_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  winning: { label: 'Ganando', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  sharing_first_place: { label: 'Empatando', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  competing: { label: 'Perdiendo', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  listed: { label: 'No puede competir', color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
  not_listed: { label: 'Procesando', color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
}

// Estados de elegibilidad REALES de Meli: los que bloquean el vínculo mapean
// a un mensaje; el resto (READY_FOR_OPTIN, CATALOG_PRODUCT_ID_NULL, null)
// deja pasar al matcher.
export const BLOCKED_ELIGIBILITY: Record<string, string> = {
  NOT_ELIGIBLE:
    'MercadoLibre dice que esta publicación no es elegible para el catálogo (por ejemplo, productos usados o celulares liberados).',
  CLOSED:
    'La publicación está cerrada en MercadoLibre y no puede vincularse al catálogo.',
  PRODUCT_INACTIVE:
    'El producto de catálogo asociado todavía no está activo en MercadoLibre.',
  ALREADY_OPTED_IN:
    'La publicación ya está vinculada al catálogo.',
  COMPETING:
    'La publicación ya está en el catálogo y compitiendo por la ficha.',
}

// Una frase humana por estado de competencia (nada de keys técnicas).
function compSentence(comp: CatalogCompetition): string {
  switch (comp.status) {
    case 'winning':
      return 'Tu publicación es la que se lleva las ventas de esta ficha.'
    case 'sharing_first_place': {
      const n = comp.competitors_sharing_first_place ?? 1
      return `Compartís el primer lugar con ${n} vendedor${n === 1 ? '' : 'es'} más.`
    }
    case 'competing':
      return 'Otro vendedor está ganando esta ficha.'
    case 'listed':
      return `MercadoLibre dice: ${(comp.reason && comp.reason.length ? comp.reason.join(', ') : 'no podés competir por esta ficha')}.`
    case 'not_listed':
      return 'MercadoLibre está incorporando tu publicación al catálogo. En unos minutos vas a ver si estás ganando la ficha.'
    default:
      return 'Sin datos de competencia todavía.'
  }
}

// ─── Píldora reutilizable: Catálogo vs Tradicional ───────────────────────────

export function CatalogTag({ isCatalog, size = 'sm' }: { isCatalog: boolean; size?: 'sm' | 'xs' }) {
  const pad = size === 'xs' ? 'px-1.5 py-0.5' : 'px-2 py-0.5'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${pad}`}
      style={{
        fontSize: size === 'xs' ? '10px' : '11px',
        color: isCatalog ? '#4F46E5' : '#64748B',
        background: isCatalog ? '#EEF2FF' : '#F1F5F9',
        border: `1px solid ${isCatalog ? '#C7D2FE' : '#E2E8F0'}`,
      }}
    >
      {isCatalog ? (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M6 1.5l4 2v5l-4 2-4-2v-5l4-2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M2 3.5l4 2 4-2M6 5.5V10" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
          <rect x="1.5" y="2" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
          <path d="M3.5 5h5M3.5 7h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      )}
      {isCatalog ? 'Catálogo' : 'Tradicional'}
    </span>
  )
}

// ─── Nota explicativa ────────────────────────────────────────────────────────

function CatalogHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl px-3.5 py-2.5" style={{ background: '#EEF2FF', border: '1px solid #C7D2FE' }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px" style={{ color: '#4F46E5' }} aria-hidden>
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 7.5v3M8 5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <p className="text-xs leading-relaxed" style={{ color: '#4338CA' }}>{children}</p>
    </div>
  )
}

// ─── Buscador + candidatos (matching) ────────────────────────────────────────

function matchAttrs(c: CatalogProduct): { brand: string; model: string; color: string | null } {
  const pick = (id: string) =>
    c.attributes.find((a) => a.id === id)?.value_name ?? null
  return { brand: pick('BRAND') ?? '—', model: pick('MODEL') ?? '—', color: pick('COLOR') ?? null }
}

export function CatalogMatcher({
  accountId,
  selected,
  onSelect,
  initialQuery,
  onResults,
}: {
  accountId: number
  selected: CatalogProduct | null
  onSelect: (c: CatalogProduct) => void
  initialQuery?: string
  onResults?: (items: CatalogProduct[]) => void
}) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [items, setItems] = useState<CatalogProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const runSearch = async (q: string) => {
    if (loading) return
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const isGtin = /^\d{6,}$/.test(q.trim())
      const res = await catalogApi.search(
        accountId,
        isGtin ? { product_identifier: q.trim() } : { q: q.trim() },
      )
      setItems(res.items ?? [])
      onResults?.(res.items ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar en el catálogo')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  // Búsqueda inicial automática (por GTIN si el producto tiene).
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      void runSearch(initialQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-2.5">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (query.trim()) void runSearch(query)
        }}
        className="relative"
      >
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
          <circle cx="6" cy="6" r="4.5" stroke="#CBD5E1" strokeWidth="1.4" />
          <path d="M9.5 9.5L12 12" stroke="#CBD5E1" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o GTIN…"
          className="w-full pl-9 pr-16 py-2.5 text-xs rounded-xl outline-none transition-all text-ink"
          style={{ border: '1px solid #E2E8F0', background: 'white' }}
          onFocus={(e) => {
            e.target.style.borderColor = ACCENT
            e.target.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.1)'
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#E2E8F0'
            e.target.style.boxShadow = 'none'
          }}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          style={{ background: '#EEF2FF', color: ACCENT }}
        >
          {loading ? '…' : 'Buscar'}
        </button>
      </form>

      {error && <ErrorBox message={error} />}

      <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto">
        {items.map((c) => {
          const isSel = selected?.id === c.id
          const attrs = matchAttrs(c)
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="w-full text-left rounded-xl px-3 py-2.5 transition-all"
              style={{ border: `1.5px solid ${isSel ? ACCENT : '#E2E8F0'}`, background: isSel ? '#EEF2FF' : 'white' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-semibold text-ink">{c.name}</p>
                    {c.listing_strategy === 'catalog_required' && (
                      <span className="rounded-full px-1.5 py-px" style={{ fontSize: '9px', fontWeight: 700, color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                        Catálogo obligatorio
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap mt-1">
                    <span className="text-xs text-faint">
                      Marca: <b className="text-subtle">{attrs.brand}</b>
                    </span>
                    <span className="text-xs text-faint">
                      Modelo: <b className="text-subtle">{attrs.model}</b>
                    </span>
                    {attrs.color && (
                      <span className="text-xs text-faint">
                        Color: <b className="text-subtle">{attrs.color}</b>
                      </span>
                    )}
                  </div>
                  <p className="font-mono mt-0.5 text-faint" style={{ fontSize: '9.5px' }}>
                    {c.id}
                  </p>
                </div>
                <span
                  className="flex items-center justify-center rounded-full flex-shrink-0 mt-0.5"
                  style={{ width: 18, height: 18, border: `2px solid ${isSel ? ACCENT : '#E2E8F0'}`, background: isSel ? ACCENT : 'white' }}
                >
                  {isSel && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M2.5 6.5l2.5 2.5 4.5-5.5" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </div>
            </button>
          )
        })}
        {searched && !loading && items.length === 0 && (
          <div className="text-center py-8 text-xs text-faint">
            No encontramos fichas de catálogo para esa búsqueda.
          </div>
        )}
        {!searched && !loading && (
          <div className="text-center py-8 text-xs text-faint">
            Buscá la ficha estándar de MercadoLibre por nombre o GTIN.
          </div>
        )}
        {loading && <SpinnerText text="Buscando en el catálogo…" />}
      </div>
    </div>
  )
}

// ─── Paso "Tipo de publicación" ──────────────────────────────────────────────

export function MLPubTypeStep({
  mode,
  setMode,
  match,
  setMatch,
  accountId,
  initialQuery,
}: {
  mode: 'traditional' | 'catalog'
  setMode: (m: 'traditional' | 'catalog') => void
  match: CatalogProduct | null
  setMatch: (c: CatalogProduct | null) => void
  accountId: number
  initialQuery?: string
}) {
  // Catálogo obligatorio: cuando la búsqueda del producto devuelve SOLO
  // fichas catalog_required, la categoría exige catálogo y la opción
  // tradicional queda deshabilitada.
  const [mandatory, setMandatory] = useState(false)
  const options: { id: 'traditional' | 'catalog'; title: string; desc: string }[] = [
    { id: 'traditional', title: 'Publicación tradicional', desc: 'Vos controlás título, fotos y atributos, como hasta ahora.' },
    { id: 'catalog', title: 'Catálogo', desc: 'La ficha la pone MercadoLibre. Vos solo definís precio, stock y condiciones.' },
  ]
  return (
    <div className="flex flex-col gap-4">
      {mandatory && (
        <div className="flex items-start gap-2 rounded-xl px-3.5 py-2.5" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px" style={{ color: '#D97706' }} aria-hidden>
            <path d="M8 2.5L14.5 14h-13L8 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M8 7v3M8 12h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <p className="text-xs leading-relaxed" style={{ color: '#92400E' }}>
            Esta categoría exige vender en <b>catálogo</b>. La opción tradicional no está disponible.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {options.map((o) => {
          const active = mode === o.id
          const disabled = mandatory && o.id === 'traditional'
          return (
            <button
              key={o.id}
              disabled={disabled}
              onClick={() => setMode(o.id)}
              className="text-left rounded-2xl p-4 transition-all"
              style={{
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
                border: `1.5px solid ${active ? ACCENT : '#E2E8F0'}`,
                background: active ? '#EEF2FF' : 'white',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="flex items-center justify-center rounded-xl"
                  style={{ width: 34, height: 34, color: active ? ACCENT : '#94A3B8', background: active ? '#E0E7FF' : '#F1F5F9' }}
                >
                  {o.id === 'catalog' ? (
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
                      <path d="M10 2.5l6 3.2v8.6l-6 3.2-6-3.2V5.7l6-3.2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                      <path d="M4 5.7l6 3.2 6-3.2M10 8.9v8.6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
                      <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M6 8h8M6 11h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
                <span
                  className="flex items-center justify-center rounded-full"
                  style={{ width: 18, height: 18, border: `2px solid ${active ? ACCENT : '#E2E8F0'}`, background: active ? ACCENT : 'white' }}
                >
                  {active && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M2.5 6.5l2.5 2.5 4.5-5.5" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </div>
              <p className="text-sm font-bold text-ink">{o.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-subtle">{o.desc}</p>
            </button>
          )
        })}
      </div>

      {mode === 'catalog' && (
        <div className="flex flex-col gap-2.5">
          <span className="text-xs font-semibold text-subtle">Elegí el producto de catálogo</span>
          <CatalogHint>
            Buscá la ficha estándar de MercadoLibre que corresponde a tu producto. Vas a competir con otros vendedores por la misma ficha.
          </CatalogHint>
          <CatalogMatcher
            accountId={accountId}
            selected={match}
            onSelect={setMatch}
            initialQuery={initialQuery}
            onResults={(items) => {
              const isMandatory =
                items.length > 0 && items.every((c) => c.listing_strategy === 'catalog_required')
              setMandatory(isMandatory)
              if (isMandatory) setMode('catalog')
            }}
          />
        </div>
      )}
    </div>
  )
}

// ─── Config simplificada para catálogo ───────────────────────────────────────

export function MLCatalogConfigStep({
  product,
  match,
  cfg,
  set,
  listingTypes,
  listingTypesError,
  onRetryListingTypes,
  priceValue,
  onPriceChange,
}: {
  product: Product
  match: CatalogProduct | null
  cfg: { listing_type: string }
  set: (k: 'listing_type', v: string) => void
  listingTypes: MLListingType[] | null
  listingTypesError: string | null
  onRetryListingTypes: () => void
  priceValue?: string
  onPriceChange?: (v: string) => void
}) {
  const attrs = match ? matchAttrs(match) : null
  const readonly = match
    ? [
        { label: 'Título', value: match.name },
        { label: 'Marca', value: attrs?.brand ?? '—' },
        { label: 'Modelo', value: attrs?.model ?? '—' },
        ...(attrs?.color ? [{ label: 'Color', value: attrs.color }] : []),
      ]
    : []
  return (
    <div className="flex flex-col gap-5">
      <CatalogHint>
        <b>MercadoLibre define la ficha.</b> El título, las fotos y los atributos vienen del producto de catálogo. Vos configurás precio, stock y condiciones de venta.
      </CatalogHint>

      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold text-subtle">Precio</span>
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: 'white', border: '1px solid #E2E8F0' }}>
          <span className="text-xs text-faint">Precio de la publicación</span>
          {priceValue !== undefined && onPriceChange ? (
            <div className="flex items-center gap-0.5">
              <span className="text-xs font-semibold text-faint">$</span>
              <input
                value={priceValue}
                onChange={(e) => onPriceChange(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                className="text-xs font-semibold text-right outline-none bg-transparent tabular-nums text-ink"
                style={{ width: '90px' }}
              />
            </div>
          ) : (
            <span className="text-xs font-semibold tabular-nums text-ink">{`$${(product.price ?? 0).toLocaleString('es-AR')}`}</span>
          )}
        </div>

        <span className="text-xs font-semibold text-subtle">Tipo de publicación</span>
        {listingTypes === null ? (
          <SpinnerText text="Cargando campañas…" />
        ) : listingTypesError ? (
          <div className="max-w-sm">
            <ErrorBox message={listingTypesError} onRetry={onRetryListingTypes} />
          </div>
        ) : (
          <ListingTypePicker value={cfg.listing_type} onChange={(v) => set('listing_type', v)} items={listingTypes} accent={ACCENT} />
        )}

        {readonly.length > 0 && (
        <span className="text-xs font-semibold text-subtle">Definido por MercadoLibre</span>
        )}
        {readonly.length > 0 && <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
          <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
            <span className="text-xs text-faint">Fotos gestionadas por MercadoLibre</span>
            <span className="ml-auto flex items-center gap-1 text-xs text-faint">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                <rect x="2.5" y="5" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.1" />
                <path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.1" />
              </svg>
              Read-only
            </span>
          </div>
          {readonly.map((r, i) => (
            <div key={r.label} className="flex items-center justify-between gap-3 px-3 py-2" style={{ borderTop: i > 0 ? '1px solid #F8FAFC' : 'none' }}>
              <span className="text-xs text-faint flex-shrink-0">{r.label}</span>
              <span className="text-xs text-right truncate text-subtle">{r.value}</span>
            </div>
          ))}
        </div>}
      </div>
    </div>
  )
}

// ─── Card del drawer (publicado): SOLO estado/datos, sin acciones ─────────────
// Las acciones (linkear / salir) viven en el toolbar del panel publicado.

export function MLCatalogCard({
  productId,
  listing,
  accountId,
}: {
  productId: number
  listing: ProductListing | null
  accountId: number
}) {
  const isCatalog = Boolean(listing?.catalog_listing)
  const [competition, setCompetition] = useState<CatalogCompetition | null | undefined>(undefined)

  // Competencia del buy box: solo aplica a publicaciones de catálogo.
  useEffect(() => {
    if (!isCatalog) return
    let alive = true
    catalogApi
      .competition(productId, accountId)
      .then((c) => {
        if (alive) setCompetition(c)
      })
      .catch(() => {
        if (alive) setCompetition(null)
      })
    return () => {
      alive = false
    }
  }, [isCatalog, productId, accountId])

  // La nota SOLO vale cuando la sombra está realmente activa: si Meli la
  // tiene pausada o en revisión no está vendiendo detrás del catálogo.
  const shadowActive =
    isCatalog &&
    Boolean(listing?.marketplace_item_id) &&
    String(listing?.marketplace_status ?? '').toLowerCase() === 'active'

  const comp = isCatalog ? competition : null
  const myPrice = comp?.current_price ?? listing?.price ?? 0
  const priceToWin = comp?.price_to_win ?? null
  const delta = priceToWin != null ? myPrice - priceToWin : 0
  const missing = comp ? comp.boosts.filter((b) => b.status !== 'boosted') : []
  const showBoosts = !!comp && comp.boosts.length > 0 && comp.status !== 'listed' && comp.status !== 'not_listed'
  const showNumbers =
    !!comp && comp.status !== 'listed' && comp.status !== 'not_listed' && comp.status !== 'winning' && priceToWin != null

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${isCatalog ? '#C7D2FE' : '#E2E8F0'}` }}>
      {/* Header de estado */}
      <div
        className="flex items-start gap-3 px-4 py-3.5"
        style={{ background: isCatalog ? '#EEF2FF' : '#F8FAFC', borderBottom: `1px solid ${isCatalog ? '#E0E7FF' : '#F1F5F9'}` }}
      >
        <span
          className="flex items-center justify-center rounded-xl flex-shrink-0"
          style={{ width: 38, height: 38, background: isCatalog ? '#E0E7FF' : '#F1F5F9', color: isCatalog ? ACCENT : '#64748B' }}
        >
          {isCatalog ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M10 2.5l6 3.2v8.6l-6 3.2-6-3.2V5.7l6-3.2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M4 5.7l6 3.2 6-3.2M10 8.9v8.6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M6 8h8M6 11h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <CatalogTag isCatalog={isCatalog} />
            {isCatalog && !listing?.marketplace_item_id && (
              <span className="rounded-full px-1.5 py-px" style={{ fontSize: '9px', fontWeight: 700, color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                Meli te sumó solo
              </span>
            )}
          </div>
          {isCatalog && listing?.catalog_product_id ? (
            <a
              href={`https://www.mercadolibre.com.ar/p/${listing.catalog_product_id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 mt-1.5 transition-colors hover:underline"
              style={{ color: ACCENT }}
            >
              <span className="text-xs font-semibold truncate">{listing.catalog_product_id}</span>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" className="flex-shrink-0" aria-hidden>
                <path d="M4 2h6v6M10 2L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          ) : (
            <p className="text-xs mt-1.5 text-subtle">
              {isCatalog
                ? 'Tu publicación está vinculada a un producto de catálogo.'
                : 'Vos controlás título, fotos y atributos de esta publicación.'}
            </p>
          )}
        </div>
      </div>

      {/* Competencia (solo catálogo) */}
      {isCatalog && competition === undefined && (
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <SpinnerText text="Consultando competencia…" />
        </div>
      )}
      {isCatalog && comp && (
        <div className="px-4 py-3.5 flex flex-col gap-3.5" style={{ borderBottom: '1px solid #F1F5F9' }}>
          {/* Frase humana + pill de estado */}
          <div className="flex items-start gap-2.5">
            {(() => {
              const meta = COMP_META[comp.status ?? ''] ?? { label: comp.status ?? 'Evaluando', color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' }
              return (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 flex-shrink-0"
                  style={{ fontSize: '11px', fontWeight: 700, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                  {meta.label}
                </span>
              )
            })()}
            <p className="text-xs leading-relaxed font-medium" style={{ color: '#334155' }}>
              {compSentence(comp)}
            </p>
          </div>

          {/* Números clave: tu precio vs precio para ganar */}
          {showNumbers && (
            <div className="flex items-stretch rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
              <div className="flex-1 px-3 py-2">
                <p className="text-faint" style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tu precio</p>
                <p className="tabular-nums font-bold text-ink" style={{ fontSize: '14px' }}>{fmtMoney(myPrice)}</p>
              </div>
              <div className="flex-1 px-3 py-2" style={{ borderLeft: '1px solid #F1F5F9' }}>
                <p className="text-faint" style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Precio para ganar</p>
                <p className="tabular-nums font-bold" style={{ fontSize: '14px', color: '#16A34A' }}>{fmtMoney(priceToWin ?? 0)}</p>
              </div>
              {delta > 0 && (
                <div className="flex flex-col items-center justify-center px-3" style={{ background: '#FEF2F2', borderLeft: '1px solid #FECACA' }}>
                  <p style={{ fontSize: '9px', color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bajar</p>
                  <p className="tabular-nums font-bold" style={{ fontSize: '13px', color: '#DC2626' }}>{fmtMoney(delta)}</p>
                </div>
              )}
            </div>
          )}

          {/* Qué podés mejorar: chips con "+" */}
          {showBoosts && missing.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-faint" style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Qué podés mejorar
              </span>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1"
                    style={{ fontSize: '11px', fontWeight: 500, color: ACCENT, background: '#EEF2FF', border: '1px solid #E0E7FF' }}
                  >
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    {b.description}
                  </span>
                ))}
              </div>
            </div>
          )}
          {showBoosts && missing.length === 0 && (
            <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#16A34A' }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Ya ofrecés todos los beneficios.
            </p>
          )}
        </div>
      )}

      {/* Nota de publicación tradicional "sombra" */}
      {shadowActive && (
        <div className="flex items-start gap-2 px-4 py-2.5" style={{ background: '#FFFBEB', borderTop: '1px solid #FDE68A' }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px" style={{ color: '#D97706' }} aria-hidden>
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 7.5v3M8 5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <p className="text-xs leading-relaxed" style={{ color: '#92400E' }}>
            Tu publicación tradicional sigue activa detrás del catálogo.
          </p>
        </div>
      )}
    </div>
  )
}
