// Configuración > Notificaciones (Figma v2): una card por canal con
// contactos múltiples (máx. 10 por canal, {id, label, destination, enabled})
// + tabla de eventos. Autosave con debounce: no existe botón "Guardar
// cambios"; cada edición o toggle persiste sola y la card muestra
// "Guardando…" / "Guardado ✓" / "No se pudo guardar · Reintentar".
//
// Backend: GET/PUT /api/notifications/settings + POST /api/notifications/test
// (con {channel, contact}). Las preferencias viven en businesses.config.

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { notificationsApi } from '../../lib/api/endpoints'
import type {
  NotifChannel,
  NotificationContact,
  NotificationEventKey,
  NotificationSettings,
} from '../../lib/api/types'
import { ErrorBox, SpinnerText, Toggle } from '../../components/ui'
import { InfoNote, SettingsCard } from './settingsShared'

const NOTIF_CONTACT_LIMIT = 10
const MAX_LABEL_LENGTH = 24

const NOTIF_EVENTS: { key: NotificationEventKey; label: string; desc: string; hint?: string }[] = [
  { key: 'order_confirmed', label: 'Venta confirmada', desc: 'Cuando entra una venta nueva y pagada.' },
  { key: 'order_cancelled', label: 'Orden cancelada', desc: 'Cuando se cancela una venta y se revierte el stock.' },
  { key: 'order_delivered', label: 'Orden entregada', desc: 'Cuando el envío llega al comprador.' },
  { key: 'scraping_finished', label: 'Scraping finalizado', desc: 'Cuando termina una corrida de búsqueda de competencia.' },
  {
    key: 'label_ready',
    label: 'Etiqueta lista para despachar',
    desc: "Cuando un envío de MercadoLibre pasa a 'Listo para enviar': mandamos la etiqueta en PDF. Si MercadoLibre todavía no la generó, avisamos por texto con el número de orden para descargarla desde la app.",
    hint: 'El PDF viaja como documento adjunto en WhatsApp y Telegram.',
  },
  {
    key: 'message_needs_review',
    label: 'Pregunta sin responder por la IA',
    desc: 'Cuando una pregunta o mensaje de MercadoLibre queda Para revisar (reclamo, devolución, baja confianza, fallo de envío) o la IA está en Off. Un solo aviso por conversación hasta que el comprador vuelva a escribir.',
    hint: 'Incluye un link directo que abre la conversación en Preguntas.',
  },
]

// ─── Validación (espejo del backend) ─────────────────────────────────────────

const normDest = (ch: NotifChannel, v: string) =>
  ch === 'whatsapp' ? v.replace(/\D/g, '') : v.trim()

function validateContact(
  ch: NotifChannel,
  label: string,
  dest: string,
  others: NotificationContact[],
): { label?: string; destination?: string } {
  const err: { label?: string; destination?: string } = {}
  if (!label.trim()) err.label = 'Poné una etiqueta corta (ej. Nico, Depósito).'
  else if (label.trim().length > MAX_LABEL_LENGTH) err.label = `Máximo ${MAX_LABEL_LENGTH} caracteres.`
  const d = dest.trim()
  if (!d) err.destination = ch === 'whatsapp' ? 'Ingresá un número de WhatsApp.' : 'Ingresá un chat id.'
  else if (ch === 'whatsapp' && (!/^\+?[\d\s\-()]+$/.test(d) || normDest(ch, d).length < 10 || normDest(ch, d).length > 15))
    err.destination = 'Número inválido. Usá formato internacional con código de país, ej. +54 9 11 2345 6789.'
  else if (ch === 'telegram' && !/^-?\d+$/.test(d))
    err.destination = 'El chat id tiene que ser numérico (ej. 123456789).'
  else {
    const dup = others.find((o) => normDest(ch, o.destination) === normDest(ch, d))
    if (dup) err.destination = `Este destino ya está cargado para "${dup.label}".`
  }
  return err
}

const CHANNEL_META: Record<
  NotifChannel,
  { name: string; color: string; bg: string; destLabel: string; placeholder: string; icon: ReactNode }
