// Drawer de orden (Figma, opción B): rail izquierdo de identidad + historial,
// panel derecho con productos y sincronización de stock, footer con acciones.

import type { SaleOrder } from '../../lib/api/types'
import { fmtMoney } from '../../lib/format'
import {
  ChannelBadge,
  OrderStatusBadge,
  ORDER_STATUS,
  SALES_CHANNELS,
  StockSyncBadge,
  fmtSaleDate,
} from './salesShared'

const railLabel = (t: string) => (
  <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#CBD5E1' }}>{t}</span>
)
const sectionLabel = (t: string) => (
  <h3 style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#94A3B8' }}>{t}</h3>
)

function SaleIdentity({ order }: { order: SaleOrder }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 items-start">
        <p className="font-semibold text-sm tabular-nums" style={{ color: '#0A1628' }}>Orden #{order.number}</p>
        <ChannelBadge channel={order.channel} />
      </div>
      <div className="flex flex-col gap-1">{railLabel('Estado')}<div><OrderStatusBadge status={order.status} /></div></div>
      <div className="flex flex-col gap-0.5">
        {railLabel('Total')}
        <span className="text-lg font-bold tabular-nums" style={{ color: '#0A1628' }}>
          {order.total != null ? fmtMoney(order.total) : '—'}{' '}
          <span className="text-[10px] font-medium" style={{ color: '#94A3B8' }}>{order.currency ?? ''}</span>
        </span>
      </div>
      {[
        { label: 'Comprador', value: order.buyer_name ?? '—' },
        { label: 'Fecha', value: `${fmtSaleDate(order.created_at)} hs` },
        {
          label: 'Ítems',
          value: `${order.items.reduce((a, it) => a + (it.quantity || 0), 0)} unidades · ${order.items.length} ${order.items.length === 1 ? 'producto' : 'productos'}`,
        },
      ].map((f) => (
        <div key={f.label} className="flex flex-col gap-0.5">{railLabel(f.label)}<span className="text-xs" style={{ color: '#475569' }}>{f.value}</span></div>
      ))}
    </div>
  )
}

