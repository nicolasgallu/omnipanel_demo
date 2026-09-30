// Inventario: modelo de columnas + popover de Filtros y gestor de Columnas
// (Figma: columnas configurables con drag, persistidas en localStorage).

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Product } from '../../lib/api/types'
import { inventoryApi } from '../../lib/api/endpoints'
import { EditableCell } from './rowEdit'
import { fmtMoney } from '../../lib/format'
import { ProductImage } from '../../components/ui'
import { StatusBadge } from '../../components/StatusBadge'

export type ColKey =
  | 'producto'
  | 'internal_code'
  | 'sku'
  | 'gtin'
  | 'brand'
  | 'model'
  | 'category'
  | 'name_edited'
  | 'stock'
  | 'cost'
  | 'price'
  | 'ml_price'
  | 'tn_price'
  | 'ml_price_manual'
  | 'ml_price_updated'
  | 'tn_price_manual'
  | 'tn_price_updated'
  | 'dimensions'
  | 'created_at'
  | 'updated_at'
  | 'ml_status'
  | 'tn_status'

export type CellCtx = { onSaved: (updated: Product) => void }

export type ColDef = {
  key: ColKey
  label: string
  locked?: boolean
  editable?: boolean
  render: (p: Product, ctx?: CellCtx) => ReactNode
}

export const COLUMNS: ColDef[] = [
  {
    key: 'producto',
    label: 'Producto',
    locked: true,
    render: (p) => (
      <div className="flex items-center gap-2.5">
        <ProductImage url={p.image_url} size={32} />
        <span className="font-medium text-ink truncate" style={{ maxWidth: 240 }}>
          {p.name_edited || p.name}
        </span>
      </div>
    ),
  },
  { key: 'internal_code', label: 'Código interno', render: (p) => <span className="text-subtle">{p.internal_code}</span> },
  { key: 'sku', label: 'SKU', render: (p) => <span className="font-mono text-subtle">{p.sku || '—'}</span> },
  { key: 'gtin', label: 'GTIN', render: (p) => <span className="font-mono text-muted">{p.gtin || '—'}</span> },
  {
    key: 'brand',
    label: 'Marca',
    editable: true,
    render: (p, ctx) => (
      <EditableCell
        rowId={p.id}
        value={p.brand ?? ''}
        onSave={async (v) => {
          const res = await inventoryApi.patch(p.id, { brand: v })
          ctx?.onSaved(res.product)
        }}
      />
    ),
  },
  {
    key: 'model',
    label: 'Modelo',
    editable: true,
    render: (p, ctx) => (
      <EditableCell
        rowId={p.id}
        value={p.model ?? ''}
        onSave={async (v) => {
          const res = await inventoryApi.patch(p.id, { model: v })
          ctx?.onSaved(res.product)
        }}
      />
    ),
  },
  {
    key: 'category',
    label: 'Categoría',
    render: (p) => (
      <span className="px-2 py-0.5 rounded-md text-xs" style={{ background: '#F1F5F9', color: '#94A3B8' }}>
        {p.category || '—'}
      </span>
    ),
  },
  {
    key: 'name_edited',
    label: 'Nombre editado',
    render: (p) => <span className="text-subtle">{p.name_edited || '—'}</span>,
  },
  {
    key: 'stock',
    label: 'Stock',
    render: (p) => (
      <span className="tabular-nums" style={{ color: '#0A1628' }}>
        {p.stock}
      </span>
    ),
  },
  { key: 'cost', label: 'Costo', render: (p) => <span className="tabular text-subtle">{fmtMoney(p.cost)}</span> },
  {
    key: 'price',
    label: 'Precio',
    render: (p) => <span className="tabular font-semibold text-ink whitespace-nowrap">{fmtMoney(p.price)}</span>,
  },
  {
    key: 'ml_price',
    label: 'Precio ML',
    render: (p) => (
      <span className="tabular whitespace-nowrap" style={{ color: p.ml_price ? '#475569' : '#CBD5E1' }}>
        {p.ml_price ? fmtMoney(p.ml_price) : '—'}
      </span>
    ),
  },
  {
    key: 'tn_price',
    label: 'Precio TN',
    render: (p) => (
      <span className="tabular whitespace-nowrap" style={{ color: p.tn_price ? '#475569' : '#CBD5E1' }}>
        {p.tn_price ? fmtMoney(p.tn_price) : '—'}
      </span>
    ),
  },
  {
    key: 'ml_price_manual',
    label: 'Precio manual ML',
    render: (p) =>
      p.ml_price == null ? (
        <span className="text-faint">—</span>
      ) : (
        <span className="rounded-full px-1.5 py-px whitespace-nowrap" style={{ fontSize: '10px', fontWeight: 700, color: p.ml_price_manual ? '#D97706' : '#64748B', background: p.ml_price_manual ? '#FFFBEB' : '#F1F5F9' }}>
          {p.ml_price_manual ? 'Manual' : 'Auto'}
        </span>
      ),
  },
  {
    key: 'ml_price_updated',
    label: 'Precio actualizado ML',
    render: (p) => <span className="text-muted whitespace-nowrap">{p.ml_price_updated || '—'}</span>,
  },
  {
    key: 'tn_price_manual',
    label: 'Precio manual TN',
    render: (p) =>
      p.tn_price == null ? (
        <span className="text-faint">—</span>
      ) : (
        <span className="rounded-full px-1.5 py-px whitespace-nowrap" style={{ fontSize: '10px', fontWeight: 700, color: p.tn_price_manual ? '#D97706' : '#64748B', background: p.tn_price_manual ? '#FFFBEB' : '#F1F5F9' }}>
          {p.tn_price_manual ? 'Manual' : 'Auto'}
        </span>
      ),
  },
  {
    key: 'tn_price_updated',
    label: 'Precio actualizado TN',
    render: (p) => <span className="text-muted whitespace-nowrap">{p.tn_price_updated || '—'}</span>,
  },
  { key: 'dimensions', label: 'Dimensiones', render: (p) => <span className="text-subtle">{p.dimensions || '—'}</span> },
  { key: 'created_at', label: 'Creado', render: (p) => <span className="text-muted">{p.created_at || '—'}</span> },
  { key: 'updated_at', label: 'Actualizado', render: (p) => <span className="text-muted">{p.updated_at}</span> },
  { key: 'ml_status', label: 'MercadoLibre', render: (p) => <StatusBadge status={p.ml_status} variant="chip" /> },
  { key: 'tn_status', label: 'Tienda Nube', render: (p) => <StatusBadge status={p.tn_status} variant="chip" /> },
]

