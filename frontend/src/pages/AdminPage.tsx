// Panel de administración de plataforma (/admin) — según el diseño de Figma.
// Consume el contrato /api/platform (lib/api/platform.ts).

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError } from '../lib/api/client'
import {
  platformApi,
} from '../lib/api/platform'
import type { AdminAccount, AdminBusiness, AdminPlatform } from '../lib/api/platform'
import { useAdminAuth } from '../lib/adminAuth'

const PAGE_SIZE = 8

const PLATFORM_META: Record<AdminPlatform, { label: string; color: string; bg: string }> = {
  mercadolibre: { label: 'MercadoLibre', color: '#F59E0B', bg: '#FFF7ED' },
  tiendanube: { label: 'Tienda Nube', color: '#4F46E5', bg: '#EEF2FF' },
}

function accountConn(a: AdminAccount): {
  label: string
  color: string
  bg: string
  border: string
  expires?: string | null
} {
  if (!a.has_credentials)
    return { label: 'Pendiente de conexión', color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0' }
  if (a.has_access_token)
    return { label: 'Conectada', color: '#16A34A', bg: '#DCFCE7', border: '#BBF7D0', expires: a.expires_at }
  return { label: 'Credenciales cargadas', color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Ocurrió un error inesperado'
}

// ─── Átomos ────────────────────────────────────────────────────────────────────

function AdminField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  hint?: string
  autoFocus?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
        style={{ border: '1.5px solid #E2E8F0', color: '#0A1628' }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#4F46E5'
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.12)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = '#E2E8F0'
          e.currentTarget.style.boxShadow = 'none'
        }}
      />
      {hint && <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>{hint}</span>}
    </div>
  )
}

function AdminErrorNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl px-3 py-2.5"
      style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-0.5" aria-hidden>
        <circle cx="8" cy="8" r="6.5" stroke="#DC2626" strokeWidth="1.3" />
        <path d="M8 5v3.5M8 10.5h.01" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span style={{ fontSize: '12px', color: '#B91C1C', lineHeight: 1.4 }}>{children}</span>
    </div>
  )
}

