import { useEffect, useRef, useState } from 'react'
import { aiApi } from '../lib/api/endpoints'
import { usePermissions } from '../lib/auth'
import { ErrorBox, SpinnerText, Toggle } from '../components/ui'
import type { AiMode, CsSettings } from '../lib/api/types'

type PromptDef = { key: string; label: string; desc: string; group: string; text: string }

const CS_PROMPT_GROUP = 'Atención al cliente · Mensajes de MercadoLibre'

const PROMPT_DEFS: PromptDef[] = [
  {
    key: 'ai_generate_title',
    group: 'Generación de contenido',
    label: 'Generar título',
    desc: 'Redacta el título de la publicación a partir de los datos del producto.',
    text: 'Sos un experto en marketplaces argentinos. Generá un título de venta claro y optimizado para SEO (máximo 60 caracteres) usando marca, modelo y características principales del producto. No uses mayúsculas sostenidas ni signos de exclamación.',
  },
  {
    key: 'ai_generate_description',
    group: 'Generación de contenido',
    label: 'Generar descripción',
    desc: 'Escribe la descripción completa de la publicación.',
    text: 'Redactá una descripción de producto persuasiva y estructurada en párrafos cortos. Incluí beneficios, características técnicas y condiciones de uso. Tono profesional y cercano, en español rioplatense.',
  },
  {
    key: 'ai_generate_brand',
    group: 'Generación de contenido',
    label: 'Detectar marca',
    desc: 'Infiere la marca cuando el campo está vacío.',
    text: 'A partir del nombre y la descripción del producto, indicá únicamente la marca. Si no podés determinarla con certeza, respondé "Genérico".',
  },
  {
    key: 'ai_generate_model',
    group: 'Generación de contenido',
    label: 'Detectar modelo',
    desc: 'Infiere el modelo cuando el campo está vacío.',
    text: 'A partir del nombre y la descripción del producto, indicá únicamente el modelo o versión. Si no existe, generá un código de modelo corto basado en el nombre.',
  },
  {
    key: 'cs_tone',
    group: CS_PROMPT_GROUP,
    label: 'Tono base',
    desc: 'Cómo suena la marca al responder preguntas y mensajes.',
    text: 'Respondé con tono cercano y profesional, en español rioplatense (voseo). Saludá por el nombre del comprador, andá al punto y cerrá con un saludo breve.',
  },
  {
    key: 'cs_rules',
    group: CS_PROMPT_GROUP,
    label: 'Reglas',
    desc: 'Lo que la IA nunca debe hacer al responder compradores.',
    text: 'No compartas datos de contacto ni pidas datos personales fuera de la mensajería. No prometas plazos ni envíos gratis que no estén configurados. No respondas reclamos, devoluciones ni temas legales: derivalos a una persona.',
  },
  {
    key: 'cs_classifier',
    group: CS_PROMPT_GROUP,
    label: 'Clasificador',
    desc: 'Decide si el mensaje lo puede responder la IA o requiere una persona.',
    text: 'Clasificá el mensaje en: consulta_producto, envio, facturacion, post_venta, reclamo, devolucion, datos_personales u otro. Devolvé la categoría y si requiere humano (true/false) con un motivo corto.',
  },
  {
    key: 'cs_writer',
    group: CS_PROMPT_GROUP,
    label: 'Redactor de respuestas',
    desc: 'Escribe el borrador usando datos reales del producto y del catálogo.',
    text: 'Redactá una respuesta de máximo 350 caracteres usando solo datos del producto (precio, stock, atributos) y del catálogo del vendedor. Si citás otro producto, incluí nombre, precio y stock. Si te falta un dato, decí que lo consultás.',
  },
  {
    key: 'cs_auditor',
    group: CS_PROMPT_GROUP,
    label: 'Auditor de respuestas',
    desc: 'Valida el borrador antes de mostrarlo o enviarlo.',
    text: 'Revisá el borrador contra las reglas y los datos del producto. Devolvé verdict (approved | corrected), score de 0 a 1 y la lista de objeciones. Si corregís, devolvé el texto corregido.',
  },
  {
    key: 'ai_improving_human_reply',
    group: CS_PROMPT_GROUP,
    label: 'Mejorar respuesta humana',
    desc: 'Pulir la respuesta escrita por un operador antes de enviarla.',
    text: 'Mejorá la redacción de la respuesta del vendedor manteniendo el sentido original. Corregí ortografía, hacela clara y amable, y conservá los datos concretos (precios, plazos, stock).',
  },
]

// ─── Config de IA para atención al cliente (solo dueño) ──────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === 'idle') return <span className="text-[11px]" style={{ color: '#CBD5E1' }}>Se guarda automáticamente</span>
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
    <button onClick={onRetry} className="inline-flex items-center gap-1.5 text-[11px] font-medium underline" style={{ color: '#DC2626' }} aria-live="assertive">
      No se pudo guardar · Reintentar
    </button>
  )
}

