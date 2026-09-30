// Átomos compartidos de la pantalla Configuración (Figma: cards, credenciales
// con lock/advertencia, guías paso a paso de conexión).

import { useState } from 'react'
import type { ReactNode } from 'react'

export function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-6" style={{ border: '1px solid #E2E8F0' }}>
      {children}
    </div>
  )
}

export function CardHeader({ icon, title, color = '#4F46E5' }: { icon: ReactNode; title: string; color?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <span style={{ color, display: 'flex' }}>{icon}</span>
      <h2 className="text-base font-bold text-ink">{title}</h2>
    </div>
  )
}

export function PrimaryBtn({
  children,
  onClick,
  disabled,
  busy,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  busy?: boolean
}) {
  const blocked = disabled || busy
  return (
    <button
      onClick={onClick}
      disabled={blocked}
      className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
      style={{ background: blocked ? '#C7D2FE' : '#4F46E5', cursor: blocked ? 'default' : 'pointer' }}
    >
      {busy ? 'Guardando…' : children}
    </button>
  )
}

// ─── CheckList / InfoNote / CopyValue (guías) ────────────────────────────────

export function CheckList({ title, items }: { title?: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {title && <p className="text-xs font-semibold" style={{ color: '#334155' }}>{title}</p>}
      <div className="flex flex-col gap-1">
        {items.map((it) => (
          <div key={it} className="flex items-start gap-2 text-xs" style={{ color: '#475569' }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px" aria-hidden>
              <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="#DCFCE7" />
              <path d="M4.5 8l2.2 2.2L11.5 5.5" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {it}
          </div>
        ))}
      </div>
    </div>
  )
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px" aria-hidden>
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 7.2v3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="5.2" r="0.6" fill="currentColor" />
      </svg>
      <div>{children}</div>
    </div>
  )
}

export function SavedBanner({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold animate-fade-in"
      style={{ background: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' }}
    >
      ✓ {children}
    </div>
  )
}

export function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
      <code className="flex-1 text-xs break-all" style={{ color: '#0A1628', fontFamily: 'ui-monospace, monospace' }}>{value}</code>
      <button
        onClick={copy}
        className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md flex-shrink-0 transition-colors"
        style={{ color: copied ? '#16A34A' : '#4F46E5', background: copied ? '#DCFCE7' : '#EEF2FF' }}
      >
        {copied ? (
          <>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M4 8.5l2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Copiado
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M3 10V4a1 1 0 0 1 1-1h6" stroke="currentColor" strokeWidth="1.3" /></svg>
            Copiar
          </>
        )}
      </button>
    </div>
  )
}

// ─── OnbInput (guías: input con label) ───────────────────────────────────────

