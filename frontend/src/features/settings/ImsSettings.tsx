// IMS — sistemas de inventario (Figma: diseño genérico multi-proveedor).
//
// Agregar un sistema nuevo = agregar una entrada en IMS_PROVIDERS. El backend
// persiste en businesses.config.stock_sync = { provider, config } y expone:
//   GET  /api/settings/stock-sync        (estado actual)
//   POST /api/settings/stock-sync        (guardar config)
//   POST /api/settings/stock-sync/test   (validación read-only de conexión)

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { adminApi } from '../../lib/api/endpoints'
import { ErrorBox, Spinner } from '../../components/ui'
import { CardHeader, SettingsCard } from './settingsShared'

type ImsProviderKey = 'bitcram'

type ImsField = {
  key: string
  label: string
  kind: 'text' | 'url' | 'password' | 'select'
  required?: boolean
  placeholder?: string
  hint?: string
  mono?: boolean
  options?: { value: string; label: string }[]
  default?: string
}

type ImsProvider = {
  key: ImsProviderKey
  name: string
  tagline: string
  initials: string
  accent: string
  accentBg: string
  fields: ImsField[]
  // Campos que el backend ya tolera pero que todavía no exponemos en el front.
  futureFields: string[]
}

const IMS_PROVIDERS: ImsProvider[] = [
  {
    key: 'bitcram',
    name: 'Bitcram',
    tagline: 'POS y control de stock',
    initials: 'B',
    accent: '#4F46E5',
    accentBg: '#EEF2FF',
    fields: [
      { key: 'base_url', label: 'URL de Bitcram', kind: 'url', required: true, placeholder: 'https://demo.pos.bitcram.com', hint: 'Sin barra final: la normalizamos automáticamente.', mono: true },
      { key: 'checkout_number', label: 'Nº de caja', kind: 'text', required: true, placeholder: 'Ej: 1', hint: 'El número del checkout en Bitcram.' },
      { key: 'token', label: 'Token', kind: 'password', required: true, placeholder: 'Bearer token de la API', mono: true },
      { key: 'payment_type', label: 'Tipo de pago', kind: 'text', required: true, placeholder: 'Id del tipo de pago', hint: 'Se envía como payment_type.id del comprobante.' },
      { key: 'iva_condition', label: 'Condición de IVA', kind: 'select', required: true, default: 'CF', options: [
        { value: 'CF', label: 'Consumidor Final (CF)' },
        { value: 'RI', label: 'Responsable Inscripto (RI)' },
      ] },
    ],
    futureFields: ['payment_account_index', 'warehouse_id', 'reversal_payment_type'],
  },
]

