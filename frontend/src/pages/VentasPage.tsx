// Ventas (Figma): tabs Órdenes | Reportes. Órdenes = buscador + strip de
// métricas + tabla unificada (ML + TN) + drawer lateral; Reportes = cards +
// gráfico de líneas (ver features/sales/VentasReportes.tsx).

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { salesApi } from '../lib/api/endpoints'
import type { OrderStatus, SaleOrder, SalesChannel, SalesResponse } from '../lib/api/types'
import { SpinnerText } from '../components/ui'
import { ListingColumnManager } from '../components/ListingColumnManager'
import { StatStrip, Stat, ICON_LIST, ICON_CLOCK, ICON_CHECK, ICON_BOX, ICON_X } from '../components/StatStrip'
import { FilterField, Popover } from '../features/inventory/inventoryColumns'
import { SaleDrawer } from '../features/sales/SaleDrawer'
import { VentasReportes } from '../features/sales/VentasReportes'
import { ORDER_STATUS, SALE_COLS, SALE_DEFAULT_COLS, SALE_COLS_KEY } from '../features/sales/salesShared'

export function VentasPage() {
  const [tab, setTab] = useState<'ordenes' | 'reportes'>('ordenes')
  const tabs = (
    <div className="flex items-center gap-5" role="tablist">
      {([['ordenes', 'Órdenes'], ['reportes', 'Reportes']] as const).map(([k, l]) => (
        <button
          key={k}
          role="tab"
          aria-selected={tab === k}
          onClick={() => setTab(k)}
          className="py-1 text-xs font-semibold transition-colors"
          style={{ color: tab === k ? '#0A1628' : '#94A3B8', borderBottom: `2px solid ${tab === k ? '#4F46E5' : 'transparent'}` }}
        >
          {l}
        </button>
      ))}
    </div>
  )
  return tab === 'ordenes' ? <VentasOrdenes tabs={tabs} /> : <VentasReportes tabs={tabs} />
}

