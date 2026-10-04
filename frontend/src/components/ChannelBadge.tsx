// Chip de canal (Figma, 04/10): fondo sólido con los colores oficiales de
// cada marca, sin borde. Se usa en Ventas (tabla de órdenes + drawer) y en
// Envíos (columna "Envío"). Reemplaza al chip anterior en ámbar/índigo pastel
// con borde, que se confundía con los badges de estado.

import type { ReactNode } from 'react'

export const CHANNELS: Record<'ml' | 'tn', { name: string; bg: string; text: string }> = {
  ml: { name: 'MercadoLibre', bg: '#FFE600', text: '#2D3277' },
  tn: { name: 'Tienda Nube', bg: '#2C3357', text: '#FFFFFF' },
}

export function channelName(channel: 'ml' | 'tn'): string {
  return CHANNELS[channel].name
}

export function ChannelBadge({ channel }: { channel: 'ml' | 'tn' }): ReactNode {
  const c = CHANNELS[channel]
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 whitespace-nowrap"
      style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.01em', color: c.text, background: c.bg }}
    >
      {c.name}
    </span>
  )
}
