import { useState } from 'react'
import type { ReactNode } from 'react'

// ─── Image placeholder / real image with graceful fallback ───────────────────

export function ImgPlaceholder({ size = 36 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center flex-shrink-0 rounded-xl"
      style={{
        width: size,
        height: size,
        background: '#F1F5F9',
        border: '1px solid #E2E8F0',
      }}
    >
      <svg
        width={size * 0.44}
        height={size * 0.44}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#E2E8F0" />
        <circle cx="9" cy="9" r="2" fill="#CBD5E1" />
        <path
          d="M3 16l5-5 4 4 3-3 6 6"
          stroke="#CBD5E1"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

export function ProductImage({
  url,
  size = 32,
  fill = false,
  className = '',
}: {
  url: string | null | undefined
  size?: number
  fill?: boolean
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  if (!url || broken) {
    if (fill) {
      return (
        <div
          className={`flex items-center justify-center w-full aspect-square rounded-2xl ${className}`}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}
        >
          <svg width="52" height="52" viewBox="0 0 64 64" fill="none" aria-hidden>
            <rect x="8" y="8" width="48" height="48" rx="8" fill="#E2E8F0" />
            <circle cx="24" cy="24" r="6" fill="#CBD5E1" />
            <path d="M8 44l14-14 10 10 8-8 16 16" stroke="#CBD5E1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )
    }
    return <ImgPlaceholder size={size} />
  }
  if (fill) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        className={`object-cover w-full aspect-square rounded-2xl ${className}`}
        style={{ border: '1px solid #E2E8F0', background: '#F1F5F9' }}
      />
    )
  }
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className={`object-cover flex-shrink-0 rounded-xl ${className}`}
      style={{ width: size, height: size, border: '1px solid #E2E8F0', background: '#F1F5F9' }}
    />
  )
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

export function Spinner({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      className={`animate-spin ${className}`}
      aria-hidden
    >
      <path
        d="M12 7A5 5 0 1 1 7 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SpinnerText({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted">
      <Spinner />
      {text}
    </div>
  )
}

// ─── Feedback boxes ──────────────────────────────────────────────────────────

export function ErrorBox({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-xs font-medium"
      style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}
    >
      <span className="min-w-0">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80"
        >
          Reintentar
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1"
        style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="3" fill="#E2E8F0" />
          <circle cx="9" cy="9" r="2" fill="#CBD5E1" />
          <path
            d="M3 16l5-5 4 4 3-3 6 6"
            stroke="#CBD5E1"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {subtitle && <p className="text-xs text-muted max-w-xs">{subtitle}</p>}
      {action}
    </div>
  )
}

// ─── Toggle switch (Figma) ───────────────────────────────────────────────────

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="relative flex-shrink-0 transition-all"
      style={{ width: '36px', height: '20px', borderRadius: '10px', background: value ? '#0A1628' : '#E2E8F0' }}
    >
      <span
        className="absolute top-0.5 transition-all"
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '8px',
          background: 'white',
          left: value ? '18px' : '2px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }}
      />
    </button>
  )
}

// ─── Confirm dialog ──────────────────────────────────────────────────────────

export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Eliminar',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 animate-fade-in">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} />
      <div
        className="relative w-full max-w-sm bg-white rounded-2xl p-5 flex flex-col gap-4 animate-fade-up"
        style={{ border: '1px solid #E2E8F0', boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }}
      >
        <p className="text-sm font-bold text-ink">{title}</p>
        <p className="text-xs leading-relaxed text-subtle">{body}</p>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors text-subtle"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-95 disabled:opacity-60"
            style={{ background: danger ? '#EF4444' : '#4F46E5' }}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
