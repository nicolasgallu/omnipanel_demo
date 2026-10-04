// Envíos (Figma 04/10): pantalla ÚNICA MercadoLibre + Tienda Nube, sin
// pestañas por plataforma. Buscador + filtros (Canal / Estado) + strip de
// métricas + tabla unificada con badge de canal + paginación.
// Datos: GET /api/shipments (shipmentsApi.list).

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { channelsApi, shipmentsApi } from '../lib/api/endpoints'
import type { Shipment, ShipmentChannel, ShipmentRowStatus, ShipmentStatusGroup, ShipmentsResponse } from '../lib/api/types'
import { SpinnerText } from '../components/ui'
import { StatStrip, Stat, ICON_LIST, ICON_CLOCK, ICON_BOX, ICON_CHECK, ICON_X } from '../components/StatStrip'
import { FilterField, Popover } from '../features/inventory/inventoryColumns'
import { ChannelBadge } from '../components/ChannelBadge'

// ─── estado por fila (chip) ──────────────────────────────────────────────────

const SHIP_STATUS: Record<ShipmentRowStatus, { label: string; color: string; bg: string; icon: ReactNode }> = {
  pending: {
    label: 'Pendiente', color: '#64748B', bg: '#F1F5F9',
    icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" /><path d="M6 3.6V6l1.7 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  },
  handling: {
    label: 'En preparación', color: '#D97706', bg: '#FEF3C7',
    icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1.5l4 2v5l-4 2-4-2v-5l4-2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M2 3.5l4 2 4-2M6 5.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>,
  },
  ready_to_ship: {
    label: 'Listo para enviar', color: '#4F46E5', bg: '#EEF2FF',
    icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2.5h4l4 4-4 4-4-4v-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><circle cx="4" cy="4" r="0.7" fill="currentColor" /></svg>,
  },
  shipped: {
    label: 'En camino', color: '#0891B2', bg: '#CFFAFE',
    icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 3h6v5H1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M7 4.5h2l1.5 1.5V8H7" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><circle cx="3.5" cy="9" r="0.9" stroke="currentColor" strokeWidth="1" /><circle cx="8.5" cy="9" r="0.9" stroke="currentColor" strokeWidth="1" /></svg>,
  },
  delivered: {
    label: 'Entregado', color: '#16A34A', bg: '#DCFCE7',
    icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" /><path d="M4 6l1.4 1.4L8.2 4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  },
  not_delivered: {
    label: 'No entregado', color: '#DC2626', bg: '#FEE2E2',
    icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1.6l4.6 8H1.4l4.6-8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M6 5v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><circle cx="6" cy="8.4" r="0.5" fill="currentColor" /></svg>,
  },
  cancelled: {
    label: 'Cancelado', color: '#94A3B8', bg: '#F1F5F9',
    icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" /><path d="M3.2 3.2l5.6 5.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  },
}
const shipStatus = (s: string) => SHIP_STATUS[s as ShipmentRowStatus] ?? { ...SHIP_STATUS.pending, label: s || '—' }

const SUBSTATUS_LABEL: Record<string, string> = {
  ready_to_print: 'Por imprimir',
  printed: 'Etiqueta impresa',
  in_hub: 'En centro de distribución',
  in_packing_list: 'En lista de empaque',
  manufacturing: 'En fabricación',
  picked_up: 'Retirado',
  out_for_delivery: 'En reparto',
  delivery_failed: 'Entrega fallida',
  returning_to_sender: 'En devolución',
}
const subLabel = (s: string | null) => (s ? SUBSTATUS_LABEL[s] ?? s.replace(/_/g, ' ') : null)

const LOGISTIC_LABEL: Record<string, string> = {
  cross_docking: 'Cross docking',
  drop_off: 'Punto de despacho',
  fulfillment: 'Full',
  self_service: 'Flex',
  xd_drop_off: 'Cross docking',
}
const logLabel = (s: string | null) => (s ? LOGISTIC_LABEL[s] ?? s.replace(/_/g, ' ') : '')

function ShipStatusChip({ s }: { s: Shipment }) {
  const m = shipStatus(s.status)
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ color: m.color, background: m.bg }}>
        {m.icon}
      </span>
      <span className="text-xs font-medium" style={{ color: '#334155' }}>{m.label}</span>
    </span>
  )
}

