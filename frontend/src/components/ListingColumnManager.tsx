// Gestor de columnas genérico (Figma): visible/hidden + drag para reordenar.
// Compartido entre las vistas de listados (Ventas; futuro: Inventario/Canales).

import { useState } from 'react'
import { Popover } from '../features/inventory/inventoryColumns'

export type ManagedCol = { key: string; label: string; locked?: boolean }

export function ListingColumnManager({
  allCols,
  cols,
  setCols,
  defaultCols,
}: {
  allCols: ManagedCol[]
  cols: string[]
  setCols: (c: string[]) => void
  defaultCols: string[]
}) {
  const [dragKey, setDragKey] = useState<string | null>(null)
  const map = Object.fromEntries(allCols.map((c) => [c.key, c])) as Record<string, ManagedCol>
  const hidden = allCols.filter((c) => !cols.includes(c.key))

  const reorder = (target: string) => {
    if (!dragKey || dragKey === target) return
    const next = [...cols]
    next.splice(next.indexOf(dragKey), 1)
    next.splice(next.indexOf(target), 0, dragKey)
    setCols(next)
  }

  return (
    <Popover
      width={272}
      trigger={(open) => (
        <button
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
          style={{ border: `1.5px solid ${open ? '#4F46E5' : '#E2E8F0'}`, color: '#475569', background: 'white' }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M7 2.5v11M11 2.5v11" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          Columnas
        </button>
      )}
    >
      {() => (
        <div className="flex flex-col p-3 gap-3 max-h-[70vh] overflow-y-auto scroll-slim">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">Columnas visibles</span>
            <button onClick={() => setCols(defaultCols)} className="text-xs font-medium transition-colors hover:underline" style={{ color: '#4F46E5' }}>
              Restablecer
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            {cols.map((k) => {
              const c = map[k]
              if (!c) return null
              return (
                <div
                  key={k}
                  draggable={!c.locked}
                  onDragStart={() => setDragKey(k)}
                  onDragEnd={() => setDragKey(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => reorder(k)}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors"
                  style={{ background: dragKey === k ? '#EEF2FF' : 'transparent', cursor: c.locked ? 'default' : 'grab' }}
                  onMouseEnter={(e) => { if (dragKey === null) e.currentTarget.style.background = '#F8FAFC' }}
                  onMouseLeave={(e) => { if (dragKey !== k) e.currentTarget.style.background = 'transparent' }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: c.locked ? '#E2E8F0' : '#CBD5E1', flexShrink: 0 }}>
                    <circle cx="4" cy="3" r="1" fill="currentColor" /><circle cx="8" cy="3" r="1" fill="currentColor" />
                    <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="8" cy="6" r="1" fill="currentColor" />
                    <circle cx="4" cy="9" r="1" fill="currentColor" /><circle cx="8" cy="9" r="1" fill="currentColor" />
                  </svg>
                  <span className="flex-1 text-xs text-ink">{c.label}</span>
                  {c.locked ? (
                    <span style={{ fontSize: '9px', color: '#CBD5E1' }}>Fijo</span>
                  ) : (
                    <button
                      onClick={() => setCols(cols.filter((x) => x !== k))}
                      className="flex-shrink-0 p-1 rounded-md transition-colors hover:bg-slate-100"
                      style={{ color: '#94A3B8' }}
                      title="Ocultar"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3" />
                        <circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {hidden.length > 0 && (
            <>
              <div className="h-px" style={{ background: '#F1F5F9' }} />
              <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>
                Ocultas
              </span>
              <div className="flex flex-col gap-0.5">
                {hidden.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setCols([...cols, c.key])}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-slate-50 text-left"
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: '#4F46E5', flexShrink: 0 }}>
                      <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <span className="flex-1 text-xs text-subtle">{c.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Popover>
  )
}
