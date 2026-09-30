import { useEffect, useState } from 'react'
import { aiApi } from '../lib/api/endpoints'
import { ErrorBox, SpinnerText } from '../components/ui'

type PromptDef = { key: string; label: string; desc: string; group: string; text: string }

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
    key: 'ai_category',
    group: 'Publicación',
    label: 'Sugerir categoría',
    desc: 'Elige la categoría del marketplace más adecuada.',
    text: 'Dada la información del producto, seleccioná la categoría de MercadoLibre más específica y correcta. Devolvé el id de categoría y su ruta completa.',
  },
  {
    key: 'ai_auditor',
    group: 'Publicación',
    label: 'Auditor de publicación',
    desc: 'Revisa la calidad de la publicación antes de publicar.',
    text: 'Actuá como auditor de calidad. Revisá título, descripción, fotos y atributos, y devolvé una lista de mejoras concretas priorizadas por impacto en las ventas.',
  },
  {
    key: 'ai_improving_human_reply',
    group: 'Atención al cliente',
    label: 'Mejorar respuesta humana',
    desc: 'Pulir la respuesta escrita por un operador antes de enviarla.',
    text: 'Mejorá la redacción de la respuesta del vendedor manteniendo el sentido original. Corregí ortografía, hacela clara y amable, y conservá los datos concretos (precios, plazos, stock).',
  },
  {
    key: 'ai_inventory_search',
    group: 'Búsqueda e inventario',
    label: 'Búsqueda de inventario',
    desc: 'Interpreta búsquedas en lenguaje natural sobre el inventario.',
    text: 'Convertí la consulta del usuario en filtros de inventario (marca, categoría, rango de precio, stock). Devolvé un JSON con los filtros detectados.',
  },
  {
    key: 'ai_general',
    group: 'General',
    label: 'Prompt general',
    desc: 'Contexto base que se antepone a todas las tareas de IA.',
    text: 'Sos el asistente de Omnipanel para un vendedor de e-commerce en Argentina. Respondé siempre en español rioplatense, de forma concisa y accionable. No inventes datos que no estén disponibles.',
  },
  {
    key: 'rules',
    group: 'General',
    label: 'Reglas',
    desc: 'Restricciones y políticas que la IA debe respetar siempre.',
    text: 'Nunca prometas envíos gratis salvo que esté configurado. No uses lenguaje discriminatorio. Respetá las políticas de cada marketplace. Ante datos faltantes, pedí aclaración en lugar de inventar.',
  },
]

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
  const [saved, setSaved] = useState<Record<string, string>>(() =>
    Object.fromEntries(PROMPT_DEFS.map((d) => [d.key, d.text])),
  )
  const [draft, setDraft] = useState<Record<string, string>>(saved)
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
      })
      .catch(() => {
        /* sin backend: quedan los defaults */
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const groups = [...new Set(PROMPT_DEFS.map((d) => d.group))]
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

        {groups.map((group) => (
          <div key={group} className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted" style={{ letterSpacing: '0.08em' }}>
                {group}
              </span>
              <div className="flex-1 h-px" style={{ background: '#F1F5F9' }} />
            </div>
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