// ─── acciones: etiqueta ML (PDF) y tracking TN ───────────────────────────────

type LabelState = { kind: 'enabled'; reprint: boolean } | { kind: 'disabled'; reason: string } | { kind: 'hidden' }

function labelState(status: ShipmentRowStatus): LabelState {
  switch (status) {
    case 'ready_to_ship':
      return { kind: 'enabled', reprint: false }
    case 'shipped':
      return { kind: 'enabled', reprint: true }
    case 'pending':
    case 'handling':
      return { kind: 'disabled', reason: 'La etiqueta se habilita cuando Meli procesa el pago' }
    case 'delivered':
      return { kind: 'disabled', reason: 'Entregado — no se puede reimprimir' }
    default:
      return { kind: 'hidden' }
  }
}

function LabelButton({ s, busy, onDownload }: { s: Shipment; busy: boolean; onDownload: () => void }) {
  const st = labelState(s.status)
  if (st.kind === 'hidden') return <span style={{ color: '#CBD5E1' }}>—</span>
  const disabled = st.kind === 'disabled'
  const primary = st.kind === 'enabled' && !st.reprint
  return (
    <span className="relative inline-flex group">
      <button
        onClick={onDownload}
        disabled={disabled || busy}
        aria-label={`Descargar etiqueta del envío ${s.external_id}`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors"
        style={disabled
          ? { color: '#CBD5E1', background: '#F8FAFC', border: '1px solid #F1F5F9', cursor: 'not-allowed' }
          : primary
            ? { color: 'white', background: busy ? '#818CF8' : '#4F46E5', border: '1px solid #4F46E5', cursor: busy ? 'wait' : 'pointer' }
            : { color: '#4F46E5', background: 'white', border: '1px solid #C7D2FE', cursor: busy ? 'wait' : 'pointer' }}
      >
        {busy
          ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="animate-spin"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" /><path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 1.5h4l2.5 2.5v6.5H3z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /><path d="M6 5v3.5M4.6 7.1 6 8.5l1.4-1.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        {busy ? 'Descargando…' : st.kind === 'enabled' && st.reprint ? 'Reimprimir' : 'Etiqueta'}
      </button>
      {disabled && (
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 bottom-full mb-2 w-52 rounded-lg px-2.5 py-2 text-[11px] leading-snug opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: '#0A1628', color: 'white', zIndex: 20, boxShadow: '0 6px 20px rgba(10,22,40,0.18)' }}
        >
          {st.reason}
        </span>
      )}
    </span>
  )
}

function ActionCell({ s, busy, onDownload }: { s: Shipment; busy: boolean; onDownload: () => void }) {
  if (s.channel === 'ml') return <LabelButton s={s} busy={busy} onDownload={onDownload} />
  if (s.tracking_url) {
    return (
      <a
        href={s.tracking_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors hover:brightness-95"
        style={{ color: '#4F46E5', background: 'white', border: '1px solid #C7D2FE' }}
      >
        Ver tracking ↗
      </a>
    )
  }
  return <span style={{ color: '#CBD5E1' }}>—</span>
}

// ─── formato de fecha ─────────────────────────────────────────────────────────

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtShipDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()} ${MES[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─── celdas ───────────────────────────────────────────────────────────────────

function ShipCell({ s }: { s: Shipment }) {
  if (s.channel === 'ml') {
    return (
      <div className="flex flex-col gap-1 items-start">
        <div className="font-semibold tabular-nums text-ink">{s.external_id}</div>
        {s.order_id && <div style={{ fontSize: '10px', color: '#94A3B8' }}>Orden #{s.order_id}</div>}
        <ChannelBadge channel={s.channel} />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1 items-start">
      <div className="font-semibold tabular-nums text-ink">#{s.external_id}</div>
      <ChannelBadge channel={s.channel} />
    </div>
  )
}

function MethodCell({ s }: { s: Shipment }) {
  if (s.channel === 'ml') {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {s.mode && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase" style={{ color: '#F59E0B', background: '#FEF3C7' }}>
            {s.mode.toUpperCase()}
          </span>
        )}
        {logLabel(s.logistic_type) && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ color: '#475569', background: '#F1F5F9' }}>
            {logLabel(s.logistic_type)}
          </span>
        )}
      </span>
    )
  }
  return <span style={{ color: '#334155' }}>{s.shipping_method || '—'}</span>
}

