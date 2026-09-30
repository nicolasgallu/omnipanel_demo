// Configuración > MercadoLibre (Figma): guía de conexión paso a paso +
// credenciales de la aplicación + tokens OAuth (read-only).
//
// Backend: GET/PUT /api/mercadolibre/credentials. El exchange del código lo
// hace el callback /api/oauth/callback (redirect_uri del DevCenter).

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { credentialsApi } from '../../lib/api/endpoints'
import type { MLCredentials } from '../../lib/api/types'
import { ErrorBox, SpinnerText } from '../../components/ui'
import { NavIcon } from '../../components/NavIcon'
import { CardHeader, CheckList, CopyValue, CredField, InfoNote, OnbInput, PrimaryBtn, SettingsCard } from './settingsShared'

const WEBHOOK_URL = 'https://test-wallet.guiaslocales.cloud/webhooks/meli'

const OAUTH_FLOWS = ['Authorization Code', 'Client Credentials', 'Refresh Token']
const MELI_SCOPES = [
  'Usuarios',
  'Comunicaciones pre y post ventas',
  'Publicación y sincronización',
  'Publicidad de un producto',
  'Facturación de una venta',
  'Métricas del negocio',
  'Promociones, cupones y descuentos de una venta',
  'Venta y envíos de un producto',
]
const WEBHOOK_TOPICS = ['orders', 'messages', 'prices', 'items', 'catalog', 'shipments', 'promotions', 'Post Purchase', 'others']

function authUrl(clientId: string, redirectUri: string) {
  return `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${encodeURIComponent(
    clientId.trim(),
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&state=mercadolibre`
}

type GuideStep = { title: string; body: ReactNode }

function guideSteps(redirectUri: string): GuideStep[] {
  return [
    {
      title: 'Accedé al DevCenter',
      body: (
        <>
          <p className="text-xs" style={{ color: '#475569' }}>Entrá al portal de desarrolladores de MercadoLibre e iniciá sesión con tu cuenta.</p>
          <a
            href="https://developers.mercadolibre.com.ar/devcenter"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 w-fit text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
            style={{ color: '#2D3277', background: '#FFE600' }}
          >
            Abrir DevCenter
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden><path d="M5 2h7v7M12 2L5.5 8.5M9 11.5H3.5A1.5 1.5 0 0 1 2 10V4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </>
      ),
    },
    {
      title: 'Creá una nueva aplicación',
      body: (
        <p className="text-xs" style={{ color: '#475569' }}>
          Buscá la opción <b>“Crear nueva aplicación”</b> o <b>“Mis aplicaciones”</b> y empezá una nueva.
        </p>
      ),
    },
    {
      title: 'Completá la información básica',
      body: (
        <>
          <p className="text-xs" style={{ color: '#475569' }}>Vas a tener que cargar estos datos:</p>
          <CheckList items={['Nombre (debe ser único)', 'Nombre corto (Short Name)', 'Descripción (hasta 150 caracteres)', 'Logo (opcional)']} />
          <CheckList title="¿Cuál es el propósito de tu solución? — elegí:" items={['Negocios']} />
          <CheckList title="Rango de usuarios — seleccioná:" items={['1-10']} />
        </>
      ),
    },
    {
      title: 'Configurá autenticación y permisos',
      body: (
        <>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold" style={{ color: '#334155' }}>Redirect URI — copiá y pegá esta:</p>
            <CopyValue value={redirectUri} />
            <InfoNote>
              Solo pegá la URL en el campo. <b>No toques “Agregar Redirect URI”</b>, porque agrega campos de más que no vas a necesitar.
            </InfoNote>
          </div>
          <CheckList title="Flujos OAuth — seleccioná todos:" items={OAUTH_FLOWS} />
          <InfoNote>
            <b>Requiere PKCE:</b> dejalo en blanco.
          </InfoNote>
          <CheckList title="Negocios — elegí solo:" items={['Mercado Libre']} />
          <CheckList title="Scopes (permisos) — activalos todos:" items={MELI_SCOPES} />
          <InfoNote>
            En cada permiso activá <b>lectura y escritura</b> siempre que esté disponible. Algunos no tienen las dos opciones: en ese caso, dejá la que ofrezca.
          </InfoNote>
        </>
      ),
    },
    {
      title: 'Configurá los webhooks (notificaciones)',
      body: (
        <>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold" style={{ color: '#334155' }}>URL del webhook — pegá exactamente esta:</p>
            <CopyValue value={WEBHOOK_URL} />
          </div>
          <CheckList title="Tópicos — suscribite a todos los ítems de estos:" items={WEBHOOK_TOPICS} />
        </>
      ),
    },
    {
      title: 'Traé tus credenciales',
      body: (
        <>
          <p className="text-xs" style={{ color: '#475569' }}>Ya creaste la aplicación. Ahora, en la lista de tus aplicaciones:</p>
          <CheckList items={['Tocá los 3 puntos (⋯) de tu aplicación', 'Elegí “Editar”', 'Ahí vas a ver y poder copiar el App ID y el Client Secret']} />
          <InfoNote>
            Copiá el <b>App ID</b> y el <b>Client Secret</b> y pegalos en los campos de abajo.
          </InfoNote>
        </>
      ),
    },
  ]
}

