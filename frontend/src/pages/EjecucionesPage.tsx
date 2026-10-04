// Ejecuciones (Figma v184): subpágina dentro del grupo Inventario.
// Tabla de corridas (más nueva primero) + drawer de detalle + polling de 2s
// mientras haya corridas activas (queued/running) + borrar (sacar de la fila
// o abortar) con confirmación en el drawer.

import { useCallback, useEffect, useState } from 'react'
import { massActionsApi } from '../lib/api/endpoints'
import type { MassRun } from '../lib/api/types'
import { ChannelBadge } from '../components/ChannelBadge'
import { ErrorBox, Spinner, SpinnerText } from '../components/ui'
import { RUN_STATUS, actionLabel } from '../features/massActions/shared'

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function RunPill({ run }: { run: MassRun }) {
  const s = RUN_STATUS[run.status]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ color: s.color, background: s.bg }}
    >
      {run.status === 'running' && <Spinner size={9} />}
      {run.status === 'done' && (
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2.5 6.5L5 9l4.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {s.label}
      {run.status === 'queued' && run.queue_position != null && ` · posición ${run.queue_position}`}
    </span>
  )
}

function ProgressBar({ run }: { run: MassRun }) {
  const done = run.ok + run.errors + run.skipped
  const pct = run.total > 0 ? Math.round((done * 100) / run.total) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full overflow-hidden flex" style={{ background: '#F1F5F9' }}>
        <div style={{ width: `${(run.ok * 100) / Math.max(run.total, 1)}%`, background: '#4F46E5' }} />
        <div style={{ width: `${(run.errors * 100) / Math.max(run.total, 1)}%`, background: '#D97706' }} />
      </div>
      <span className="text-[10px] tabular-nums" style={{ color: '#94A3B8' }}>
        {done}/{run.total} · {pct}%
      </span>
    </div>
  )
}