function TrackingCell({ s }: { s: Shipment }) {
  if (!s.tracking_number) return <span style={{ color: '#CBD5E1' }}>—</span>
  if (s.tracking_url) {
    return (
      <a href={s.tracking_url} target="_blank" rel="noopener noreferrer" className="font-mono tabular-nums hover:underline" style={{ color: '#4F46E5' }}>
        {s.tracking_number} ↗
      </a>
    )
  }
  return <span className="font-mono tabular-nums" style={{ color: '#4F46E5' }}>{s.tracking_number}</span>
}

// ─── estados de pantalla ──────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
          {Array.from({ length: 8 }).map((_, j) => (
            <td key={j} className="px-3 py-3.5">
              <div className="h-3 rounded animate-pulse" style={{ background: '#F1F5F9', width: j === 3 ? '70%' : '55%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function TruckEmpty() {
  return (
    <svg width="120" height="84" viewBox="0 0 120 84" fill="none" aria-hidden>
      <rect x="16" y="20" width="60" height="36" rx="6" fill="#EEF2FF" />
      <path d="M76 34h14l10 10v12H76V34z" fill="#C7D2FE" />
      <circle cx="38" cy="60" r="9" fill="#E2E8F0" />
      <circle cx="88" cy="60" r="9" fill="#E2E8F0" />
      <circle cx="38" cy="60" r="4" fill="#94A3B8" />
      <circle cx="88" cy="60" r="4" fill="#94A3B8" />
      <path d="M30 34h32" stroke="#C7D2FE" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

// ─── página ───────────────────────────────────────────────────────────────────

const GROUP_OPTIONS: { value: ShipmentStatusGroup | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'to_prepare', label: 'Por preparar' },
  { value: 'in_transit', label: 'En camino' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'not_delivered', label: 'No entregado' },
  { value: 'cancelled', label: 'Cancelado' },
]

export function ShipmentsPage() {
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState<ShipmentChannel | 'all'>('all')
  const [statusGroup, setStatusGroup] = useState<ShipmentStatusGroup | 'all'>('all')
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(0)
  const [data, setData] = useState<ShipmentsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ tone: 'ok' | 'err'; message: string } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // Al cambiar búsqueda o filtros, la tabla vuelve a la página 1 (0-based).
  useEffect(() => {
    setPage(0)
  }, [search, channel, statusGroup, pageSize])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const t = setTimeout(() => {
      shipmentsApi
        .list({ channel, status_group: statusGroup, q: search, page, page_size: pageSize })
        .then((r) => {
          if (alive) setData(r)
        })
        .catch((e: Error) => {
          if (alive) setError(e.message || 'No pudimos cargar los envíos.')
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }, search ? 250 : 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [search, channel, statusGroup, page, pageSize, reload])

  const downloadLabel = async (s: Shipment) => {
    if (busyId) return
    setBusyId(s.id)
    setToast(null)
    try {
      const blob = await channelsApi.shipmentLabel(s.external_id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `etiqueta-${s.external_id}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setToast({ tone: 'ok', message: `Etiqueta del envío ${s.external_id} descargada.` })
    } catch (e) {
      setToast({ tone: 'err', message: e instanceof Error ? e.message : 'No se pudo descargar la etiqueta.' })
    } finally {
      setBusyId(null)
    }
  }

  const counts = data?.counts
  const stats: Stat[] = [
    { label: 'Envíos', value: counts?.total ?? '—', sub: 'total', tone: '#F59E0B', icon: ICON_LIST },
    { label: 'Por preparar', value: counts?.to_prepare ?? '—', tone: '#D97706', icon: ICON_CLOCK },
    { label: 'En camino', value: counts?.in_transit ?? '—', tone: '#0891B2', icon: ICON_BOX },
    { label: 'Entregados', value: counts?.delivered ?? '—', tone: '#16A34A', icon: ICON_CHECK },
    { label: 'Incidencias', value: counts?.incidents ?? '—', tone: '#DC2626', icon: ICON_X },
  ]

  const total = data?.total ?? 0
  const accountTotal = data?.account_total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const filterCount = (channel !== 'all' ? 1 : 0) + (statusGroup !== 'all' ? 1 : 0)
  const hasSearch = search.trim() !== ''
  const isFiltered = hasSearch || filterCount > 0
  const rows = data?.items ?? []
  const cols = ['Envío', 'Estado', 'Destino', 'Producto', 'Método', 'Tracking', 'Actualizado', 'Acciones']

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      <header className="flex items-center gap-3 px-6 py-3 flex-shrink-0 bg-white" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nº de envío, nº de orden, tracking, ciudad o producto…"
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none transition-all text-ink placeholder:text-faint"
            style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0' }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#4F46E5'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.08)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#E2E8F0'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col p-5 min-h-0 gap-3">
        <div className="flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-base font-bold text-ink">Envíos</h1>
            <span className="text-xs font-medium text-muted">
              {total} {total === 1 ? 'envío' : 'envíos'}
            </span>
          </div>
          <Popover
            width={280}
            trigger={(o) => (
              <button
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
                style={{
                  border: `1.5px solid ${o || filterCount ? '#4F46E5' : '#E2E8F0'}`,
                  color: filterCount ? '#4F46E5' : '#475569',
                  background: filterCount ? '#EEF2FF' : 'white',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M2 3.5h12M4 8h8M6 12.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Filtros
                {filterCount > 0 && (
                  <span className="ml-0.5 px-1.5 rounded-full text-white" style={{ fontSize: '9px', fontWeight: 700, background: '#4F46E5' }}>{filterCount}</span>
                )}
              </button>
            )}
          >
            {() => (
              <div className="flex flex-col gap-3 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink">Filtros</span>
                  {filterCount > 0 && (
                    <button
                      onClick={() => {
                        setChannel('all')
                        setStatusGroup('all')
                      }}
                      className="text-xs font-medium transition-colors hover:underline"
                      style={{ color: '#4F46E5' }}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <FilterField
                  label="Canal"
                  value={channel}
                  onChange={(v) => setChannel(v as ShipmentChannel | 'all')}
                  options={[
                    { value: 'all', label: 'Todos' },
                    { value: 'ml', label: 'MercadoLibre' },
                    { value: 'tn', label: 'Tienda Nube' },
                  ]}
                />
                <FilterField
                  label="Estado"
                  value={statusGroup}
                  onChange={(v) => setStatusGroup(v as ShipmentStatusGroup | 'all')}
                  options={GROUP_OPTIONS}
                />
              </div>
            )}
          </Popover>
        </div>

        <div className="overflow-x-auto flex-shrink-0">
          <div className="min-w-[720px]">
            <StatStrip stats={stats} />
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
          <div className="flex-1 overflow-auto scroll-slim bg-white min-h-0">
            {error ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
                <p className="text-sm font-semibold text-ink">No pudimos cargar los envíos</p>
                <p className="text-xs text-subtle">{error}</p>
                <button onClick={() => setReload((n) => n + 1)} className="mt-1 px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ border: '1px solid #E2E8F0', color: '#4F46E5' }}>
                  Reintentar
                </button>
              </div>
            ) : loading && !data ? (
              <div className="py-4">
                <SpinnerText text="Cargando envíos…" />
              </div>
            ) : !isFiltered && accountTotal === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
                <TruckEmpty />
                <p className="text-sm font-semibold text-ink">Todavía no hay envíos</p>
                <p className="text-xs text-subtle max-w-sm">
                  Cuando entres en una venta, sus envíos van a aparecer acá con el estado y el tracking de cada plataforma.
                </p>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-center px-6">
                <p className="text-sm font-medium text-muted">No hay envíos que coincidan con la búsqueda o los filtros.</p>
                <button
                  onClick={() => {
                    setSearch('')
                    setChannel('all')
                    setStatusGroup('all')
                  }}
                  className="text-xs font-semibold hover:underline"
                  style={{ color: '#4F46E5' }}
                >
                  Limpiar filtros
                </button>
              </div>
            ) : (
              <table className="w-full text-xs border-collapse" style={{ minWidth: 880, opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr className="bg-white" style={{ borderBottom: '1px solid #F1F5F9' }}>
                    {cols.map((c) => (
                      <th key={c} className="px-3 py-3 font-semibold bg-white text-left" style={{ color: '#94A3B8', fontSize: '10px', letterSpacing: '0.07em' }}>
                        {c.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && data ? (
                    <SkeletonRows />
                  ) : (
                    rows.map((s) => {
                      const first = s.items[0]
                      const totalQty = s.items.reduce((a, i) => a + i.quantity, 0)
                      const extra = first ? totalQty - first.quantity : 0
                      return (
                        <tr key={s.id} className="transition-colors hover:bg-slate-50" style={{ borderBottom: '1px solid #F8FAFC' }}>
                          <td className="px-3 py-3">
                            <ShipCell s={s} />
                          </td>
                          <td className="px-3 py-3">
                            <ShipStatusChip s={s} />
                            {s.channel === 'ml' && subLabel(s.substatus) && (
                              <div style={{ fontSize: '10px', color: '#94A3B8', marginLeft: 28, marginTop: 2 }}>{subLabel(s.substatus)}</div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div style={{ color: '#334155' }}>
                              {[s.receiver.city, s.receiver.state].filter(Boolean).join(', ') || '—'}
                            </div>
                            {s.receiver.zip_code && (
                              <div className="tabular-nums" style={{ fontSize: '10px', color: '#94A3B8' }}>
                                CP {s.receiver.zip_code}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {first ? (
                              <>
                                <div className="truncate" style={{ color: '#334155', maxWidth: 200 }}>{first.title}</div>
                                <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                                  {totalQty} u.{extra > 0 ? ` · +${extra} más` : ''}
                                </div>
                              </>
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <MethodCell s={s} />
                          </td>
                          <td className="px-3 py-3">
                            <TrackingCell s={s} />
                          </td>
                          <td className="px-3 py-3 tabular-nums whitespace-nowrap" style={{ color: '#64748B' }}>
                            {fmtShipDate(s.last_updated)}
                          </td>
                          <td className="px-3 py-3">
                            <ActionCell s={s} busy={busyId === s.id} onDownload={() => downloadLabel(s)} />
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer de paginación (Figma, estilo Inventario) */}
          <div className="flex items-center justify-between px-6 py-3 flex-shrink-0 bg-white" style={{ borderTop: '1px solid #E2E8F0' }}>
            <span className="text-xs" style={{ color: '#94A3B8' }}>{total} {total === 1 ? 'envío' : 'envíos'}</span>
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: '#94A3B8' }}>Mostrar</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="text-xs px-2 py-1 rounded-lg outline-none"
                style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#475569' }}
              >
                <option>50</option>
                <option>100</option>
                <option>200</option>
              </select>
              <span className="text-xs font-medium" style={{ color: '#475569' }}>{total ? page * pageSize + 1 : 0} – {Math.min((page + 1) * pageSize, total)}</span>
              {(['‹', '›'] as const).map((g) => {
                const dis = g === '‹' ? page === 0 : page >= pageCount - 1
                return (
                  <button
                    key={g}
                    disabled={dis}
                    onClick={() => setPage(page + (g === '‹' ? -1 : 1))}
                    aria-label={g === '‹' ? 'Página anterior' : 'Página siguiente'}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-sm"
                    style={{ color: '#94A3B8', border: '1px solid #E2E8F0', cursor: dis ? 'default' : 'pointer', opacity: dis ? 0.4 : 1 }}
                    onMouseEnter={(e) => {
                      if (!dis) e.currentTarget.style.background = '#F1F5F9'
                    }}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {g}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Toast de resultado (Figma): bottom-right, auto-cierre 5s */}
      {toast && (
        <div className="fixed bottom-6 right-6 flex items-start gap-3 rounded-2xl px-4 py-3.5 max-w-sm"
          style={{ zIndex: 60, background: 'white', border: `1px solid ${toast.tone === 'ok' ? '#BBF7D0' : '#FECACA'}`, boxShadow: '0 12px 32px rgba(10,22,40,0.12)' }}>
          <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-px" style={{ background: toast.tone === 'ok' ? '#DCFCE7' : '#FEE2E2', color: toast.tone === 'ok' ? '#16A34A' : '#DC2626' }}>
            {toast.tone === 'ok'
              ? <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              : <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" /><path d="M6 4v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="6" cy="8.3" r="0.5" fill="currentColor" /></svg>}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold" style={{ color: '#0A1628' }}>{toast.tone === 'ok' ? 'Etiqueta descargada' : 'No se pudo descargar la etiqueta'}</div>
            <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.4, marginTop: 2 }}>{toast.message}</div>
          </div>
          <button onClick={() => setToast(null)} aria-label="Cerrar" className="text-sm leading-none" style={{ color: '#94A3B8' }}>×</button>
        </div>
      )}
    </div>
  )
}