export function MeliSettings() {
  const [creds, setCreds] = useState<MLCredentials | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    credentialsApi
      .meli()
      .then(setCreds)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  const [showGuide, setShowGuide] = useState(false)
  const redirectUri = creds?.redirect_uri || `${window.location.origin}/api/oauth/callback`

  if (loading && !creds) return <SpinnerText />

  if (error && !creds) {
    return (
      <div className="max-w-md">
        <ErrorBox message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    )
  }

  if (!creds) return null

  const hasApp = Boolean(creds.client_id)

  if (!hasApp || showGuide) {
    return (
      <MeliOnboarding
        redirectUri={redirectUri}
        initialAppId={creds.client_id ?? ''}
        initialSecret={creds.client_secret ?? ''}
        initialUserId={creds.external_account_id ?? ''}
        onExit={hasApp ? () => setShowGuide(false) : undefined}
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
        <p className="text-xs text-subtle">¿Necesitás volver a crear la aplicación?</p>
        <button
          onClick={() => setShowGuide(true)}
          className="flex items-center gap-1.5 text-xs font-semibold transition-colors hover:underline"
          style={{ color: '#4F46E5' }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" /><path d="M8 5v3.2l2 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Ver la guía otra vez
        </button>
      </div>

      <MeliCredsCard creds={creds} redirectUri={redirectUri} onSaved={() => setReloadKey((k) => k + 1)} />
      <MeliTokensCard creds={creds} redirectUri={redirectUri} onSaved={() => setReloadKey((k) => k + 1)} />
    </>
  )
}

// ─── Guía paso a paso (Figma MeliOnboarding) ─────────────────────────────────

function MeliOnboarding({
  redirectUri,
  initialAppId,
  initialSecret,
  initialUserId,
  onFinish,
  onExit,
}: {
  redirectUri: string
  initialAppId: string
  initialSecret: string
  initialUserId: string
  onFinish: () => void
  onExit?: () => void
}) {
  const steps = guideSteps(redirectUri)
  const CREDS_STEP = steps.length - 1 // "Traé tus credenciales" + formulario
  const AUTH_STEP = steps.length // autorizar la conexión
  const TOTAL = steps.length + 1

  const [i, setI] = useState(0)
  const [appId, setAppId] = useState(initialAppId)
  const [secret, setSecret] = useState(initialSecret)
  const [userId, setUserId] = useState(initialUserId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const last = i === TOTAL - 1
  const title = i === AUTH_STEP ? 'Autorizá la conexión' : steps[i]?.title ?? ''
  const canNext = i === CREDS_STEP ? Boolean(appId.trim() && secret.trim() && userId.trim()) : true

  const saveAndNext = async () => {
    setSaving(true)
    setError(null)
    try {
      await credentialsApi.saveMeli(appId.trim(), secret.trim(), userId.trim())
      setI(AUTH_STEP)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar las credenciales')
    } finally {
      setSaving(false)
    }
  }

  let body: ReactNode
  if (i === CREDS_STEP) {
    body = (
      <>
        {steps[CREDS_STEP].body}
        <div className="pt-1 flex flex-col gap-3">
          <OnbInput label="App ID (Client ID)" value={appId} onChange={setAppId} placeholder="Ej. 1234567890123456" mono />
          <OnbInput label="Client Secret" value={secret} onChange={setSecret} placeholder="Clave secreta de la aplicación" secret mono />
        </div>
        <div className="pt-1 flex flex-col gap-2.5">
          <p className="text-xs" style={{ color: '#475569' }}>
            Por último, necesitamos el <b>ID de usuario</b>. En la misma lista de aplicaciones:
          </p>
          <CheckList
            items={[
              'Tocá los 3 puntos (⋯) de tu aplicación',
              'Elegí “Administrar permisos”',
              'Copiá el ID del usuario y traelo acá',
            ]}
          />
          <OnbInput label="ID de usuario" value={userId} onChange={setUserId} placeholder="Ej. 307027338" mono />
        </div>
      </>
    )
  } else if (i === AUTH_STEP) {
    body = (
      <>
        <p className="text-xs" style={{ color: '#475569' }}>
          Ahora vamos a autorizar la conexión con tu cuenta de MercadoLibre usando el App ID que cargaste.
        </p>
        <a
          href={authUrl(appId, redirectUri)}
          target="_blank"
          rel="noreferrer"
          className="w-fit inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-transform hover:scale-[1.02]"
          style={{ background: '#FFE600', color: '#2D3277' }}
        >
          Ir a autorizar en MercadoLibre
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 3h7v7M13 3 6.5 9.5M11 9v4H3V5h4" /></svg>
        </a>
        <CheckList
          title="Qué va a pasar"
          items={[
            'Se abre MercadoLibre con el aviso: “Autorizá la conexión de la app … con tu cuenta de Mercado Libre”.',
            'Tocá Autorizar con tu cuenta.',
            'Omnipanel recibe el código, intercambia los tokens automáticamente y quedás conectado.',
          ]}
        />
        <InfoNote>
          Al terminar vas a ver los tokens en la pantalla de Configuración. Si la cuenta no coincide con una cuenta vinculada, avisale al administrador de la plataforma.
        </InfoNote>
      </>
    )
  } else {
    body = steps[i].body
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #C7D2FE', background: 'white' }}>
      <div className="flex items-center gap-3 px-6 py-5" style={{ background: '#EEF2FF' }}>
        <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#FFF7D6', color: '#F59E0B' }}>
          <NavIcon name="ml" size={22} />
        </span>
        <div className="flex-1">
          <h2 className="text-base font-bold text-ink">Conectá tu cuenta de MercadoLibre</h2>
          <p className="text-xs mt-0.5 text-subtle">Creá tu aplicación, cargá tus credenciales y autorizá la conexión siguiendo esta guía.</p>
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
              style={{ flex: 1, background: j <= i ? '#4F46E5' : '#E2E8F0', cursor: j <= i ? 'pointer' : 'default' }}
              aria-label={`Paso ${j + 1}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: '#EEF2FF', color: '#4F46E5' }}>
            {i + 1}
          </span>
          <div>
            <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94A3B8' }}>
              Paso {i + 1} de {TOTAL}
            </p>
            <h3 className="text-sm font-bold text-ink">{title}</h3>
          </div>
        </div>
        <div className="flex flex-col gap-3 min-h-[140px]">{body}</div>
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
              onClick={() => {
                if (!canNext) return
                if (i === CREDS_STEP) saveAndNext()
                else setI((x) => Math.min(TOTAL - 1, x + 1))
              }}
              disabled={!canNext || saving}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
              style={{ background: canNext ? '#4F46E5' : '#E2E8F0', color: canNext ? 'white' : '#94A3B8', cursor: canNext ? 'pointer' : 'default' }}
            >
              {saving ? 'Guardando…' : 'Siguiente'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Cards de credenciales / tokens ──────────────────────────────────────────

function MeliCredsCard({
  creds,
  redirectUri,
  onSaved,
}: {
  creds: MLCredentials
  redirectUri: string
  onSaved: () => void
}) {
  const [appId, setAppId] = useState(creds.client_id ?? '')
  const [secret, setSecret] = useState(creds.client_secret ?? '')
  const [userId, setUserId] = useState(creds.external_account_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const dirty =
    appId !== (creds.client_id ?? '') ||
    secret !== (creds.client_secret ?? '') ||
    userId !== (creds.external_account_id ?? '')

  const save = async () => {
    if (!dirty) return
    setSaving(true)
    setError(null)
    setSavedMsg(null)
    try {
      await credentialsApi.saveMeli(appId.trim(), secret.trim(), userId.trim())
      setSavedMsg('Credenciales guardadas')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar las credenciales')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsCard>
      <CardHeader
        title="Credenciales de la aplicación"
        icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8.5 8.5a3 3 0 1 0-3 3l1 1 1-1 1 1 1-1 2.5-2.5" /><circle cx="12.5" cy="7.5" r="4.5" transform="rotate(45 12.5 7.5)" /></svg>
        }
      />
      <p className="text-xs -mt-3 mb-4 text-subtle">Obtené estos valores creando una aplicación en el panel de desarrolladores de MercadoLibre.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <CredField label="Client ID (App ID)" value={appId} onChange={setAppId} placeholder="Ej. 1234567890123456" mono lockable />
        <CredField label="Client Secret" value={secret} onChange={setSecret} placeholder="Clave secreta de la aplicación" secret mono lockable />
        <CredField label="ID de usuario" value={userId} onChange={setUserId} placeholder="Ej. 307027338" mono lockable />
        <div className="md:col-span-2">
          <CredField
            label="Redirect URL"
            value={redirectUri}
            mono
            readOnly
            hint="Debe coincidir exactamente con la Redirect URI configurada en tu aplicación de ML."
          />
        </div>
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
        <PrimaryBtn onClick={save} disabled={!dirty || !appId.trim()} busy={saving}>
          Guardar cambios
        </PrimaryBtn>
      </div>
    </SettingsCard>
  )
}

function MeliTokensCard({
  creds,
  redirectUri,
  onSaved,
}: {
  creds: MLCredentials
  redirectUri: string
  onSaved: () => void
}) {
  return (
    <SettingsCard>
      <CardHeader
        title="Tokens de acceso (OAuth)"
        icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="7" cy="10" r="3.5" /><path d="M10 8.5l6.5-6.5M13.5 5l2 2M11.5 7l1.5 1.5" /></svg>
        }
      />
      <p className="text-xs -mt-3 mb-4 text-subtle">Se generan automáticamente al conectar la cuenta. Se renuevan solos con el refresh token.</p>
      {creds.connected ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div className="md:col-span-2">
            <CredField label="Access Token" value={creds.access_token ?? ''} placeholder="—" secret readOnly mono />
          </div>
          <div className="md:col-span-2">
            <CredField label="Refresh Token" value={creds.refresh_token ?? ''} placeholder="—" secret readOnly mono />
          </div>
          <CredField label="Código de autorización" value={creds.code ?? ''} placeholder="—" readOnly mono />
          <CredField
            label="Expira"
            value={creds.expires_at ?? '—'}
            placeholder="—"
            readOnly
            mono
            hint="Vence a las 6 horas — se renovará automáticamente."
          />
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-xs text-subtle">
            Todavía no conectaste tu cuenta. Completá la autorización con tu App ID para generar los tokens.
          </p>
          <a
            href={authUrl(creds.client_id ?? '', redirectUri)}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              // Permitir que el usuario refresque los tokens al volver.
              setTimeout(onSaved, 3000)
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-transform hover:scale-[1.02]"
            style={{ background: '#FFE600', color: '#2D3277' }}
          >
            Ir a autorizar en MercadoLibre
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 3h7v7M13 3 6.5 9.5M11 9v4H3V5h4" /></svg>
          </a>
        </div>
      )}
    </SettingsCard>
  )
}