function CsAiSettings({ config, onChange }: { config: CsSettings; onChange: (c: CsSettings) => void }) {
  const [save, setSave] = useState<SaveState>('idle')
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const update = (patch: Partial<CsSettings>) => {
    const next = { ...config, ...patch }
    onChange(next)
    setSave('saving')
    setSaving(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      aiApi
        .savePrompts(undefined, next)
        .then(() => {
          setSave('saved')
          setTimeout(() => setSave((s) => (s === 'saved' ? 'idle' : s)), 2000)
        })
        .catch(() => setSave('error'))
        .finally(() => setSaving(false))
    }, 600)
  }

  const modes: { key: AiMode; label: string; desc: string }[] = [
    { key: 'off', label: 'Off', desc: 'La IA no interviene. Todas las conversaciones te llegan para responder a mano y te avisamos por WhatsApp/Telegram.' },
    { key: 'suggest', label: 'Sugerir', desc: 'La IA prepara un borrador auditado y vos decidís si enviarlo.' },
    { key: 'autopilot', label: 'Piloto automático', desc: 'La IA responde sola cuando supera el umbral de confianza. El resto queda Para revisar.' },
  ]

  return (
    <div className="rounded-xl bg-white p-4 flex flex-col gap-4" style={{ border: '1px solid #E2E8F0' }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: '#0A1628' }}>Modo de IA</span>
        <SaveIndicator state={save} onRetry={() => update({})} />
      </div>
      <div role="radiogroup" className="grid grid-cols-3 p-1 rounded-xl" style={{ background: '#F1F5F9' }}>
        {modes.map((mo) => (
          <button
            key={mo.key}
            role="radio"
            aria-checked={config.mode === mo.key}
            onClick={() => !saving && update({ mode: mo.key })}
            className="py-2 rounded-lg text-xs font-semibold transition-all"
            style={{ background: config.mode === mo.key ? 'white' : 'transparent', color: config.mode === mo.key ? '#0A1628' : '#64748B', boxShadow: config.mode === mo.key ? '0 1px 2px rgba(15,23,42,0.08)' : 'none' }}
          >
            {mo.label}
          </button>
        ))}
      </div>
      <p className="text-xs -mt-2" style={{ color: '#64748B' }}>{modes.find((mo) => mo.key === config.mode)!.desc}</p>

      <div className="flex flex-col gap-2" style={{ opacity: config.mode === 'off' ? 0.45 : 1 }}>
        <div className="flex items-center justify-between">
          <label htmlFor="cs-threshold" className="text-xs font-semibold" style={{ color: '#334155' }}>Confianza mínima</label>
          <span className="text-xs font-bold tabular-nums" style={{ color: '#4F46E5' }}>{config.min_confidence}%</span>
        </div>
        <input
          id="cs-threshold"
          type="range"
          min={50}
          max={99}
          value={config.min_confidence}
          disabled={config.mode === 'off'}
          onChange={(e) => update({ min_confidence: Number(e.target.value) })}
          className="w-full accent-indigo-600"
        />
        <span className="text-[11px]" style={{ color: '#94A3B8' }}>Por debajo de este valor la respuesta no se envía sola y queda Para revisar.</span>
      </div>

      <div className="flex items-center justify-between gap-4 pt-3" style={{ borderTop: '1px solid #F1F5F9', opacity: config.mode === 'off' ? 0.45 : 1 }}>
        <div>
          <p className="text-xs font-semibold" style={{ color: '#334155' }}>Auditoría de respuestas</p>
          <p className="text-[11px]" style={{ color: '#94A3B8' }}>Un segundo modelo revisa cada borrador antes de mostrarlo o enviarlo.</p>
        </div>
        <Toggle value={config.audit} onChange={(v) => config.mode !== 'off' && update({ audit: v })} />
      </div>
    </div>
  )
}

