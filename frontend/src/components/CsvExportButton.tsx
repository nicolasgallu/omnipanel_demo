// Botón "Descargar CSV" (Figma): modal con columnas + alcance + toast.
// El CSV lo genera el backend (export respeta búsqueda y filtros activos):
// `onExport(columns, limit)` devuelve el Blob con limit=0 → todas las filas.

import { useEffect, useState } from 'react'

const EXPORT_LIMIT = 1000
const fmtCount = (n: number) => n.toLocaleString('es-AR')

export function CsvExportButton({
  columns,
  label,
  filenameBase,
  rowsTotal,
  onExport,
}: {
  columns: { key: string; label: string }[]
  label: string
  filenameBase: string
  rowsTotal: number
  onExport: (columns: string[], limit: number) => Promise<Blob>
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ tone: 'ok' | 'err'; title: string; message: string } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // Cierre con Escape (además de click afuera y Cancelar).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy])

  const openModal = () => {
    setSelected(columns.map((c) => c.key))
    setAll(false)
    setOpen(true)
  }
  const close = () => {
    if (!busy) setOpen(false)
  }
  const toggleCol = (k: string) =>
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))
  const exportCount = all ? rowsTotal : Math.min(EXPORT_LIMIT, rowsTotal)

  const run = async () => {
    if (busy || selected.length === 0) return
    setBusy(true)
    try {
      const cols = columns.filter((c) => selected.includes(c.key)).map((c) => c.key)
      const blob = await onExport(cols, all ? 0 : EXPORT_LIMIT)
      const d = new Date()
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
      const filename = `${filenameBase}-${stamp}.csv`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setOpen(false)
      setToast({ tone: 'ok', title: 'CSV descargado', message: `${filename} · ${fmtCount(exportCount)} ${exportCount === 1 ? 'fila' : 'filas'}` })
    } catch (e) {
      setToast({ tone: 'err', title: 'No se pudo generar el CSV', message: e instanceof Error ? e.message : 'Intentá de nuevo en unos minutos.' })
    } finally {
      setBusy(false)
    }
  }

  const allChecked = selected.length === columns.length

  return (
    <>
      <button onClick={openModal} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors hover:bg-slate-50"
        style={{ border: '1.5px solid #E2E8F0', color: '#475569', background: 'white' }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Descargar CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)' }} onClick={close}>
          <div role="dialog" aria-modal="true" aria-labelledby="csv-title" className="w-full max-w-lg rounded-2xl bg-white flex flex-col max-h-[88vh]" style={{ boxShadow: '0 24px 60px rgba(15,23,42,0.28)', animation: 'fadeUp 0.18s ease both' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 px-6 pt-6 pb-4">
              <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: '#EEF2FF', color: '#4F46E5' }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M5 2.5h7l4 4v11H5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M12 2.5v4h4M7.5 11h6M7.5 14h6M10.5 9v7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 id="csv-title" className="text-lg font-bold" style={{ color: '#0A1628' }}>Descargar CSV</h3>
                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{label} · respeta la búsqueda y los filtros activos</p>
              </div>
              <button onClick={close} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" style={{ color: '#94A3B8' }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>

            <div className="flex flex-col gap-5 px-6 pb-5 overflow-y-auto">
              {/* Columnas */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>Columnas</span>
                  <button onClick={() => setSelected(allChecked ? [] : columns.map((c) => c.key))} className="text-xs font-medium hover:underline" style={{ color: '#4F46E5' }}>
                    {allChecked ? 'Desmarcar todas' : 'Marcar todas'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {columns.map((c) => {
                    const on = selected.includes(c.key)
                    return (
                      <label key={c.key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                        style={{ border: `1px solid ${on ? '#C7D2FE' : '#F1F5F9'}`, background: on ? '#F5F7FF' : 'white' }}>
                        <input type="checkbox" checked={on} onChange={() => toggleCol(c.key)} className="sr-only" />
                        <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                          style={{ background: on ? '#4F46E5' : 'white', border: `1.5px solid ${on ? '#4F46E5' : '#CBD5E1'}` }}>
                          {on && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5.2 4 7.2 8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </span>
                        <span className="text-xs truncate" style={{ color: on ? '#0A1628' : '#64748B', fontWeight: on ? 500 : 400 }}>{c.label}</span>
                      </label>
                    )
                  })}
                </div>
                <span className="text-xs" style={{ color: selected.length === 0 ? '#DC2626' : '#64748B' }}>
                  {selected.length === 0 ? 'Elegí al menos una columna' : `${selected.length} ${selected.length === 1 ? 'columna seleccionada' : 'columnas seleccionadas'}`}
                </span>
              </div>

              {/* Alcance */}
              <div className="flex flex-col gap-2.5">
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>Alcance</span>
                <div className="flex flex-col gap-1.5" role="radiogroup">
                  {[
                    { v: false, label: `Primeras ${fmtCount(EXPORT_LIMIT)} filas`, sub: 'Recomendado · más rápido' },
                    { v: true, label: 'Todas las filas', sub: 'Puede tardar más en archivos grandes' },
                  ].map((o) => {
                    const on = all === o.v
                    return (
                      <label key={String(o.v)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                        style={{ border: `1px solid ${on ? '#C7D2FE' : '#F1F5F9'}`, background: on ? '#F5F7FF' : 'white' }}>
                        <input type="radio" name="csv-scope" checked={on} onChange={() => setAll(o.v)} className="sr-only" />
                        <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: `1.5px solid ${on ? '#4F46E5' : '#CBD5E1'}` }}>
                          {on && <span className="w-2 h-2 rounded-full" style={{ background: '#4F46E5' }} />}
                        </span>
                        <span className="flex flex-col">
                          <span className="text-xs font-medium" style={{ color: '#0A1628' }}>{o.label}</span>
                          <span style={{ fontSize: '11px', color: '#94A3B8' }}>{o.sub}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                <div className="flex items-baseline gap-1.5 px-3 py-2.5 rounded-lg" style={{ background: '#F8FAFC' }}>
                  <span className="text-sm font-bold tabular-nums" style={{ color: '#0A1628' }}>{fmtCount(exportCount)}</span>
                  <span className="text-xs" style={{ color: '#64748B' }}>{exportCount === 1 ? 'fila se va a exportar' : 'filas se van a exportar'}</span>
                  {!all && rowsTotal > EXPORT_LIMIT && <span className="text-xs ml-auto" style={{ color: '#94A3B8' }}>de {fmtCount(rowsTotal)}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid #F1F5F9' }}>
              <button onClick={close} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ border: '1px solid #E2E8F0', color: '#475569', background: 'white' }}>Cancelar</button>
              <button onClick={run} disabled={busy || selected.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: busy ? '#818CF8' : selected.length === 0 ? '#C7D2FE' : '#4F46E5', cursor: busy ? 'wait' : selected.length === 0 ? 'default' : 'pointer' }}>
                {busy && <svg width="13" height="13" viewBox="0 0 12 12" fill="none" className="animate-spin"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" /><path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>}
                {busy ? 'Generando…' : 'Descargar CSV'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 right-6 flex items-start gap-2.5 rounded-xl px-4 py-3 max-w-sm"
          style={{ zIndex: 80, background: 'white', border: `1px solid ${toast.tone === 'ok' ? '#BBF7D0' : '#FECACA'}`, boxShadow: '0 12px 32px rgba(10,22,40,0.12)' }}>
          <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-px" style={{ background: toast.tone === 'ok' ? '#DCFCE7' : '#FEE2E2', color: toast.tone === 'ok' ? '#16A34A' : '#DC2626' }}>
            {toast.tone === 'ok'
              ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5.2 4 7.2 8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              : <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 2.5v3M5 7.5h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold" style={{ color: '#0A1628' }}>{toast.title}</div>
            <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.4, marginTop: 2 }}>{toast.message}</div>
          </div>
          <button onClick={() => setToast(null)} aria-label="Cerrar" className="text-sm leading-none" style={{ color: '#94A3B8' }}>×</button>
        </div>
      )}
    </>
  )
}