function VentasOrdenes({ tabs }: { tabs: ReactNode }) {
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState<SalesChannel | 'all'>('all')
  const [status, setStatus] = useState<OrderStatus | 'all'>('all')
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(0)
  const [cols, setColsState] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(SALE_COLS_KEY) ?? 'null')
      return Array.isArray(v) ? v : SALE_DEFAULT_COLS
    } catch {
      return SALE_DEFAULT_COLS
    }
  })
  const setCols = (c: string[]) => {
    setColsState(c)
    try {
      localStorage.setItem(SALE_COLS_KEY, JSON.stringify(c))
    } catch {
      /* sin storage */
    }
  }
  const [data, setData] = useState<SalesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [open, setOpen] = useState<SaleOrder | null>(null)

  useEffect(() => {
    setPage(0)
  }, [search, channel, status, pageSize])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const t = setTimeout(() => {
      salesApi
        .list({ channel, status, q: search, page, page_size: pageSize })
        .then((r) => {
          if (alive) setData(r)
        })
        .catch((e: Error) => {
          if (alive) setError(e.message || 'No pudimos cargar las órdenes.')
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }, search ? 250 : 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [search, channel, status, page, pageSize, reload])

  const counts = data?.counts
  const stats: Stat[] = [
    { label: 'Ventas', value: counts?.total ?? '—', sub: 'total', tone: '#4F46E5', icon: ICON_LIST },
    { label: 'Pendientes de pago', value: counts?.pending_payment ?? '—', tone: '#F59E0B', icon: ICON_CLOCK },
    { label: 'Pagadas', value: counts?.paid ?? '—', tone: '#4F46E5', icon: ICON_CHECK },
    { label: 'Entregadas', value: counts?.delivered ?? '—', tone: '#16A34A', icon: ICON_BOX },
    { label: 'Canceladas', value: counts?.cancelled ?? '—', tone: '#DC2626', icon: ICON_X },
  ]
  const visible = cols.map((k) => SALE_COLS.find((c) => c.key === k)).filter(Boolean)
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const filterCount = (channel !== 'all' ? 1 : 0) + (status !== 'all' ? 1 : 0)

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      <header className="flex items-center gap-3 px-6 py-3 flex-shrink-0 bg-white" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" /><path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por orden, comprador, producto o SKU…"
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
        <div className="flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-4">
            <h1 className="text-base font-bold text-ink">Ventas</h1>
            {tabs}
          </div>
          <div className="flex items-center gap-2">
            <Popover
              width={280}
              trigger={(o) => (
                <button
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
                  style={{ border: `1.5px solid ${o || filterCount ? '#4F46E5' : '#E2E8F0'}`, color: filterCount ? '#4F46E5' : '#475569', background: filterCount ? '#EEF2FF' : 'white' }}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 3.5h12M4 8h8M6 12.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
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
                          setStatus('all')
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
                    onChange={(v) => setChannel(v as SalesChannel | 'all')}
                    options={[
                      { value: 'all', label: 'Todos' },
                      { value: 'ml', label: 'MercadoLibre' },
                      { value: 'tn', label: 'Tienda Nube' },
                    ]}
                  />
                  <FilterField
                    label="Estado"
                    value={status}
                    onChange={(v) => setStatus(v as OrderStatus | 'all')}
                    options={[
                      { value: 'all', label: 'Todos' },
                      ...(Object.keys(ORDER_STATUS) as OrderStatus[]).map((k) => ({ value: k, label: ORDER_STATUS[k].label })),
                    ]}
                  />
                </div>
              )}
            </Popover>
            <ListingColumnManager allCols={SALE_COLS} cols={cols} setCols={setCols} defaultCols={SALE_DEFAULT_COLS} />
          </div>
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
                <p className="text-sm font-semibold text-ink">No pudimos cargar las órdenes</p>
                <p className="text-xs text-subtle">{error}</p>
                <button onClick={() => setReload((n) => n + 1)} className="mt-1 px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ border: '1px solid #E2E8F0', color: '#4F46E5' }}>
                  Reintentar
                </button>
              </div>
            ) : loading && !data ? (
              <SpinnerText text="Cargando órdenes…" />
            ) : (
              <table className="w-full text-xs border-collapse" style={{ minWidth: 900, opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr className="bg-white" style={{ borderBottom: '1px solid #F1F5F9' }}>
                    {visible.map((c) => (
                      <th key={c!.key} className="px-3 py-3 font-semibold bg-white" style={{ color: '#94A3B8', fontSize: '10px', letterSpacing: '0.07em', textAlign: c!.align ?? 'left' }}>
                        {c!.label.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data && data.items.length === 0 ? (
                    <tr>
                      <td colSpan={visible.length} className="px-4 py-14 text-center text-sm text-muted">
                        No hay órdenes que coincidan con la búsqueda o los filtros.
                      </td>
                    </tr>
                  ) : (
                    data?.items.map((o) => (
                      <tr key={o.id} onClick={() => setOpen(o)} className="cursor-pointer transition-colors hover:bg-slate-50" style={{ borderBottom: '1px solid #F8FAFC' }}>
                        {visible.map((c) => (
                          <td key={c!.key} className="px-3 py-3" style={{ textAlign: c!.align ?? 'left' }}>
                            {c!.render(o)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex items-center justify-between px-6 py-3 flex-shrink-0 bg-white" style={{ borderTop: '1px solid #E2E8F0' }}>
            <span className="text-xs text-muted">{total} {total === 1 ? 'orden' : 'órdenes'}</span>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-xs text-muted">Mostrar</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="hidden sm:block text-xs px-2 py-1 rounded-lg outline-none"
                style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#475569' }}
              >
                <option>50</option>
                <option>100</option>
                <option>200</option>
              </select>
              <span className="text-xs font-medium text-subtle">{total ? page * pageSize + 1 : 0} – {Math.min((page + 1) * pageSize, total)}</span>
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
      {open && <SaleDrawer order={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