function PromptCard({
  def,
  value,
  dirty,
  saving,
  onChange,
  onSave,
  onReset,
}: {
  def: PromptDef
  value: string
  dirty: boolean
  saving: boolean
  onChange: (v: string) => void
  onSave: () => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl overflow-hidden bg-white" style={{ border: '1px solid #E2E8F0' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
        style={{ background: open ? '#F8FAFC' : 'white', borderBottom: open ? '1px solid #F1F5F9' : 'none' }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 12 12"
          fill="none"
          className="flex-shrink-0"
          style={{ color: '#94A3B8', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s ease' }}
          aria-hidden
        >
          <path d="M4 2.5l3.5 3.5L4 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">{def.label}</span>
            {dirty && (
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#F59E0B' }} title="Cambios sin guardar" />
            )}
          </div>
          {!open && <p className="truncate mt-0.5 text-muted" style={{ fontSize: '11px' }}>{def.desc}</p>}
        </div>
        <span className="font-mono px-2 py-0.5 rounded flex-shrink-0" style={{ fontSize: '10px', color: '#6366F1', background: '#EEF2FF' }}>
          {def.key}
        </span>
      </button>
      {open && (
        <div className="px-4 py-3.5 flex flex-col gap-3">
          <p style={{ fontSize: '12px', color: '#64748B' }}>{def.desc}</p>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={6}
            className="w-full px-3.5 py-3 text-sm rounded-xl outline-none transition-all resize-y text-ink"
            style={{ border: '1px solid #E2E8F0', background: '#FCFCFD', lineHeight: 1.55 }}
            onFocus={(e) => {
              e.target.style.borderColor = '#4F46E5'
              e.target.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.1)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#E2E8F0'
              e.target.style.boxShadow = 'none'
            }}
          />
          <div className="flex items-center gap-3">
            <span style={{ fontSize: '11px', color: '#CBD5E1' }}>{value.length} caracteres</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={onReset}
                disabled={!dirty}
                className="px-3.5 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{ border: '1px solid #E2E8F0', color: dirty ? '#475569' : '#CBD5E1', background: 'white', cursor: dirty ? 'pointer' : 'default' }}
              >
                Restaurar
              </button>
              <button
                onClick={onSave}
                disabled={!dirty || saving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: dirty ? '#4F46E5' : '#C7D2FE', cursor: dirty ? 'pointer' : 'default' }}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function PromptsAIPage() {
  const { isBusiness } = usePermissions()
  const [saved, setSaved] = useState<Record<string, string>>(() =>
    Object.fromEntries(PROMPT_DEFS.map((d) => [d.key, d.text])),
  )
  const [draft, setDraft] = useState<Record<string, string>>(saved)
  const [settings, setSettings] = useState<CsSettings>({ mode: 'suggest', min_confidence: 75, audit: true })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)

  useEffect(() => {
    aiApi
      .getPrompts()
      .then((res) => {
        const merged = { ...saved }
        for (const k of PROMPT_DEFS.map((d) => d.key)) {
          if (res.prompts[k]) merged[k] = res.prompts[k]
        }
        setSaved(merged)
        setDraft(merged)
        setSettings(res.settings)
      })
      .catch(() => {
        /* sin backend: quedan los defaults */
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const groups = [...new Set(PROMPT_DEFS.map((d) => d.group))].filter(
    (g) => isBusiness || g !== CS_PROMPT_GROUP,
  )
  const dirtyCount = PROMPT_DEFS.filter((d) => draft[d.key] !== saved[d.key]).length

  const saveOne = async (k: string) => {
    setSavingKey(k)
    setError(null)
    try {
      const res = await aiApi.savePrompts({ [k]: draft[k] })
      if (res.prompts[k] !== undefined) {
        setSaved((s) => ({ ...s, [k]: res.prompts[k] }))
      } else {
        setSaved((s) => ({ ...s, [k]: draft[k] }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el prompt')
    } finally {
      setSavingKey(null)
    }
  }

  const saveAll = async () => {
    setSavingAll(true)
    setError(null)
    try {
      await aiApi.savePrompts(draft)
      setSaved({ ...draft })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los prompts')
    } finally {
      setSavingAll(false)
    }
  }

  if (loading) return <SpinnerText />

  return (
    <div className="flex-1 overflow-y-auto scroll-slim">
      <div className="max-w-4xl mx-auto px-8 py-8 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-ink">Prompts AI</h1>
            <p className="text-sm text-subtle">
              Editá las instrucciones que usa la IA. Cada bloque corresponde a un registro de la tabla{' '}
              <span className="font-mono" style={{ color: '#6366F1' }}>
                prompts
              </span>
              .
            </p>
          </div>
          {dirtyCount > 0 && (
            <button
              onClick={saveAll}
              disabled={savingAll}
              className="flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-70"
              style={{ background: '#4F46E5' }}
            >
              {savingAll ? 'Guardando…' : `Guardar todo (${dirtyCount})`}
            </button>
          )}
        </div>

        {error && <ErrorBox message={error} />}

        {!isBusiness && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#64748B' }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" /></svg>
            La configuración de IA para atención al cliente la ve solo el dueño del negocio.
          </div>
        )}

        {groups.map((group) => (
          <div key={group} className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted" style={{ letterSpacing: '0.08em' }}>
                {group}
              </span>
              <div className="flex-1 h-px" style={{ background: '#F1F5F9' }} />
            </div>
            {group === CS_PROMPT_GROUP && isBusiness && (
              <CsAiSettings config={settings} onChange={setSettings} />
            )}
            {PROMPT_DEFS.filter((d) => d.group === group).map((def) => (
              <PromptCard
                key={def.key}
                def={def}
                value={draft[def.key]}
                dirty={draft[def.key] !== saved[def.key]}
                saving={savingKey === def.key}
                onChange={(v) => setDraft((d) => ({ ...d, [def.key]: v }))}
                onSave={() => saveOne(def.key)}
                onReset={() => setDraft((d) => ({ ...d, [def.key]: saved[def.key] }))}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