> = {
  whatsapp: {
    name: 'WhatsApp',
    color: '#16A34A',
    bg: '#DCFCE7',
    destLabel: 'Número',
    placeholder: '+54 9 11 2345 6789',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M8 1.8a6.2 6.2 0 0 0-5.3 9.4L2 14l2.9-.7A6.2 6.2 0 1 0 8 1.8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M6 5.6c.2 1.9 1.6 3.7 3.9 4.6l.9-1-1.1-.6-.6.5c-.8-.4-1.4-1-1.8-1.8l.5-.6-.6-1.1-1.2 0z" fill="currentColor" />
      </svg>
    ),
  },
  telegram: {
    name: 'Telegram',
    color: '#0284C7',
    bg: '#E0F2FE',
    destLabel: 'Chat ID',
    placeholder: '123456789',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 7.5 14 3l-2 10-3.5-2.5L6.5 12l-.3-2.7L11 5.5 5.6 8.8 2 7.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    ),
  },
}

function TrashIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === 'idle')
    return <span className="text-[11px]" style={{ color: '#CBD5E1' }}>Se guarda automáticamente</span>
  if (state === 'saving')
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: '#64748B' }} aria-live="polite">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="animate-spin">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
          <path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Guardando…
      </span>
    )
  if (state === 'saved')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: '#16A34A', animation: 'fadeUp 0.2s ease both' }} aria-live="polite">
        Guardado
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="M4 8.5l2.5 2.5L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: '#DC2626' }} aria-live="assertive">
      No se pudo guardar
      <button onClick={onRetry} className="font-semibold underline">Reintentar</button>
    </span>
  )
}

function FieldError({ children }: { children: ReactNode }) {
  return <span className="text-[11.5px] font-medium" style={{ color: '#DC2626' }}>{children}</span>
}

function ContactInput({
  value,
  onChange,
  onCommit,
  onCancel,
  placeholder,
  invalid,
  mono,
  dim,
  ariaLabel,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  onCancel?: () => void
  placeholder: string
  invalid?: boolean
  mono?: boolean
  dim?: boolean
  ariaLabel: string
  autoFocus?: boolean
}) {
  const base = invalid ? '#FCA5A5' : '#E2E8F0'
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      autoFocus={autoFocus}
      onBlur={(e) => {
        e.target.style.borderColor = base
        e.target.style.boxShadow = 'none'
        onCommit()
      }}
      onFocus={(e) => {
        e.target.style.borderColor = invalid ? '#DC2626' : '#4F46E5'
        e.target.style.boxShadow = `0 0 0 3px ${invalid ? 'rgba(220,38,38,0.1)' : 'rgba(79,70,229,0.1)'}`
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit()
        }
        if (e.key === 'Escape') onCancel?.()
      }}
      className={`w-full px-3 py-2 text-[13px] rounded-lg outline-none transition-all ${mono ? 'font-mono tabular-nums' : ''}`}
      style={{ border: `1px solid ${base}`, color: dim ? '#94A3B8' : '#0A1628', background: invalid ? '#FEF2F2' : 'white' }}
    />
  )
}

type TestState = { kind: 'sending' } | { kind: 'ok' } | { kind: 'err'; message: string }