export const COL_MAP = Object.fromEntries(COLUMNS.map((c) => [c.key, c])) as Record<ColKey, ColDef>
export const DEFAULT_COLS: ColKey[] = ['producto', 'category', 'stock', 'cost', 'price', 'ml_status', 'tn_status']

const COLS_KEY = 'omnipanel.inventory.cols'
export const loadCols = (): ColKey[] => {
  try {
    const arr = JSON.parse(localStorage.getItem(COLS_KEY) || 'null') as ColKey[] | null
    if (Array.isArray(arr)) {
      const valid = arr.filter((k) => COL_MAP[k])
      if (valid.includes('producto') && valid.length) return valid
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_COLS
}
export const saveCols = (c: ColKey[]) => {
  try {
    localStorage.setItem(COLS_KEY, JSON.stringify(c))
  } catch {
    /* ignore */
  }
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

export interface InventoryFilters {
  category: string
  ml: string
  tn: string
  stock: string
}
export const DEFAULT_FILTERS: InventoryFilters = { category: 'all', ml: 'all', tn: 'all', stock: 'all' }

export const STATUS_FILTER = [
  { value: 'all', label: 'Todos' },
  { value: 'published', label: 'Publicado' },
  { value: 'paused', label: 'Pausado' },
  { value: 'prepublished', label: 'Pre-publicado' },
  { value: 'under_review', label: 'En revisión' },
  { value: 'unpublished', label: 'Sin publicar' },
  { value: 'failed', label: 'Con error' },
]

export const activeFilterCount = (f: InventoryFilters) =>
  Object.values(f).filter((v) => v !== 'all').length

// ─── Popover ─────────────────────────────────────────────────────────────────

export function Popover({
  trigger,
  width = 260,
  children,
}: {
  trigger: (open: boolean) => ReactNode
  width?: number
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-2 z-30 rounded-xl bg-white"
            style={{ width, border: '1px solid #E2E8F0', boxShadow: '0 12px 32px rgba(15,23,42,0.12)', animation: 'fadeUp 0.15s ease both' }}
          >
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  )
}

export function FilterField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>
        {label}
      </span>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-all"
          style={{ background: open ? '#EEF2FF' : '#F8FAFC', border: `1px solid ${open ? '#C7D2FE' : '#E2E8F0'}` }}
        >
          <span className="text-xs font-medium truncate text-ink">{current?.label}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: '#94A3B8', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} aria-hidden>
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
            <div
              className="absolute left-0 right-0 mt-1 z-50 rounded-xl p-1.5 flex flex-col gap-0.5 max-h-56 overflow-y-auto scroll-slim"
              style={{ background: 'white', border: '1px solid #E2E8F0', boxShadow: '0 8px 24px rgba(15,23,42,0.14)' }}
            >
              {options.map((o) => (
                <button
                  key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false) }}
                  className="flex items-center justify-between gap-2 text-left px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-slate-50"
                  style={{ color: o.value === value ? '#4F46E5' : '#0A1628', fontWeight: o.value === value ? 600 : 400 }}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && (
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }} aria-hidden>
                      <path d="M2.5 7.5l3 3 6-7" stroke="#4F46E5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function FilterPanel({
  filters,
  setFilters,
  categories,
}: {
  filters: InventoryFilters
  setFilters: (f: InventoryFilters) => void
  categories: string[]
}) {
  const set = <K extends keyof InventoryFilters>(k: K, v: string) => setFilters({ ...filters, [k]: v })
  const count = activeFilterCount(filters)
  return (
    <Popover
      width={280}
      trigger={(open) => (
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
      )}
    >
      {() => (
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">Filtros</span>
            {count > 0 && (
              <button onClick={() => setFilters(DEFAULT_FILTERS)} className="text-xs font-medium transition-colors hover:underline" style={{ color: '#4F46E5' }}>
                Limpiar
              </button>
            )}
          </div>
          <FilterField
            label="Categoría"
            value={filters.category}
            onChange={(v) => set('category', v)}
            options={[{ value: 'all', label: 'Todas' }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
          <FilterField
            label="Stock"
            value={filters.stock}
            onChange={(v) => set('stock', v)}
            options={[{ value: 'all', label: 'Todos' }, { value: 'in', label: 'Con stock' }, { value: 'out', label: 'Sin stock' }]}
          />
          <FilterField label="Estado en MercadoLibre" value={filters.ml} onChange={(v) => set('ml', v)} options={STATUS_FILTER} />
          <FilterField label="Estado en Tienda Nube" value={filters.tn} onChange={(v) => set('tn', v)} options={STATUS_FILTER} />
        </div>
      )}
    </Popover>
  )
}

// ─── Column manager ──────────────────────────────────────────────────────────

export function ColumnManager({ cols, setCols }: { cols: ColKey[]; setCols: (c: ColKey[]) => void }) {
  const [dragKey, setDragKey] = useState<ColKey | null>(null)
  const hidden = COLUMNS.filter((c) => !cols.includes(c.key))

  const reorder = (target: ColKey) => {
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
            <button onClick={() => setCols(DEFAULT_COLS)} className="text-xs font-medium transition-colors hover:underline" style={{ color: '#4F46E5' }}>
              Restablecer
            </button>
          </div>

          <div className="flex flex-col gap-0.5">
            {cols.map((k) => {
              const c = COL_MAP[k]
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
