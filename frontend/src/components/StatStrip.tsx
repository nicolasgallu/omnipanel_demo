// Strip de métricas (Figma): una tarjeta por métrica con icono y tono.

import type { ReactNode } from 'react'

export type Stat = { label: string; value: ReactNode; sub?: string; tone: string; icon: ReactNode }

export const ICON_LIST = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="2" y="2" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M5 8h6M5 5.5h6M5 10.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)
export const ICON_CLOCK = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 4.8V8l2.2 1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
export const ICON_CHECK = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
    <path d="M5.5 8l1.7 1.7L10.5 6.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
export const ICON_BOX = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M2.5 5 8 2.2 13.5 5v6L8 13.8 2.5 11V5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M2.5 5 8 7.8 13.5 5M8 7.8v6" stroke="currentColor" strokeWidth="1.4" />
  </svg>
)
export const ICON_X = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
    <path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export function StatStrip({ stats }: { stats: Stat[] }) {
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
