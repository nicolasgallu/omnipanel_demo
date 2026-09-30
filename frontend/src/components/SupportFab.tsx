// Botón flotante de soporte + modal de ticket (Figma: disponible en toda la app).
// POST /api/support/tickets (asunto + descripción; prioridad por defecto normal).

import { useState } from 'react'
import { supportApi } from '../lib/api/endpoints'

export function SupportFab() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Soporte"
        aria-label="Soporte"
        className="group fixed bottom-16 right-6 z-40 flex items-center h-12 rounded-full text-sm font-semibold text-white transition-all duration-300 hover:scale-105 px-3.5"
        style={{ background: '#4F46E5', boxShadow: '0 8px 24px rgba(79,70,229,0.35)' }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0" aria-hidden>
          <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12.2 7.8l2.6-2.6M5.2 14.8l2.6-2.6M12.2 12.2l2.6 2.6M5.2 5.2l2.6 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="overflow-hidden whitespace-nowrap transition-all duration-300 max-w-0 opacity-0 group-hover:max-w-[80px] group-hover:opacity-100 group-hover:ml-2">
          Soporte
        </span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div
            className="relative w-[440px] max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl scroll-slim"
            style={{ border: '1px solid #E2E8F0' }}
          >
            <div className="flex items-start justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-base font-bold text-ink">¿En qué te ayudamos?</h2>
                <p className="text-xs mt-0.5 text-subtle">Contanos el problema y te respondemos por correo.</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-muted"
                aria-label="Cerrar"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="px-5 pb-5">
              <TicketForm onDone={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function TicketForm({ onDone }: { onDone?: () => void }) {
  const [subject, setSubject] = useState('')
  const [detail, setDetail] = useState('')
  const [files, setFiles] = useState<TicketAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ticketId, setTicketId] = useState<number | null>(null)
  const canSend = subject.trim().length > 0 && detail.trim().length > 0 && !sending

  const inputStyle: React.CSSProperties = { background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#0A1628' }
  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = '#4F46E5'
    e.target.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.08)'
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = '#E2E8F0'
    e.target.style.boxShadow = 'none'
  }

  const send = async () => {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      // NOTA: los adjuntos todavía no viajan al backend (la tabla
      // support_tickets no tiene columna para archivos). Quedan en la UI
      // hasta que se implemente el almacenamiento (GCS + schema).
      const res = await supportApi.createTicket(subject.trim(), detail.trim())
      setTicketId(res.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el ticket')
      setSending(false)
    }
  }

  if (ticketId !== null) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-3 py-8 px-4">
        <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ color: '#16A34A', background: '#DCFCE7' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 12.5l3.5 3.5L18 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-bold text-ink">¡Ticket enviado!</p>
          <p className="text-xs mt-1 text-subtle">
            Te responderemos por correo. N.º de seguimiento{' '}
            <span className="font-semibold tabular-nums" style={{ color: '#4F46E5' }}>
              #{ticketId}
            </span>
          </p>
        </div>
        <button
          onClick={() => {
            setTicketId(null)
            setSubject('')
            setDetail('')
            setFiles([])
            onDone?.()
          }}
          className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          style={{ color: '#4F46E5', background: '#EEF2FF' }}
        >
          Listo
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="support-subject" style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94A3B8' }}>
          Asunto
        </label>
        <input
          id="support-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Resumí el problema en una línea"
          className="w-full px-3 py-2 rounded-xl text-sm outline-none transition-all text-ink"
          style={inputStyle}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="support-detail" style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94A3B8' }}>
          Descripción
        </label>
        <textarea
          id="support-detail"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={4}
          placeholder="Contanos qué pasó, qué esperabas y los pasos para reproducirlo…"
          className="w-full px-3 py-2 rounded-xl text-sm outline-none transition-all resize-none text-ink"
          style={inputStyle}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </div>

      <TicketImageDrop files={files} setFiles={setFiles} />

      {error && (
        <div className="px-3 py-2.5 rounded-xl text-xs font-medium" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

      <button
        disabled={!canSend}
        onClick={send}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
        style={{ background: canSend ? '#4F46E5' : '#E2E8F0', color: canSend ? 'white' : '#94A3B8', cursor: canSend ? 'pointer' : 'not-allowed' }}
      >
        {sending ? 'Enviando…' : 'Enviar ticket'}
      </button>
    </div>
  )
}

// ─── Dropzone de adjuntos (Figma TicketImageDrop) ────────────────────────────

type TicketAttachment = { url: string; name: string }

function TicketImageDrop({ files, setFiles }: { files: TicketAttachment[]; setFiles: (f: TicketAttachment[]) => void }) {
  const add = (list: FileList | null) => {
    if (!list) return
    const next = Array.from(list)
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => ({ url: URL.createObjectURL(f), name: f.name }))
    setFiles([...files, ...next])
  }
  return (
    <div className="flex flex-col gap-2">
      <label
        className="flex flex-col items-center justify-center gap-1.5 rounded-xl cursor-pointer transition-colors py-5 px-3 text-center"
        style={{ border: '1.5px dashed #CBD5E1', background: '#F8FAFC' }}
        onDragOver={(e) => {
          e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          add(e.dataTransfer.files)
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#4F46E5')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#CBD5E1')}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: '#94A3B8' }} aria-hidden>
          <path d="M10 13V4M6.5 7.5L10 4l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3.5 13v2a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="text-xs font-medium text-subtle">Adjuntar captura del problema</span>
        <span style={{ fontSize: '10px', color: '#94A3B8' }}>Arrastrá una imagen o hacé click · PNG, JPG</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
      {files.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {files.map((f, i) => (
            <div key={i} className="relative group" style={{ width: 56, height: 56 }}>
              <img src={f.url} alt={f.name} className="w-full h-full object-cover rounded-lg" style={{ border: '1px solid #E2E8F0' }} />
              <button
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white transition-transform group-hover:scale-110"
                style={{ background: '#DC2626', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
                title="Quitar"
                aria-label={`Quitar ${f.name}`}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2.5 4h11M6 4V2.8A.8.8 0 0 1 6.8 2h2.4a.8.8 0 0 1 .8.8V4M12.5 4l-.6 8.4a1 1 0 0 1-1 .9H5.1a1 1 0 0 1-1-.9L3.5 4M6.5 6.8v4M9.5 6.8v4" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
