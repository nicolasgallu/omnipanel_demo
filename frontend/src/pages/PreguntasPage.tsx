// Preguntas · Atención al cliente MercadoLibre (diseño Figma).
//
// Bandeja en tabla + conversación en panel lateral. El backend habla el
// contrato /api/mercadolibre/messages: kind question|post_sale, reply_status
// new|ai_suggested|needs_review|answered|closed, counts por tab/chip,
// paginación server-side, ml_url por item y MsgDetail con hilo buyer/seller.
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../lib/api/client'
import { aiApi, messagesApi } from '../lib/api/endpoints'
import { useAuth, usePermissions } from '../lib/auth'
import type {
  AiMode,
  CsSettings,
  MsgDetail,
  MsgKind,
  MsgListItem,
  MsgListResponse,
  MsgReply,
  ReplyStatus,
} from '../lib/api/types'
import { ImgPlaceholder } from '../components/ui'

const REPLY_STATUS: Record<ReplyStatus, { label: string; glyph: string; color: string; bg: string }> = {
  new: { label: 'Nueva', glyph: '●', color: '#4F46E5', bg: '#EEF2FF' },
  ai_suggested: { label: 'IA sugerida', glyph: '✨', color: '#7C3AED', bg: '#F5F3FF' },
  needs_review: { label: 'Para revisar', glyph: '⚠', color: '#B45309', bg: '#FEF3C7' },
  answered: { label: 'Respondida', glyph: '✓', color: '#16A34A', bg: '#DCFCE7' },
  closed: { label: 'Cerrada', glyph: '', color: '#64748B', bg: '#F1F5F9' },
}
const STATUS_ORDER: ReplyStatus[] = ['new', 'ai_suggested', 'needs_review', 'answered', 'closed']

const DEFAULT_CS: CsSettings = { mode: 'suggest', min_confidence: 75, audit: true }

const QUICK_REPLIES = [
  { label: 'Stock disponible', text: '¡Hola! Sí, tenemos stock disponible para envío inmediato. ¡Saludos!' },
  { label: 'Plazo de envío', text: '¡Hola! El envío demora entre 3 y 5 días hábiles con MercadoEnvíos. ¡Saludos!' },
  { label: 'Factura A', text: '¡Hola! Sí, hacemos factura A. Cuando confirmes la compra, mandanos tu CUIT por la mensajería. ¡Saludos!' },
  { label: 'Gracias por tu compra', text: '¡Gracias por tu compra! Cualquier duda, escribinos por acá.' },
]

function fmtWhen(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = (Date.now() - d.getTime()) / 60000
  if (diff < 1) return 'ahora'
  if (diff < 60) return `hace ${Math.round(diff)} min`
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const hm = d
    .toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    .replace(/\s*([ap])\.\s*m\./i, ' $1.m.')
    .replace(/\s/g, '\u00a0')
  if (sameDay) return hm
  const y = new Date(today)
  y.setDate(today.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `ayer ${hm}`
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

function fmtPrice(n: number) {
  return `$${n.toLocaleString('es-AR')}`
}

const SpinIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="animate-spin flex-shrink-0">
    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
    <path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
const SparkIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
    <path d="M8 1.5l1.4 4.1 4.1 1.4-4.1 1.4L8 12.5 6.6 8.4 2.5 7l4.1-1.4L8 1.5zM13 11l.6 1.4 1.4.6-1.4.6L13 15l-.6-1.4L11 13l1.4-.6L13 11z" fill="currentColor" />
  </svg>
)
function ExtLinkIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h4v4M13 3 7 9M11 9.5V13H3V5h3.5" />
    </svg>
  )
}

function ReplyStatusChip({ status, compact }: { status: ReplyStatus; compact?: boolean }) {
  const s = REPLY_STATUS[status]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${compact ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-[11px]'}`}
      style={{ color: s.color, background: s.bg }}
    >
      {s.glyph && <span aria-hidden style={{ fontSize: compact ? 8 : 9 }}>{s.glyph}</span>}
      {s.label}
    </span>
  )
}
function ModeBadge({ mode }: { mode: 'ai' | 'human' }) {
  return mode === 'ai' ? (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[10px] font-bold" style={{ color: '#7C3AED', background: '#F5F3FF' }}>
      <SparkIcon size={9} />IA
    </span>
  ) : (
    <span className="inline-flex items-center px-1.5 py-px rounded text-[10px] font-bold" style={{ color: '#0369A1', background: '#E0F2FE' }}>
      Humano
    </span>
  )
}
function MineBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-semibold" style={{ color: '#0A1628', background: '#F1F5F9' }}>
      <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5.5" r="2.8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2.5 14c.8-2.8 3-4.2 5.5-4.2s4.7 1.4 5.5 4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      Asignada a mí
    </span>
  )
}

function CsErrorState({ title, message, onRetry, busy }: { title: string; message: string; onRetry: () => void; busy?: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-6 py-12">
      <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#FEF2F2', color: '#DC2626' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 9-2.6M8.5 16a5 5 0 0 1 5-1M12 20h.01M3 3l18 18" />
        </svg>
      </span>
      <div>
        <p className="text-sm font-bold" style={{ color: '#0A1628' }}>{title}</p>
        <p className="text-xs mt-1 max-w-xs" style={{ color: '#64748B' }}>{message}</p>
      </div>
      <button onClick={onRetry} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: '#4F46E5' }}>
        {busy && <SpinIcon />} Reintentar
      </button>
    </div>
  )
}