function RunDrawer({ run, onClose, onChanged }: { run: MassRun; onClose: () => void; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canDelete = run.status === 'queued' || run.status === 'running'
  const pending = Math.max(run.total - run.ok - run.errors - run.skipped, 0)

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await massActionsApi.remove(run.id)
      setConfirming(false)
      onChanged()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la ejecución')
    } finally {
      setBusy(false)
    }
  }

  const counters = [
    { label: 'Pendientes', value: pending, color: '#94A3B8' },
    { label: 'Correctos', value: run.ok, color: '#4F46E5' },
    { label: 'Con errores', value: run.errors, color: '#D97706' },
    { label: 'Salteados', value: run.skipped, color: '#64748B' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(10,22,40,0.35)' }} onClick={onClose}>
      <div
        className="h-full w-[480px] bg-white flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <ChannelBadge channel={run.channel} />
          <RunPill run={run} />
          <span className="flex-1" />
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-slate-100" style={{ color: '#94A3B8' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-slim px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-ink">{actionLabel(run.action)}</span>
            <span className="text-xs text-muted">
              {run.user || '—'} · {fmtDate(run.created_at)}
            </span>
          </div>

          {/* Progreso */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-ink">
                {run.ok + run.errors + run.skipped} / {run.total}
              </span>
              <span className="text-xs tabular-nums" style={{ color: '#94A3B8' }}>
                {run.total > 0 ? Math.round(((run.ok + run.errors + run.skipped) * 100) / run.total) : 0}%
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden flex" style={{ background: '#F1F5F9' }}>
              <div style={{ width: `${(run.ok * 100) / Math.max(run.total, 1)}%`, background: '#4F46E5' }} />
              <div style={{ width: `${(run.errors * 100) / Math.max(run.total, 1)}%`, background: '#D97706' }} />
            </div>
          </div>

          {/* Contadores */}
          <div className="grid grid-cols-4 gap-2">
            {counters.map((c) => (
              <div key={c.label} className="flex flex-col items-center py-2.5 rounded-xl" style={{ background: '#F8FAFC' }}>
                <span className="text-base font-bold tabular-nums" style={{ color: c.color }}>{c.value}</span>
                <span className="text-[10px] text-subtle">{c.label}</span>
              </div>
            ))}
          </div>

          {/* Errores */}
          {(run.failures?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink">Ítems con error</span>
              <div className="flex flex-col gap-1 max-h-56 overflow-y-auto scroll-slim">
                {run.failures!.map((f, i) => (
                  <div key={i} className="flex flex-col gap-0.5 px-3 py-2 rounded-xl" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                    <span className="text-xs font-medium text-ink">{f.product}</span>
                    <span className="text-[11px]" style={{ color: '#B45309' }}>{f.reason || 'Error de la plataforma'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <span className="text-xs" style={{ color: '#DC2626' }}>{error}</span>}

          {/* Borrar */}
          {canDelete && (
            <div className="flex flex-col gap-2 p-3 rounded-xl" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              {confirming ? (
                <>
                  <span className="text-xs" style={{ color: '#B91C1C' }}>
                    {run.status === 'running'
                      ? 'Detener la ejecución: los ítems ya aplicados quedan como están.'
                      : 'Se quita de la fila y no se va a ejecutar.'}
                  </span>
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setConfirming(false)} className="px-3 py-1.5 rounded-xl text-xs font-medium" style={{ border: '1px solid #E2E8F0', color: '#475569' }}>
                      Cancelar
                    </button>
                    <button
                      disabled={busy}
                      onClick={remove}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
                      style={{ background: '#DC2626' }}
                    >
                      {busy ? 'Eliminando…' : 'Confirmar'}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: '#DC2626' }}
                >
                  Borrar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function EjecucionesPage() {
  const [items, setItems] = useState<MassRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawerId, setDrawerId] = useState<number | null>(null)
  const [drawer, setDrawer] = useState<MassRun | null>(null)
  const [live, setLive] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const active = items.some((r) => r.status === 'queued' || r.status === 'running')

  const load = useCallback(async () => {
    try {
      const res = await massActionsApi.list({ page_size: 200 })
      setItems(res.items)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las ejecuciones')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDrawer = useCallback(async (id: number) => {
    try {
      setDrawer(await massActionsApi.get(id))
    } catch {
      /* el drawer muestra lo que ya hay */
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Polling 2s mientras haya corridas activas.
  useEffect(() => {
    if (!active) return
    setLive(true)
    const t = setInterval(load, 2000)
    return () => {
      clearInterval(t)
      setLive(false)
    }
  }, [active, load])

  // Mantener fresco el drawer abierto durante el polling.
  useEffect(() => {
    if (drawerId != null) loadDrawer(drawerId)
  }, [drawerId, loadDrawer, items])

  const openRun = (id: number) => {
    setDrawerId(id)
    loadDrawer(id)
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 pt-5 flex-shrink-0">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-base font-bold text-ink">Ejecuciones</h1>
          <span className="text-xs font-medium text-muted">
            {items.length} {items.length === 1 ? 'corrida' : 'corridas'}
          </span>
          {live && (
            <span className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: '#4F46E5' }}>
              <Spinner size={9} /> Actualizando en vivo
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col p-5 min-h-0 pt-3">
        {error ? (
          <div className="max-w-xl">
            <ErrorBox message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
          </div>
        ) : loading && items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center rounded-2xl bg-white" style={{ border: '1px solid #E2E8F0' }}>
            <SpinnerText text="Cargando ejecuciones…" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center rounded-2xl bg-white" style={{ border: '1px solid #E2E8F0' }}>
            <span className="text-xs text-muted">No hay acciones masivas todavía</span>
          </div>
        ) : (
          <div className="flex-1 overflow-auto rounded-2xl bg-white scroll-slim" style={{ border: '1px solid #E2E8F0' }}>
            <table className="w-full text-xs border-collapse">
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr className="bg-white" style={{ borderBottom: '1px solid #F1F5F9' }}>
                  {['Fecha', 'Usuario', 'Plataforma', 'Acción', 'Ítems', 'Estado'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 font-semibold tracking-wider text-left"
                      style={{ color: '#94A3B8', fontSize: '10px', letterSpacing: '0.07em' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                    style={{ borderBottom: '1px solid #F8FAFC' }}
                    onClick={() => openRun(r.id)}
                  >
                    <td className="px-4 py-3 text-subtle whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    <td className="px-4 py-3 text-ink">{r.user || '—'}</td>
                    <td className="px-4 py-3"><ChannelBadge channel={r.channel} /></td>
                    <td className="px-4 py-3 text-ink">{actionLabel(r.action)}</td>
                    <td className="px-4 py-3" style={{ width: 220 }}><ProgressBar run={r} /></td>
                    <td className="px-4 py-3"><RunPill run={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawer && (
        <RunDrawer
          run={drawer}
          onClose={() => {
            setDrawer(null)
            setDrawerId(null)
          }}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  )
}