function ImsSelectField({ field, value, onChange }: { field: ImsField; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const current = field.options!.find((o) => o.value === value) ?? field.options![0]
  return (
    <div className="flex flex-col gap-1.5">
      <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>{field.label}</span>
      <div className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-sm transition-all"
          style={{ background: 'white', border: `1px solid ${open ? '#4F46E5' : '#E2E8F0'}`, boxShadow: open ? '0 0 0 3px rgba(79,70,229,0.1)' : 'none', color: '#0A1628' }}>
          <span className="truncate">{current?.label}</span>
          <svg width="12" height="12" viewBox="0 0 10 10" fill="none" style={{ color: '#94A3B8', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 mt-1 z-50 rounded-xl p-1.5 flex flex-col gap-0.5 max-h-56 overflow-y-auto"
              style={{ background: 'white', border: '1px solid #E2E8F0', boxShadow: '0 8px 24px rgba(15,23,42,0.14)' }}>
              {field.options!.map((o) => (
                <button type="button" key={o.value} onClick={() => { onChange(o.value); setOpen(false) }}
                  className="flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg text-sm transition-colors hover:bg-slate-50"
                  style={{ color: o.value === value ? '#4F46E5' : '#0A1628', fontWeight: o.value === value ? 600 : 400 }}>
                  <span className="truncate">{o.label}</span>
                  {o.value === value && (
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}><path d="M2.5 7.5l3 3 6-7" stroke="#4F46E5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {field.hint && <span style={{ fontSize: '10px', color: '#94A3B8' }}>{field.hint}</span>}
    </div>
  )
}

function ImsTextField({ field, value, onChange }: { field: ImsField; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(field.kind !== 'password')
  const secret = field.kind === 'password'
  return (
    <div className="flex flex-col gap-1.5">
      <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>{field.label}</span>
      <div className="relative">
        <input type={secret && !show ? 'password' : 'text'} value={value} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)}
          className="w-full pl-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
          style={{ paddingRight: secret ? 42 : 12, border: '1px solid #E2E8F0', color: '#0A1628', background: 'white', fontFamily: field.mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#4F46E5'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.1)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none' }} />
        {secret && (
          <button onClick={() => setShow((x) => !x)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors hover:bg-slate-100" style={{ color: '#94A3B8' }} aria-label="Mostrar / ocultar">
            {show
              ? <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" /><circle cx="10" cy="10" r="2.5" /></svg>
              : <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l12 12M8.5 8.6A2.5 2.5 0 0 0 11.4 11.5M6 6.2C3.6 7.6 2 10 2 10s3 5.5 8 5.5c1.3 0 2.5-.3 3.5-.8M11 4.6C10.7 4.5 10.3 4.5 10 4.5 5 4.5 2 10 2 10" /></svg>}
          </button>
        )}
      </div>
      {field.hint && <span style={{ fontSize: '10px', color: '#94A3B8' }}>{field.hint}</span>}
    </div>
  )
}

function SecondaryBtn({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
      style={{ border: '1px solid #E2E8F0', color: disabled ? '#CBD5E1' : '#475569', background: 'white', cursor: disabled ? 'default' : 'pointer' }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#F8FAFC' }}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}>
      {children}
    </button>
  )
}

function ProviderBadge({ provider, size = 40 }: { provider: ImsProvider; size?: number }) {
  return (
    <span className="flex items-center justify-center rounded-xl flex-shrink-0 font-bold"
      style={{ width: size, height: size, background: provider.accentBg, color: provider.accent, fontSize: size * 0.4 }}>
      {provider.initials}
    </span>
  )
}

function ImsProviderForm({
  provider,
  initialValues,
  onSave,
  onDisconnect,
}: {
  provider: ImsProvider
  initialValues?: Record<string, string>
  onSave: (values: Record<string, string>) => Promise<void>
  onDisconnect: () => void
}) {
  const makeInitial = () => {
    const o: Record<string, string> = {}
    for (const f of provider.fields) o[f.key] = (initialValues?.[f.key]) ?? f.default ?? ''
    return o
  }
  const [values, setValues] = useState<Record<string, string>>(makeInitial)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const setField = (k: string, v: string) => {
    setValues((vs) => ({ ...vs, [k]: v }))
    setTestResult(null)
    setErr(null)
  }
  const complete = provider.fields.filter((f) => f.required).every((f) => values[f.key]?.trim())

  const save = async () => {
    if (!complete || saving) return
    setSaving(true)
    setErr(null)
    setTestResult(null)
    try {
      await onSave(values)
      setSaving(false)
      setSavedFlash(true)
      // Tras confirmar, volvemos al menú de sistemas.
      setTimeout(() => onDisconnect(), 1300)
    } catch (e) {
      setSaving(false)
      setErr(e instanceof Error ? e.message : 'No se pudo guardar la configuración')
    }
  }

  const test = async () => {
    if (!complete || testing || saving) return
    setTesting(true)
    setTestResult(null)
    setErr(null)
    try {
      const res = await adminApi.imsTest({ provider: provider.key, config: values })
      if (res.ok) {
        setTestResult('ok')
      } else {
        setTestResult('fail')
        setErr(res.message || 'La conexión falló')
      }
    } catch (e) {
      setTestResult('fail')
      setErr(e instanceof Error ? e.message : 'No se pudo probar la conexión')
    } finally {
      setTesting(false)
    }
  }

  const flashOk = savedFlash || testResult === 'ok'
  const busy = testing || saving

  return (
    <SettingsCard>
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <ProviderBadge provider={provider} />
          <div>
            <h2 className="text-base font-bold" style={{ color: '#0A1628' }}>{provider.name}</h2>
            <p className="text-xs" style={{ color: '#64748B' }}>{provider.tagline}</p>
          </div>
        </div>
        <button onClick={onDisconnect} aria-label="Cerrar" className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0" style={{ color: '#94A3B8' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#475569' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {provider.fields.map((f) => (
          f.kind === 'select'
            ? <ImsSelectField key={f.key} field={f} value={values[f.key]} onChange={(v) => setField(f.key, v)} />
            : <ImsTextField key={f.key} field={f} value={values[f.key]} onChange={(v) => setField(f.key, v)} />
        ))}
      </div>

      {err && (
        <div className="mt-4">
          <ErrorBox message={err} />
        </div>
      )}

      {/* Feedback: banner inline dentro del card */}
      {(busy || flashOk) && (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl px-4 py-3"
          style={{
            background: flashOk ? '#F0FDF4' : '#EEF2FF',
            border: `1px solid ${flashOk ? '#BBF7D0' : '#C7D2FE'}`,
          }}>
          {busy ? (
            <span className="rounded-full flex-shrink-0" style={{ width: 16, height: 16, border: '2px solid #C7D2FE', borderTopColor: '#4F46E5', animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#16A34A' }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M4 8.5l2.5 2.5L12 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          )}
          <div className="min-w-0">
            <p style={{ fontSize: '13px', fontWeight: 600, color: flashOk ? '#15803D' : '#4338CA' }}>
              {saving ? 'Guardando configuración…' : savedFlash ? 'Configuración guardada' : testing ? 'Probando conexión…' : 'Conexión verificada'}
            </p>
            <p style={{ fontSize: '11.5px', color: '#64748B' }}>
              {saving ? 'Estamos guardando los datos de ' + provider.name : savedFlash ? 'Volviendo al menú de sistemas…' : testing ? 'Consultando la caja en ' + provider.name : 'La caja está abierta y la sesión responde correctamente.'}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 mt-5">
        <SecondaryBtn onClick={test} disabled={!complete || testing || saving}>{testing ? 'Probando…' : 'Probar conexión'}</SecondaryBtn>
        <button onClick={save} disabled={!complete || saving}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{ background: complete && !saving ? '#4F46E5' : '#C7D2FE', cursor: complete && !saving ? 'pointer' : 'default' }}
          onMouseEnter={(e) => { if (complete && !saving) e.currentTarget.style.background = '#4338CA' }}
          onMouseLeave={(e) => { if (complete && !saving) e.currentTarget.style.background = '#4F46E5' }}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </SettingsCard>
  )
}

type ImsConfigs = Partial<Record<ImsProviderKey, Record<string, string>>>

// Momento en que una venta descuenta stock en el IMS (aplica a cualquier
// sistema conectado). Se persiste en el backend (PATCH /settings/stock-sync/trigger).
type StockSyncTrigger = 'paid' | 'confirmed'

const STOCK_SYNC_TRIGGERS: { key: StockSyncTrigger; title: string; desc: string; note: string }[] = [
  { key: 'paid', title: 'Cuando la orden se paga', desc: 'Descuenta stock recién con el pago acreditado.', note: 'Recomendado · evita mover stock por órdenes que nunca se pagan.' },
  { key: 'confirmed', title: 'Cuando la orden se confirma', desc: 'Reserva el stock apenas entra la orden, antes del pago.', note: 'Evita sobreventas. Si la orden se cancela, el stock se revierte automáticamente.' },
]

function StockSyncTriggerPicker({
  value,
  busy,
  onPick,
}: {
  value: StockSyncTrigger
  busy: boolean
  onPick: (v: StockSyncTrigger) => void
}) {
  return (
    <div className="mb-6">
      <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }} className="mb-1">
        Sincronización de ventas
      </p>
      <p className="text-xs mb-2.5" style={{ color: '#64748B' }}>
        Elegí en qué momento una venta de MercadoLibre o Tienda Nube descuenta stock. Aplica a cualquier sistema conectado.
      </p>
      <div role="radiogroup" className="grid gap-2.5 sm:grid-cols-2" style={{ opacity: busy ? 0.7 : 1 }}>
        {STOCK_SYNC_TRIGGERS.map((t) => {
          const on = value === t.key
          return (
            <button
              key={t.key}
              role="radio"
              aria-checked={on}
              disabled={busy}
              onClick={() => onPick(t.key)}
              className="text-left flex gap-3 rounded-xl px-4 py-3 transition-colors"
              style={{ border: `1.5px solid ${on ? '#4F46E5' : '#E2E8F0'}`, background: on ? '#FBFBFF' : 'white', boxShadow: on ? '0 0 0 3px rgba(79,70,229,0.08)' : 'none' }}
            >
              <span className="mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center" style={{ border: `1.5px solid ${on ? '#4F46E5' : '#CBD5E1'}` }}>
                {on && <span className="w-2 h-2 rounded-full" style={{ background: '#4F46E5' }} />}
              </span>
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-semibold" style={{ color: '#0A1628' }}>{t.title}</span>
                <span className="text-xs" style={{ color: '#475569' }}>{t.desc}</span>
                <span className="text-[11px] mt-1" style={{ color: '#94A3B8' }}>{t.note}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ImsSettings() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [configs, setConfigs] = useState<ImsConfigs>({})
  const [provider, setProvider] = useState<ImsProviderKey | null>(null)
  const [trigger, setTrigger] = useState<StockSyncTrigger>('paid')
  const [triggerBusy, setTriggerBusy] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)
  const active = IMS_PROVIDERS.find((p) => p.key === provider) ?? null
  const anyConnected = IMS_PROVIDERS.some((p) => Boolean(configs[p.key]))

  // Precargar la config guardada desde el backend (persistencia real, no
  // localStorage). El backend guarda UN provider activo por business.
  useEffect(() => {
    let cancelled = false
    adminApi
      .imsSettings()
      .then((res) => {
        if (cancelled) return
        setTrigger(res.trigger === 'confirmed' ? 'confirmed' : 'paid')
        if (res.provider && res.provider !== 'none') {
          const known = IMS_PROVIDERS.some((p) => p.key === res.provider)
          if (known) {
            setConfigs({ [res.provider]: res.config } as ImsConfigs)
          }
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Optimista: aplica al toque y revierte si el PATCH falla.
  const pickTrigger = async (v: StockSyncTrigger) => {
    if (triggerBusy) return
    const prev = trigger
    setTrigger(v)
    setTriggerError(null)
    setTriggerBusy(true)
    try {
      await adminApi.imsTrigger(v)
    } catch (err) {
      setTrigger(prev)
      setTriggerError(err instanceof Error ? err.message : 'No se pudo guardar el momento de sincronización.')
    } finally {
      setTriggerBusy(false)
    }
  }

  if (loading) {
    return (
      <SettingsCard>
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </SettingsCard>
    )
  }

  if (active) {
    return (
      <ImsProviderForm
        provider={active}
        initialValues={configs[active.key]}
        onSave={async (values) => {
          await adminApi.imsSave({ provider: active.key, config: values })
          setConfigs((prev) => ({ ...prev, [active.key]: values }))
        }}
        onDisconnect={() => setProvider(null)}
      />
    )
  }

  return (
    <SettingsCard>
      <CardHeader title="Sistema de inventario (IMS)" icon={
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6l7-3.5L17 6v8l-7 3.5L3 14V6Z" /><path d="M3 6l7 3.5L17 6M10 9.5V17" /></svg>
      } />

      {loadError && (
        <div className="mb-4">
          <ErrorBox message={loadError} />
        </div>
      )}

      {/* Estado vacío (solo si no hay ningún sistema conectado) */}
      {!anyConnected && (
        <div className="flex flex-col items-center text-center gap-1.5 py-6 mb-4">
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#F1F5F9', color: '#94A3B8' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7l8-4 8 4v10l-8 4-8-4V7Z" /><path d="M4 7l8 4 8-4M12 11v10" /></svg>
          </span>
          <h3 className="text-base font-bold" style={{ color: '#0A1628' }}>Sin sistema conectado</h3>
          <p className="text-sm max-w-md" style={{ color: '#64748B' }}>Conectá tu sistema de gestión de stock para que las ventas de tus canales actualicen el inventario automáticamente.</p>
        </div>
      )}

      {triggerError && (
        <div className="mb-4">
          <ErrorBox message={triggerError} />
        </div>
      )}

      {/* Momento de descuento de stock (aplica a cualquier IMS conectado). */}
      <StockSyncTriggerPicker value={trigger} busy={triggerBusy} onPick={pickTrigger} />

      {/* Catálogo de sistemas disponibles */}
      <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }} className="mb-2">Sistemas disponibles</p>
      <div className="flex flex-col gap-2.5">
        {IMS_PROVIDERS.map((p) => {
          const cfg = configs[p.key]
          const connected = Boolean(cfg)
          const summary = cfg?.base_url
          return (
            <div key={p.key} className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors" style={{ border: `1px solid ${connected ? '#C7D2FE' : '#E2E8F0'}`, background: connected ? '#FBFBFF' : 'white' }}>
              <ProviderBadge provider={p} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold" style={{ fontSize: '14px', color: '#0A1628' }}>{p.name}</p>
                  {connected && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: '#DCFCE7' }}>
                      <span className="rounded-full" style={{ width: 5, height: 5, background: '#16A34A' }} />
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#15803D' }}>Conectado</span>
                    </span>
                  )}
                </div>
                <p className="truncate" style={{ fontSize: '12px', color: '#94A3B8' }}>{connected && summary ? summary : p.tagline}</p>
              </div>
              <button onClick={() => setProvider(p.key)} className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex-shrink-0"
                style={{ background: connected ? 'white' : '#4F46E5', color: connected ? '#4F46E5' : 'white', border: connected ? '1px solid #C7D2FE' : 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = connected ? '#EEF2FF' : '#4338CA')}
                onMouseLeave={(e) => (e.currentTarget.style.background = connected ? 'white' : '#4F46E5')}>
                {connected ? 'Editar' : 'Conectar'}
              </button>
            </div>
          )
        })}
        <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ border: '1px dashed #E2E8F0' }}>
          <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#F8FAFC', color: '#CBD5E1' }}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M8 3.5v9M3.5 8h9" /></svg>
          </span>
          <p style={{ fontSize: '12.5px', color: '#94A3B8' }}>Vamos a ir sumando más sistemas de inventario.</p>
        </div>
      </div>
    </SettingsCard>
  )
}
