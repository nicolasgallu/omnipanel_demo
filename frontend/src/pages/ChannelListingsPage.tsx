// Vistas de publicaciones por canal (Figma: Inventario > MercadoLibre / Tienda Nube).
// Cada canal tiene su propia tabla (con columnas configurables), filtros por
// estado/performance/categoría y un strip de métricas resumen.

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { channelsApi, inventoryApi } from '../lib/api/endpoints'
import { statusLabel } from '../lib/channelStatus'
import type {
  ChannelStatus,
  ListingQuery,
  ListingSummary,
  MLListingRow,
  Product,
  TNListingRow,
} from '../lib/api/types'
import { fmtMoney, fmtPct } from '../lib/format'
import { ErrorBox, SpinnerText } from '../components/ui'
import { StatusBadge } from '../components/StatusBadge'
import { CategoryChip } from '../components/CategoryChip'
import { ProductDrawer } from '../features/inventory/ProductDrawer'
import { FilterField, Popover } from '../features/inventory/inventoryColumns'
import { CatalogTag } from '../features/inventory/MLCatalog'
import { CsvExportButton } from '../components/CsvExportButton'
import { PencilIcon, RowEditAction, RowEditContext } from '../features/inventory/rowEdit'
import { EditableCell } from '../features/inventory/rowEdit'
import { SelectBox } from '../features/massActions/SelectBox'
import { MassActionsBar } from '../features/massActions/MassActionsBar'

type Platform = 'ml' | 'tn'

type ListingCol = {
  key: string
  label: string
  locked?: boolean
  editable?: boolean
  render: (p: MLListingRow | TNListingRow, ctx?: { onSaved: (updated: MLListingRow | TNListingRow) => void }) => ReactNode
}

const asMl = (p: MLListingRow | TNListingRow) => p as MLListingRow
const asTn = (p: MLListingRow | TNListingRow) => p as TNListingRow

const ProductCell = (p: MLListingRow | TNListingRow, ctx?: { onSaved: (updated: MLListingRow | TNListingRow) => void }) => (
  <div className="flex items-center gap-2.5">
    {p.image_url ? (
      <img
        src={p.image_url}
        alt=""
        className="rounded-md object-cover flex-shrink-0"
        style={{ width: 28, height: 28, border: '1px solid #E2E8F0' }}
      />
    ) : (
      <div className="rounded-md flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, background: '#F1F5F9', border: '1px solid #E2E8F0', color: '#CBD5E1' }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="5.5" cy="6.5" r="1" fill="currentColor" />
          <path d="M3 12l3.5-3 2.5 2 2-1.5 2 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </div>
    )}
    <div className="flex flex-col min-w-0 items-start">
      <EditableCell
        rowId={p.id}
        value={p.name_edited || p.name}
        format={(v) => <span className="font-medium text-ink">{v}</span>}
        onSave={async (v) => {
          const res = await inventoryApi.patch(p.id, { title: v })
          ctx?.onSaved({ ...p, name_edited: res.product.name_edited } as MLListingRow)
        }}
      />
      <span className="font-mono px-1" style={{ fontSize: '10px', color: '#94A3B8' }}>
        {p.sku || '—'}
      </span>
    </div>
  </div>
)

