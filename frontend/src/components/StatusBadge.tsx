import type { ReactNode } from 'react'
import type { ChannelStatus } from '../lib/api/types'

// 1:1 copy of the Figma STATUS map.
export const STATUS: Record<
  ChannelStatus,
  { label: string; color: string; bg: string }
> = {
  unpublished: { label: 'Sin publicar', color: '#94A3B8', bg: '#F1F5F9' },
  prepublished: { label: 'Pre-publicado', color: '#D97706', bg: '#FEF3C7' },
  under_review: { label: 'En revisión', color: '#2563EB', bg: '#EFF6FF' },
  published: { label: 'Publicado', color: '#16A34A', bg: '#DCFCE7' },
  paused: { label: 'Pausado', color: '#EA580C', bg: '#FFF7ED' },
  failed: { label: 'Sin publicar', color: '#94A3B8', bg: '#F1F5F9' },
}

// Small glyph per status (Figma STATUS_ICON, 12px viewBox).
const STATUS_ICON: Record<ChannelStatus, ReactNode> = {
  published: (
    <path d="M3.5 6.2l1.8 1.8 3.4-3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  paused: (
    <>
      <path d="M4.5 3.5v5M7.5 3.5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  prepublished: (
    <>
      <circle cx="6" cy="6" r="3.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 4v2l1.4.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  under_review: (
    <>
      <circle cx="5.2" cy="5.2" r="3.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.6 7.6L10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  unpublished: <path d="M3.6 6h4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
  failed: <path d="M3.6 6h4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
}

export function StatusBadge({
  status,
  variant = 'soft',
}: {
  status: ChannelStatus
  variant?: 'soft' | 'chip'
}) {
  const s = STATUS[status]

  if (variant === 'chip') {
    // Figma Concept 1 — tinted icon tile + label (used in the listing tables).
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <span
          className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ color: s.color, background: s.bg }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            {STATUS_ICON[status]}
          </svg>
        </span>
        <span className="text-xs font-medium" style={{ color: '#334155' }}>
          {s.label}
        </span>
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ color: s.color, background: s.bg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  )
}