export function OnbInput({
  label,
  value,
  onChange,
  placeholder,
  secret = false,
  mono = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  secret?: boolean
  mono?: boolean
}) {
  const [show, setShow] = useState(!secret)
  return (
    <div className="flex flex-col gap-1.5">
      <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>{label}</span>
      <div className="relative">
        <input
          type={secret && !show ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-3.5 py-2.5 text-sm rounded-xl outline-none transition-all text-ink"
          style={{
            paddingRight: secret ? 42 : 12,
            border: '1px solid #E2E8F0',
            background: 'white',
            fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#4F46E5'
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.1)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#E2E8F0'
            e.currentTarget.style.boxShadow = 'none'
          }}
        />
        {secret && (
          <button
            onClick={() => setShow((x) => !x)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors hover:bg-slate-100"
            style={{ color: '#94A3B8' }}
            aria-label="Mostrar / ocultar"
          >
            {show ? (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" /><circle cx="10" cy="10" r="2.5" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M4 4l12 12M8.5 8.6A2.5 2.5 0 0 0 11.4 11.5M6 6.2C3.6 7.6 2 10 2 10s3 5.5 8 5.5c1.3 0 2.5-.3 3.5-.8M11 4.6C10.7 4.5 10.3 4.5 10 4.5 5 4.5 2 10 2 10" /></svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── CredField (card de credenciales: lock + advertencia, secret, copy) ──────

function CredWarningModal({ label, onCancel, onConfirm }: { label: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(10,22,40,0.45)' }} onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl" style={{ background: 'white' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-6 pt-6">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#FEF3C7', color: '#D97706' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </span>
          <div>
            <h3 className="text-base font-bold text-ink">Vas a editar una credencial</h3>
            <p className="text-sm mt-1 text-subtle">
              Modificar <b className="text-ink">{label}</b> puede romper la conexión con la plataforma y detener la sincronización de productos, ventas y envíos.
            </p>
            <p className="text-sm mt-2 text-subtle">Editá solo si sabés lo que estás haciendo.</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-5 mt-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ border: '1px solid #E2E8F0', color: '#475569', background: 'white' }}>
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors"
            style={{ background: '#D97706' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#B45309')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#D97706')}
          >
            Sí, quiero editar
          </button>
        </div>
      </div>
    </div>
  )
}

export function CredField({
  label,
  value,
  onChange,
  placeholder,
  secret = false,
  readOnly = false,
  mono = false,
  hint,
  lockable = false,
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  secret?: boolean
  readOnly?: boolean
  mono?: boolean
  hint?: string
  lockable?: boolean
}) {
  const [show, setShow] = useState(!secret)
  const [copied, setCopied] = useState(false)
  const [locked, setLocked] = useState(lockable)
  const [warn, setWarn] = useState(false)
  const copy = () => {
    if (!value) return
    navigator.clipboard?.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  const inputReadOnly = readOnly || locked
  const trailing = (secret ? 1 : 0) + (readOnly ? 1 : 0) + (lockable ? 1 : 0)
  return (
    <div className="flex flex-col gap-1.5">
      <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>{label}</span>
      <div className="relative">
        <input
          type={secret && !show ? 'password' : 'text'}
          value={value}
          placeholder={placeholder}
          readOnly={inputReadOnly}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          onMouseDown={locked ? (e) => { e.preventDefault(); setWarn(true) } : undefined}
          className="w-full pl-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
          style={{
            paddingRight: 12 + trailing * 30,
            border: '1px solid #E2E8F0',
            color: inputReadOnly ? '#475569' : '#0A1628',
            background: inputReadOnly ? '#F8FAFC' : 'white',
            fontFamily: mono ? 'ui-monospace, monospace' : undefined,
            cursor: locked ? 'pointer' : undefined,
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#4F46E5'
            e.target.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.1)'
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#E2E8F0'
            e.target.style.boxShadow = 'none'
          }}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {secret && (
            <button onClick={() => setShow((s) => !s)} title={show ? 'Ocultar' : 'Mostrar'} className="p-1.5 rounded-md transition-colors hover:bg-slate-100" style={{ color: '#94A3B8' }}>
              {show ? (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.3" /></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.3" /><path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
              )}
            </button>
          )}
          {lockable && (
            <button
              onClick={() => {
                if (locked) setWarn(true)
                else setLocked(true)
              }}
              title={locked ? 'Editar (con advertencia)' : 'Bloquear edición'}
              className="p-1.5 rounded-md transition-colors hover:bg-slate-100"
              style={{ color: locked ? '#94A3B8' : '#D97706' }}
            >
              {locked ? (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="3.5" y="7" width="9" height="6.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.3" /></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="3.5" y="7" width="9" height="6.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" /><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
              )}
            </button>
          )}
          {readOnly && (
            <button onClick={copy} title="Copiar" className="p-1.5 rounded-md transition-colors hover:bg-slate-100" style={{ color: copied ? '#16A34A' : '#94A3B8' }}>
              {copied ? (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M4 8.5l2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M3 10V4a1 1 0 0 1 1-1h6" stroke="currentColor" strokeWidth="1.3" /></svg>
              )}
            </button>
          )}
        </div>
      </div>
      {hint && <span style={{ fontSize: '10px', color: '#94A3B8' }}>{hint}</span>}
      {warn && <CredWarningModal label={label} onCancel={() => setWarn(false)} onConfirm={() => { setLocked(false); setWarn(false) }} />}
    </div>
  )
}