const PubCell = (externalId: string | null, permalink: string | null) => {
  if (!externalId) return <span className="text-faint">—</span>
  const inner = (
    <span className="inline-flex items-center gap-1 font-mono transition-colors hover:underline" style={{ color: '#4F46E5', fontSize: '11px' }}>
      {externalId}
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M4 2h6v6M10 2L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
  if (!permalink) return inner
  return (
    <a href={permalink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      {inner}
    </a>
  )
}

const CategoryCell = (p: MLListingRow | TNListingRow) => <CategoryChip category={p.category} />

const StockCell = (p: MLListingRow | TNListingRow) => (
  <span className="tabular-nums" style={{ color: p.stock > 0 ? '#0A1628' : '#DC2626' }}>
    {p.stock}
  </span>
)

const UpdCell = (p: MLListingRow | TNListingRow) => {
  const d =
    (p as MLListingRow).listing_updated_at ??
    (p as TNListingRow).listing_updated_at ??
    p.updated_at
  return <span className="text-muted whitespace-nowrap">{d ?? '—'}</span>
}

const scoreLevel = (s: number) => (s >= 80 ? 'Óptimo' : s >= 50 ? 'Estándar' : 'Básico')

function PerfCell(p: MLListingRow | TNListingRow) {
  const score = asMl(p).perf_score
  if (score === null || score === undefined) return <span className="text-faint">—</span>
  const col = score >= 80 ? '#16A34A' : score >= 50 ? '#D97706' : '#DC2626'
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="tabular-nums font-semibold" style={{ color: col }}>
        {score}
      </span>
      <span style={{ fontSize: '10px', color: '#94A3B8' }}>{scoreLevel(score)}</span>
    </span>
  )
}

const ML_LISTING_COLS: ListingCol[] = [
  { key: 'prod', label: 'Producto', locked: true, editable: true, render: ProductCell },
  { key: 'pub', label: 'Publicación', render: (p) => PubCell(asMl(p).external_id, asMl(p).permalink) },
  {
    key: 'price',
    label: 'Precio',
    editable: true,
    render: (p, ctx) => (
      <EditableCell
        rowId={p.id}
        type="number"
        prefix="$"
        value={asMl(p).listing_price != null ? String(asMl(p).listing_price) : ''}
        format={(v) => (v ? fmtMoney(Number(v)) : '—')}
        onSave={async (v) => {
          const res = await channelsApi.mlPrice(p.id, asMl(p).account_id, Number(v))
          ctx?.onSaved({ ...asMl(p), listing_price: res.price, price_manually_changed: true } as MLListingRow)
        }}
      />
    ),
  },
  { key: 'tipo', label: 'Tipo', render: (p) => <CatalogTag isCatalog={asMl(p).catalog_listing} size="xs" /> },
  { key: 'status', label: 'Estado', render: (p) => <StatusBadge status={asMl(p).status} variant="chip" /> },
  { key: 'perf', label: 'Performance', render: PerfCell },
  {
    key: 'cost',
    label: 'Costo de venta',
    render: (p) => {
      const m = asMl(p)
      return <span className="tabular-nums text-subtle">{m.selling_cost != null ? fmtMoney(m.selling_cost) : '—'}</span>
    },
  },
  { key: 'category', label: 'Categoría', render: CategoryCell },
  { key: 'stock', label: 'Stock', render: StockCell },
  { key: 'upd', label: 'Actualizado', render: UpdCell },
  { key: 'brand', label: 'Marca', render: (p) => <span className="text-subtle">{asMl(p).brand || '—'}</span> },
  { key: 'model', label: 'Modelo', render: (p) => <span className="text-subtle">{asMl(p).model || '—'}</span> },
  {
    key: 'manual_price',
    label: 'Precio manual',
    render: (p) => (
      <span className="rounded-full px-1.5 py-px" style={{ fontSize: '10px', fontWeight: 700, color: asMl(p).price_manually_changed ? '#D97706' : '#64748B', background: asMl(p).price_manually_changed ? '#FFFBEB' : '#F1F5F9' }}>
        {asMl(p).price_manually_changed ? 'Manual' : 'Auto'}
      </span>
    ),
  },
  { key: 'reason', label: 'Motivo Meli', render: (p) => <span className="text-xs text-subtle line-clamp-2">{asMl(p).reason || '—'}</span> },
  { key: 'fee', label: 'Comisión ML', render: (p) => { const m = asMl(p); return <span className="tabular-nums text-subtle whitespace-nowrap">{m.percentage_fee != null ? fmtPct(m.percentage_fee) : '—'}</span> } },
  { key: 'cost_no_tax', label: 'Costo sin IVA', render: (p) => { const m = asMl(p); return <span className="tabular-nums text-subtle">{m.total_selling_cost != null ? fmtMoney(m.total_selling_cost) : '—'}</span> } },
  { key: 'ship_cost', label: 'Costo de envío', render: (p) => { const m = asMl(p); return <span className="tabular-nums text-subtle">{m.ship_list_cost != null ? fmtMoney(m.ship_list_cost) : '—'}</span> } },
  {
    key: 'suggested',
    label: 'Precio sugerido',
    render: (p) => {
      const m = asMl(p)
      if (m.suggested_price == null) return <span className="text-faint">—</span>
      const delta = m.listing_price != null ? m.listing_price - m.suggested_price : null
      return (
        <span className="flex flex-col items-start">
          <span className="tabular-nums font-semibold text-ink">{fmtMoney(m.suggested_price)}</span>
          {delta != null && delta !== 0 && (
            <span style={{ fontSize: '10px', fontWeight: 600, color: delta > 0 ? '#DC2626' : '#16A34A' }}>
              {delta > 0 ? '−' : '+'}{fmtMoney(Math.abs(delta))}
            </span>
          )}
        </span>
      )
    },
  },
]

const TN_LISTING_COLS: ListingCol[] = [
  { key: 'prod', label: 'Producto', locked: true, editable: true, render: ProductCell },
  { key: 'pub', label: 'Publicación', render: (p) => PubCell(asTn(p).external_id ? `#${asTn(p).external_id}` : null, asTn(p).permalink) },
  {
    key: 'price',
    label: 'Precio',
    editable: true,
    render: (p, ctx) => (
      <EditableCell
        rowId={p.id}
        type="number"
        prefix="$"
        value={asTn(p).listing_price != null ? String(asTn(p).listing_price) : ''}
        format={(v) => (v ? fmtMoney(Number(v)) : '—')}
        onSave={async (v) => {
          const res = await channelsApi.tnPrice(p.id, asTn(p).account_id, Number(v))
          ctx?.onSaved({ ...asTn(p), listing_price: res.price } as TNListingRow)
        }}
      />
    ),
  },
  { key: 'status', label: 'Estado', render: (p) => <StatusBadge status={asTn(p).status} variant="chip" /> },
  { key: 'cat', label: 'Categoría', render: CategoryCell },
  { key: 'stock', label: 'Stock', render: StockCell },
  { key: 'upd', label: 'Actualizado', render: UpdCell },
]

const ML_COL_MAP = Object.fromEntries(ML_LISTING_COLS.map((c) => [c.key, c])) as Record<string, ListingCol>
const TN_COL_MAP = Object.fromEntries(TN_LISTING_COLS.map((c) => [c.key, c])) as Record<string, ListingCol>
const ML_DEFAULT_COLS = ['prod', 'pub', 'price', 'tipo', 'status', 'perf', 'upd']
const TN_DEFAULT_COLS = ['prod', 'pub', 'price', 'status', 'cat', 'upd']

const makeColStore = (key: string, map: Record<string, ListingCol>, def: string[]) => ({
  load: (): string[] => {
    try {
      const arr = JSON.parse(localStorage.getItem(key) || 'null') as string[] | null
      if (Array.isArray(arr)) {
        const valid = arr.filter((k) => map[k])
        if (valid.includes('prod') && valid.length) return valid
      }
    } catch {
      /* ignore */
    }
    return def
  },
  save: (c: string[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(c))
    } catch {
      /* ignore */
    }
  },
})