function AdminConfirm({
  title,
  body,
  confirmLabel,
  loading,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel: string
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(10,22,40,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 flex flex-col gap-4"
        style={{ boxShadow: '0 24px 60px rgba(15,23,42,0.28)', animation: 'fadeUp 0.18s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: '#FEF2F2' }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M10 3.5L2.5 16.5h15L10 3.5Z" stroke="#DC2626" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M10 8.5v3M10 13.5h.01" stroke="#DC2626" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <h3 className="text-base font-bold" style={{ color: '#0A1628' }}>{title}</h3>
        </div>
        <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>{body}</p>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ border: '1px solid #E2E8F0', color: '#475569', background: 'white' }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors"
            style={{ background: '#DC2626', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function SpinnerInline({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-8 justify-center" style={{ color: '#94A3B8' }}>
      <span
        className="rounded-full"
        style={{ width: 16, height: 16, border: '2px solid #E2E8F0', borderTopColor: '#4F46E5', animation: 'spin 0.8s linear infinite' }}
      />
      <span className="text-sm">{label}</span>
    </div>
  )
}

// ─── Login ─────────────────────────────────────────────────────────────────────

function AdminLogin() {
  const { login } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = /.+@.+\..+/.test(email.trim()) && password.length > 0

  const submit = async () => {
    if (!valid || loading) return
    setLoading(true)
    setError(null)
    try {
      await login(email.trim(), password)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen" style={{ background: '#F1F5F9' }}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-8 flex flex-col gap-5"
        style={{ boxShadow: '0 24px 60px rgba(15,23,42,0.12)' }}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center justify-center rounded-2xl" style={{ width: 48, height: 48, background: '#4F46E5' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-3Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M9 12l2 2 4-4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-lg font-bold" style={{ color: '#0A1628' }}>Panel de administración</h1>
          <p style={{ fontSize: '12px', color: '#64748B' }}>
            Ingresá con tu cuenta de administrador de la plataforma.
          </p>
        </div>
        {error && <AdminErrorNote>{error}</AdminErrorNote>}
        <div className="flex flex-col gap-3.5" onKeyDown={(e) => { if (e.key === 'Enter') submit() }}>
          <AdminField label="Email" value={email} onChange={setEmail} type="email" placeholder="admin@empresa.com" autoFocus />
          <AdminField label="Contraseña" value={password} onChange={setPassword} type="password" placeholder="••••••••" />
        </div>
        <button
          onClick={submit}
          disabled={!valid || loading}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
          style={{ background: valid && !loading ? '#4F46E5' : '#C7D2FE', cursor: valid && !loading ? 'pointer' : 'default' }}
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </div>
    </div>
  )
}

// ─── Modales y drawer ──────────────────────────────────────────────────────────

function CreateBusinessModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [fullName, setName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = /.+@.+\..+/.test(email.trim()) && fullName.trim().length > 0 && password.length >= 6

  const submit = async () => {
    if (!valid || loading) return
    setLoading(true)
    setError(null)
    try {
      await platformApi.createBusiness({ email: email.trim(), full_name: fullName.trim(), password })
      onCreated()
      onClose()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 flex flex-col gap-4"
        style={{ boxShadow: '0 24px 60px rgba(15,23,42,0.28)', animation: 'fadeUp 0.18s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: '#E0E7FF' }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#4F46E5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="14" height="12" rx="2" />
              <path d="M3 8h14M7 12h2" />
            </svg>
          </div>
          <h3 className="text-lg font-bold" style={{ color: '#0A1628' }}>Crear negocio</h3>
        </div>
        {error && <AdminErrorNote>{error}</AdminErrorNote>}
        <AdminField label="Email" value={email} onChange={setEmail} type="email" placeholder="dueño@negocio.com" autoFocus />
        <AdminField label="Nombre" value={fullName} onChange={setName} placeholder="Nombre del negocio" />
        <AdminField
          label="Contraseña"
          value={password}
          onChange={setPassword}
          type="password"
          placeholder="Mínimo 6 caracteres"
          hint="La contraseña debe tener al menos 6 caracteres."
        />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ border: '1px solid #E2E8F0', color: '#475569', background: 'white' }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!valid || loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: valid && !loading ? '#4F46E5' : '#C7D2FE', cursor: valid && !loading ? 'pointer' : 'default' }}
          >
            {loading ? 'Creando…' : 'Crear negocio'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddAccountModal({
  businessId,
  takenPlatforms,
  onClose,
  onCreated,
}: {
  businessId: number
  takenPlatforms: AdminPlatform[]
  onClose: () => void
  onCreated: () => void
}) {
  const [platform, setPlatform] = useState<AdminPlatform | ''>('')
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [externalId, setExternalId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const extLabel =
    platform === 'tiendanube'
      ? 'URL de la tienda Tienda Nube'
      : platform === 'mercadolibre'
        ? 'ID de usuario de MercadoLibre'
        : 'Identificador externo'
  const extPlaceholder =
    platform === 'tiendanube'
      ? 'https://mitienda.mitiendanube.com'
      : platform === 'mercadolibre'
        ? 'Ej. 307027338'
        : ''

  // Tienda Nube: client_id/client_secret son del PARTNER de la app y son
  // obligatorios para poder completar el OAuth después.
  const appCredsRequired = platform === 'tiendanube'
  const valid = Boolean(platform) && (!appCredsRequired || (clientId.trim().length > 0 && clientSecret.trim().length > 0))

  const submit = async () => {
    if (!platform || !valid || loading) return
    setLoading(true)
    setError(null)
    try {
      await platformApi.createAccount(businessId, {
        platform,
        name: name.trim(),
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        external_account_id: externalId.trim(),
      })
      onCreated()
      onClose()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '0 24px 60px rgba(15,23,42,0.28)', animation: 'fadeUp 0.18s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold" style={{ color: '#0A1628' }}>Agregar cuenta</h3>
        {error && <AdminErrorNote>{error}</AdminErrorNote>}

        <div className="flex flex-col gap-1.5">
          <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>
            Plataforma *
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(['mercadolibre', 'tiendanube'] as AdminPlatform[]).map((p) => {
              const m = PLATFORM_META[p]
              const on = platform === p
              const taken = takenPlatforms.includes(p)
              return (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  type="button"
                  disabled={taken}
                  title={taken ? 'Este negocio ya tiene una cuenta de ' + m.label : undefined}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: on ? m.bg : 'white',
                    color: on ? m.color : taken ? '#CBD5E1' : '#64748B',
                    border: `1.5px solid ${on ? m.color : '#E2E8F0'}`,
                    opacity: taken ? 0.55 : 1,
                    cursor: taken ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span className="rounded-full" style={{ width: 8, height: 8, background: m.color }} />
                  {m.label}
                  {taken && <span style={{ fontSize: '10px', fontWeight: 600 }}>· ya agregada</span>}
                </button>
              )
            })}
          </div>
        </div>

        <AdminField label="Nombre (opcional)" value={name} onChange={setName} placeholder="Ej. Tienda principal" />
        <AdminField
          label={appCredsRequired ? 'Client ID *' : 'Client ID (opcional)'}
          value={clientId}
          onChange={setClientId}
          placeholder="Client ID de la aplicación"
          hint={appCredsRequired ? 'Obligatorio para Tienda Nube: es el de tu aplicación de partner.' : undefined}
        />
        <AdminField
          label={appCredsRequired ? 'Client Secret *' : 'Client Secret (opcional)'}
          value={clientSecret}
          onChange={setClientSecret}
          type="password"
          placeholder="Client Secret de la aplicación"
        />
        <AdminField label={`${extLabel} (opcional)`} value={externalId} onChange={setExternalId} placeholder={extPlaceholder} />

        <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 mt-0.5" aria-hidden>
            <circle cx="7" cy="7" r="5.5" stroke="#94A3B8" strokeWidth="1.2" />
            <path d="M7 6.2v3.3M7 4.6h.01" stroke="#94A3B8" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: '11.5px', color: '#64748B', lineHeight: 1.45 }}>
            La cuenta queda pendiente de conexión hasta que se complete la autorización OAuth.
          </span>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ border: '1px solid #E2E8F0', color: '#475569', background: 'white' }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!valid || loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: valid && !loading ? '#4F46E5' : '#C7D2FE', cursor: valid && !loading ? 'pointer' : 'default' }}
          >
            {loading ? 'Agregando…' : 'Agregar cuenta'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AccountsDrawer({ business, onClose }: { business: AdminBusiness; onClose: () => void }) {
  const [items, setItems] = useState<AdminAccount[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const takenPlatforms: AdminPlatform[] = (items ?? []).map((a) => a.platform)
  const allPlatformsTaken =
    takenPlatforms.includes('mercadolibre') && takenPlatforms.includes('tiendanube')

  const load = async () => {
    setError(null)
    try {
      const r = await platformApi.listAccounts(business.id)
      setItems(r.items)
    } catch (e) {
      setError(errMsg(e))
      setItems([])
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id])

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="flex-1" style={{ background: 'rgba(10,22,40,0.35)' }} onClick={onClose} />
      <div className="w-[520px] max-w-full flex flex-col bg-white shadow-2xl" style={{ animation: 'fadeUp 0.2s ease both' }}>
        <div className="flex items-start justify-between gap-3 px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div className="min-w-0">
            <p className="text-base font-bold truncate" style={{ color: '#0A1628' }}>{business.full_name}</p>
            <p className="truncate" style={{ fontSize: '12px', color: '#64748B' }}>{business.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0" style={{ color: '#94A3B8' }} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #F8FAFC' }}>
          <span className="text-xs font-semibold" style={{ color: '#64748B' }}>
            Cuentas conectadas ({items?.length ?? 0})
          </span>
          <button
            onClick={() => setAdding(true)}
            disabled={allPlatformsTaken}
            title={allPlatformsTaken ? 'Este negocio ya tiene una cuenta por plataforma' : undefined}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-colors"
            style={{ background: allPlatformsTaken ? '#C7D2FE' : '#4F46E5', cursor: allPlatformsTaken ? 'not-allowed' : 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Agregar cuenta
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3">
          {error && <AdminErrorNote>{error}</AdminErrorNote>}
          {items === null ? (
            <SpinnerInline label="Cargando cuentas…" />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="flex items-center justify-center rounded-2xl" style={{ width: 48, height: 48, background: '#F1F5F9' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.6" aria-hidden>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 10h18" />
                </svg>
              </div>
              <p className="text-sm font-semibold" style={{ color: '#475569' }}>Sin cuentas todavía</p>
              <p style={{ fontSize: '12px', color: '#94A3B8' }}>Agregá una cuenta de MercadoLibre o Tienda Nube.</p>
            </div>
          ) : (
            items.map((a) => {
              const m = PLATFORM_META[a.platform]
              const conn = accountConn(a)
              return (
                <div key={a.id} className="rounded-xl p-3.5 flex flex-col gap-2.5" style={{ border: '1px solid #E2E8F0' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ background: m.bg }}>
                      <span className="rounded-full" style={{ width: 6, height: 6, background: m.color }} />
                      <span style={{ fontSize: '10.5px', fontWeight: 700, color: m.color }}>{m.label}</span>
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
                      style={{ background: conn.bg, border: `1px solid ${conn.border}` }}
                    >
                      <span className="rounded-full" style={{ width: 6, height: 6, background: conn.color }} />
                      <span style={{ fontSize: '10.5px', fontWeight: 700, color: conn.color }}>{conn.label}</span>
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold" style={{ color: '#0A1628' }}>{a.name || 'Sin nombre'}</span>
                    <span className="font-mono" style={{ fontSize: '11px', color: '#64748B' }}>{a.external_account_id || '—'}</span>
                  </div>
                  {conn.expires && (
                    <span style={{ fontSize: '11px', color: '#16A34A' }}>Token válido hasta {conn.expires}</span>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {adding && (
        <AddAccountModal
          businessId={business.id}
          takenPlatforms={takenPlatforms}
          onClose={() => setAdding(false)}
          onCreated={() => load()}
        />
      )}
    </div>
  )
}

// ─── Pantalla principal ────────────────────────────────────────────────────────

function AdminBusinesses() {
  const { session, logout } = useAdminAuth()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: AdminBusiness[]; total: number; pages: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [drawerBiz, setDrawerBiz] = useState<AdminBusiness | null>(null)
  const [confirm, setConfirm] = useState<AdminBusiness | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await platformApi.listBusinesses(q, page, PAGE_SIZE)
      setData({ items: r.items, total: r.total, pages: r.pages })
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        logout()
        return
      }
      setData({ items: [], total: 0, pages: 0 })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page])
  useEffect(() => {
    setPage(1)
  }, [q])

  const activate = async (b: AdminBusiness) => {
    setTogglingId(b.id)
    try {
      await platformApi.setActive(b.id, true)
      await load()
    } catch {
      /* el toggle queda como estaba */
    } finally {
      setTogglingId(null)
    }
  }

  const confirmDeactivate = async () => {
    if (!confirm) return
    setConfirmLoading(true)
    try {
      await platformApi.setActive(confirm.id, false)
      setConfirm(null)
      await load()
    } catch {
      setConfirm(null)
    } finally {
      setConfirmLoading(false)
    }
  }

  const items = data?.items ?? []
  const pages = data?.pages ?? 1
  const admin = session?.admin

  return (
    <div className="h-screen flex flex-col" style={{ background: '#F1F5F9' }}>
      <header
        className="flex items-center justify-between gap-3 px-6 py-3 flex-shrink-0 bg-white"
        style={{ borderBottom: '1px solid #E2E8F0' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center rounded-xl" style={{ width: 32, height: 32, background: '#4F46E5' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-3Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold" style={{ color: '#0A1628' }}>Panel de administración</p>
            <p style={{ fontSize: '11px', color: '#94A3B8' }}>Omnipanel · Plataforma</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: '12px', color: '#64748B' }}>{admin?.email}</span>
          <button
            onClick={logout}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
            style={{ border: '1px solid #E2E8F0', color: '#475569', background: 'white' }}
          >
            Salir
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col p-5 gap-3 min-h-0">
        <div className="flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-base font-bold" style={{ color: '#0A1628' }}>Negocios</h1>
            <span className="text-xs font-medium" style={{ color: '#94A3B8' }}>{data?.total ?? 0} en total</span>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: '#4F46E5' }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Crear negocio
          </button>
        </div>

        <div className="relative flex-shrink-0" style={{ maxWidth: 360 }}>
          <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#CBD5E1' }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por email o nombre…"
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none transition-all"
            style={{ background: 'white', border: '1.5px solid #E2E8F0', color: '#0A1628' }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#4F46E5'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.08)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#E2E8F0'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </div>

        <div className="flex-1 overflow-auto rounded-2xl bg-white min-h-0" style={{ border: '1px solid #E2E8F0' }}>
          <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                {['Negocio', 'Cuentas', 'Estado', ''].map((h, i) => (
                  <th
                    key={i}
                    className="px-4 py-3"
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#94A3B8',
                      textAlign: i === 1 ? 'center' : 'left',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center">
                    <SpinnerInline label="Cargando…" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm" style={{ color: '#94A3B8' }}>
                    No hay negocios que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                items.map((b) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid #F8FAFC' }} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold" style={{ color: '#0A1628' }}>{b.full_name}</span>
                        <span style={{ fontSize: '11.5px', color: '#64748B' }}>{b.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="tabular-nums inline-flex items-center justify-center rounded-lg px-2 py-0.5"
                        style={{ fontSize: '12px', fontWeight: 600, color: '#475569', background: '#F1F5F9' }}
                      >
                        {b.accounts_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => (b.active ? setConfirm(b) : activate(b))}
                          disabled={togglingId === b.id}
                          className="relative rounded-full transition-colors flex-shrink-0"
                          style={{
                            width: 34,
                            height: 20,
                            background: b.active ? '#16A34A' : '#CBD5E1',
                            opacity: togglingId === b.id ? 0.6 : 1,
                          }}
                          aria-label="Activar / desactivar"
                        >
                          <span
                            className="absolute rounded-full bg-white transition-all"
                            style={{ width: 14, height: 14, top: 3, left: b.active ? 17 : 3, boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}
                          />
                        </button>
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
                          style={{
                            background: b.active ? '#DCFCE7' : '#F1F5F9',
                            border: `1px solid ${b.active ? '#BBF7D0' : '#E2E8F0'}`,
                          }}
                        >
                          <span className="rounded-full" style={{ width: 6, height: 6, background: b.active ? '#16A34A' : '#94A3B8' }} />
                          <span style={{ fontSize: '10.5px', fontWeight: 700, color: b.active ? '#16A34A' : '#64748B' }}>
                            {b.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setDrawerBiz(b)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                        style={{ border: '1px solid #E2E8F0', color: '#4F46E5', background: 'white' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                      >
                        Ver cuentas
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between flex-shrink-0">
          <span style={{ fontSize: '12px', color: '#94A3B8' }}>Página {data?.pages ? page : 1} de {pages}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
              style={{ border: '1px solid #E2E8F0', color: page <= 1 ? '#CBD5E1' : '#475569', background: 'white', cursor: page <= 1 ? 'default' : 'pointer' }}
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages || loading}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
              style={{ border: '1px solid #E2E8F0', color: page >= pages ? '#CBD5E1' : '#475569', background: 'white', cursor: page >= pages ? 'default' : 'pointer' }}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {creating && (
        <CreateBusinessModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setPage(1)
            load()
          }}
        />
      )}
      {drawerBiz && (
        <AccountsDrawer
          business={drawerBiz}
          onClose={() => {
            setDrawerBiz(null)
            load()
          }}
        />
      )}
      {confirm && (
        <AdminConfirm
          title="Desactivar negocio"
          body="¿Desactivar este negocio? Bloqueará su acceso y sus webhooks de inmediato."
          confirmLabel="Desactivar"
          loading={confirmLoading}
          onCancel={() => setConfirm(null)}
          onConfirm={confirmDeactivate}
        />
      )}
    </div>
  )
}

export default function AdminPage() {
  const { session } = useAdminAuth()
  if (!session) return <AdminLogin />
  return <AdminBusinesses />
}