function ContactRow({
  ch,
  contact,
  others,
  onUpdate,
  onRemove,
}: {
  ch: NotifChannel
  contact: NotificationContact
  others: NotificationContact[]
  onUpdate: (c: NotificationContact) => void
  onRemove: () => void
}) {
  const meta = CHANNEL_META[ch]
  const [label, setLabel] = useState(contact.label)
  const [dest, setDest] = useState(contact.destination)
  const [errors, setErrors] = useState<{ label?: string; destination?: string }>({})
  const [test, setTest] = useState<TestState | null>(null)
  const muted = !contact.enabled

  useEffect(() => {
    if (test?.kind !== 'ok') return
    const t = setTimeout(() => setTest(null), 4000)
    return () => clearTimeout(t)
  }, [test])

  const commit = () => {
    if (label === contact.label && dest === contact.destination) {
      setErrors({})
      return
    }
    const err = validateContact(ch, label, dest, others)
    setErrors(err)
    if (!err.label && !err.destination) onUpdate({ ...contact, label: label.trim(), destination: dest.trim() })
  }
  const revert = () => {
    setLabel(contact.label)
    setDest(contact.destination)
    setErrors({})
  }
  const dirtyInvalid =
    Boolean(errors.label || errors.destination) && (label !== contact.label || dest !== contact.destination)

  const runTest = async () => {
    setTest({ kind: 'sending' })
    try {
      await notificationsApi.test(ch, contact)
      setTest({ kind: 'ok' })
    } catch (e) {
      setTest({ kind: 'err', message: e instanceof Error ? e.message : 'No se pudo enviar el mensaje de prueba.' })
    }
  }

  return (
    <div className="px-4 py-3 transition-colors" style={{ background: muted ? '#FAFBFC' : 'white', borderTop: '1px solid #F1F5F9' }}>
      <div className="grid items-center gap-3" style={{ gridTemplateColumns: '150px minmax(0,1fr) auto 36px 28px' }}>
        <div className="relative">
          <ContactInput value={label} onChange={setLabel} onCommit={commit} onCancel={revert} placeholder="Etiqueta" invalid={!!errors.label} dim={muted} ariaLabel="Etiqueta del contacto" />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <ContactInput value={dest} onChange={setDest} onCommit={commit} onCancel={revert} placeholder={meta.placeholder} invalid={!!errors.destination} mono dim={muted} ariaLabel={`${meta.destLabel} de ${contact.label}`} />
          {muted && (
            <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#F1F5F9', color: '#64748B' }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M6.5 3.6A4.5 4.5 0 0 1 12.5 7.5c0 2 .6 3.2 1.2 4M3.8 6.4c-.1.4-.3.8-.3 1.1 0 3-1 4.5-2 5.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Silenciado
            </span>
          )}
        </div>
        <button
          onClick={runTest}
          disabled={test?.kind === 'sending' || !!dirtyInvalid}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors hover:bg-slate-50"
          style={{ border: '1px solid #E2E8F0', color: test?.kind === 'sending' ? '#94A3B8' : '#475569', background: 'white', cursor: test?.kind === 'sending' ? 'wait' : 'pointer', opacity: dirtyInvalid ? 0.5 : 1 }}
        >
          {test?.kind === 'sending' ? (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="animate-spin">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
              <path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M2 8 14 2l-4 12-2.5-4.5L2 8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          )}
          {test?.kind === 'sending' ? 'Enviando…' : 'Enviar mensaje de prueba'}
        </button>
        <div className="flex justify-center" title={muted ? 'Activar contacto' : 'Silenciar contacto'}>
          <Toggle value={contact.enabled} onChange={(v) => onUpdate({ ...contact, enabled: v })} />
        </div>
        <button
          onClick={onRemove}
          aria-label={`Eliminar ${contact.label}`}
          title="Eliminar contacto"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: '#CBD5E1' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#DC2626'
            e.currentTarget.style.background = '#FEF2F2'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#CBD5E1'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <TrashIcon size={13} />
        </button>
      </div>

      {(errors.label || errors.destination) && (
        <div className="flex flex-col gap-0.5 mt-1.5 pl-0.5">
          {errors.label && <FieldError>{errors.label}</FieldError>}
          {errors.destination && <FieldError>{errors.destination}</FieldError>}
          <span className="text-[10.5px]" style={{ color: '#94A3B8' }}>Sin guardar · corregilo o presioná Esc para descartar.</span>
        </div>
      )}
      {test?.kind === 'ok' && (
        <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: '#16A34A', animation: 'fadeUp 0.18s ease both' }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M4 8.5l2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Mensaje de prueba enviado a {contact.label} por {meta.name}.
        </div>
      )}
      {test?.kind === 'err' && (
        <div className="mt-1.5 flex items-center gap-2 text-[11.5px]" style={{ color: '#B91C1C' }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 5v3.5M8 10.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>{test.message}</span>
          <button onClick={runTest} className="font-semibold underline">Reintentar</button>
        </div>
      )}
    </div>
  )
}