const mlColStore = makeColStore('omnipanel.ml.cols', ML_COL_MAP, ML_DEFAULT_COLS)
const tnColStore = makeColStore('omnipanel.tn.cols', TN_COL_MAP, TN_DEFAULT_COLS)

// ─── Filtros por dominio ─────────────────────────────────────────────────────

const LISTING_STATUS_FILTER = [
  { value: 'all', label: 'Todos' },
  { value: 'published', label: statusLabel('published') },
  { value: 'paused', label: statusLabel('paused') },
  { value: 'prepublished', label: statusLabel('prepublished') },
  { value: 'under_review', label: statusLabel('under_review') },
]
const PERF_FILTER = [
  { value: 'all', label: 'Todas' },
  { value: 'high', label: 'Óptimo (80+)' },
  { value: 'mid', label: 'Estándar (50–79)' },
  { value: 'low', label: 'Básico (<50)' },
]

type MlFilters = { status: string; perf: string; category: string }
type TnFilters = { status: string; category: string }
const DEFAULT_ML_FILTERS: MlFilters = { status: 'all', perf: 'all', category: 'all' }
const DEFAULT_TN_FILTERS: TnFilters = { status: 'all', category: 'all' }

function DomainFilterButton({ count }: { count: number }) {
  return (open: boolean) => (
    <button
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
      style={{ border: `1.5px solid ${open || count ? '#4F46E5' : '#E2E8F0'}`, color: count ? '#4F46E5' : '#475569', background: count ? '#EEF2FF' : 'white' }}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 3.5h12M4 8h8M6 12.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Filtros
      {count > 0 && (
        <span className="ml-0.5 px-1.5 rounded-full text-white" style={{ fontSize: '9px', fontWeight: 700, background: '#4F46E5' }}>
          {count}
        </span>
      )}
    </button>
  )
}

