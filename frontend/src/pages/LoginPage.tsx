import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { Spinner } from '../components/ui'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api/client'

const MOCK_MODE = import.meta.env.VITE_USE_MOCK === '1'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      await login(email, password)
      navigate('/inventory', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión')
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all bg-white border text-ink placeholder:text-faint'
  const focusFx = (e: { target: EventTarget & HTMLElement }) => {
    e.target.style.borderColor = '#818CF8'
    e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'
  }
  const blurFx = (e: { target: EventTarget & HTMLElement }) => {
    e.target.style.borderColor = '#E2E8F0'
    e.target.style.boxShadow = 'none'
  }

  return (
    <div
      className="h-screen flex items-center justify-center p-6"
      style={{
        background:
          'radial-gradient(1200px 600px at 50% -10%, #EEF2FF 0%, #F1F5F9 55%)',
      }}
    >
      <div className="w-full max-w-sm animate-fade-up">
        <form
          onSubmit={submit}
          className="bg-white rounded-2xl p-8 flex flex-col gap-5"
          style={{ border: '1px solid #E2E8F0', boxShadow: '0 8px 30px rgba(15,23,42,0.06)' }}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <Logo size={38} />
            <div>
              <p className="font-bold text-ink">Omnipanel</p>
              <p className="text-xs text-muted mt-1">
                Gestión multicanal para tu ecommerce
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-subtle">Email</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@negocio.com"
                className={inputCls}
                style={{ border: '1px solid #E2E8F0' }}
                onFocus={focusFx}
                onBlur={blurFx}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-subtle">Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputCls + ' pr-10'}
                  style={{ border: '1px solid #E2E8F0' }}
                  onFocus={focusFx}
                  onBlur={blurFx}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-subtle transition-colors"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path
                        d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                      <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path
                        d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                      <path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="px-3 py-2.5 rounded-xl text-xs font-medium animate-fade-in"
                style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-95 disabled:opacity-70 flex items-center justify-center gap-2"
              style={{ background: '#4F46E5' }}
            >
              {busy ? (
                <>
                  <Spinner size={13} /> Ingresando…
                </>
              ) : (
                'Iniciar sesión'
              )}
            </button>
          </div>

          {MOCK_MODE && (
            <div
              className="rounded-xl px-3 py-2.5 text-xs leading-relaxed animate-fade-in"
              style={{ background: '#F8FAFC', border: '1px dashed #E2E8F0', color: '#64748B' }}
            >
              <p className="font-semibold text-subtle mb-0.5">Modo demo (sin backend)</p>
              <p>
                Usá{' '}
                <button
                  type="button"
                  className="font-mono font-semibold text-primary hover:underline"
                  onClick={() => {
                    setEmail('demo@guiaslocales.com')
                    setPassword('demo1234')
                  }}
                >
                  demo@guiaslocales.com
                </button>{' '}
                / <span className="font-mono">demo1234</span>
              </p>
            </div>
          )}
        </form>

        <p className="text-center text-xs text-muted mt-4">
          Omnipanel · Inventario, publicación y ventas multi-canal
        </p>
      </div>
    </div>
  )
}