function KeySubmit({ onEnter }: { onEnter: () => void }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const row = ref.current?.parentElement
    if (!row) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') onEnter()
    }
    row.addEventListener('keydown', h)
    return () => row.removeEventListener('keydown', h)
  }, [onEnter])
  return <span ref={ref} className="hidden" />
}

function NewContactRow({
  ch,
  existing,
  onAdd,
  onCancel,
}: {
  ch: NotifChannel
  existing: NotificationContact[]
  onAdd: (c: NotificationContact) => void
  onCancel: () => void
}) {
  const meta = CHANNEL_META[ch]
  const [label, setLabel] = useState('')
  const [dest, setDest] = useState('')
  const [errors, setErrors] = useState<{ label?: string; destination?: string }>({})

  const submit = () => {
    const err = validateContact(ch, label, dest, existing)
    setErrors(err)
    if (!err.label && !err.destination) onAdd({ id: `${ch}-${Date.now()}`, label: label.trim(), destination: dest.trim(), enabled: true })
  }
  return (
    <div className="px-4 py-3" style={{ background: '#F5F7FF', borderTop: '1px solid #E0E7FF' }}>
      <div className="grid items-center gap-3" style={{ gridTemplateColumns: '150px minmax(0,1fr) auto' }}>
        <ContactInput value={label} onChange={setLabel} onCommit={() => {}} onCancel={onCancel} placeholder="Etiqueta (ej. Depósito)" invalid={!!errors.label} ariaLabel="Etiqueta del nuevo contacto" autoFocus />
        <ContactInput value={dest} onChange={setDest} onCommit={() => {}} onCancel={onCancel} placeholder={meta.placeholder} invalid={!!errors.destination} mono ariaLabel={`${meta.destLabel} del nuevo contacto`} />
        <div className="flex items-center gap-1.5">
          <button onClick={onCancel} className="px-3 py-2 rounded-lg text-xs font-medium" style={{ color: '#64748B' }}>Cancelar</button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={submit} className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: '#4F46E5' }}>Agregar</button>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 mt-1.5 pl-0.5">
        {errors.label && <FieldError>{errors.label}</FieldError>}
        {errors.destination && <FieldError>{errors.destination}</FieldError>}
        {!errors.label && !errors.destination && <span className="text-[10.5px]" style={{ color: '#94A3B8' }}>Enter para agregar · Esc para cancelar</span>}
      </div>
      <KeySubmit onEnter={submit} />
    </div>
  )
}

