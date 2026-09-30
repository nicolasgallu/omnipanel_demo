import { useEffect, useState } from 'react'
import { adminApi } from '../lib/api/endpoints'
import type { Employee } from '../lib/api/types'
import { fmtDate } from '../lib/format'
import { ErrorBox, Spinner, SpinnerText, Toggle } from '../components/ui'

const initials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

function AddUserModal({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (u: { full_name: string; email: string; password: string }) => Promise<void>
}) {
  const [full_name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = full_name.trim() && /.+@.+\..+/.test(email) && password.length >= 6

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      await onAdd({ full_name: full_name.trim(), email: email.trim(), password })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
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
              <circle cx="8" cy="7" r="2.8" />
              <path d="M2.5 16.5c0-2.8 2.4-4.5 5.5-4.5M14 6v5M16.5 8.5h-5" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-ink">Agregar usuario</h3>
        </div>

        {(
          [
            { label: 'Nombre completo', value: full_name, set: setName, type: 'text', ph: 'Nombre y apellido' },
            { label: 'Email', value: email, set: setEmail, type: 'email', ph: 'usuario@empresa.com' },
            { label: 'Contraseña', value: password, set: setPassword, type: 'password', ph: 'Mínimo 6 caracteres' },
          ] as const
        ).map((f) => (
          <div key={f.label} className="flex flex-col gap-1.5">
            <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>
              {f.label}
            </span>
            <input
              type={f.type}
              value={f.value}
              placeholder={f.ph}
              onChange={(e) => f.set(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all text-ink placeholder:text-faint"
              style={{ border: '1.5px solid #E2E8F0' }}
              onFocus={(e) => {
                e.target.style.borderColor = '#4F46E5'
                e.target.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.12)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#E2E8F0'
                e.target.style.boxShadow = 'none'
              }}
            />
          </div>
        ))}

        {error && (
          <div className="rounded-xl px-3 py-2.5 text-xs font-medium" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors text-subtle"
            style={{ border: '1px solid #E2E8F0', background: 'white' }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!valid || busy}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: valid ? '#4F46E5' : '#C7D2FE', cursor: valid ? 'pointer' : 'default' }}
          >
            {busy ? 'Creando…' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function UsuariosPage() {
  const [users, setUsers] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    // Foto de perfil = logo del negocio (hasta que existan fotos por usuario).
    adminApi
      .settings()
      .then((res) => setLogoUrl(res.logo_url || null))
      .catch(() => setLogoUrl(null))
  }, [])

  const reload = () => {
    setLoading(true)
    setError(null)
    adminApi
      .employees()
      .then((res) => setUsers(res.items))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
  }, [])

  const toggleActive = async (u: Employee) => {
    if (busyId !== null) return
    const next = !u.active
    setBusyId(u.id)
    setError(null)
    // Optimista: el toggle responde al instante y la fila no se mueve
    // (sin refetch ni textos que cambien el layout).
    setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, active: next } : x)))
    try {
      const res = await adminApi.toggleEmployee(u.id, next)
      setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, active: res.active } : x)))
    } catch (err) {
      setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, active: u.active } : x)))
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario')
    } finally {
      setBusyId(null)
    }
  }

  const addUser = async (u: { full_name: string; email: string; password: string }) => {
    await adminApi.createEmployee(u)
    reload()
  }

  return (
    <div className="flex-1 overflow-y-auto scroll-slim">
      <div className="max-w-5xl mx-auto px-8 py-8 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">Usuarios</h1>
            <p className="text-sm mt-0.5 text-subtle">
              {users.filter((u) => u.active).length} activos · {users.length} en total
            </p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors hover:brightness-95"
            style={{ background: '#4F46E5' }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
            Agregar usuario
          </button>
        </div>

        {error && <ErrorBox message={error} onRetry={reload} />}

        <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
          {loading ? (
            <SpinnerText />
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                  {['Usuario', 'Estado', 'Fecha de alta', 'Acceso'].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 font-semibold tracking-wider"
                      style={{ color: '#94A3B8', fontSize: '10px', letterSpacing: '0.07em', textAlign: h === 'Acceso' ? 'right' : 'left' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="transition-colors hover:bg-slate-50"
                    style={{ borderBottom: '1px solid #F8FAFC', opacity: u.active ? 1 : 0.6 }}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden"
                          style={{ background: u.active ? '#4F46E5' : '#94A3B8' }}
                        >
                          {logoUrl ? (
                            <img src={logoUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            initials(u.full_name)
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold truncate text-ink">{u.full_name}</p>
                          <p className="text-xs truncate text-muted">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: u.active ? '#16A34A' : '#94A3B8' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: u.active ? '#16A34A' : '#CBD5E1' }} />
                        {u.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-subtle">{fmtDate(u.created_at)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex justify-end items-center gap-2">
                        <Toggle value={u.active} onChange={() => toggleActive(u)} />
                        <span className="w-4 inline-flex justify-start">
                          {busyId === u.id && <Spinner size={12} />}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-muted">
                      Todavía no hay usuarios cargados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {adding && <AddUserModal onClose={() => setAdding(false)} onAdd={addUser} />}
    </div>
  )
}