function Notice({ tone, title, children, action }: { tone: 'info' | 'warn' | 'error' | 'lock'; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const t = {
    info: ['#EFF6FF', '#BFDBFE', '#1D4ED8'],
    warn: ['#FFFBEB', '#FDE68A', '#B45309'],
    error: ['#FEF2F2', '#FECACA', '#B91C1C'],
    lock: ['#F8FAFC', '#E2E8F0', '#475569'],
  }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className="flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background: t[0], border: `1px solid ${t[1]}` }}>
      <span className="mt-0.5 flex-shrink-0" style={{ color: t[2] }}>
        {tone === 'lock' ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 4.8v3.7M8 10.8h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold" style={{ color: t[2] }}>{title}</p>
        {children && <div className="text-xs mt-0.5 leading-relaxed" style={{ color: '#475569' }}>{children}</div>}
      </div>
      {action}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando conversaciones">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="px-4 py-3.5 flex flex-col gap-2 animate-pulse" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div className="flex justify-between"><div className="h-3 w-28 rounded bg-slate-200" /><div className="h-2.5 w-10 rounded bg-slate-100" /></div>
          <div className="h-2.5 w-40 rounded bg-slate-100" />
          <div className="h-2.5 w-full rounded bg-slate-100" />
          <div className="flex gap-1.5"><div className="h-4 w-16 rounded-full bg-slate-100" /><div className="h-4 w-8 rounded bg-slate-100" /></div>
        </div>
      ))}
    </div>
  )
}

function InboxSearch({ q, setQ }: { q: string; setQ: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#CBD5E1' }}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar comprador o producto…"
        aria-label="Buscar conversaciones"
        className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
        style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#0A1628' }}
        onFocus={(e) => { e.currentTarget.style.borderColor = '#4F46E5' }}
        onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
      />
    </div>
  )
}

function InboxEmpty({ kind, filtered, onClear }: { kind: MsgKind; filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-1.5 px-8 py-14">
      <p className="text-sm font-semibold" style={{ color: '#0A1628' }}>
        {filtered ? 'Sin resultados' : `Todavía no tenés ${kind === 'question' ? 'preguntas' : 'mensajes'}`}
      </p>
      <p className="text-xs max-w-[260px]" style={{ color: '#64748B' }}>
        {filtered ? 'No hay conversaciones con esos filtros.' : 'Cuando un comprador escriba, aparece acá.'}
      </p>
      {filtered && (
        <button onClick={onClear} className="text-xs font-semibold hover:underline mt-1" style={{ color: '#4F46E5' }}>
          Limpiar filtros
        </button>
      )}
    </div>
  )
}

function InboxToast({ toast }: { toast: { tone: 'ok' | 'err'; message: string } | null }) {
  if (!toast) return null
  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-6 bottom-24 md:bottom-6 flex items-center gap-2.5 rounded-xl px-4 py-3 max-w-[calc(100vw-32px)]"
      style={{ zIndex: 90, background: '#0A1628', color: 'white', boxShadow: '0 12px 32px rgba(10,22,40,0.25)', animation: 'fadeUp 0.18s ease both' }}
    >
      <span style={{ color: toast.tone === 'ok' ? '#4ADE80' : '#F87171' }}>{toast.tone === 'ok' ? '✓' : '!'}</span>
      <span className="text-[13px] font-medium">{toast.message}</span>
    </div>
  )
}

// ─── Bloque de sugerencia de IA ───────────────────────────────────────────────

