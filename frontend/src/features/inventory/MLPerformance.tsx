// MercadoLibre item health: score ring + bucket accordion (mercadolibre.performance).

import { useState } from 'react'
import type { MLPerformance, PerfBucket } from '../../lib/api/types'
import { Spinner } from '../../components/ui'

export function ScoreRing({ score }: { score: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const tone = score >= 80 ? '#16A34A' : score >= 50 ? '#F59E0B' : '#EF4444'
  return (
    <div className="relative flex-shrink-0" style={{ width: 64, height: 64 }}>
      <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="32" cy="32" r={r} fill="none" stroke="#F1F5F9" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular font-bold" style={{ fontSize: '17px', color: '#0A1628', lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontSize: '8px', color: '#94A3B8' }}>/ 100</span>
      </div>
    </div>
  )
}

export function perfStats(perf: MLPerformance | null) {
  const buckets: PerfBucket[] = perf?.buckets ?? []
  const all = buckets.flatMap((b) => b.variables ?? [])
  const doneCount = all.filter((v) => v.status === 'COMPLETED').length
  const pending = all.filter((v) => v.status === 'PENDING')
  const s = perf?.score ?? 0
  const tone = s >= 80 ? '#16A34A' : s >= 50 ? '#F59E0B' : '#EF4444'
  const toneBg = s >= 80 ? '#DCFCE7' : s >= 50 ? '#FEF3C7' : '#FEE2E2'
  return { all, doneCount, pending, tone, toneBg }
}

export function PerfBuckets({ perf, accent }: { perf: MLPerformance | null; accent: string }) {
  const buckets: PerfBucket[] = perf?.buckets ?? []
  const [open, setOpen] = useState<string | null>(buckets[0]?.key ?? null)

  if (!perf || perf.score === null || buckets.length === 0) {
    return (
      <div
        className="rounded-xl px-3 py-4 text-center text-xs text-muted"
        style={{ border: '1px solid #E2E8F0', background: '#F8FAFC' }}
      >
        Todavía no hay datos de performance para esta publicación.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {buckets.map((bucket) => {
        const isOpen = open === bucket.key
        const pend = (bucket.variables ?? []).filter((v) => v.status === 'PENDING').length
        const scoreColor = bucket.score >= 80 ? '#16A34A' : bucket.score >= 50 ? '#D97706' : '#DC2626'
        return (
          <div key={bucket.key} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
            <button
              onClick={() => setOpen(isOpen ? null : bucket.key)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50"
              style={{ background: isOpen ? '#F8FAFC' : 'white', borderBottom: isOpen ? '1px solid #F1F5F9' : 'none' }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 12 12"
                fill="none"
                className="flex-shrink-0"
                style={{ color: '#94A3B8', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s ease' }}
                aria-hidden
              >
                <path d="M4 2.5l3.5 3.5L4 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="flex-1 text-xs font-semibold text-ink">{bucket.title}</span>
              {pend > 0 && (
                <span
                  className="tabular px-1.5 py-0.5 rounded"
                  style={{ fontSize: '10px', fontWeight: 600, color: '#D97706', background: '#FEF3C7' }}
                >
                  {pend} pendiente{pend > 1 ? 's' : ''}
                </span>
              )}
              <span className="tabular font-semibold" style={{ fontSize: '11px', color: scoreColor }}>
                {Math.round(bucket.score)}%
              </span>
            </button>
            {isOpen &&
              [...(bucket.variables ?? [])]
                .sort((a, b) => (a.status === b.status ? 0 : a.status === 'PENDING' ? -1 : 1))
                .map((v, i) => {
                  const done = v.status === 'COMPLETED'
                  return (
                    <div
                      key={v.key}
                      className="flex items-start gap-2.5 px-3.5 py-2.5"
                      style={{ borderTop: i > 0 ? '1px solid #F8FAFC' : 'none' }}
                    >
                      <div
                        className="flex items-center justify-center flex-shrink-0 rounded-full mt-0.5"
                        style={{ width: 16, height: 16, background: done ? '#DCFCE7' : '#FEF3C7' }}
                      >
                        {done ? (
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                            <path d="M2.5 6.5l2.5 2.5 4.5-5.5" stroke="#16A34A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                            <path d="M6 3v3.5M6 8.5h.01" stroke="#D97706" strokeWidth="1.6" strokeLinecap="round" />
                          </svg>
                        )}
                      </div>
                      <p className="flex-1 min-w-0" style={{ fontSize: '11px', lineHeight: 1.35, color: done ? '#94A3B8' : '#334155' }}>
                        {v.title}
                      </p>
                      {!done && (
                        <a
                          href={v.rule?.link || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-shrink-0 whitespace-nowrap px-2 py-1 rounded-lg font-semibold transition-all hover:brightness-95"
                          style={{ fontSize: '10px', color: 'white', background: accent }}
                        >
                          {v.rule?.label ?? 'Resolver'}
                        </a>
                      )}
                    </div>
                  )
                })}
          </div>
        )
      })}
    </div>
  )
}

export function PerformanceLoading() {
  return (
    <div className="flex items-center gap-2 py-4 text-xs text-muted">
      <Spinner size={12} /> Cargando performance…
    </div>
  )
}
