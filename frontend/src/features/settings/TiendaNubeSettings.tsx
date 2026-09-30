// Configuración > Tienda Nube (Figma): onboarding en 2 pasos (URL de la tienda
// + autorización) + cards de conexión (URL editable, token read-only).
//
// Backend: GET/PUT /api/tiendanube/credentials. La autorización abre
// {tienda}/admin/apps/29440/authorize y el callback /api/oauth/callback
// matchea por hostname y guarda el token.

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { credentialsApi } from '../../lib/api/endpoints'
import type { TNCredentials } from '../../lib/api/types'
import { ErrorBox, SpinnerText } from '../../components/ui'
import { NavIcon } from '../../components/NavIcon'
import { CardHeader, CheckList, CredField, InfoNote, OnbInput, PrimaryBtn, SettingsCard } from './settingsShared'

const TN_APP_ID = '29440'

export function normalizeStoreUrl(raw: string): string {
  let u = raw.trim()
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  return u.replace(/\/+$/, '')
}

export function TiendaNubeSettings() {
  const [creds, setCreds] = useState<TNCredentials | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    credentialsApi
      .tn()
      .then(setCreds)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  const [showGuide, setShowGuide] = useState(false)

  if (loading && !creds) return <SpinnerText />

  if (error && !creds) {
    return (
      <div className="max-w-md">
        <ErrorBox message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    )
  }

  if (!creds) return null

  const hasStore = Boolean(creds.url)

  if (!hasStore || showGuide) {
    return (
      <TnOnboarding
        initialUrl={creds?.url ?? ''}
        onExit={hasStore ? () => setShowGuide(false) : undefined}
        onFinish={() => {
          setShowGuide(false)
          setReloadKey((k) => k + 1)
        }}
      />
    )
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-subtle">¿Necesitás volver a conectar tu tienda?</p>
        <button
          onClick={() => setShowGuide(true)}
          className="flex items-center gap-1.5 text-xs font-semibold transition-colors hover:underline"
          style={{ color: '#2563EB' }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" /><path d="M8 5v3.2l2 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Ver la guía otra vez
        </button>
      </div>

      <TnStoreCard creds={creds} onSaved={() => setReloadKey((k) => k + 1)} />
    </>
  )
}

// ─── Onboarding (Figma TnOnboarding) ─────────────────────────────────────────

function TnOnboarding({
  initialUrl,
  onFinish,
  onExit,
}: {
  initialUrl: string
  onFinish: () => void
  onExit?: () => void
}) {
  const TOTAL = 2
  const [i, setI] = useState(0)
  const [store, setStore] = useState(initialUrl)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const last = i === TOTAL - 1
  const base = normalizeStoreUrl(store)
  const authUrl = base ? `${base}/admin/apps/${TN_APP_ID}/authorize` : ''
  const canNext = i === 0 ? Boolean(base) : true
  const title = i === 0 ? 'Ingresá la URL de tu tienda' : 'Autorizá la conexión'

  const body: ReactNode =
    i === 0 ? (
      <>
        <p className="text-xs" style={{ color: '#475569' }}>
          Escribí la dirección de tu Tienda Nube. La encontrás en la barra del navegador cuando entrás a tu tienda.
        </p>
        <OnbInput label="URL de tu tienda" value={store} onChange={setStore} placeholder="https://mitienda.mitiendanube.com" mono />
        <InfoNote>
          Ejemplo: <span style={{ fontFamily: 'ui-monospace, monospace' }}>https://nicolasgall.mitiendanube.com</span>
        </InfoNote>
      </>
    ) : (
      <>
        <p className="text-xs" style={{ color: '#475569' }}>Vamos a llevarte al panel de tu tienda para autorizar la conexión de la app.</p>
        <a
          href={authUrl}
          target="_blank"
          rel="noreferrer"
          className="w-fit inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-transform hover:scale-[1.02]"
          style={{ background: '#2563EB' }}
        >
          Ir a autorizar en Tienda Nube
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 3h7v7M13 3 6.5 9.5M11 9v4H3V5h4" /></svg>
        </a>
        <CheckList
          title="Qué va a pasar"
          items={[
            'Se abre el panel de administración de tu Tienda Nube.',
            'Bajá hasta el final de la página.',
            'Tocá el botón “Aceptar” para autorizar la app.',
          ]}
        />
        <InfoNote>Si te pide iniciar sesión, ingresá con tu usuario de Tienda Nube y volvé a intentar.</InfoNote>
      </>
    )

  const next = async () => {
    if (!canNext) return
    if (i === 0) {
      setSaving(true)
      setError(null)
      try {
        await credentialsApi.saveTn(base)
        setI(1)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar la URL de la tienda')
      } finally {
        setSaving(false)
      }
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #BFDBFE', background: 'white' }}>
      <div className="flex items-center gap-3 px-6 py-5" style={{ background: '#EFF6FF' }}>
        <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#DBEAFE', color: '#2563EB' }}>
          <NavIcon name="tn" size={22} />
        </span>
        <div className="flex-1">
          <h2 className="text-base font-bold text-ink">Conectá tu Tienda Nube</h2>
          <p className="text-xs mt-0.5 text-subtle">Ingresá la URL de tu tienda y autorizá la conexión en dos pasos.</p>
        </div>
        {onExit && (
          <button
            onClick={onExit}
            title="Salir de la guía"
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors hover:bg-white"
            style={{ color: '#64748B' }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M5 5l10 10M15 5 5 15" /></svg>
          </button>
        )}
      </div>

      <div className="px-6 py-6 flex flex-col gap-4">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL }).map((_, j) => (
            <button
              key={j}
              onClick={() => {
                if (j <= i) setI(j)
              }}
              className="h-1.5 rounded-full transition-all"
              style={{ flex: 1, background: j <= i ? '#2563EB' : '#E2E8F0', cursor: j <= i ? 'pointer' : 'default' }}
              aria-label={`Paso ${j + 1}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: '#DBEAFE', color: '#2563EB' }}>
            {i + 1}
          </span>
          <div>
            <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94A3B8' }}>
              Paso {i + 1} de {TOTAL}
            </p>
            <h3 className="text-sm font-bold text-ink">{title}</h3>
          </div>
        </div>
        <div className="flex flex-col gap-3 min-h-[120px]">{body}</div>
        {error && <ErrorBox message={error} />}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setI((x) => Math.max(0, x - 1))}
            disabled={i === 0}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ border: '1px solid #E2E8F0', color: i === 0 ? '#CBD5E1' : '#475569', background: 'white', cursor: i === 0 ? 'default' : 'pointer' }}
          >
            Anterior
          </button>
          {last ? (
            <button
              onClick={() => canNext && onFinish()}
              disabled={!canNext}
              className="px-5 py-2 rounded-xl text-sm font-bold transition-transform hover:scale-[1.02]"
              style={{ background: canNext ? '#16A34A' : '#E2E8F0', color: canNext ? 'white' : '#94A3B8', cursor: canNext ? 'pointer' : 'default' }}
            >
              Finalizar conexión
            </button>
          ) : (
            <button
              onClick={next}
              disabled={!canNext || saving}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
              style={{ background: canNext ? '#2563EB' : '#E2E8F0', color: canNext ? 'white' : '#94A3B8', cursor: canNext ? 'pointer' : 'default' }}
            >
              {saving ? 'Guardando…' : 'Siguiente'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Card de conexión de la tienda ───────────────────────────────────────────

function TnStoreCard({ creds, onSaved }: { creds: TNCredentials; onSaved: () => void }) {
  const [url, setUrl] = useState(creds.url ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const dirty = url !== (creds.url ?? '')

  const save = async () => {
    if (!dirty) return
    setSaving(true)
    setError(null)
    setSavedMsg(null)
    try {
      await credentialsApi.saveTn(normalizeStoreUrl(url))
      setSavedMsg('URL de la tienda guardada')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la URL de la tienda')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsCard>
      <CardHeader
        title="Conexión de la tienda"
        color="#2563EB"
        icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 7h14l-1 2.5a2 2 0 0 1-2 1.5H6a2 2 0 0 1-2-1.5L3 7Z" /><path d="M4.5 7 6 3.5h8L15.5 7M6.5 11v5.5h7V11" /></svg>
        }
      />
      <div className="grid grid-cols-1 gap-y-4">
        <CredField label="URL de tu tienda" value={url} onChange={setUrl} placeholder="https://mitienda.mitiendanube.com" mono lockable />
        <CredField
          label="Token de acceso"
          value={creds.access_token ?? ''}
          placeholder="—"
          secret
          readOnly
          mono
          hint={creds.connected ? 'Se renueva automáticamente al autorizar la app.' : 'Se genera automáticamente al autorizar la app.'}
        />
        <CredField
          label="ID de la tienda"
          value={creds.external_account_id ?? ''}
          placeholder="Se genera automáticamente al autorizar la app."
          readOnly
          mono
        />
      </div>
      {error && (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      )}
      {savedMsg && (
        <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold animate-fade-in" style={{ background: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' }}>
          ✓ {savedMsg}
        </div>
      )}
      <div className="flex justify-end mt-5">
        <PrimaryBtn onClick={save} disabled={!dirty || !normalizeStoreUrl(url)} busy={saving}>
          Guardar cambios
        </PrimaryBtn>
      </div>
    </SettingsCard>
  )
}