// ─── Column manager (por dominio) ────────────────────────────────────────────

function ListingColumnManager({
  allCols,
  cols,
  setCols,
  defaultCols,
}: {
  allCols: ListingCol[]
  cols: string[]
  setCols: (c: string[]) => void
  defaultCols: string[]
}) {
  const [dragKey, setDragKey] = useState<string | null>(null)
  const map = Object.fromEntries(allCols.map((c) => [c.key, c])) as Record<string, ListingCol>
  const hidden = allCols.filter((c) => !cols.includes(c.key))

  const reorder = (target: string) => {
    if (!dragKey || dragKey === target) return
    const next = [...cols]
    next.splice(next.indexOf(dragKey), 1)
    next.splice(next.indexOf(target), 0, dragKey)
    setCols(next)
  }

  return (
    <Popover
      width={272}
      trigger={(open) => (
        <button
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
          style={{ border: `1.5px solid ${open ? '#4F46E5' : '#E2E8F0'}`, color: '#475569', background: 'white' }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M7 2.5v11M11 2.5v11" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          Columnas
        </button>
      )}
    >
      {() => (
        <div className="flex flex-col p-3 gap-3 max-h-[70vh] overflow-y-auto scroll-slim">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">Columnas visibles</span>
            <button onClick={() => setCols(defaultCols)} className="text-xs font-medium transition-colors hover:underline" style={{ color: '#4F46E5' }}>
              Restablecer
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            {cols.map((k) => {
              const c = map[k]
              if (!c) return null
              return (
                <div
                  key={k}
                  draggable={!c.locked}
                  onDragStart={() => setDragKey(k)}
                  onDragEnd={() => setDragKey(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => reorder(k)}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors"
                  style={{ background: dragKey === k ? '#EEF2FF' : 'transparent', cursor: c.locked ? 'default' : 'grab' }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: c.locked ? '#E2E8F0' : '#CBD5E1', flexShrink: 0 }} aria-hidden>
                    <circle cx="4" cy="3" r="1" fill="currentColor" /><circle cx="8" cy="3" r="1" fill="currentColor" />
                    <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="8" cy="6" r="1" fill="currentColor" />
                    <circle cx="4" cy="9" r="1" fill="currentColor" /><circle cx="8" cy="9" r="1" fill="currentColor" />
                  </svg>
                  <span className="flex-1 text-xs text-ink">{c.label}</span>
                  {c.locked ? (
                    <span style={{ fontSize: '9px', color: '#CBD5E1' }}>Fijo</span>
                  ) : (
                    <button
                      onClick={() => setCols(cols.filter((x) => x !== k))}
                      className="flex-shrink-0 p-1 rounded-md transition-colors hover:bg-slate-100"
                      style={{ color: '#94A3B8' }}
                      title="Ocultar"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3" />
                        <circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {hidden.length > 0 && (
            <>
              <div className="h-px" style={{ background: '#F1F5F9' }} />
              <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>
                Ocultas
              </span>
              <div className="flex flex-col gap-0.5">
                {hidden.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setCols([...cols, c.key])}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-slate-50 text-left"
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: '#4F46E5', flexShrink: 0 }} aria-hidden>
                      <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <span className="flex-1 text-xs text-subtle">{c.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Popover>
  )
}

// ─── Summary strip ───────────────────────────────────────────────────────────

const ICON_LIST = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="2" y="2" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.4" /><path d="M5 8h6M5 5.5h6M5 10.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
)
const ICON_CHECK = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" /><path d="M5.5 8l1.7 1.7L10.5 6.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const ICON_PAUSE = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" /><path d="M6.5 6v4M9.5 6v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
)
const ICON_PERF = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2 13h12M4.5 11V7M8 11V4M11.5 11V8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
)

type Stat = { label: string; value: ReactNode; sub?: string; tone: string; icon: ReactNode }

function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="flex items-stretch rounded-2xl bg-white flex-shrink-0 overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
      {stats.map((s, i) => (
        <div key={s.label} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3" style={{ borderLeft: i === 0 ? 'none' : '1px solid #F1F5F9' }}>
          <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ color: s.tone, background: `${s.tone}14` }}>
            {s.icon}
          </span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold tabular-nums text-ink">{s.value}</span>
              {s.sub && <span style={{ fontSize: '10px', color: '#94A3B8' }}>{s.sub}</span>}
            </div>
            <span className="text-xs text-subtle">{s.label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function domainStats(summary: ListingSummary, platform: Platform): Stat[] {
  const avgPerf = summary.avg_perf
  const perfTone = avgPerf === null ? '#94A3B8' : avgPerf >= 80 ? '#16A34A' : avgPerf >= 50 ? '#D97706' : '#DC2626'
  const stats: Stat[] = [
    { label: 'Publicaciones', value: summary.listed, sub: 'total', tone: platform === 'ml' ? '#F59E0B' : '#4F46E5', icon: ICON_LIST },
    { label: 'Publicadas', value: summary.published, sub: 'activas', tone: '#16A34A', icon: ICON_CHECK },
    { label: 'Pausadas', value: summary.paused, tone: '#D97706', icon: ICON_PAUSE },
  ]
  if (platform === 'ml') {
    stats.push({
      label: 'Performance prom.',
      value: avgPerf === null ? '—' : avgPerf,
      sub: avgPerf === null ? undefined : scoreLevel(avgPerf),
      tone: perfTone,
      icon: ICON_PERF,
    })
  }
  return stats
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function ChannelListingsPage({ platform }: { platform: Platform }) {
  const isML = platform === 'ml'
  const label = isML ? 'MercadoLibre' : 'Tienda Nube'

  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [mlFilters, setMlFilters] = useState<MlFilters>(DEFAULT_ML_FILTERS)
  const [tnFilters, setTnFilters] = useState<TnFilters>(DEFAULT_TN_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [summary, setSummary] = useState<ListingSummary>({ listed: 0, published: 0, paused: 0, avg_perf: null })
  const [items, setItems] = useState<(MLListingRow | TNListingRow)[]>([])
  // Edición por fila (Figma): lápiz por fila, Enter guarda / Esc cancela.
  const [editRow, setEditRow] = useState<number | null>(null)
  const [saveTick, setSaveTick] = useState(0)
  const [cancelTick, setCancelTick] = useState(0)
  const saveRow = () => {
    setSaveTick((t) => t + 1)
    setTimeout(() => setEditRow(null), 900)
  }
  const cancelRow = () => {
    setCancelTick((t) => t + 1)
    setEditRow(null)
  }
  const startRow = (id: number) => {
    if (editRow != null && editRow !== id) {
      setSaveTick((t) => t + 1)
      setTimeout(() => setEditRow(id), 0)
    } else setEditRow(id)
  }
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawerProduct, setDrawerProduct] = useState<Product | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  // La selección se limpia al cambiar de página o de canal (Figma v184).
  useEffect(() => {
    setSelected(new Set())
  }, [page, platform])
  const reorderCols = (target: string) => {
    if (!dragKey || dragKey === target) return
    const next = [...cols]
    next.splice(next.indexOf(dragKey), 1)
    next.splice(next.indexOf(target), 0, dragKey)
    setCols(next)
  }
  const [refreshKey, setRefreshKey] = useState(0)

  const [cols, setColsState] = useState<string[]>(() => (isML ? mlColStore.load() : tnColStore.load()))
  const setCols = useCallback(
    (c: string[]) => {
      setColsState(c)
      if (isML) mlColStore.save(c)
      else tnColStore.save(c)
    },
    [isML],
  )

  useEffect(() => {
    setColsState(isML ? mlColStore.load() : tnColStore.load())
  }, [isML])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const filters = isML ? mlFilters : tnFilters
  const activeCount = Object.values(filters).filter((v) => v !== 'all').length

  useEffect(() => {
    setPage(1)
  }, [debouncedQ, platform, mlFilters, tnFilters])

  const requestId = { current: 0 }
  useEffect(() => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    const params: ListingQuery = {
      q: debouncedQ,
      status: filters.status !== 'all' ? (filters.status as ListingQuery['status']) : '',
      category: filters.category !== 'all' ? filters.category : '',
      page,
      page_size: pageSize,
    }
    if (isML) params.perf = mlFilters.perf !== 'all' ? (mlFilters.perf as ListingQuery['perf']) : ''
    const call = isML ? channelsApi.mlListings(params) : channelsApi.tnListings(params)
    call
      .then((res) => {
        if (requestId.current === id) {
          setItems(res.items as (MLListingRow | TNListingRow)[])
          setTotal(res.total)
          setPages(res.pages)
          setSummary(res.summary)
        }
      })
      .catch((err: Error) => {
        if (requestId.current === id) setError(err.message)
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, platform, mlFilters, tnFilters, page, pageSize, refreshKey])

  const allCols = isML ? ML_LISTING_COLS : TN_LISTING_COLS
  const colMap = isML ? ML_COL_MAP : TN_COL_MAP
  const defs = cols.map((k) => colMap[k]).filter(Boolean)

  const allChecked = items.length > 0 && items.every((p) => selected.has(p.id))
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allChecked) items.forEach((p) => next.delete(p.id))
      else items.forEach((p) => next.add(p.id))
      return next
    })
  }
  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const openProduct = (p: MLListingRow | TNListingRow) => {
    setDrawerProduct({
      id: p.id,
      internal_code: p.internal_code,
      sku: p.sku,
      name: p.name,
      name_edited: p.name_edited,
      brand: null,
      category: p.category,
      stock: p.stock,
      cost: p.cost,
      price: p.price,
      updated_at: p.updated_at,
      ml_status: isML ? p.status : ('unpublished' as ChannelStatus),
      tn_status: isML ? ('unpublished' as ChannelStatus) : p.status,
      image_url: p.image_url,
      ml_price: isML ? p.listing_price : null,
      tn_price: isML ? null : p.listing_price,
    })
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="flex items-center gap-3 px-6 py-3 flex-shrink-0 bg-white" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar producto…"
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none transition-all text-ink placeholder:text-faint"
            style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0' }}
            onFocus={(e) => {
              e.target.style.borderColor = '#4F46E5'
              e.target.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.08)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#E2E8F0'
              e.target.style.boxShadow = 'none'
            }}
          />
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col p-5 min-h-0 gap-3">
        <div className="flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-base font-bold text-ink">{label}</h1>
            <span className="text-xs font-medium text-muted">
              {total} {total === 1 ? 'publicación' : 'publicaciones'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Popover
              width={280}
              trigger={DomainFilterButton({ count: activeCount })}
            >
              {() => (
                <div className="flex flex-col gap-3 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">Filtros · {label}</span>
                    {activeCount > 0 && (
                      <button
                        onClick={() => (isML ? setMlFilters(DEFAULT_ML_FILTERS) : setTnFilters(DEFAULT_TN_FILTERS))}
                        className="text-xs font-medium transition-colors hover:underline"
                        style={{ color: '#4F46E5' }}
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                  <FilterField
                    label="Estado"
                    value={filters.status}
                    onChange={(v) => (isML ? setMlFilters({ ...mlFilters, status: v }) : setTnFilters({ ...tnFilters, status: v }))}
                    options={LISTING_STATUS_FILTER}
                  />
                  {isML && (
                    <FilterField
                      label="Performance"
                      value={mlFilters.perf}
                      onChange={(v) => setMlFilters({ ...mlFilters, perf: v })}
                      options={PERF_FILTER}
                    />
                  )}
                  <FilterField
                    label="Categoría"
                    value={filters.category}
                    onChange={(v) => (isML ? setMlFilters({ ...mlFilters, category: v }) : setTnFilters({ ...tnFilters, category: v }))}
                    options={[
                      { value: 'all', label: 'Todas' },
                      ...Array.from(new Set(items.map((p) => p.category).filter(Boolean)))
                        .sort()
                        .map((c) => ({ value: c as string, label: c as string })),
                    ]}
                  />
                </div>
              )}
            </Popover>
            <ListingColumnManager
              allCols={allCols}
              cols={cols}
              setCols={setCols}
              defaultCols={isML ? ML_DEFAULT_COLS : TN_DEFAULT_COLS}
            />
            <CsvExportButton
              columns={allCols.map((c) => ({ key: c.key, label: c.label }))}
              label={isML ? 'Publicaciones · MercadoLibre' : 'Publicaciones · Tienda Nube'}
              filenameBase={isML ? 'publicaciones-ml' : 'publicaciones-tn'}
              rowsTotal={total}
              onExport={(colsKeys, limit) => {
                const base = {
                  columns: colsKeys.join(','),
                  limit,
                  q: debouncedQ,
                  status: filters.status !== 'all' ? (filters.status as ListingQuery['status']) : '',
                  category: filters.category !== 'all' ? filters.category : '',
                }
                if (isML) {
                  return channelsApi.mlExportCsv({
                    ...base,
                    perf: mlFilters.perf !== 'all' ? (mlFilters.perf as ListingQuery['perf']) : '',
                  })
                }
                return channelsApi.tnExportCsv(base)
              }}
            />
          </div>
        </div>

        <StatStrip stats={domainStats(summary, platform)} />

        {error ? (
          <div className="max-w-xl">
            <ErrorBox message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
          </div>
        ) : (
          <RowEditContext.Provider value={{ active: editRow, saveTick, cancelTick }}>
          <div className="flex-1 overflow-auto rounded-2xl bg-white scroll-slim" style={{ border: '1px solid #E2E8F0' }}>
            <table className="w-full text-xs border-collapse" style={{ minWidth: '680px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr className="bg-white" style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <th className="w-10 px-4 py-3">
                    <SelectBox
                      checked={allChecked}
                      indeterminate={selected.size > 0 && !allChecked}
                      onChange={toggleAll}
                    />
                  </th>
                  {defs.map((c) => (
                    <th
                      key={c.key}
                      className="px-2 py-3 font-semibold tracking-wider select-none"
                      draggable={!c.locked}
                      onDragStart={() => setDragKey(c.key)}
                      onDragEnd={() => {
                        setDragKey(null)
                        setOverKey(null)
                      }}
                      onDragOver={(e) => {
                        if (dragKey && !c.locked) {
                          e.preventDefault()
                          setOverKey(c.key)
                        }
                      }}
                      onDragLeave={() => setOverKey((k) => (k === c.key ? null : k))}
                      onDrop={() => {
                        reorderCols(c.key)
                        setOverKey(null)
                      }}
                      style={{
                        color: '#94A3B8', fontSize: '10px', letterSpacing: '0.07em',
                        textAlign: 'left',
                        cursor: c.locked ? 'default' : 'grab',
                        opacity: dragKey === c.key ? 0.4 : 1,
                        boxShadow: overKey === c.key && dragKey !== c.key ? 'inset 2px 0 0 #4F46E5' : 'none',
                        background: overKey === c.key && dragKey !== c.key ? '#EEF2FF' : 'transparent',
                        transition: 'background 0.12s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span className="inline-flex items-center gap-1" style={{ justifyContent: 'flex-start' }}>
                        {c.label}
                        {c.editable && (
                          <span className="flex-shrink-0" style={{ color: '#4F46E5' }} title="Columna editable">
                            <PencilIcon size={10} />
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                  {/* Columna comodín: absorbe el ancho sobrante */}
                  <th style={{ width: '100%' }} />
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={defs.length + 2}>
                      <SpinnerText />
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={defs.length + 2} className="px-4 py-16 text-center text-muted">
                      No hay publicaciones de {label} que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  items.map((p) => (
                    <tr
                      key={p.id}
                      className="group cursor-pointer transition-colors hover:bg-slate-50"
                      style={{ borderBottom: '1px solid #F8FAFC' }}
                      onClick={() => {
                        if (editRow === p.id) return
                        openProduct(p)
                      }}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <SelectBox checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} />
                      </td>
                      {defs.map((c) => (
                        <td key={c.key} className="px-2 py-3" style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                          {c.render(p, {
                            onSaved: (updated) =>
                              setItems((prev) =>
                                prev.map((i) => (i.id === updated.id ? updated : i)),
                              ),
                          })}
                        </td>
                      ))}
                      <td className="pl-2 pr-4 py-3" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <RowEditAction editing={editRow === p.id} onStart={() => startRow(p.id)} onSave={saveRow} onCancel={cancelRow} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          </RowEditContext.Provider>
        )}
      </div>

      <div className="flex items-center justify-between px-6 py-3 flex-shrink-0 bg-white" style={{ borderTop: '1px solid #E2E8F0' }}>
        <span className="text-xs text-muted">
          {total.toLocaleString('es-AR')} resultados · Click en una publicación para ver detalles
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">Mostrar</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(1)
            }}
            className="text-xs px-2 py-1 rounded-lg outline-none"
            style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#475569' }}
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
          <span className="text-xs font-medium text-subtle tabular">
            {from} – {to}
          </span>
          {['‹', '›'].map((ch, i) => {
            const isPrev = i === 0
            const disabled = isPrev ? page <= 1 : page >= pages
            return (
              <button
                key={ch}
                disabled={disabled}
                onClick={() => setPage((p) => (isPrev ? Math.max(1, p - 1) : Math.min(pages, p + 1)))}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-sm disabled:opacity-40"
                style={{ color: '#94A3B8', border: '1px solid #E2E8F0' }}
              >
                {ch}
              </button>
            )
          })}
        </div>
      </div>

      {drawerProduct && (
        <ProductDrawer
          product={drawerProduct}
          initialTab={platform === 'ml' ? 'ml' : 'tn'}
          onClose={() => setDrawerProduct(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}

      <MassActionsBar selectedIds={[...selected]} onClear={() => setSelected(new Set())} />
    </div>
  )
}
