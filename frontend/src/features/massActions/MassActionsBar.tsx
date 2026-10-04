// Barra flotante de acciones masivas (Figma v184): aparece al seleccionar
// filas en cualquiera de las tres vistas de inventario. Incluye:
//   - el cartel "N seleccionados" + Deseleccionar + botón Acciones masivas,
//   - el menú de dos paneles (acciones a la izquierda, desglose por
//     plataforma a la derecha) con conteos EN VIVO del backend,
//   - el modal de confirmación por acción (checkboxes por plataforma +
//     confirmación extra para borrar),
//   - el toast "Acción encolada".

import { useEffect, useRef, useState } from 'react'
import { massActionsApi } from '../../lib/api/endpoints'
import type { MassAction, MassChannel, MassEligibility } from '../../lib/api/types'
import { ChannelBadge, channelName } from '../../components/ChannelBadge'
import { Spinner } from '../../components/ui'
import { MASS_ACTIONS, actionLabel, CHANNEL_LABEL } from './shared'

export function MassActionsBar({
  selectedIds,
  onClear,
}: {
  selectedIds: number[]
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState<MassAction | null>(null)
  const [counts, setCounts] = useState<MassEligibility | null>(null)
  const [countsLoading, setCountsLoading] = useState(false)

  const [modalAction, setModalAction] = useState<MassAction | null>(null)
  const [checked, setChecked] = useState<Record<MassChannel, boolean>>({ ml: true, tn: true })
  const [simulating, setSimulating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const reqId = useRef(0)

  // Conteos en vivo: se recalculan con la selección (debounce 300ms).
  useEffect(() => {
    if (selectedIds.length === 0) {
      setCounts(null)
      setOpen(false)
      setModalAction(null)
      return
    }
    setCountsLoading(true)
    const id = ++reqId.current
    const t = setTimeout(() => {
      massActionsApi
        .eligibility(selectedIds)
        .then((res) => {
          if (reqId.current === id) setCounts(res)
        })
        .catch(() => {
          if (reqId.current === id) setCounts(null)
        })
        .finally(() => {
          if (reqId.current === id) setCountsLoading(false)
        })
    }, 300)
    return () => clearTimeout(t)
  }, [selectedIds])

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  const openModal = (action: MassAction) => {
    const c = counts?.[action] ?? { ml: 0, tn: 0 }
    setChecked({ ml: c.ml > 0, tn: c.tn > 0 })
    setDeleteConfirm(false)
    setError(null)
    setModalAction(action)
    setOpen(false)
    setSimulating(true)
    // Spinner breve "mientras calcula" (los conteos ya están en el cartel).
    setTimeout(() => setSimulating(false), 650)
  }

  const enqueue = async () => {
    if (!modalAction) return
    const c = counts?.[modalAction] ?? { ml: 0, tn: 0 }
    const channels = (['ml', 'tn'] as MassChannel[]).filter((ch) => checked[ch] && c[ch] > 0)
    if (channels.length === 0) return
    setBusy(true)
    setError(null)
    try {
      for (const ch of channels) {
        await massActionsApi.create(modalAction, ch, selectedIds)
      }
      showToast('Acción encolada')
      setModalAction(null)
      onClear()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo encolar la acción')
    } finally {
      setBusy(false)
    }
  }

  if (selectedIds.length === 0) return null

  const totalFor = (action: MassAction) => {
    const c = counts?.[action]
    return c ? c.ml + c.tn : 0
  }
  const modalCounts = modalAction ? (counts?.[modalAction] ?? { ml: 0, tn: 0 }) : { ml: 0, tn: 0 }
  const checkedTotal = modalAction
    ? (['ml', 'tn'] as MassChannel[]).reduce((n, ch) => n + (checked[ch] ? modalCounts[ch] : 0), 0)
    : 0
  const nothingEligible = modalAction !== null && checkedTotal === 0 && !simulating
  const summaryParts = (['ml', 'tn'] as MassChannel[])
    .filter((ch) => checked[ch] && modalCounts[ch] > 0)
    .map((ch) => `${modalCounts[ch]} publicaciones en ${CHANNEL_LABEL[ch]}`)

  return (
    <>
      {/* ─── Barra flotante ─── */}
      <div className="fixed left-1/2 -translate-x-1/2 z-50 massDrop" style={{ top: 14 }}>
        <div
          className="flex items-center gap-3 pl-4 pr-2 py-2 rounded-full bg-white shadow-lg"
          style={{ border: '1px solid #E2E8F0' }}
        >
          <span className="text-xs font-semibold text-ink tabular-nums">
            {selectedIds.length} seleccionado{selectedIds.length === 1 ? '' : 's'}
          </span>
          <button
            onClick={onClear}
            className="text-xs font-medium transition-colors hover:underline"
            style={{ color: '#4F46E5' }}
          >
            Deseleccionar
          </button>
          <div className="w-px h-4" style={{ background: '#E2E8F0' }} />
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: '#4F46E5' }}
          >
            Acciones masivas
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* ─── Menú de dos paneles ─── */}
        {open && (
          <div
            className="absolute right-0 mt-2 flex rounded-2xl bg-white shadow-xl overflow-hidden"
            style={{ border: '1px solid #E2E8F0', width: 560 }}
          >
            {/* Izquierda: acciones con total */}
            <div className="w-56 flex flex-col py-2" style={{ borderRight: '1px solid #F1F5F9' }}>
              {MASS_ACTIONS.map((a) => {
                const total = totalFor(a.action)
                const disabled = total === 0
                return (
                  <button
                    key={a.action}
                    disabled={disabled}
                    onMouseEnter={() => setHovered(a.action)}
                    onClick={() => !disabled && openModal(a.action)}
                    className="flex items-center justify-between px-4 py-2 text-left transition-colors disabled:opacity-40"
                    style={{
                      background: hovered === a.action ? '#EEF2FF' : 'transparent',
                      cursor: disabled ? 'default' : 'pointer',
                    }}
                  >
                    <span
                      className="text-xs font-medium"
                      style={{ color: a.action === 'delete' ? '#DC2626' : '#0A1628' }}
                    >
                      {a.label}
                    </span>
                    <span className="text-xs font-semibold tabular-nums" style={{ color: '#94A3B8' }}>
                      {total}
                    </span>
                  </button>
                )
              })}
              {countsLoading && (
                <span className="flex items-center gap-1.5 px-4 py-2 text-[10px]" style={{ color: '#94A3B8' }}>
                  <Spinner size={10} /> calculando…
                </span>
              )}
            </div>

            {/* Derecha: desglose por plataforma del hovered */}
            <div className="flex-1 flex flex-col p-4 gap-2 min-h-0">
              {hovered ? (
                <>
                  <span className="text-xs font-bold text-ink">{actionLabel(hovered)}</span>
                  {MASS_ACTIONS.find((a) => a.action === hovered)!.platforms.map((ch) => {
                    const n = counts?.[hovered][ch] ?? 0
                    return (
                      <div
                        key={ch}
                        className="flex items-center justify-between py-1.5 px-2 rounded-xl"
                        style={{ background: '#F8FAFC', opacity: n === 0 ? 0.5 : 1 }}
                      >
                        <span className="flex items-center gap-2">
                          <ChannelBadge channel={ch} />
                          <span className="text-xs text-subtle">{channelName(ch)}</span>
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-ink">{n}</span>
                      </div>
                    )
                  })}
                  <button
                    disabled={totalFor(hovered) === 0}
                    onClick={() => openModal(hovered)}
                    className="mt-2 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                    style={{ background: hovered === 'delete' ? '#DC2626' : '#4F46E5' }}
                  >
                    {actionLabel(hovered)} · {totalFor(hovered)}
                  </button>
                </>
              ) : (
                <span className="text-xs text-muted m-auto">Pasá el mouse sobre una acción</span>
              )}
            </div>
          </div>
        )}
      </div>
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}

      {/* ─── Modal de confirmación ─── */}
      {modalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(10,22,40,0.4)' }}>
          <div
            className="rounded-2xl bg-white shadow-2xl p-6 flex flex-col gap-4"
            style={{ width: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm font-bold text-ink">{actionLabel(modalAction)}</span>

            {simulating ? (
              <div className="flex items-center justify-center py-6">
                <Spinner size={18} />
              </div>
            ) : nothingEligible ? (
              <span className="text-xs text-muted">
                Ninguna de las publicaciones seleccionadas puede ejecutar esta acción.
              </span>
            ) : (
              <>
                <p className="text-xs text-subtle leading-relaxed">
                  Vas a {MASS_ACTIONS.find((a) => a.action === modalAction)!.verb}{' '}
                  {summaryParts.join(' y ')}.
                </p>
                {MASS_ACTIONS.find((a) => a.action === modalAction)!.platforms.map((ch) => (
                  <label
                    key={ch}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                    style={{
                      background: '#F8FAFC',
                      opacity: modalCounts[ch] === 0 ? 0.55 : 1,
                      cursor: modalCounts[ch] === 0 ? 'default' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      disabled={modalCounts[ch] === 0}
                      checked={checked[ch]}
                      onChange={() => setChecked((c) => ({ ...c, [ch]: !c[ch] }))}
                      className="w-3.5 h-3.5"
                      style={{ accentColor: '#4F46E5' }}
                    />
                    <ChannelBadge channel={ch} />
                    <span className="flex-1 text-xs text-ink">{channelName(ch)}</span>
                    <span className="text-xs font-semibold tabular-nums text-ink">{modalCounts[ch]}</span>
                  </label>
                ))}

                {modalAction === 'delete' && (
                  <div className="flex flex-col gap-2 p-3 rounded-xl" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                    <span className="text-xs font-semibold" style={{ color: '#DC2626' }}>
                      Esta acción no se puede deshacer
                    </span>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deleteConfirm}
                        onChange={() => setDeleteConfirm((v) => !v)}
                        className="w-3.5 h-3.5 mt-0.5"
                        style={{ accentColor: '#DC2626' }}
                      />
                      <span className="text-xs" style={{ color: '#B91C1C' }}>
                        Entiendo que esto borra definitivamente {checkedTotal} publicacion{checkedTotal === 1 ? '' : 'es'}
                      </span>
                    </label>
                  </div>
                )}

                {error && <span className="text-xs" style={{ color: '#DC2626' }}>{error}</span>}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => setModalAction(null)}
                    className="px-3 py-2 rounded-xl text-xs font-medium"
                    style={{ border: '1px solid #E2E8F0', color: '#475569' }}
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={busy || checkedTotal === 0 || (modalAction === 'delete' && !deleteConfirm)}
                    onClick={enqueue}
                    className="px-3 py-2 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                    style={{ background: modalAction === 'delete' ? '#DC2626' : '#4F46E5' }}
                  >
                    {busy ? 'Encolando…' : 'Encolar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Toast ─── */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-ink shadow-lg massDrop" style={{ bottom: 24 }}>
          <span className="text-xs font-medium text-white">{toast}</span>
        </div>
      )}
    </>
  )
}
