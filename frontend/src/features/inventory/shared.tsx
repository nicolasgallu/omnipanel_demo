import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { MLListingType } from '../../lib/api/types'
import { fmtMoney } from '../../lib/format'
import { fmtMoneyCents } from '../../lib/format'

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: '#94A3B8', letterSpacing: '0.08em' }}
      >
        {children}
      </span>
      <div className="flex-1 h-px" style={{ background: '#F1F5F9' }} />
    </div>
  )
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-2.5"
      style={{ borderBottom: '1px solid #F8FAFC' }}
    >
      <span className="text-xs flex-shrink-0 text-subtle">{label}</span>
      {children}
    </div>
  )
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      style={{
        color: '#94A3B8',
        flexShrink: 0,
        transform: open ? 'rotate(180deg)' : 'none',
        transition: 'transform 0.15s',
      }}
      aria-hidden
    >
      <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Compact card showing a value; click to open an inline option picker.
export function ValueCard({
  label,
  value,
  options,
  onChange,
  placeholder = 'Elegí…',
  required = false,
  optional = false,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  optional?: boolean
}) {
  const [open, setOpen] = useState(false)
  const empty = !String(value || '').trim()
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all"
        style={{
          background: open ? '#EEF2FF' : 'white',
          border: `1px solid ${open ? '#C7D2FE' : required ? '#FECACA' : '#E2E8F0'}`,
        }}
      >
        <span style={{ fontSize: '10px', color: '#94A3B8' }}>
          {label}
          {required && <span style={{ color: '#DC2626' }}> · obligatorio</span>}
          {optional && <span style={{ color: '#2563EB' }}> · para catálogo</span>}
        </span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold truncate" style={{ color: empty ? '#94A3B8' : '#0A1628', fontWeight: empty ? 400 : 600 }}>
            {empty ? placeholder : value}
          </span>
          <Chevron open={open} />
        </div>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-1 z-20 rounded-xl p-1.5 flex flex-col gap-0.5 min-w-full max-h-48 overflow-y-auto scroll-slim"
            style={{ background: 'white', border: '1px solid #E2E8F0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
          >
            {options.map((o) => (
              <button
                key={o}
                onClick={() => {
                  onChange(o)
                  setOpen(false)
                }}
                className="text-left px-3 py-1.5 rounded-lg text-xs transition-all hover:bg-slate-50 whitespace-nowrap"
                style={{ color: o === value ? '#4F46E5' : '#0A1628', fontWeight: o === value ? 600 : 400 }}
              >
                {o}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Listing type (campaña) picker with the fee breakdown per option.
export function ListingTypePicker({
  value,
  onChange,
  items,
  accent,
}: {
  value: string
  onChange: (id: string) => void
  items: MLListingType[]
  accent: string
}) {
  const [open, setOpen] = useState(false)
  const selected = items.find((l) => l.id === value) ?? items[0]

  if (items.length === 0) {
    return (
      <div
        className="w-full px-3 py-2.5 rounded-xl text-xs"
        style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#94A3B8' }}
      >
        Cargando campañas disponibles…
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all"
        style={{
          background: open ? '#EEF2FF' : 'white',
          border: `1px solid ${open ? '#C7D2FE' : '#E2E8F0'}`,
        }}
      >
        <span style={{ fontSize: '10px', color: '#94A3B8' }}>Campaña</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-ink">{selected?.name}</span>
          {selected && selected.pct > 0 && (
            <span
              className="text-xs font-semibold tabular px-1.5 py-0.5 rounded-md"
              style={{ background: '#FFFBEB', color: accent }}
            >
              {selected.pct}%
            </span>
          )}
          <Chevron open={open} />
        </div>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="relative mt-1 z-20 rounded-xl overflow-hidden"
            style={{ border: '1px solid #E2E8F0', boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}
          >
            {items.map((lt, i) => (
              <button
                key={lt.id}
                onClick={() => {
                  onChange(lt.id)
                  setOpen(false)
                }}
                className="w-full text-left transition-all"
                style={{
                  borderTop: i > 0 ? '1px solid #F8FAFC' : 'none',
                  background: lt.id === value ? '#FFFBEB' : 'white',
                }}
              >
                <div className="flex items-start justify-between px-3 py-2.5 gap-3">
                  <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                    <div
                      className="w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        border: `2px solid ${lt.id === value ? accent : '#E2E8F0'}`,
                        background: lt.id === value ? accent : 'white',
                      }}
                    >
                      {lt.id === value && <div className="w-1 h-1 rounded-full bg-white" />}
                    </div>
                    <span className="text-xs font-semibold text-ink whitespace-nowrap">{lt.name}</span>
                  </div>
                  {lt.pct > 0 ? (
                    <div className="flex flex-col items-end gap-1 min-w-0">
                      <span className="text-xs font-bold tabular" style={{ color: accent }}>
                        {lt.pct}% total
                      </span>
                      <div className="flex flex-wrap justify-end gap-x-3 gap-y-0.5">
                        <span style={{ fontSize: '10px', color: '#94A3B8' }}>ML {lt.meli_pct}%</span>
                        {lt.financing > 0 && (
                          <span style={{ fontSize: '10px', color: '#94A3B8' }}>Financ. {lt.financing}%</span>
                        )}
                        {lt.fixed > 0 && (
                          <span style={{ fontSize: '10px', color: '#94A3B8' }}>
                            Fijo {fmtMoneyCents(lt.fixed)}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: '10px', color: '#CBD5E1' }}>Sin comisión activa</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// 3-step tracker that turns green and fades out after a successful publish.
export function StepTracker({
  steps,
  step,
  completing,
  accent,
}: {
  steps: string[]
  step: number
  completing: boolean
  accent: string
}) {
  return (
    <div className="flex items-center pb-1">
      {steps.map((s, i) => {
        const n = i + 1
        const allGreen = completing
        const done = allGreen ? true : step > n
        const active = !allGreen && step === n
        const isLast = i === steps.length - 1
        return (
          <div key={s} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: done ? '#16A34A' : active ? (accent === '#F59E0B' ? '#FEF3C7' : '#EFF6FF') : '#F8FAFC',
                  color: done ? 'white' : active ? accent : '#CBD5E1',
                  border: `1.5px solid ${done ? '#16A34A' : active ? accent : '#E2E8F0'}`,
                  transition: 'all 0.4s ease',
                }}
              >
                {done ? '✓' : n}
              </div>
              <span
                style={{
                  fontSize: '9px',
                  color: done ? '#16A34A' : active ? accent : '#CBD5E1',
                  fontWeight: active || done ? 600 : 400,
                  whiteSpace: 'nowrap',
                  transition: 'color 0.4s ease',
                }}
              >
                {allGreen && isLast ? 'Publicado' : s}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="flex-1 h-px mx-2 mb-4"
                style={{ background: done ? '#16A34A' : '#E2E8F0', transition: 'background 0.4s ease' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ActionRow({
  label,
  sub,
  color,
  icon,
  onClick,
  busy,
}: {
  label: string
  sub: string
  color: string
  icon: ReactNode
  onClick?: () => void
  busy?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 disabled:opacity-60"
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          {icon}
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold" style={{ color }}>
          {busy ? 'Procesando…' : label}
        </p>
        <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '1px' }}>{sub}</p>
      </div>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: '#E2E8F0', flexShrink: 0 }} aria-hidden>
        <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

// ─── Costos de venta ML (mercadolibre.selling_costs) ─────────────────────────
// Si la API devuelve la snapshot real, se usa; si no, se estima con la
// fórmula del diseño (comisión + fijo por tramo + IVA 21% sobre la comisión).

export function estimateMLCost(price: number) {
  const pct = 14.5
  const fixed = price >= 12000 ? 1330 : price >= 5000 ? 1390 : 1410
  const percPart = Math.round(price * pct) / 100
  const financing = 0
  const shipping = 0
  const total = percPart + fixed + financing + shipping
  const feeTax = 21
  const withTax = Math.round(total * (1 + feeTax / 100) * 100) / 100
  return {
    price, pct, fixed, percPart, financing, shipping, total, feeTax, withTax,
    tax: Math.round((withTax - total) * 100) / 100,
  }
}

export function SellingCosts({
  price,
  listingName,
  costs,
}: {
  price: number
  listingName: string
  costs?: {
    percentage_fee: number | null
    sale_fixed_fee: number | null
    financing_add_on_fee: number | null
    ship_list_cost: number | null
    total_selling_cost: number | null
    total_selling_cost_with_tax: number | null
    fee_tax: number | null
  } | null
}) {
  const [open, setOpen] = useState(false)
  const c = estimateMLCost(price)

  const pct = costs?.percentage_fee ?? c.pct
  const percPart = Math.round((price * pct) / 100 * 100) / 100
  const fixed = costs?.sale_fixed_fee ?? c.fixed
  const financing = costs?.financing_add_on_fee ?? c.financing
  const shipping = costs?.ship_list_cost ?? c.shipping
  const total = costs?.total_selling_cost ?? percPart + fixed + financing + shipping
  const withTax = costs?.total_selling_cost_with_tax ?? Math.round(total * (1 + 21 / 100) * 100) / 100
  const feeTax = costs?.fee_tax ?? c.feeTax
  const net = Math.round((price - withTax) * 100) / 100
  const netPct = price > 0 ? Math.round((net / price) * 100) : 0

  const rows = [
    { label: 'Precio de venta', value: fmtMoney(price), muted: true },
    { label: `Comisión por venta · ${pct}%`, value: fmtMoney(percPart) },
    { label: 'Costo fijo', value: fmtMoney(fixed) },
    { label: 'Cargo por financiación', value: fmtMoney(financing) },
    { label: 'Costo de envío', value: fmtMoney(shipping) },
    { label: 'Subtotal', value: fmtMoney(total), strong: true },
    { label: `IVA sobre comisión · ${feeTax}%`, value: fmtMoney(Math.round((withTax - total) * 100) / 100) },
    { label: 'Costo total de venta', value: fmtMoney(withTax), strong: true },
  ]

  return (
    <div className="flex flex-col gap-2.5">
      <SectionLabel>Costos de venta</SectionLabel>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50"
          style={{ background: open ? '#F8FAFC' : 'white', borderBottom: open ? '1px solid #F1F5F9' : 'none' }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 12 12"
            fill="none"
            className="flex-shrink-0"
            style={{ color: '#94A3B8', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s ease' }}
            aria-hidden
          >
            <path d="M4 2.5l3.5 3.5L4 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="flex-1 text-xs font-semibold text-ink">Detalle de costos</span>
        </button>
        {open && (
          <>
            <div
              className="flex items-center justify-between px-3.5 py-2.5"
              style={{ background: '#F0FDF4', borderBottom: '1px solid #DCFCE7' }}
            >
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#166534' }}>Ingreso neto est.</span>
              <div className="flex items-center gap-1.5">
                <span className="tabular font-bold" style={{ fontSize: '13px', color: '#16A34A' }}>
                  {fmtMoney(net)}
                </span>
                <span className="tabular px-1.5 py-0.5 rounded" style={{ fontSize: '10px', fontWeight: 600, color: '#16A34A', background: '#DCFCE7' }}>
                  {netPct}%
                </span>
              </div>
            </div>
            <div className="flex flex-col">
              {rows.map((r, i) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between px-3.5"
                  style={{
                    paddingTop: '8px',
                    paddingBottom: '8px',
                    borderTop: i > 0 ? `1px solid ${r.strong ? '#E2E8F0' : '#F8FAFC'}` : 'none',
                  }}
                >
                  <span style={{ fontSize: '12px', color: r.strong ? '#0A1628' : '#64748B', fontWeight: r.strong ? 600 : 400 }}>
                    {r.label}
                  </span>
                  <span
                    className="tabular"
                    style={{ fontSize: '12px', color: r.muted ? '#94A3B8' : r.strong ? '#0A1628' : '#334155', fontWeight: r.strong ? 700 : 500 }}
                  >
                    {r.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 px-3.5 py-2.5" style={{ borderTop: '1px solid #F1F5F9', background: '#FAFBFC' }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ color: '#94A3B8', flexShrink: 0 }} aria-hidden>
                <path d="M6 3.2v3.2M6 8.3h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" />
              </svg>
              <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>
                Publicación {listingName} · registrado al publicar/actualizar
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Panel de acción fallida (Figma: hero rojo + reintentar/editar) ──────────

export function FailedPanel({
  verb,
  label,
  reason,
  remedy,
  retrying,
  onRetry,
  onEdit,
}: {
  verb: string
  label: string
  reason: string
  remedy?: string | null
  retrying: boolean
  onRetry: () => void
  onEdit?: () => void
}) {
  const red = '#DC2626'
  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #FECACA' }}>
        <div
          className="flex items-start gap-3 px-4 py-4"
          style={{ background: '#FEF2F2', borderBottom: '1px solid #FEE2E2' }}
        >
          <div className="flex items-center justify-center flex-shrink-0 rounded-full" style={{ width: 40, height: 40, background: '#FEE2E2' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 3.5L22 20H2L12 3.5z" stroke={red} strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M12 10v4" stroke={red} strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="12" cy="17" r="1" fill={red} />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: '#991B1B' }}>
              No se pudo {verb} en {label}
            </p>
            <p className="break-words" style={{ fontSize: '12px', lineHeight: 1.4, color: '#B91C1C', marginTop: '3px' }}>
              {reason}
            </p>
          </div>
        </div>
        <div className={onEdit ? 'grid grid-cols-2' : 'grid grid-cols-1'}>
          <button
            onClick={onRetry}
            disabled={retrying}
            className="flex items-center justify-center gap-1.5 py-3 transition-colors hover:bg-slate-50"
            style={{ color: '#4F46E5', opacity: retrying ? 0.6 : 1 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ animation: retrying ? 'spin 0.7s linear infinite' : 'none' }} aria-hidden>
              {ICONS.refresh}
            </svg>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>{retrying ? 'Reintentando…' : 'Reintentar'}</span>
          </button>
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex items-center justify-center gap-1.5 py-3 transition-colors hover:bg-slate-50"
              style={{ borderLeft: '1px solid #F1F5F9', color: '#0A1628' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M9.5 2.5l2 2L5 11l-2.5.5L3 9l6.5-6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Editar datos</span>
            </button>
          )}
        </div>
      </div>

      {remedy && remedy !== 'None' && (
        <div className="flex items-start gap-2 rounded-xl px-3.5 py-3" style={{ border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px" aria-hidden>
            <circle cx="8" cy="8" r="6.5" stroke="#94A3B8" strokeWidth="1.3" />
            <path d="M8 7.5v3M8 5h.01" stroke="#94A3B8" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <p style={{ fontSize: '11px', lineHeight: 1.4, color: '#475569' }}>
            <span style={{ fontWeight: 600 }}>Sugerencia:</span> {remedy}
          </p>
        </div>
      )}
    </div>
  )
}

export function ChannelErrorBox({ reason, remedy }: { reason?: string | null; remedy?: string | null }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5 text-xs leading-relaxed"
      style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#B91C1C' }}
    >
      <p className="font-semibold mb-0.5">La publicación falló</p>
      {reason && <p className="break-words line-clamp-3">{reason}</p>}
      {remedy && remedy !== 'None' && (
        <p className="mt-1 text-[11px]" style={{ color: '#DC2626' }}>
          Sugerencia: {remedy}
        </p>
      )}
    </div>
  )
}

// ─── Iconos de línea (del Figma, viewBox 24, currentColor) ───────────────────

export const ICONS = {
  refresh: (
    <>
      <path d="M20.5 9a8 8 0 1 0 .4 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 4v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  pause: (
    <>
      <rect x="7" y="5" width="3.5" height="14" rx="1.5" fill="currentColor" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1.5" fill="currentColor" />
    </>
  ),
  play: <path d="M7 4.5l13 7.5-13 7.5V4.5z" fill="currentColor" />,
  gauge: (
    <>
      <path d="M4.5 15.5a8 8 0 1 1 15 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M12 15l4.2-5.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  photos: (
    <>
      <rect x="3" y="4.5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="8.5" cy="9.5" r="1.6" fill="currentColor" />
      <path d="M4 16.5l4.5-4 3.5 3 3-2.5 5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
} as const

// Tile con ícono tintado (toolbar de publicados / filas de pausado)
export function IconTile({
  icon,
  color,
  tint,
  border,
  size = 'md',
}: {
  icon: ReactNode
  color: string
  tint: string
  border: string
  size?: 'md' | 'sm'
}) {
  const box = size === 'md' ? 'w-8 h-8' : 'w-7 h-7'
  const svg = size === 'md' ? 15 : 12
  return (
    <div
      className={`${box} rounded-lg flex items-center justify-center`}
      style={{ background: tint, border: `1px solid ${border}`, color }}
    >
      <svg width={svg} height={svg} viewBox="0 0 24 24" fill="none" aria-hidden>
        {icon}
      </svg>
    </div>
  )
}

// ─── Resumen de configuración (estado publicado/pausado) ─────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-3.5 py-2"
      style={{ borderTop: '1px solid #F8FAFC' }}
    >
      <span style={{ fontSize: '11px', color: '#94A3B8' }}>{label}</span>
      <span className="text-xs font-medium text-right truncate text-ink">{value || '—'}</span>
    </div>
  )
}

export function ConfigSummary({
  rows,
  onEdit,
}: {
  rows: { label: string; value: string }[]
  onEdit: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Configuración</SectionLabel>
        <button
          onClick={onEdit}
          className="flex items-center gap-1 flex-shrink-0 px-2 py-0.5 rounded-md text-xs font-medium transition-colors hover:bg-slate-100"
          style={{ color: '#4F46E5' }}
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M9.5 2.5l2 2L5 11l-2.5.5L3 9l6.5-6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Editar
        </button>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
        {rows.map((r) => (
          <SummaryRow key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
    </div>
  )
}

// ─── Tracker de pasos sticky con CTA bajo el paso activo (Figma) ─────────────

export function ChannelTracker({
  steps,
  step,
  completing,
  loading,
  show,
  failedAt = -1,
  failLabel,
  verbDone,
  ctaLabel,
  btnLabel,
  onCta,
  ctaDisabled = false,
  accent = '#4F46E5',
}: {
  steps: string[]
  step: number
  completing: boolean
  loading: boolean
  show: boolean
  /** Índice (0-based) del paso fallido; -1 = ninguno. Los pasos ANTERIORES
   * quedan neutros; los POSTERIORES siguen el flujo normal. */
  failedAt?: number
  failLabel?: string
  verbDone: string
  ctaLabel: string
  btnLabel: string
  onCta: () => void
  ctaDisabled?: boolean
  accent?: string
}) {
  return (
    <div
      style={{
        overflow: 'hidden',
        maxHeight: show ? '120px' : '0',
        opacity: show ? 1 : 0,
        transition: 'max-height 0.6s ease, opacity 0.5s ease',
        position: 'sticky',
        top: '-24px',
        zIndex: 10,
        background: 'white',
        marginLeft: '-24px',
        marginRight: '-24px',
        paddingLeft: '24px',
        paddingRight: '24px',
        paddingBottom: '12px',
        paddingTop: '4px',
        borderBottom: show ? '1px solid #F1F5F9' : 'none',
      }}
    >
      <div className="flex items-start">
        {steps.map((s, i) => {
          const n = i + 1
          const allGreen = completing
          const isLast = i === steps.length - 1
          // Nodo fallido + pasos anteriores: rojo/neutros. Los pasos
          // posteriores al fallo siguen el flujo normal (done/active).
          const hasFailure = failedAt >= 0
          const isFail = i === failedAt
          const failedPrevious = hasFailure && i < failedAt
          const afterFailure = hasFailure && i > failedAt
          const done = (afterFailure || !hasFailure) && (allGreen ? true : step > n)
          const active = (afterFailure || !hasFailure) && !allGreen && step === n
          const showCta = active && !loading && !completing
          const showLoading = active && loading
          const nodeColor = isFail
            ? '#DC2626'
            : done
              ? '#16A34A'
              : active
                ? accent
                : '#CBD5E1'
          return (
            <div key={s} className="relative flex-1 flex flex-col items-center">
              {/* Conector centrado entre círculos: geometría pareja siempre,
                  sin importar el ancho de labels ni botones. */}
              {i < steps.length - 1 && (
                <div
                  className="absolute h-px"
                  style={{
                    top: '11px',
                    left: 'calc(50% + 14px)',
                    right: 'calc(-50% + 14px)',
                    background: hasFailure ? '#FECACA' : done ? '#16A34A' : '#E2E8F0',
                    transition: 'background 0.4s ease',
                  }}
                />
              )}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold relative"
                style={{
                  background: isFail
                    ? '#FEE2E2'
                    : failedPrevious
                      ? '#F1F5F9'
                      : done
                        ? '#16A34A'
                        : active
                          ? '#EEF2FF'
                          : '#F8FAFC',
                  color: isFail
                    ? '#DC2626'
                    : failedPrevious
                      ? '#94A3B8'
                      : done
                        ? 'white'
                        : active
                          ? accent
                          : '#CBD5E1',
                  border: `1.5px solid ${
                    isFail
                      ? '#DC2626'
                      : failedPrevious
                        ? '#E2E8F0'
                        : done
                          ? '#16A34A'
                          : active
                            ? accent
                            : '#E2E8F0'
                  }`,
                  transition: 'all 0.4s ease',
                }}
              >
                {isFail ? '✕' : failedPrevious ? '✓' : done ? '✓' : n}
              </div>
              <span
                className="mt-1"
                style={{
                  fontSize: '9px',
                  color: isFail
                    ? '#DC2626'
                    : failedPrevious
                      ? '#94A3B8'
                      : nodeColor,
                  fontWeight: active || done || isFail ? 600 : 400,
                  whiteSpace: 'nowrap',
                  transition: 'color 0.4s ease',
                }}
              >
                {isFail ? (failLabel ?? 'Error') : allGreen && isLast ? verbDone : s}
              </span>
              {/* Slot de altura fija para el CTA: nada se mueve al cambiar de paso. */}
              <div className="mt-1.5 h-[26px] flex items-center justify-center">
                {(showCta || showLoading) && (
                  <button
                    disabled={loading || ctaDisabled}
                    onClick={onCta}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all hover:brightness-95 whitespace-nowrap max-w-full truncate"
                    style={{
                      background: accent,
                      color: 'white',
                      opacity: loading ? 0.6 : ctaDisabled ? 0.4 : 1,
                      fontSize: '10px',
                    }}
                  >
                    {loading ? btnLabel : ctaLabel}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Hero chip "Activo" / "Pausado" (Figma HeroChip) ─────────────────────────

export function HeroChip({
  paused,
  prepublished,
  underReview,
}: {
  paused?: boolean
  prepublished?: boolean
  underReview?: boolean
}) {
  const tone = paused ? '#EA580C' : prepublished ? '#D97706' : underReview ? '#2563EB' : '#16A34A'
  const bg = paused ? '#FFF7ED' : prepublished ? '#FEF3C7' : underReview ? '#EFF6FF' : '#F0FDF4'
  const border = paused ? '#FED7AA' : prepublished ? '#FDE68A' : underReview ? '#BFDBFE' : '#BBF7D0'
  const label = paused ? 'Pausado' : prepublished ? 'Pre-publicado' : underReview ? 'En revisión' : 'Activo'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ background: bg, border: `1px solid ${border}` }}>
      <span className="rounded-full" style={{ width: 6, height: 6, background: tone }} />
      <span style={{ fontSize: '10.5px', fontWeight: 700, color: tone }}>{label}</span>
    </span>
  )
}

// ─── Card de éxito al publicar (Figma PublishSuccessCard) ────────────────────

export type BubbleRect = { top: number; left: number; width: number; height: number }

export function PublishSuccessCard({ verbDone, label, rect }: { verbDone: string; label: string; rect: BubbleRect }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        position: 'fixed',
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        zIndex: 100,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(240,253,244,0.85)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          animation: 'backdropFade 1.6s ease forwards',
        }}
      />
      <div
        className="relative flex flex-col items-center gap-3.5 rounded-2xl"
        style={{
          background: 'white',
          padding: '30px 44px',
          boxShadow: '0 16px 44px rgba(2,6,23,0.14)',
          border: '1px solid #DCFCE7',
          animation: 'cardPop 1.6s ease forwards',
        }}
      >
        <div className="relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
          <span style={{ position: 'absolute', inset: 0, borderRadius: '9999px', border: '2px solid #16A34A', animation: 'ringPulse 1.1s ease 0.15s' }} />
          <div className="flex items-center justify-center rounded-full" style={{ width: 64, height: 64, background: '#16A34A' }}>
            <svg width="34" height="34" viewBox="0 0 96 96" fill="none" aria-hidden>
              <path
                d="M28 49.5l13 13 27-30"
                stroke="white"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="70"
                style={{ animation: 'checkDraw 0.45s ease 0.3s both' }}
              />
            </svg>
          </div>
        </div>
        <p className="text-center" style={{ color: '#0A1628', fontSize: '15px', fontWeight: 700 }}>
          {verbDone} en {label}
        </p>
      </div>
    </div>
  )
}


// ─── Edición inline de celdas (listas de inventario/publicaciones) ─────────────

export function InlineEdit({
  value,
  onSave,
  align = 'left',
  mono = false,
  display,
}: {
  value: string | null
  onSave: (v: string) => Promise<void>
  align?: 'left' | 'right'
  mono?: boolean
  display?: (v: string) => string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const committing = useRef(false)

  const start = (e: React.MouseEvent) => {
    e.stopPropagation() // la fila abre el drawer; editar no debe abrirlo
    setDraft(value ?? '')
    setError(null)
    setEditing(true)
  }

  const commit = async () => {
    if (committing.current) return
    const next = draft.trim()
    if (next === (value ?? '')) {
      setEditing(false)
      return
    }
    committing.current = true
    setBusy(true)
    setError(null)
    try {
      await onSave(next)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
      committing.current = false
    }
  }

  if (editing) {
    return (
      <div
        className="flex flex-col gap-0.5 min-w-0"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          onBlur={() => void commit()}
          className="w-full px-2 py-1 rounded-lg text-xs outline-none"
          style={{
            border: '1.5px solid #4F46E5',
            boxShadow: '0 0 0 3px rgba(79,70,229,0.08)',
            textAlign: align,
            fontFamily: mono ? 'ui-monospace, monospace' : undefined,
          }}
        />
        {error && (
          <span className="text-red-600" style={{ fontSize: '10px' }}>
            {error}
          </span>
        )}
      </div>
    )
  }

  const shown = value ?? '—'
  return (
    <button
      onClick={start}
      title="Editar"
      className={`group/edit flex items-center gap-1.5 w-full ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
    >
      <span
        className="truncate"
        style={{
          fontSize: 'inherit',
          fontWeight: 'inherit',
          color: 'inherit',
          fontFamily: mono ? 'ui-monospace, monospace' : undefined,
        }}
      >
        {display ? display(shown) : shown}
      </span>
      <svg
        width="10"
        height="10"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
        className="opacity-0 group-hover/edit:opacity-100 transition-opacity flex-shrink-0"
        style={{ color: '#94A3B8' }}
      >
        <path d="M8.5 2.5l1 1L4 9l-1.5.5L3 8l5.5-5.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