function ChannelContactsCard({
  ch,
  contacts,
  onChange,
  save,
  onRetry,
}: {
  ch: NotifChannel
  contacts: NotificationContact[]
  onChange: (c: NotificationContact[]) => void
  save: SaveState
  onRetry: () => void
}) {
  const meta = CHANNEL_META[ch]
  const [adding, setAdding] = useState(false)
  const atLimit = contacts.length >= NOTIF_CONTACT_LIMIT
  const active = contacts.filter((c) => c.enabled).length
  const mutedCount = contacts.length - active

  const addBtn = (
    <button
      onClick={() => setAdding(true)}
      disabled={atLimit || adding}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
      style={atLimit
        ? { border: '1px solid #F1F5F9', color: '#CBD5E1', background: '#F8FAFC', cursor: 'not-allowed' }
        : { border: '1px solid #C7D2FE', color: '#4F46E5', background: 'white', opacity: adding ? 0.5 : 1 }}
    >
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      Agregar contacto
      <span className="tabular-nums px-1.5 py-px rounded-md text-[10.5px]" style={{ background: atLimit ? '#F1F5F9' : '#EEF2FF' }}>{contacts.length}/{NOTIF_CONTACT_LIMIT}</span>
    </button>
  )

  return (
    <SettingsCard>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: meta.bg, color: meta.color }}>{meta.icon}</span>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#0A1628' }}>Contactos de {meta.name}</h2>
            <p className="text-xs" style={{ color: '#94A3B8' }}>
              {contacts.length === 0
                ? 'Sin contactos todavía'
                : `${active} ${active === 1 ? 'activo' : 'activos'}${mutedCount > 0 ? ` · ${mutedCount} ${mutedCount === 1 ? 'silenciado' : 'silenciados'}` : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator state={save} onRetry={onRetry} />
          {contacts.length > 0 && addBtn}
        </div>
      </div>

      {contacts.length === 0 && !adding ? (
        <div className="flex flex-col items-center text-center gap-3 rounded-xl px-6 py-9" style={{ border: '1.5px dashed #E2E8F0', background: '#FAFBFC' }}>
          <span className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: meta.bg, color: meta.color }}>{meta.icon}</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#0A1628' }}>Agregá tu primer contacto de {meta.name}</p>
            <p className="text-xs mt-1 max-w-sm" style={{ color: '#64748B' }}>Sumá a quien tenga que enterarse de las ventas, cancelaciones y etiquetas: vos, tu socio o el depósito. Hasta {NOTIF_CONTACT_LIMIT} contactos.</p>
          </div>
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: '#4F46E5' }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            Agregar contacto
          </button>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
          <div className="grid items-center gap-3 px-4 py-2" style={{ gridTemplateColumns: '150px minmax(0,1fr) auto 36px 28px', background: '#F8FAFC' }}>
            {['Etiqueta', meta.destLabel, '', 'Activo', ''].map((h, i) => (
              <span key={i} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8', textAlign: i === 3 ? 'center' : 'left' }}>{h}</span>
            ))}
          </div>
          {contacts.map((c) => (
            <ContactRow
              key={c.id}
              ch={ch}
              contact={c}
              others={contacts.filter((o) => o.id !== c.id)}
              onUpdate={(u) => onChange(contacts.map((o) => (o.id === u.id ? u : o)))}
              onRemove={() => onChange(contacts.filter((o) => o.id !== c.id))}
            />
          ))}
          {adding && <NewContactRow ch={ch} existing={contacts} onCancel={() => setAdding(false)} onAdd={(c) => { onChange([...contacts, c]); setAdding(false) }} />}
        </div>
      )}

      {ch === 'telegram' && (
        <p className="flex items-start gap-1.5 mt-3 text-[11.5px] leading-relaxed" style={{ color: '#64748B' }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-0.5"><circle cx="8" cy="8" r="6.5" stroke="#94A3B8" strokeWidth="1.3" /><path d="M8 7v4M8 5h.01" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <span>Para obtener tu id, hablale a <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: '#0284C7' }}>@userinfobot</a> en Telegram: te responde tu id al instante y lo pegás acá.</span>
        </p>
      )}
      {atLimit && (
        <p className="flex items-center gap-1.5 mt-3 text-[11.5px] font-medium" style={{ color: '#B45309' }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2.5 14.5 13.5h-13L8 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M8 6.5v3M8 11.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          Límite de {NOTIF_CONTACT_LIMIT} contactos alcanzado. Eliminá uno para sumar otro.
        </p>
      )}
    </SettingsCard>
  )
}

export function NotificationsSettings() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [save, setSave] = useState<SaveState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fade = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    let alive = true
    notificationsApi
      .settings()
      .then((s) => {
        if (!alive) return
        setSettings(s)
      })
      .catch((err: Error) => {
        if (!alive) return
        setLoadErr(err.message)
      })
    return () => {
      alive = false
    }
  }, [])

  const flush = async (next: NotificationSettings) => {
    const id = ++seq.current
    setSave('saving')
    try {
      await notificationsApi.saveSettings(next)
      if (id !== seq.current) return
      setSave('saved')
      if (fade.current) clearTimeout(fade.current)
      fade.current = setTimeout(() => setSave((s) => (s === 'saved' ? 'idle' : s)), 2200)
    } catch {
      if (id === seq.current) setSave('error')
    }
  }

  // Autosave con debounce corto para agrupar cambios seguidos.
  const persist = (next: NotificationSettings) => {
    setSettings(next)
    setSave('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => flush(next), 400)
  }

  if (loadErr) {
    return <SettingsCard><ErrorBox message={loadErr} /></SettingsCard>
  }
  if (!settings) {
    return <SettingsCard><SpinnerText text="Cargando notificaciones…" /></SettingsCard>
  }

  const retry = () => flush(settings)
  const toggleEvent = (key: NotificationEventKey, ch: NotifChannel) =>
    persist({ ...settings, events: { ...settings.events, [key]: { ...settings.events[key], [ch]: !settings.events[key][ch] } } })

  const noActive = (ch: NotifChannel) => {
    const list = ch === 'whatsapp' ? settings.whatsapp_contacts : settings.telegram_contacts
    return NOTIF_EVENTS.some((e) => settings.events[e.key][ch]) && !list.some((c) => c.enabled)
  }

  return (
    <>
      <ChannelContactsCard ch="whatsapp" contacts={settings.whatsapp_contacts} save={save} onRetry={retry} onChange={(c) => persist({ ...settings, whatsapp_contacts: c })} />
      <ChannelContactsCard ch="telegram" contacts={settings.telegram_contacts} save={save} onRetry={retry} onChange={(c) => persist({ ...settings, telegram_contacts: c })} />

      <SettingsCard>
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <span style={{ color: '#4F46E5', display: 'flex' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="14" height="14" rx="3" /><path d="M6.5 10l2 2 4.5-4.5" /></svg>
            </span>
            <h2 className="text-base font-bold" style={{ color: '#0A1628' }}>Qué querés recibir</h2>
          </div>
          <SaveIndicator state={save} onRetry={retry} />
        </div>

        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9' }}>
          <div className="grid items-center px-4 py-2.5" style={{ gridTemplateColumns: '1.4fr 2fr 90px 90px', background: '#F8FAFC' }}>
            {['Evento', 'Descripción', 'WhatsApp', 'Telegram'].map((h, i) => (
              <span key={h} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8', textAlign: i >= 2 ? 'center' : 'left' }}>{h}</span>
            ))}
          </div>
          {NOTIF_EVENTS.map((ev, i) => (
            <div key={ev.key} className="grid items-center px-4 py-3" style={{ gridTemplateColumns: '1.4fr 2fr 90px 90px', borderTop: i === 0 ? 'none' : '1px solid #F8FAFC' }}>
              <span className="text-sm font-semibold" style={{ color: '#0A1628' }}>{ev.label}</span>
              <div className="flex flex-col gap-1 pr-4">
                <span style={{ fontSize: '12px', color: '#64748B' }}>{ev.desc}</span>
                {ev.hint && (
                  <span className="inline-flex items-center gap-1.5" style={{ fontSize: '11px', color: '#94A3B8' }}>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M7.5 3.5 4 7a1.1 1.1 0 0 0 1.5 1.5L9.3 4.7a2.2 2.2 0 0 0-3.1-3.1L2.4 5.4a3.3 3.3 0 0 0 4.7 4.7L10 7.2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
                    {ev.hint}
                  </span>
                )}
              </div>
              <div className="flex justify-center"><Toggle value={settings.events[ev.key].whatsapp} onChange={() => toggleEvent(ev.key, 'whatsapp')} /></div>
              <div className="flex justify-center"><Toggle value={settings.events[ev.key].telegram} onChange={() => toggleEvent(ev.key, 'telegram')} /></div>
            </div>
          ))}
        </div>

        {(noActive('whatsapp') || noActive('telegram')) && (
          <div className="flex flex-col gap-2 mt-4">
            {noActive('whatsapp') && <InfoNote>No hay contactos de WhatsApp activos: los eventos marcados no se van a enviar por ese canal.</InfoNote>}
            {noActive('telegram') && <InfoNote>No hay contactos de Telegram activos: los eventos marcados no se van a enviar por ese canal.</InfoNote>}
          </div>
        )}
      </SettingsCard>
    </>
  )
}
