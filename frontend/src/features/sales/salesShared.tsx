// Ventas: constantes de canal/estado/sync, badges y columnas (port del Figma).

import type { ReactNode } from 'react'
import type { OrderStatus, SaleOrder, SalesChannel, StockSync } from '../../lib/api/types'
import { fmtMoney } from '../../lib/format'

export const SALES_CHANNELS: Record<SalesChannel, { name: string; text: string; bg: string; border: string }> = {
  ml: { name: 'MercadoLibre', text: '#B45309', bg: '#FEF7E6', border: '#FDE68A' },
  tn: { name: 'Tienda Nube', text: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pending_payment: { label: 'Pendiente de pago', color: '#B45309', bg: '#FEF3C7' },
  paid: { label: 'Pagada', color: '#4F46E5', bg: '#EEF2FF' },
  delivered: { label: 'Entregada', color: '#16A34A', bg: '#DCFCE7' },
  cancelled: { label: 'Cancelada', color: '#DC2626', bg: '#FEE2E2' },
}

export const STOCK_SYNC: Record<StockSync, { glyph: string; label: string; color: string; bg: string }> = {
  synced: { glyph: '✓', label: 'Sincronizado', color: '#16A34A', bg: '#DCFCE7' },
  pending: { glyph: '⏳', label: 'Pendiente', color: '#B45309', bg: '#FEF3C7' },
  error: { glyph: '⚠', label: 'Con error', color: '#DC2626', bg: '#FEE2E2' },
  not_applicable: { glyph: '—', label: 'No aplica', color: '#94A3B8', bg: 'transparent' },
}

const pad = (n: number) => String(n).padStart(2, '0')

export const fmtSaleDate = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ChannelBadge({ channel }: { channel: SalesChannel }) {
  const c = SALES_CHANNELS[channel]
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 whitespace-nowrap" style={{ fontSize: '10px', fontWeight: 700, color: c.text, background: c.bg, border: `1px solid ${c.border}` }}>
      {c.name}
    </span>
  )
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const m = ORDER_STATUS[status] ?? { label: status, color: '#94A3B8', bg: '#F1F5F9' }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 whitespace-nowrap font-semibold" style={{ fontSize: '10.5px', color: m.color, background: m.bg }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  )
}

export function StockSyncBadge({ sync }: { sync: StockSync }) {
  const m = STOCK_SYNC[sync] ?? STOCK_SYNC.not_applicable
  if (sync === 'not_applicable') {
    return <span title="No aplica: la orden no llegó a pagarse" style={{ color: '#CBD5E1' }}>— No aplica</span>
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 whitespace-nowrap font-semibold" style={{ fontSize: '10.5px', color: m.color, background: m.bg }}>
      <span aria-hidden>{m.glyph}</span>{m.label}
    </span>
  )
}

export type SaleCol = {
  key: string
  label: string
  locked?: boolean
  align?: 'right'
  render: (o: SaleOrder) => ReactNode
}

export const SALE_COLS: SaleCol[] = [
  {
    key: 'order', label: 'Orden', locked: true, render: (o) => (
      <div className="flex flex-col gap-1 items-start">
        <span className="font-semibold tabular-nums" style={{ color: '#0A1628' }}>#{o.number}</span>
        <ChannelBadge channel={o.channel} />
      </div>
    ),
  },
  { key: 'created', label: 'Fecha', render: (o) => <span className="tabular-nums whitespace-nowrap" style={{ color: '#64748B' }}>{fmtSaleDate(o.created_at)}</span> },
  { key: 'buyer', label: 'Comprador', render: (o) => (o.buyer_name ? <span style={{ color: '#334155' }}>{o.buyer_name}</span> : <span style={{ color: '#CBD5E1' }}>—</span>) },
  {
    key: 'items', label: 'Productos', render: (o) => (
      <div className="min-w-0">
        <div className="truncate" style={{ color: '#334155', maxWidth: 240 }}>{o.items[0]?.title ?? '—'}</div>
        <div style={{ fontSize: '10px', color: '#94A3B8' }}>{o.items.length} {o.items.length === 1 ? 'ítem' : 'ítems'}</div>
      </div>
    ),
  },
  { key: 'total', label: 'Total', align: 'right', render: (o) => <span className="font-semibold tabular-nums whitespace-nowrap" style={{ color: '#0A1628' }}>{o.total != null ? fmtMoney(o.total) : '—'}</span> },
  { key: 'status', label: 'Estado', render: (o) => <OrderStatusBadge status={o.status} /> },
  { key: 'sync', label: 'Sync stock', render: (o) => <StockSyncBadge sync={o.stock_sync} /> },
  { key: 'channel', label: 'Canal', render: (o) => <span style={{ color: '#334155' }}>{SALES_CHANNELS[o.channel].name}</span> },
  { key: 'currency', label: 'Moneda', render: (o) => <span className="font-mono" style={{ color: '#64748B' }}>{o.currency ?? '—'}</span> },
  { key: 'updated', label: 'Actualizado', render: (o) => <span className="tabular-nums whitespace-nowrap" style={{ color: '#64748B' }}>{fmtSaleDate(o.updated_at)}</span> },
  {
    key: 'link', label: 'Enlace', render: (o) => (o.url ? (
      <a href={o.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="font-semibold hover:underline whitespace-nowrap" style={{ color: '#4F46E5' }}>Abrir ↗</a>
    ) : (
      <span style={{ color: '#CBD5E1' }}>—</span>
    )),
  },
]

export const SALE_DEFAULT_COLS = ['order', 'created', 'buyer', 'items', 'total', 'status', 'sync']
export const SALE_COLS_KEY = 'omnipanel.ventas.cols'