function SaleHistory({ order, compact }: { order: SaleOrder; compact?: boolean }) {
  return (
    <ol className="flex flex-col">
      {[...order.history].reverse().map((ev, i, arr) => {
        const current = i === 0
        const m = ORDER_STATUS[ev.status] ?? { label: ev.status, color: '#94A3B8', bg: '#F1F5F9' }
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="rounded-full flex-shrink-0 mt-1" style={{ width: 10, height: 10, background: current ? m.color : 'white', border: `2px solid ${current ? m.color : '#CBD5E1'}`, boxShadow: current ? `0 0 0 4px ${m.bg}` : 'none' }} />
              {i < arr.length - 1 && <span className="flex-1 w-px my-1" style={{ background: '#E2E8F0', minHeight: 20 }} />}
            </div>
            <div className={compact ? 'pb-3 min-w-0' : 'pb-5 min-w-0'}>
              <p className={compact ? 'text-xs' : 'text-[13px]'} style={{ color: current ? '#0A1628' : '#475569', fontWeight: current ? 700 : 500 }}>{m.label}</p>
              <p className="tabular-nums" style={{ fontSize: '10.5px', color: '#94A3B8' }}>
                {fmtSaleDate(ev.at)} {ev.raw_status ? <span className="font-mono">({ev.raw_status})</span> : null}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function SaleProducts({ order }: { order: SaleOrder }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
      {order.items.map((it, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3" style={{ borderTop: i ? '1px solid #F1F5F9' : 'none' }}>
          <span className="tabular-nums font-bold text-xs mt-px" style={{ color: '#4F46E5' }}>{it.quantity}×</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate" style={{ color: '#0A1628' }}>{it.title || '—'}</p>
            <p className="font-mono" style={{ fontSize: '10.5px', color: '#94A3B8' }}>{it.sku ?? '—'} · {it.unit_price != null ? fmtMoney(it.unit_price) : '—'} c/u</p>
          </div>
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: '#0A1628' }}>
            {it.quantity * (it.unit_price ?? 0) > 0 ? fmtMoney((it.quantity || 0) * (it.unit_price ?? 0)) : '—'}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#F8FAFC', borderTop: '1px solid #F1F5F9' }}>
        <span className="text-xs font-semibold" style={{ color: '#64748B' }}>Subtotal</span>
        <span className="text-sm font-bold tabular-nums" style={{ color: '#0A1628' }}>
          {fmtMoney(order.items.reduce((a, it) => a + (it.quantity || 0) * (it.unit_price ?? 0), 0))}
        </span>
      </div>
    </div>
  )
}

const STOCK_TX_TYPE: Record<'sale' | 'return', string> = {
  sale: 'Venta',
  return: 'Devolución de stock',
}

function SaleStock({ order }: { order: SaleOrder }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ border: '1px solid #E2E8F0' }}>
        <span className="text-xs font-medium" style={{ color: '#475569' }}>Estado general</span>
        <StockSyncBadge sync={order.stock_sync} />
      </div>

      {/* Transacciones por ítem, apiladas */}
      <div className="flex flex-col gap-3">
        {order.items.map((it, i) => (
          <div key={i} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
              <span className="text-xs font-semibold truncate" style={{ color: '#0A1628' }}>{it.title || '—'}</span>
              <span className="font-mono flex-shrink-0" style={{ fontSize: '10.5px', color: '#94A3B8' }}>{it.quantity}× · {it.sku ?? '—'}</span>
            </div>
            {it.stock_transactions.length === 0 ? (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-xs" style={{ color: '#94A3B8' }}>Sin movimientos de stock</span>
                <StockSyncBadge sync="not_applicable" />
              </div>
            ) : (
              it.stock_transactions.map((tx, k) => (
                <div key={k} className="px-4 py-3" style={{ borderTop: k ? '1px solid #F1F5F9' : 'none' }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[13px] font-medium" style={{ color: '#0A1628' }}>
                      <span className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold" style={{ background: tx.type === 'sale' ? '#EEF2FF' : '#F1F5F9', color: tx.type === 'sale' ? '#4F46E5' : '#475569' }}>
                        {tx.type === 'sale' ? '−' : '+'}
                      </span>
                      {STOCK_TX_TYPE[tx.type]}
                    </span>
                    <StockSyncBadge sync={tx.status} />
                  </div>
                  <p className="mt-1 pl-7 text-xs" style={{ color: tx.document_number ? '#475569' : '#94A3B8' }}>
                    {tx.document_number ? (
                      <>
                        Comprobante Nº <span className="font-semibold tabular-nums" style={{ color: '#0A1628' }}>{tx.document_number}</span>
                      </>
                    ) : tx.status === 'error' ? (
                      'Sin comprobante · el sistema rechazó el movimiento, se reintenta automáticamente'
                    ) : (
                      'Sin comprobante · se genera al sincronizar'
                    )}
                  </p>
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      {/* Leyenda */}
      <div className="rounded-xl px-4 py-3 flex flex-col gap-2" style={{ background: '#F8FAFC' }}>
        <p className="text-[11px] font-semibold" style={{ color: '#475569' }}>Cómo leer esta sección</p>
        <ul className="flex flex-col gap-1 text-[11px]" style={{ color: '#64748B' }}>
          <li>
            <b style={{ color: '#334155' }}>Venta</b>: descuenta las unidades vendidas en tu sistema de stock.{' '}
            <b style={{ color: '#334155' }}>Devolución de stock</b>: las vuelve a sumar cuando la orden se cancela.
          </li>
          <li>
            <b style={{ color: '#334155' }}>Comprobante Nº</b>: número del documento que generó tu sistema de stock para ese movimiento.
          </li>
          <li>
            <b style={{ color: '#16A34A' }}>✓ Sincronizado</b> registrado en el sistema · <b style={{ color: '#B45309' }}>⏳ Pendiente</b> en cola ·{' '}
            <b style={{ color: '#DC2626' }}>⚠ Con error</b> rechazado, se reintenta · <b style={{ color: '#94A3B8' }}>— No aplica</b> la orden todavía no mueve stock.
          </li>
        </ul>
      </div>
    </div>
  )
}

export function SaleDrawer({ order, onClose }: { order: SaleOrder; onClose: () => void }) {
  const ch = SALES_CHANNELS[order.channel]
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="w-[820px] max-w-full flex flex-col bg-white shadow-2xl" style={{ borderLeft: '1px solid #E2E8F0' }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <span className="text-xs" style={{ color: '#94A3B8' }}>Actualizado {fmtSaleDate(order.updated_at)} hs</span>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" style={{ color: '#94A3B8' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Rail izquierdo */}
          <div className="w-64 flex-shrink-0 flex flex-col gap-5 px-5 py-5 overflow-y-auto scroll-slim" style={{ borderRight: '1px solid #F1F5F9', background: '#FAFBFC' }}>
            <SaleIdentity order={order} />
            <div className="flex flex-col gap-3 pt-4" style={{ borderTop: '1px solid #EEF2F6' }}>
              {railLabel('Historial de estados')}
              <SaleHistory order={order} compact />
            </div>
          </div>

          {/* Contenido */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto scroll-slim px-6 py-6 flex flex-col gap-7">
              <section className="flex flex-col gap-3">{sectionLabel('Productos')}<SaleProducts order={order} /></section>
              <section className="flex flex-col gap-3">{sectionLabel('Sincronización de stock')}<SaleStock order={order} /></section>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F1F5F9' }}>
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors" style={{ color: '#64748B' }}>Cerrar</button>
              {order.url && (
                <a
                  href={order.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold transition-all hover:brightness-95"
                  style={{ background: '#4F46E5', color: 'white' }}
                >
                  Ver en {ch.name}
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h4v4M13 3 7 9M11 9.5V13H3V5h3.5" /></svg>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
