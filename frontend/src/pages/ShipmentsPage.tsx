// Envíos · MercadoLibre (Figma): buscador + strip de métricas + tabla de
// operaciones. Datos: mercadolibre.shipments vía GET /api/mercadolibre/shipments.

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { channelsApi } from '../lib/api/endpoints'
import type { Shipment, ShipmentSummary } from '../lib/api/types'
import { ErrorBox, SpinnerText } from '../components/ui'

type ShipStatus =
  | 'pending'
  | 'handling'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivered'
  | 'not_delivered'
  | 'cancelled'

const SHIP_STATUS: Record<string, { label: string; color: string; bg: string; icon: ReactNode }> = {
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
const UNKNOWN_STATUS = { label: '—', color: '#94A3B8', bg: '#F1F5F9', icon: null }
const shipStatus = (s: string) => SHIP_STATUS[s] ?? { ...UNKNOWN_STATUS, label: (s || '—').replace(/_/g, ' ') }

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
const LOGISTIC_LABEL: Record<string, string> = {
  cross_docking: 'Cross docking',
  drop_off: 'Punto de despacho',
  fulfillment: 'Full',
  self_service: 'Flex',
  xd_drop_off: 'Cross docking',
}
const subLabel = (s: string | null) => (s ? SUBSTATUS_LABEL[s] ?? s.replace(/_/g, ' ') : null)
const logLabel = (s: string) => LOGISTIC_LABEL[s] ?? s.replace(/_/g, ' ')

// ─── Acción "Descargar etiqueta" (Figma) ──────────────────────────────────────

type LabelState = { kind: 'enabled'; reprint: boolean } | { kind: 'disabled'; reason: string } | { kind: 'hidden' }

function labelState(status: string): LabelState {
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
      <button onClick={onDownload} disabled={disabled || busy} aria-label={`Descargar etiqueta del envío ${s.external_id}`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors"
        style={disabled
          ? { color: '#CBD5E1', background: '#F8FAFC', border: '1px solid #F1F5F9', cursor: 'not-allowed' }
          : primary
            ? { color: 'white', background: busy ? '#818CF8' : '#4F46E5', border: '1px solid #4F46E5', cursor: busy ? 'wait' : 'pointer' }
            : { color: '#4F46E5', background: 'white', border: '1px solid #C7D2FE', cursor: busy ? 'wait' : 'pointer' }}>
        {busy
          ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="animate-spin"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" /><path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 1.5h4l2.5 2.5v6.5H3z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /><path d="M6 5v3.5M4.6 7.1 6 8.5l1.4-1.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        {busy ? 'Descargando…' : st.kind === 'enabled' && st.reprint ? 'Reimprimir' : 'Etiqueta'}
      </button>
      {disabled && (
        <span role="tooltip" className="pointer-events-none absolute right-0 bottom-full mb-2 w-52 rounded-lg px-2.5 py-2 text-[11px] leading-snug opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: '#0A1628', color: 'white', zIndex: 20, boxShadow: '0 6px 20px rgba(10,22,40,0.18)' }}>{st.reason}</span>
      )}
    </span>
  )
}

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtShipDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()} ${MES[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function ShipStatusChip({ status }: { status: ShipStatus | string }) {
  const s = shipStatus(status)
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ color: s.color, background: s.bg }}>
        {s.icon}
      </span>
      <span className="text-xs font-medium" style={{ color: '#334155' }}>
        {s.label}
      </span>
    </span>
  )
}

function LogisticTags({ mode, logistic_type }: { mode: string; logistic_type: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {mode && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase" style={{ color: '#F59E0B', background: '#FEF3C7' }}>
          {mode.toUpperCase()}
        </span>
      )}
      {logistic_type && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ color: '#475569', background: '#F1F5F9' }}>
          {logLabel(logistic_type)}
        </span>
      )}
    </span>
  )
}

// ─── Stat strip (Figma) ──────────────────────────────────────────────────────

type Stat = { label: string; value: ReactNode; sub?: string; tone: string; icon: ReactNode }

const ICON_LIST = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="2" y="2" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.4" /><path d="M5 8h6M5 5.5h6M5 10.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
)
const ICON_PREP = SHIP_STATUS.handling.icon
const ICON_ONWAY = SHIP_STATUS.shipped.icon
const ICON_DONE = SHIP_STATUS.delivered.icon
const ICON_ISSUE = SHIP_STATUS.not_delivered.icon

function shipStats(total: number, summary: ShipmentSummary): Stat[] {
  return [
    { label: 'Envíos', value: total, sub: 'total', tone: '#F59E0B', icon: ICON_LIST },
    { label: 'Por preparar', value: summary.pending, tone: '#D97706', icon: ICON_PREP },
    { label: 'En camino', value: summary.on_way, tone: '#0891B2', icon: ICON_ONWAY },
    { label: 'Entregados', value: summary.delivered, tone: '#16A34A', icon: ICON_DONE },
    { label: 'Incidencias', value: summary.issues, tone: '#DC2626', icon: ICON_ISSUE },
  ]
}

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

// ─── Page ────────────────────────────────────────────────────────────────────

