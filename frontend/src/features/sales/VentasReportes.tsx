// Ventas › Reportes (Figma): filtros de rango/canal + comparar, cards y
// gráfico de líneas "Ingresos por día". Datos: salesReportApi (GET /api/sales/report).

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { salesReportApi } from '../../lib/api/endpoints'
import type { ReportDay, SalesChannel, SalesReport } from '../../lib/api/types'
import { fmtMoney } from '../../lib/format'
import { SpinnerText } from '../../components/ui'
import { StatStrip, type Stat, ICON_LIST, ICON_X } from '../../components/StatStrip'
import { SALES_CHANNELS } from './salesShared'

const fmtCompact = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1).replace('.', ',')} M` : n >= 1e3 ? `$${Math.round(n / 1e3)} k` : `$${Math.round(n)}`

const dayLabel = (iso: string, long = false) => {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return long
    ? dt.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
    : `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

const CHANNEL_LINE: Record<SalesChannel, string> = { ml: '#F59E0B', tn: '#4F46E5' }

function RevenueLineChart({ days, compare }: { days: ReportDay[]; compare?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(800)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  const H = 280
  const pl = 56
  const pr = 16
  const pt = 16
  const pb = 28
  const iw = Math.max(10, w - pl - pr)
  const ih = H - pt - pb
  const series = compare
    ? (['ml', 'tn'] as const).map((c) => ({
        key: c,
        color: CHANNEL_LINE[c],
        label: SALES_CHANNELS[c].name,
        net: days.map((d) => d.by_channel[c].net),
        orders: days.map((d) => d.by_channel[c].orders),
      }))
    : [{ key: 'all', color: '#4F46E5', label: 'Total', net: days.map((d) => d.net), orders: days.map((d) => d.orders) }]
  const rawMax = Math.max(1, ...series.flatMap((sr) => sr.net))
  const step = Math.pow(10, Math.floor(Math.log10(rawMax / 4)))
  const tick = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => s * 4 >= rawMax) ?? step * 10
  const max = tick * 4
  const x = (i: number) => pl + (days.length === 1 ? iw / 2 : (i / (days.length - 1)) * iw)
  const y = (v: number) => pt + ih - (v / max) * ih
  const pathOf = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = `${pathOf(series[0].net)}L${x(days.length - 1)},${pt + ih}L${x(0)},${pt + ih}Z`
  const every = Math.ceil(days.length / Math.max(2, Math.floor(iw / 70)))
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left - pl) / iw) * (days.length - 1))
    setHover(Math.max(0, Math.min(days.length - 1, i)))
  }
  const hd = hover !== null ? days[hover] : null
  return (
    <div ref={ref} className="relative w-full" style={{ height: H }}>
      <svg width={w} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block">
        <defs>
          <linearGradient id="rev-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k}>
            <line x1={pl} x2={w - pr} y1={y(tick * k)} y2={y(tick * k)} stroke={k ? '#F1F5F9' : '#E2E8F0'} />
            <text x={pl - 10} y={y(tick * k)} dy="0.32em" textAnchor="end" fontSize="10.5" fill="#94A3B8" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtCompact(tick * k)}
            </text>
          </g>
        ))}
        {days.map((d, i) =>
          (i % every === 0 || i === days.length - 1) && (days.length - 1 - i >= every / 2 || i === days.length - 1) ? (
            <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="#94A3B8">
              {dayLabel(d.date)}
            </text>
          ) : null,
        )}
        {!compare && <path d={area} fill="url(#rev-fill)" />}
        {series.map((sr) => (
          <path key={sr.key} d={pathOf(sr.net)} fill="none" stroke={sr.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hd && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pt} y2={pt + ih} stroke="#CBD5E1" strokeDasharray="3 3" />
            {series.map((sr) => (
              <circle key={sr.key} cx={x(hover)} cy={y(sr.net[hover])} r="4.5" fill="white" stroke={sr.color} strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hd && hover !== null && (
        <div
          className="absolute pointer-events-none rounded-xl bg-white px-3 py-2 shadow-lg"
          style={{
            border: '1px solid #E2E8F0',
            top: Math.max(0, y(Math.max(...series.map((sr) => sr.net[hover]))) - (compare ? 110 : 72)),
            left: Math.min(Math.max(x(hover) - 90, 0), w - 180),
            width: 180,
          }}
        >
          <p className="text-[11px] font-semibold capitalize" style={{ color: '#64748B' }}>{dayLabel(hd.date, true)}</p>
          {compare ? (
            <div className="flex flex-col gap-1 mt-1">
              {series.map((sr) => (
                <div key={sr.key} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: sr.color }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-bold tabular-nums" style={{ color: '#0A1628' }}>{fmtMoney(sr.net[hover])}</span>
                    <span className="block text-[10.5px]" style={{ color: '#94A3B8' }}>
                      {sr.label} · {sr.orders[hover]} {sr.orders[hover] === 1 ? 'orden' : 'órdenes'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <p className="text-sm font-bold tabular-nums" style={{ color: '#0A1628' }}>{fmtMoney(hd.net)}</p>
              <p className="text-[11px]" style={{ color: '#94A3B8' }}>{hd.orders} {hd.orders === 1 ? 'orden' : 'órdenes'}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex items-center p-0.5 rounded-xl" style={{ background: '#F1F5F9' }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            className="px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all whitespace-nowrap"
            style={{ background: on ? 'white' : 'transparent', color: on ? '#0A1628' : '#64748B', boxShadow: on ? '0 1px 2px rgba(15,23,42,0.08)' : 'none' }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

const ICON_TICKET = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M2.5 4.5h11v2a1.5 1.5 0 0 0 0 3v2h-11v-2a1.5 1.5 0 0 0 0-3v-2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M9.5 4.5v7" stroke="currentColor" strokeWidth="1.3" strokeDasharray="1.5 1.5" />
  </svg>
)
const ICON_MONEY = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="1.8" y="4" width="12.4" height="8" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4" />
  </svg>
)

export function VentasReportes({ tabs }: { tabs: ReactNode }) {
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [channel, setChannel] = useState<SalesChannel | 'all'>('all')
  const [compare, setCompare] = useState(false)
  const [data, setData] = useState<SalesReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    salesReportApi
      .get({ days, channel })
      .then((r) => {
        if (alive) setData(r)
      })
      .catch((e: Error) => {
        if (alive) setError(e.message || 'No pudimos cargar el reporte.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [days, channel, reload])

  const pct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`
  const stats: Stat[] = [
    { label: 'Total facturado', value: data ? fmtMoney(data.net) : '—', sub: 'neto', tone: '#4F46E5', icon: ICON_MONEY },
    { label: 'Órdenes', value: data ? data.orders.toLocaleString('es-AR') : '—', sub: data ? `${data.orders_per_day.toFixed(1).replace('.', ',')}/día` : undefined, tone: '#0EA5E9', icon: ICON_LIST },
    { label: 'Ticket promedio', value: data ? fmtMoney(Math.round(data.avg_ticket)) : '—', tone: '#16A34A', icon: ICON_TICKET },
    { label: 'Cancelaciones', value: data ? data.cancelled.count : '—', sub: data ? `${fmtMoney(data.cancelled.amount)} · ${pct(data.cancelled.pct)}` : undefined, tone: '#DC2626', icon: ICON_X },
  ]
  const empty = data && data.orders === 0 && data.cancelled.count === 0

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      <header className="flex items-center justify-between gap-3 px-6 py-3 flex-shrink-0 bg-white flex-wrap" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <Segmented value={days} onChange={setDays} options={[{ value: 7, label: '7 días' }, { value: 30, label: '30 días' }, { value: 90, label: '90 días' }]} />
        <div className="flex items-center gap-3">
          <Segmented
            value={channel}
            onChange={(v) => {
              setChannel(v)
              if (v !== 'all') setCompare(false)
            }}
            options={[{ value: 'all', label: 'Todos' }, { value: 'ml', label: 'MercadoLibre' }, { value: 'tn', label: 'Tienda Nube' }]}
          />
          <button
            role="switch"
            aria-checked={compare}
            onClick={() => {
              setCompare((c) => !c)
              setChannel('all')
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
            style={{ border: `1.5px solid ${compare ? '#4F46E5' : '#E2E8F0'}`, background: compare ? '#EEF2FF' : 'white', color: compare ? '#4F46E5' : '#475569' }}
          >
            <span className="relative w-6 h-3.5 rounded-full transition-colors" style={{ background: compare ? '#4F46E5' : '#CBD5E1' }}>
              <span className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all" style={{ left: compare ? 12 : 2 }} />
            </span>
            Comparar canales
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto flex flex-col p-5 min-h-0 gap-3">
        <div className="flex items-center gap-4 flex-shrink-0">
          <h1 className="text-base font-bold text-ink">Ventas</h1>
          {tabs}
        </div>

        {error ? (
          <div className="rounded-2xl bg-white" style={{ border: '1px solid #E2E8F0' }}>
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
              <p className="text-sm font-semibold text-ink">No pudimos cargar el reporte</p>
              <p className="text-xs text-subtle">{error}</p>
              <button onClick={() => setReload((n) => n + 1)} className="mt-1 px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ border: '1px solid #E2E8F0', color: '#4F46E5' }}>
                Reintentar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto flex-shrink-0">
              <div className="min-w-[680px]" style={{ opacity: loading && data ? 0.55 : 1, transition: 'opacity .15s' }}>
                {loading && !data ? (
                  <div className="flex rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="flex-1 flex items-center gap-3 px-4 py-3" style={{ borderLeft: i ? '1px solid #F1F5F9' : 'none' }}>
                        <span className="w-9 h-9 rounded-xl animate-pulse" style={{ background: '#F1F5F9' }} />
                        <div className="flex flex-col gap-1.5">
                          <span className="h-4 w-20 rounded animate-pulse" style={{ background: '#F1F5F9' }} />
                          <span className="h-3 w-14 rounded animate-pulse" style={{ background: '#F1F5F9' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <StatStrip stats={stats} />
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white flex-shrink-0" style={{ border: '1px solid #E2E8F0' }}>
              <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-2">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Ingresos por día</h2>
                  <p className="text-xs text-muted">
                    Monto neto · últimos {days} días{compare ? ' · por canal' : channel !== 'all' ? ` · ${SALES_CHANNELS[channel].name}` : ''}
                  </p>
                </div>
                {compare && data && (
                  <div className="flex items-center gap-5">
                    {(['ml', 'tn'] as const).map((c) => (
                      <div key={c} className="flex items-start gap-2">
                        <span className="w-2.5 h-2.5 rounded-full mt-1" style={{ background: CHANNEL_LINE[c] }} />
                        <div>
                          <p className="text-[11px] font-medium text-subtle">{SALES_CHANNELS[c].name}</p>
                          <p className="text-sm font-bold tabular-nums text-ink">
                            {fmtMoney(data.by_channel[c].net)}{' '}
                            <span className="text-[11px] font-medium text-muted">
                              {data.net ? Math.round((data.by_channel[c].net / data.net) * 100) : 0}% · {data.by_channel[c].orders} órd.
                            </span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-3 pb-3">
                {loading && !data ? (
                  <div style={{ height: 280 }} className="flex items-center justify-center">
                    <SpinnerText text="Cargando reporte…" />
                  </div>
                ) : empty ? (
                  <div style={{ height: 280 }} className="flex flex-col items-center justify-center gap-1 text-center">
                    <p className="text-sm font-semibold text-ink">Sin datos en el rango</p>
                    <p className="text-xs text-muted">Probá con un rango más amplio u otro canal.</p>
                  </div>
                ) : (
                  data && (
                    <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
                      <RevenueLineChart days={data.days} compare={compare} />
                    </div>
                  )
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