function SuggestionBlock({
  draft, aiError, mode, minConfidence, busy, regenerating, sendError,
  onSend, onDiscard, onRetry, textRef,
}: {
  draft: MsgReply | null
  aiError: string | null
  mode: AiMode
  minConfidence: number
  busy: 'send' | 'discard' | null
  regenerating: boolean
  sendError: string | null
  onSend: (t: string) => void
  onDiscard: () => void
  onRetry: () => void
  textRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const [text, setText] = useState(draft?.text ?? '')
  useEffect(() => { setText(draft?.text ?? '') }, [draft])
  if (mode === 'off' && !draft && !aiError) return null
  const conf = draft?.audit_score != null ? Math.round(draft.audit_score * 100) : null
  const low = conf != null && conf < minConfidence

  return (
    <section aria-label="Sugerencia de IA" className="rounded-2xl overflow-hidden" style={{ border: '1px solid #DDD6FE', background: '#FDFCFF' }}>
      <header className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid #EDE9FE', background: '#F5F3FF' }}>
        <span style={{ color: '#7C3AED' }}><SparkIcon size={13} /></span>
        <span className="text-xs font-bold" style={{ color: '#5B21B6' }}>Sugerencia de IA</span>
        {draft && !regenerating && conf != null && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: low ? '#B45309' : '#475569' }} title={`Umbral mínimo: ${minConfidence}%`}>
            <span className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: '#EDE9FE' }}>
              <span className="block h-full rounded-full" style={{ width: `${conf}%`, background: low ? '#F59E0B' : '#7C3AED' }} />
            </span>
            Confianza {conf}%
          </span>
        )}
      </header>

      <div className="p-4 flex flex-col gap-3">
        {regenerating ? (
          <div className="flex flex-col gap-2 py-2" aria-busy="true">
            <span className="inline-flex items-center gap-2 text-xs font-medium" style={{ color: '#7C3AED' }}><SpinIcon /> Generando borrador y auditoría…</span>
            <div className="h-2.5 rounded bg-violet-100 animate-pulse w-full" />
            <div className="h-2.5 rounded bg-violet-100 animate-pulse w-11/12" />
            <div className="h-2.5 rounded bg-violet-100 animate-pulse w-2/3" />
          </div>
        ) : !draft ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm font-semibold" style={{ color: '#0A1628' }}>No pudimos generar una sugerencia</p>
            <p className="text-xs" style={{ color: '#64748B' }}>{aiError ?? 'La IA todavía no procesó este mensaje.'}</p>
            <button onClick={onRetry} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold" style={{ color: '#6D28D9', border: '1px solid #DDD6FE', background: 'white' }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Reintentar IA
            </button>
          </div>
        ) : (
          <>
            {draft.audit_verdict && (
              <div className="flex items-start gap-2 flex-wrap">
                {draft.audit_verdict === 'approved' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ color: '#16A34A', background: '#DCFCE7' }}>✓ Aprobada por el auditor</span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ color: '#B45309', background: '#FEF3C7' }}>✎ Corregida por el auditor</span>
                )}
                {low && <span className="text-[11px] font-medium" style={{ color: '#B45309' }}>Debajo del umbral de {minConfidence}%: revisala antes de enviar.</span>}
              </div>
            )}
            {draft.audit_issues.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-lg px-3 py-2" style={{ background: '#FFFBEB' }}>
                {draft.audit_issues.map((iss, i) => (
                  <li key={i} className="flex gap-1.5 text-[11.5px]" style={{ color: '#78350F' }}><span aria-hidden>•</span>{iss}</li>
                ))}
              </ul>
            )}
            <textarea
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              aria-label="Texto de la respuesta sugerida"
              className="w-full px-3.5 py-3 text-[13px] rounded-xl outline-none resize-y leading-relaxed"
              style={{ border: '1px solid #E2E8F0', background: 'white', color: '#0A1628' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.12)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none' }}
            />
            {draft.cited_products && draft.cited_products.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Productos citados</span>
                <div className="flex gap-1.5 flex-wrap">
                  {draft.cited_products.map((cp) => (
                    <span key={cp.title} className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full text-[11px]" style={{ border: '1px solid #E2E8F0', background: 'white' }}>
                      <span className="font-semibold" style={{ color: '#0A1628' }}>{cp.title}</span>
                      <span className="tabular-nums" style={{ color: '#475569' }}>{fmtPrice(cp.price)}</span>
                      <span className="tabular-nums px-1.5 rounded-full text-[10px] font-semibold" style={{ color: cp.stock > 0 ? '#16A34A' : '#DC2626', background: cp.stock > 0 ? '#DCFCE7' : '#FEE2E2' }}>
                        {cp.stock > 0 ? `${cp.stock} en stock` : 'Sin stock'}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {sendError && <Notice tone="error" title="No se pudo enviar la respuesta">{sendError} Tocá Enviar para reintentar.</Notice>}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => onSend(text)}
                disabled={!!busy || !text.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: busy === 'send' ? '#818CF8' : '#4F46E5', cursor: busy ? 'wait' : 'pointer' }}
              >
                {busy === 'send' ? <><SpinIcon /> Enviando…</> : sendError ? 'Reintentar envío' : 'Enviar'}
              </button>
              <button onClick={onDiscard} disabled={!!busy} className="px-3.5 py-2.5 rounded-xl text-sm font-medium" style={{ color: '#475569', border: '1px solid #E2E8F0', background: 'white' }}>
                {busy === 'discard' ? 'Descartando…' : 'Descartar'}
              </button>
              <button onClick={onRetry} disabled={!!busy} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold" style={{ color: '#6D28D9' }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Reintentar IA
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function Composer({
  locked, lockMsg, busy, onSend, onImprove, sendError, inputRef,
}: {
  locked: boolean
  lockMsg: string
  busy: 'send' | 'improve' | null
  sendError: string | null
  onSend: (t: string, clear: () => void) => void
  onImprove: (t: string, set: (v: string) => void) => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const [text, setText] = useState('')
  if (locked) {
    return (
      <div className="px-4 py-3 bg-white" style={{ borderTop: '1px solid #E2E8F0' }}>
        <Notice tone="lock" title="Solo lectura">{lockMsg}</Notice>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2 px-3 md:px-4 pt-2.5 pb-3 bg-white" style={{ borderTop: '1px solid #E2E8F0', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
      {sendError && (
        <Notice tone="error" title="No se pudo enviar la respuesta" action={<button onClick={() => onSend(text, () => setText(''))} className="text-xs font-bold underline flex-shrink-0" style={{ color: '#B91C1C' }}>Reintentar</button>}>
          {sendError}
        </Notice>
      )}
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" style={{ scrollbarWidth: 'none' }} aria-label="Respuestas rápidas">
        {QUICK_REPLIES.map((q) => (
          <button
            key={q.label}
            onClick={() => { setText(q.text); inputRef.current?.focus() }}
            className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors hover:bg-slate-100"
            style={{ border: '1px solid #E2E8F0', color: '#475569' }}
          >
            {q.label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Escribí tu respuesta…"
            aria-label="Respuesta manual"
            disabled={busy === 'improve'}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSend(text, () => setText('')) }}
            className="w-full px-3.5 py-2.5 text-[13px] rounded-xl outline-none resize-none leading-relaxed"
            style={{ border: '1px solid #E2E8F0', background: busy === 'improve' ? '#F8FAFC' : 'white', color: '#0A1628', maxHeight: 160 }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#4F46E5'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.1)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none' }}
          />
          {busy === 'improve' && (
            <span className="absolute inset-0 flex items-center justify-center gap-2 text-xs font-medium rounded-xl" style={{ color: '#7C3AED', background: 'rgba(255,255,255,0.7)' }}>
              <SpinIcon /> Mejorando con IA…
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onImprove(text, setText)}
          disabled={!text.trim() || !!busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-opacity"
          style={{ color: '#6D28D9', border: '1px solid #DDD6FE', background: '#FDFCFF', opacity: !text.trim() ? 0.5 : 1 }}
        >
          <SparkIcon size={11} /> Mejorar con IA
        </button>
        <span className="hidden md:inline text-[10.5px]" style={{ color: '#CBD5E1' }}>⌘/Ctrl + Enter para enviar</span>
        <button
          onClick={() => onSend(text, () => setText(''))}
          disabled={!text.trim() || !!busy}
          className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: !text.trim() ? '#C7D2FE' : busy === 'send' ? '#818CF8' : '#4F46E5' }}
        >
          {busy === 'send' ? <><SpinIcon /> Enviando…</> : <>Enviar <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 8 14 2l-4 12-2.5-4.5L2 8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></>}
        </button>
      </div>
    </div>
  )
}

// ─── Panel de conversación ────────────────────────────────────────────────────

function ThreadBubble({ rep }: { rep: MsgReply }) {
  const out = rep.author === 'seller'
  const failed = rep.status === 'failed'
  return (
    <div className={`flex flex-col gap-1 max-w-[86%] ${out ? 'self-end items-end' : 'self-start items-start'}`}>
      <div
        className="px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap"
        style={
          out
            ? { background: failed ? '#FEF2F2' : '#4F46E5', color: failed ? '#7F1D1D' : 'white', border: failed ? '1px dashed #FCA5A5' : 'none', borderRadius: '16px 16px 4px 16px' }
            : { background: 'white', color: '#0A1628', border: '1px solid #E2E8F0', borderRadius: '16px 16px 16px 4px' }
        }
      >
        {rep.text}
      </div>
      <div className="flex items-center gap-1.5 text-[10.5px]" style={{ color: '#94A3B8' }}>
        {out && rep.mode && <ModeBadge mode={rep.mode} />}
        <span className="tabular-nums">{fmtWhen(rep.created_at)}</span>
        {out &&
          (failed ? (
            <span className="font-semibold" style={{ color: '#DC2626' }}>· No enviada</span>
          ) : (
            <span className="inline-flex items-center gap-0.5">
              · Enviada
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l2.5 2.5L11 5.5M7.5 11l.5.5L13.5 5.5" stroke="#16A34A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          ))}
      </div>
    </div>
  )
}

function ConversationDetail({
  id, focusOnOpen, onBack, onChanged, onOpenProduct, toast,
}: {
  id: string
  focusOnOpen: boolean
  onBack: () => void
  onChanged: (patch: Partial<MsgListItem> & { id: string }) => void
  onOpenProduct: (productId: number) => void
  toast: (t: { tone: 'ok' | 'err'; message: string }) => void
}) {
  const { user } = useAuth()
  const me = String(user?.id ?? '')
  const [config, setConfig] = useState<CsSettings>(DEFAULT_CS)
  const [data, setData] = useState<MsgDetail | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [regenerating, setRegenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [sugBusy, setSugBusy] = useState<'send' | 'discard' | null>(null)
  const [sugErr, setSugErr] = useState<string | null>(null)
  const [compBusy, setCompBusy] = useState<'send' | 'improve' | null>(null)
  const [compErr, setCompErr] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const sugRef = useRef<HTMLTextAreaElement>(null)
  const compRef = useRef<HTMLTextAreaElement>(null)
  const threadEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    aiApi
      .getPrompts()
      .then((r) => setConfig(r.settings))
      .catch(() => setConfig(DEFAULT_CS))
  }, [])

  useEffect(() => {
    let alive = true
    setData(null)
    setLoadErr(null)
    setAiError(null)
    setSugErr(null)
    setCompErr(null)
    messagesApi
      .get(id)
      .then((d) => {
        if (alive) {
          setData(d)
          setAiError(d.message.ai_error ?? null)
        }
      })
      .catch((e) => {
        if (alive) setLoadErr(e instanceof Error ? e.message : 'Error del servidor.')
      })
    return () => { alive = false }
  }, [id, reload])

  // Entrada desde el link de WhatsApp/Telegram: foco directo en la respuesta.
  useEffect(() => {
    if (!data) return
    threadEnd.current?.scrollIntoView({ block: 'end' })
    if (focusOnOpen) setTimeout(() => (sugRef.current ?? compRef.current)?.focus(), 60)
  }, [data, focusOnOpen])

  if (loadErr) return <CsErrorState title="No pudimos abrir la conversación" message={loadErr} onRetry={() => setReload((n) => n + 1)} />
  if (!data) {
    return (
      <div className="flex-1 flex flex-col gap-4 p-5 animate-pulse" aria-busy="true">
        <div className="h-4 w-40 rounded bg-slate-200" />
        <div className="h-20 rounded-2xl bg-slate-100" />
        <div className="h-12 w-2/3 rounded-2xl bg-slate-100" />
        <div className="h-12 w-1/2 self-end rounded-2xl bg-slate-100" />
      </div>
    )
  }

  const m = data.message
  const draft = data.replies.find((x) => x.status === 'draft') ?? null
  const failed = data.replies.find((x) => x.status === 'failed') ?? null
  const thread = data.replies.filter((x) => x.status !== 'draft')
  const closed = m.reply_status === 'closed'
  const locked = closed || !!m.answered_externally
  const lockMsg = closed
    ? (m.closed_reason ?? 'La conversación está cerrada en MercadoLibre.') + ' Ya no se puede responder.'
    : 'Esta pregunta ya se respondió desde MercadoLibre. Para cambiar la respuesta, entrá a tu cuenta de MercadoLibre.'
  const showSuggestion =
    !locked && m.reply_status !== 'answered' &&
    (draft || aiError || regenerating || (config.mode !== 'off' && m.reply_status !== 'needs_review'))

  const apply = (d: MsgDetail) => {
    setData(d)
    onChanged({
      id,
      kind: d.message.kind,
      buyer_name: d.message.buyer_name,
      product_title: d.message.product_title,
      last_text: d.message.last_text,
      reply_status: d.message.reply_status,
      assigned_to: d.message.assigned_to,
      ai_confidence: d.message.ai_confidence,
      created_at: d.message.created_at,
      last_activity: d.message.last_activity,
      listing_id: d.message.listing_id,
      last_reply_mode: d.message.last_reply_mode,
    })
  }
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Error inesperado.')

  const regenerate = async () => {
    setRegenerating(true)
    setAiError(null)
    setSugErr(null)
    try {
      await messagesApi.aiSuggest(id)
      apply(await messagesApi.get(id))
    } catch (e) {
      setAiError(errMsg(e))
      if (e instanceof ApiError && e.code === 'needs_human') {
        onChanged({ id, reply_status: 'needs_review' })
        setData((d) => (d ? { ...d, message: { ...d.message, reply_status: 'needs_review' } } : d))
      }
    } finally {
      setRegenerating(false)
    }
  }
  const send = async (text: string, from: 'suggestion' | 'composer', clear?: () => void) => {
    if (!text.trim()) return
    const setBusy = from === 'suggestion' ? (v: 'send' | null) => setSugBusy(v) : (v: 'send' | null) => setCompBusy(v)
    const setErr = from === 'suggestion' ? setSugErr : setCompErr
    setBusy('send')
    setErr(null)
    try {
      await messagesApi.reply(id, text)
      apply(await messagesApi.get(id))
      clear?.()
      toast({ tone: 'ok', message: 'Respuesta enviada' })
    } catch (e) {
      setErr(errMsg(e))
      if (e instanceof ApiError && e.code === 'already_answered') {
        setData((d) => (d ? { ...d, message: { ...d.message, answered_externally: true } } : d))
      }
    } finally {
      setBusy(null)
    }
  }
  const discard = async () => {
    setSugBusy('discard')
    try {
      await messagesApi.discardSuggestion(id)
      apply(await messagesApi.get(id))
      setAiError(null)
      toast({ tone: 'ok', message: 'Sugerencia descartada' })
    } catch (e) {
      toast({ tone: 'err', message: errMsg(e) })
    } finally {
      setSugBusy(null)
    }
  }
  const improve = async (text: string, set: (v: string) => void) => {
    setCompBusy('improve')
    try {
      const res = await messagesApi.improve(id, text)
      set(res.text)
      compRef.current?.focus()
    } catch (e) {
      toast({ tone: 'err', message: `No se pudo mejorar el texto: ${errMsg(e)}` })
    } finally {
      setCompBusy(null)
    }
  }
  const assign = async () => {
    setAssigning(true)
    try {
      const res = await messagesApi.assign(id)
      setData((d) => (d ? { ...d, message: { ...d.message, assigned_to: res.assigned_to } } : d))
      onChanged({ id, assigned_to: res.assigned_to })
      toast({ tone: 'ok', message: res.assigned_to ? 'Conversación asignada a vos' : 'Conversación liberada' })
    } catch (e) {
      toast({ tone: 'err', message: errMsg(e) })
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      {/* Encabezado */}
      <header className="flex items-center gap-3 px-3 md:px-5 py-3 bg-white flex-shrink-0" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[15px] font-bold truncate" style={{ color: '#0A1628' }}>{m.buyer_name}</h2>
            <ReplyStatusChip status={m.reply_status} />
            {m.answered_externally && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ color: '#475569', background: '#F1F5F9' }}>Respondida desde MercadoLibre</span>}
          </div>
          <p className="text-[11px] truncate mt-0.5" style={{ color: '#94A3B8' }}>
            {m.kind === 'question' ? 'Pregunta' : 'Mensaje post-venta'} · {m.product_title} · <span className="font-mono">{m.listing_id}</span>
          </p>
        </div>
        {!closed && (
          <button
            onClick={assign}
            disabled={assigning}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
            style={m.assigned_to === me ? { color: '#475569', border: '1px solid #E2E8F0', background: 'white' } : { color: '#4F46E5', border: '1px solid #C7D2FE', background: '#EEF2FF' }}
          >
            {assigning ? <SpinIcon /> : null}
            {m.assigned_to === me ? 'Liberar' : 'Asignarme'}
          </button>
        )}
        <button onClick={onBack} aria-label="Cerrar conversación" className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100" style={{ color: '#94A3B8' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0" style={{ background: '#F8FAFC' }}>
        <div className="max-w-3xl mx-auto flex flex-col gap-4 px-3 md:px-6 py-4">
          {/* Tarjeta de producto */}
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3" style={{ border: '1px solid #E2E8F0' }}>
            <div className="flex-shrink-0"><ImgPlaceholder size={56} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate" style={{ color: '#0A1628' }}>{data.product.title}</p>
            </div>
            {m.product_id != null && (
              <button onClick={() => onOpenProduct(m.product_id!)} className="flex-shrink-0 text-xs font-semibold hover:underline" style={{ color: '#4F46E5' }}>
                Ver producto
              </button>
            )}
          </div>

          {closed && <Notice tone="lock" title="Conversación cerrada por MercadoLibre">{m.closed_reason} Se muestra solo como registro y quedó fuera de las colas activas.</Notice>}
          {m.reply_status === 'needs_review' && m.review_reason && <Notice tone="warn" title="Para revisar · la IA no respondió">{m.review_reason} Te avisamos por WhatsApp/Telegram.</Notice>}

          {/* Hilo */}
          <div className="flex flex-col gap-3" aria-label="Hilo de mensajes">
            {thread.map((rep, i) => <ThreadBubble key={i} rep={rep} />)}
          </div>

          {failed && !locked && (
            <Notice
              tone="error"
              title="No se pudo enviar la respuesta"
              action={
                <button onClick={() => send(failed.text, 'composer')} disabled={compBusy === 'send'} className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#DC2626' }}>
                  {compBusy === 'send' ? <SpinIcon size={11} /> : null}Reintentar
                </button>
              }
            >
              MercadoLibre rechazó el envío por un error temporal. No se reintenta solo: tocá Reintentar cuando quieras volver a mandarla.
            </Notice>
          )}

          {showSuggestion && (
            <SuggestionBlock
              draft={draft}
              aiError={aiError}
              mode={config.mode}
              minConfidence={config.min_confidence}
              busy={sugBusy}
              regenerating={regenerating}
              sendError={sugErr}
              onSend={(t) => send(t, 'suggestion')}
              onDiscard={discard}
              onRetry={regenerate}
              textRef={sugRef}
            />
          )}
          <div ref={threadEnd} />
        </div>
      </div>

      <Composer locked={locked} lockMsg={lockMsg} busy={compBusy} sendError={compErr} inputRef={compRef}
        onSend={(t, clear) => send(t, 'composer', clear)} onImprove={improve} />
    </div>
  )
}

// ─── Bandeja ──────────────────────────────────────────────────────────────────

function readOpenParam(searchParams: URLSearchParams) {
  return searchParams.get('open')
}

export default function PreguntasPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isBusiness } = usePermissions()
  const { user } = useAuth()
  const me = String(user?.id ?? '')
  const deepLinkId = useRef(readOpenParam(searchParams))

  const [kind, setKind] = useState<MsgKind>('question')
  const [statuses, setStatuses] = useState<ReplyStatus[]>([])
  const [q, setQ] = useState('')
  const [items, setItems] = useState<MsgListItem[] | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<MsgListResponse['counts']>({
    question: { total: 0, new: 0, ai_suggested: 0, needs_review: 0, answered: 0, closed: 0 },
    post_sale: { total: 0, new: 0, ai_suggested: 0, needs_review: 0, answered: 0, closed: 0 },
  })
  const [listErr, setListErr] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkId.current)
  const [toast, setToast] = useState<{ tone: 'ok' | 'err'; message: string } | null>(null)

  useEffect(() => { setPage(1) }, [kind, statuses, q, pageSize])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    let alive = true
    setItems(null)
    setListErr(null)
    const t = setTimeout(() => {
      messagesApi
        .list({ kind, reply_status: statuses, q, page, page_size: pageSize })
        .then((res) => {
          if (alive) {
            setItems(res.items)
            setTotal(res.total)
            setCounts(res.counts)
          }
        })
        .catch((e) => {
          if (alive) setListErr(e instanceof Error ? e.message : 'Error del servidor.')
        })
    }, q ? 250 : 0)
    return () => { alive = false; clearTimeout(t) }
  }, [kind, statuses, q, page, pageSize, reload])

  const select = (id: string | null) => {
    setSelectedId(id)
    const next = new URLSearchParams(searchParams)
    if (id) next.set('open', id)
    else next.delete('open')
    setSearchParams(next, { replace: true })
  }
  const setKindAndClear = (k: MsgKind) => {
    setKind(k)
    select(null)
  }
  const patchItem = (p: Partial<MsgListItem> & { id: string }) =>
    setItems((list) => (list ? list.map((it) => (it.id === p.id ? { ...it, ...p } : it)) : list))
  const toggleStatus = (s: ReplyStatus) =>
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
  const retry = () => setReload((n) => n + 1)
  const clearFilters = () => {
    setQ('')
    setStatuses([])
  }

  const cols = 'minmax(150px,1.1fr) minmax(140px,1fr) minmax(200px,2.2fr) 130px 70px 112px 44px'

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 relative">
      <header className="flex items-center gap-3 px-4 md:px-6 py-3 bg-white flex-shrink-0 flex-wrap" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <h1 className="text-base font-bold" style={{ color: '#0A1628' }}>Preguntas</h1>
        <div className="order-last md:order-none w-full md:w-auto md:flex-1 md:max-w-md md:ml-4">
          <InboxSearch q={q} setQ={setQ} />
        </div>
        <div className="ml-auto flex items-center gap-3">
          {isBusiness && (
            <button onClick={() => navigate('/prompts-ai')} className="text-xs font-semibold hover:underline" style={{ color: '#4F46E5' }}>
              Configurar IA
            </button>
          )}
        </div>
      </header>

      <div className="flex items-center gap-4 px-4 md:px-6 bg-white flex-shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid #E2E8F0', scrollbarWidth: 'none' }}>
        {([['question', 'Preguntas'], ['post_sale', 'Mensajes']] as [MsgKind, string][]).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKindAndClear(k)}
            className="flex-shrink-0 flex items-center gap-1.5 py-3 text-xs font-semibold transition-colors"
            style={{ color: kind === k ? '#0A1628' : '#94A3B8', borderBottom: `2px solid ${kind === k ? '#4F46E5' : 'transparent'}`, marginBottom: -1 }}
          >
            {label}
            <span className="tabular-nums px-1.5 rounded-full text-[10px]" style={{ background: kind === k ? '#EEF2FF' : '#F1F5F9', color: kind === k ? '#4F46E5' : '#94A3B8' }}>
              {counts[k]?.total ?? 0}
            </span>
          </button>
        ))}
        <span className="w-px h-4 flex-shrink-0" style={{ background: '#E2E8F0' }} />
        {STATUS_ORDER.map((s) => {
          const on = statuses.includes(s)
          const meta = REPLY_STATUS[s]
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              aria-pressed={on}
              className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
              style={{ background: on ? meta.bg : 'transparent', color: on ? meta.color : '#64748B', boxShadow: on ? `inset 0 0 0 1px ${meta.color}33` : 'none' }}
            >
              {meta.glyph && <span aria-hidden style={{ fontSize: 9 }}>{meta.glyph}</span>}
              {meta.label}
              <span className="tabular-nums" style={{ color: on ? meta.color : '#CBD5E1' }}>{counts[kind]?.[s] ?? 0}</span>
            </button>
          )
        })}
        {statuses.length > 0 && (
          <button onClick={() => setStatuses([])} className="flex-shrink-0 text-[11px] hover:underline" style={{ color: '#94A3B8' }}>
            Limpiar
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0 p-3 md:p-5 gap-3">
        <p className="text-xs px-1 flex-shrink-0" style={{ color: '#64748B' }}>
          {kind === 'question' ? (
            <><b style={{ color: '#0A1628' }}>Preventa</b> · Consultas públicas que hacen los compradores en tus publicaciones antes de comprar.</>
          ) : (
            <><b style={{ color: '#0A1628' }}>Postventa</b> · Mensajes privados con compradores después de una venta: envíos, facturas, reclamos y devoluciones.</>
          )}
        </p>
        <div className="flex-1 flex flex-col min-h-0 rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
          <div className="flex-1 overflow-auto bg-white min-h-0">
            <div className="hidden md:grid z-10 items-center gap-4 px-4 py-2.5 sticky top-0 bg-white" style={{ gridTemplateColumns: cols, borderBottom: '1px solid #F1F5F9' }}>
              {['Comprador', 'Producto', 'Último mensaje', 'Estado', 'Resp.', 'Actividad', 'ML'].map((h) => (
                <span key={h} style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.07em', color: '#94A3B8' }}>{h.toUpperCase()}</span>
              ))}
            </div>
            {listErr ? (
              <CsErrorState title="No pudimos cargar las conversaciones" message={listErr} onRetry={retry} />
            ) : !items ? (
              <ListSkeleton />
            ) : items.length === 0 ? (
              <InboxEmpty kind={kind} filtered={!!q || statuses.length > 0} onClear={clearFilters} />
            ) : (
              items.map((m) => {
                const sel = m.id === selectedId
                const unread = m.reply_status === 'new' || m.reply_status === 'needs_review'
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    key={m.id}
                    onClick={() => select(m.id)}
                    aria-current={sel}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(m.id) } }}
                    className="w-full text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 grid md:items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors grid-cols-[1fr_auto] md:[grid-template-columns:var(--cols)]"
                    style={{ ['--cols' as string]: cols, background: sel ? '#EEF2FF' : 'white', borderBottom: '1px solid #F8FAFC', boxShadow: sel ? 'inset 3px 0 0 #4F46E5' : 'none' }}
                    onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = '#F8FAFC' }}
                    onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = 'white' }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {unread && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: REPLY_STATUS[m.reply_status].color }} />}
                      <span className={`text-[13px] truncate ${unread ? 'font-bold' : 'font-medium'}`} style={{ color: '#0A1628' }}>{m.buyer_name}</span>
                      {m.assigned_to === me && <MineBadge />}
                    </span>
                    <span className="md:hidden text-[11px] tabular-nums text-right whitespace-nowrap" style={{ color: '#94A3B8' }}>{fmtWhen(m.last_activity)}</span>
                    <span className="text-xs truncate col-span-2 md:col-span-1" style={{ color: '#64748B' }}>{m.product_title}</span>
                    <span className="text-xs truncate col-span-2 md:col-span-1" style={{ color: unread ? '#334155' : '#94A3B8' }}>{m.last_text}</span>
                    <span className="flex items-center gap-1.5 col-span-2 md:col-span-1">
                      <ReplyStatusChip status={m.reply_status} compact />
                      <span className="md:hidden">{m.last_reply_mode && <ModeBadge mode={m.last_reply_mode} />}</span>
                    </span>
                    <span className="hidden md:block">{m.last_reply_mode ? <ModeBadge mode={m.last_reply_mode} /> : <span style={{ color: '#CBD5E1' }}>—</span>}</span>
                    <span className="hidden md:block text-xs tabular-nums whitespace-nowrap" style={{ color: unread ? '#4F46E5' : '#94A3B8', fontWeight: unread ? 600 : 400 }}>{fmtWhen(m.last_activity)}</span>
                    <a
                      href={m.ml_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Abrir en MercadoLibre"
                      aria-label={`Abrir conversación con ${m.buyer_name} en MercadoLibre`}
                      className="hidden md:flex w-7 h-7 rounded-lg items-center justify-center transition-colors hover:bg-amber-50"
                      style={{ color: '#94A3B8', border: '1px solid #E2E8F0' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#B45309'; e.currentTarget.style.borderColor = '#FDE68A' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.borderColor = '#E2E8F0' }}
                    >
                      <ExtLinkIcon />
                    </a>
                  </div>
                )
              })
            )}
          </div>
          <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 flex-shrink-0 bg-white" style={{ borderTop: '1px solid #E2E8F0' }}>
            <span className="text-xs" style={{ color: '#94A3B8' }}>{total} {total === 1 ? 'conversación' : 'conversaciones'}</span>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-xs" style={{ color: '#94A3B8' }}>Mostrar</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="hidden sm:block text-xs px-2 py-1 rounded-lg outline-none"
                style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#475569' }}
              >
                <option>50</option>
                <option>100</option>
                <option>200</option>
              </select>
              <span className="text-xs font-medium tabular-nums" style={{ color: '#475569' }}>
                {total ? (page - 1) * pageSize + 1 : 0} – {Math.min(page * pageSize, total)}
              </span>
              {(['‹', '›'] as const).map((g) => {
                const to = g === '‹' ? page - 1 : page + 1
                const dis = to < 1 || to > Math.max(1, Math.ceil(total / pageSize))
                return (
                  <button
                    key={g}
                    disabled={dis}
                    onClick={() => setPage(to)}
                    aria-label={g === '‹' ? 'Página anterior' : 'Página siguiente'}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-sm"
                    style={{ color: '#94A3B8', border: '1px solid #E2E8F0', cursor: dis ? 'default' : 'pointer', opacity: dis ? 0.4 : 1 }}
                    onMouseEnter={(e) => { if (!dis) e.currentTarget.style.background = '#F1F5F9' }}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {g}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {selectedId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="hidden md:block flex-1 bg-black/30 backdrop-blur-[1px]" onClick={() => select(null)} />
          <div className="w-full md:w-[820px] md:max-w-[92vw] flex flex-col bg-white shadow-2xl" style={{ borderLeft: '1px solid #E2E8F0', animation: 'fadeUp 0.2s ease both' }}>
            <ConversationDetail
              key={selectedId}
              id={selectedId}
              focusOnOpen={selectedId === deepLinkId.current}
              onBack={() => select(null)}
              onChanged={patchItem}
              onOpenProduct={(productId) => navigate(`/inventory?product=${productId}`)}
              toast={setToast}
            />
          </div>
        </div>
      )}
      <InboxToast toast={toast} />
    </div>
  )
}