export function ShipmentsPage() {
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<Shipment[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<ShipmentSummary>({ pending: 0, on_way: 0, delivered: 0, issues: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  // Paginación (Figma): página 0-based + tamaño 50/100/200.
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  // Descarga de etiquetas: una a la vez + toast de resultado (Figma).
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ tone: 'ok' | 'err'; message: string } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // Reiniciar a la primera página cuando cambia la búsqueda o el tamaño.
  useEffect(() => {
    setPage(0)
  }, [search, pageSize])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    channelsApi
      .mlShipments({ page: page + 1, page_size: pageSize, q: search || undefined })
      .then((res) => {
        if (cancelled) return
        setItems(res.items)
        setTotal(res.total)
        setSummary(res.summary)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey, page, pageSize, search])

  const downloadLabel = async (s: Shipment) => {
    if (busyId) return
    setBusyId(s.external_id)
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

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const clampedPage = Math.min(page, pageCount - 1)
  const rangeStart = total === 0 ? 0 : clampedPage * pageSize + 1
  const rangeEnd = Math.min(clampedPage * pageSize + pageSize, total)
  const rows = items
  const cols = ['Envío', 'Estado', 'Destino', 'Producto', 'Logística', 'Tracking', 'Actualizado', 'Acciones']

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 relative">
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
            placeholder="Buscar por envío, orden, tracking, ciudad o producto…"
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
            <h1 className="text-base font-bold text-ink">Envíos · MercadoLibre</h1>
            <span className="text-xs font-medium text-muted">
              {total} {total === 1 ? 'envío' : 'envíos'}
            </span>
          </div>
        </div>

        <StatStrip stats={shipStats(total, summary)} />

        {error ? (
          <div className="max-w-xl">
            <ErrorBox message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
            <div className="flex-1 overflow-auto scroll-slim">
              <table className="w-full text-xs border-collapse" style={{ minWidth: '880px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr className="bg-white" style={{ borderBottom: '1px solid #F1F5F9' }}>
                    {cols.map((c) => (
                      <th key={c} className="px-3 py-3 font-semibold text-left" style={{ color: '#94A3B8', fontSize: '10px', letterSpacing: '0.07em' }}>
                        {c.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={cols.length}>
                        <SpinnerText text="Cargando envíos…" />
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={cols.length} className="px-4 py-16 text-center text-muted">
                        No hay envíos que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    rows.map((s) => {
                      const first = s.items[0]
                      const totalQty = s.items.reduce((a, i) => a + i.quantity, 0)
                      const extra = first ? totalQty - first.quantity : 0
                      return (
                        <tr key={s.external_id} className="transition-colors hover:bg-slate-50" style={{ borderBottom: '1px solid #F8FAFC' }}>
                          <td className="px-3 py-3">
                            <div className="font-semibold tabular-nums text-ink">{s.external_id}</div>
                            <div style={{ fontSize: '10px', color: '#94A3B8' }}>Orden #{s.order_id ?? '—'}</div>
                          </td>
                          <td className="px-3 py-3">
                            <ShipStatusChip status={s.status} />
                            {subLabel(s.substatus) && (
                              <div style={{ fontSize: '10px', color: '#94A3B8', marginLeft: 28, marginTop: 2 }}>{subLabel(s.substatus)}</div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div style={{ color: '#334155' }}>
                              {[s.receiver.city, s.receiver.state].filter(Boolean).join(', ') || '—'}
                            </div>
                            <div className="tabular-nums" style={{ fontSize: '10px', color: '#94A3B8' }}>
                              {s.receiver.zip_code}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            {first ? (
                              <>
                                <div className="truncate" style={{ color: '#334155', maxWidth: 200 }}>{first.title}</div>
                                <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                                  {first.quantity} u.{extra > 0 ? ` · +${extra}` : ''}
                                </div>
                              </>
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <LogisticTags mode={s.mode} logistic_type={s.logistic_type} />
                          </td>
                          <td className="px-3 py-3">
                            {s.tracking_number ? (
                              <span className="font-mono tabular-nums" style={{ color: '#4F46E5' }}>
                                {s.tracking_number}
                              </span>
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 tabular-nums whitespace-nowrap" style={{ color: '#64748B' }}>
                            {fmtShipDate(s.last_updated)}
                          </td>
                          <td className="px-3 py-3">
                            <LabelButton s={s} busy={busyId === s.external_id} onDownload={() => downloadLabel(s)} />
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer de paginación (Figma, estilo Inventario) */}
            <div className="flex items-center justify-between px-6 py-3 flex-shrink-0 bg-white" style={{ borderTop: '1px solid #E2E8F0' }}>
              <span className="text-xs" style={{ color: '#94A3B8' }}>{total} {total === 1 ? 'envío' : 'envíos'}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: '#94A3B8' }}>Mostrar</span>
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="text-xs px-2 py-1 rounded-lg outline-none" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#475569' }}>
                  <option>50</option>
                  <option>100</option>
                  <option>200</option>
                </select>
                <span className="text-xs font-medium" style={{ color: '#475569' }}>{rangeStart} – {rangeEnd}</span>
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={clampedPage === 0}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-sm"
                  style={{ color: '#94A3B8', border: '1px solid #E2E8F0', cursor: clampedPage === 0 ? 'default' : 'pointer', opacity: clampedPage === 0 ? 0.4 : 1 }}
                  onMouseEnter={(e) => { if (clampedPage !== 0) e.currentTarget.style.background = '#F1F5F9' }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>‹</button>
                <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={clampedPage >= pageCount - 1}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-sm"
                  style={{ color: '#94A3B8', border: '1px solid #E2E8F0', cursor: clampedPage >= pageCount - 1 ? 'default' : 'pointer', opacity: clampedPage >= pageCount - 1 ? 0.4 : 1 }}
                  onMouseEnter={(e) => { if (clampedPage < pageCount - 1) e.currentTarget.style.background = '#F1F5F9' }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>›</button>
              </div>
            </div>
          </div>
        )}
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
