import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Product } from '../../lib/api/types'
import { aiApi, inventoryApi } from '../../lib/api/endpoints'
import { Spinner } from '../../components/ui'

interface Dims {
  h: string
  w: string
  d: string
  weight: string
}

function parseDims(dimensions?: string | null): Dims {
  if (!dimensions) return { h: '', w: '', d: '', weight: '' }
  const [h, w, rest = ''] = dimensions.split('x')
  const [d = '', weight = ''] = rest.split(',')
  return { h: h ?? '', w: w ?? '', d, weight }
}

const inputStyle = { border: '1px solid #E2E8F0' }
const focusFx = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  e.target.style.borderColor = '#818CF8'
  e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'
}
const blurFx = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  e.target.style.borderColor = '#E2E8F0'
  e.target.style.boxShadow = 'none'
}

function AIButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      type="button"
      title="Generar con IA"
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-semibold transition-colors"
      style={{ color: '#4F46E5' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#EEF2FF'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M8 1.5l1.4 3.6L13 6.5 9.4 7.9 8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5z" fill="currentColor" />
        <path d="M12.8 10.5l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6.6-1.5z" fill="currentColor" opacity="0.7" />
      </svg>
      IA
    </button>
  )
}

function AIGenerateModal({
  fieldLabel,
  current,
  onClose,
  onAccept,
}: {
  fieldLabel: 'title' | 'description'
  current: string
  onClose: () => void
  onAccept: (v: string) => void
}) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isTitle = fieldLabel === 'title'

  const generate = async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await aiApi.generate(fieldLabel, prompt.trim(), current)
      setResult(res.text)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar con IA')
    } finally {
      setLoading(false)
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
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M4 4.5h12v8H8l-3 3v-3H4v-8z" stroke="#4F46E5" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-ink">Generar con IA</h3>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-subtle">
            Ingresa el prompt para generar {isTitle ? 'el título' : 'la descripción'}:
          </label>
          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={isTitle ? 2 : 3}
            placeholder="Escribe aquí…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
            }}
            className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all resize-none text-ink placeholder:text-faint"
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

        {loading && (
          <div className="flex items-center gap-2 text-xs text-subtle">
            <Spinner size={14} />
            Generando…
          </div>
        )}

        {error && (
          <div className="rounded-xl px-3 py-2.5 text-xs font-medium" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            {error}
          </div>
        )}

        {result && !loading && (
          <div className="rounded-xl p-3 flex flex-col gap-1" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>
              Sugerencia
            </span>
            <p className="text-sm leading-relaxed text-ink">{result}</p>
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
          {result && !loading ? (
            <button
              onClick={() => {
                onAccept(result)
                onClose()
              }}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors hover:brightness-95"
              style={{ background: '#4F46E5' }}
            >
              Usar sugerencia
            </button>
          ) : (
            <button
              onClick={generate}
              disabled={!prompt.trim() || loading}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ background: !prompt.trim() || loading ? '#C7D2FE' : '#4F46E5', cursor: !prompt.trim() || loading ? 'default' : 'pointer' }}
            >
              {loading ? 'Generando…' : 'Aceptar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function GeneralTab({
  product,
  onSaved,
}: {
  product: Product
  onSaved: (p: Product) => void
}) {
  const [title, setTitle] = useState(product.name_edited || product.name)
  const [description, setDescription] = useState(product.description || '')
  const [brand, setBrand] = useState(product.brand || '')
  const [model, setModel] = useState(product.model || '')
  const [dims, setDims] = useState<Dims>(() => parseDims(product.dimensions))
  const [prepublishing, setPrepublishing] = useState(false)
  const [prepublished, setPrepublished] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiField, setAiField] = useState<null | 'title' | 'description'>(null)

  // Re-sync when the drawer switches products.
  useEffect(() => {
    setTitle(product.name_edited || product.name)
    setDescription(product.description || '')
    setBrand(product.brand || '')
    setModel(product.model || '')
    setDims(parseDims(product.dimensions))
    setPrepublished(false)
    setSaved(false)
    setError(null)
  }, [product.id, product.name, product.name_edited, product.description, product.dimensions, product.brand, product.model])

  const missingCount = [!title.trim(), !description.trim(), !brand.trim(), !model.trim()].filter(Boolean).length
  const explain =
    'La IA completa los campos faltantes (marca, modelo) y mejora el título y la descripción si están vacíos, dejando el producto listo para publicar.'

  const prepublish = async () => {
    if (prepublishing || prepublished) return
    setPrepublishing(true)
    setError(null)
    try {
      const res = await inventoryApi.prepublish(product.id)
      const p = res.product
      setTitle(p.name_edited || p.name || title)
      setDescription(p.description || description)
      setBrand(p.brand || brand)
      setModel(p.model || model)
      setPrepublished(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ejecutar la prepublicación')
    } finally {
      setPrepublishing(false)
    }
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const { product: updated } = await inventoryApi.patch(product.id, {
        title,
        description,
        dimensions_cm_g: {
          height: parseFloat(dims.h) || 0,
          width: parseFloat(dims.w) || 0,
          depth: parseFloat(dims.d) || 0,
          weight: parseFloat(dims.weight) || 0,
        },
      })
      setSaved(true)
      onSaved(updated)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {prepublished ? (
        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#15803D' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5 8l2 2 4-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Ya se ejecutó la prepublicación
        </div>
      ) : missingCount > 0 ? (
        <div className="flex items-center gap-2">
          <button
            onClick={prepublish}
            disabled={prepublishing}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ border: '1.5px solid #C7D2FE', color: '#4F46E5', background: 'white', cursor: prepublishing ? 'default' : 'pointer' }}
            onMouseEnter={(e) => {
              if (!prepublishing) e.currentTarget.style.background = '#EEF2FF'
            }}
            onMouseLeave={(e) => {
              if (!prepublishing) e.currentTarget.style.background = 'white'
            }}
          >
            {prepublishing ? (
              <Spinner size={12} />
            ) : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 1.5l1.4 3.6L13 6.5 9.4 7.9 8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5z" fill="currentColor" />
              </svg>
            )}
            {prepublishing ? 'Procesando…' : 'Prepublicar'}
          </button>
          {missingCount > 0 && <span className="text-xs text-muted">faltan {missingCount} campos</span>}
          <span
            className="ml-auto flex items-center justify-center rounded-full cursor-help transition-colors hover:border-indigo-300"
            style={{ width: 16, height: 16, border: '1px solid #CBD5E1', color: '#94A3B8', fontSize: '10px', fontWeight: 700 }}
            onMouseEnter={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setTip({ x: r.right, y: r.bottom + 8 })
            }}
            onMouseLeave={() => setTip(null)}
          >
            ?
          </span>
        </div>
      ) : null}

      {tip &&
        createPortal(
          <div
            className="fixed z-[70] w-60 rounded-lg p-2.5 text-xs leading-relaxed pointer-events-none"
            style={{ top: tip.y, left: tip.x, transform: 'translateX(-100%)', background: '#0F172A', color: '#E2E8F0', boxShadow: '0 8px 24px rgba(15,23,42,0.3)' }}
          >
            {explain}
          </div>,
          document.body,
        )}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-subtle">Título</label>
        <div className="relative">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
            className="w-full pl-3 pr-16 py-2 text-sm rounded-lg outline-none transition-all bg-white text-ink"
            style={inputStyle}
            onFocus={focusFx}
            onBlur={blurFx}
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
            <AIButton onClick={() => setAiField('title')} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-subtle">Descripción</label>
        <div className="relative">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() } }}
            rows={4}
            onFocus={focusFx}
            onBlur={blurFx}
            className="w-full px-3 pt-2 pb-9 text-sm rounded-lg outline-none transition-all resize-none leading-relaxed bg-white text-ink"
            style={{ ...inputStyle }}
          />
          <div className="absolute right-1.5 bottom-1.5">
            <AIButton onClick={() => setAiField('description')} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-subtle">Dimensiones</label>
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ['Alto', 'h', 'cm'],
              ['Ancho', 'w', 'cm'],
              ['Largo', 'd', 'cm'],
              ['Peso', 'weight', 'g'],
            ] as const
          ).map(([label, key, unit]) => (
            <div key={key}>
              <div className="relative">
                <input
                  value={dims[key]}
                  onChange={(e) => setDims((prev) => ({ ...prev, [key]: e.target.value }))}
                  onFocus={focusFx}
                  onBlur={blurFx}
                  inputMode="decimal"
                  className="w-full pl-3 pr-7 py-2 text-sm rounded-lg outline-none transition-all text-right tabular bg-white text-ink"
                  style={{ ...inputStyle }}
                />
                <span
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                  style={{ color: '#CBD5E1' }}
                >
                  {unit}
                </span>
              </div>
              <p className="text-xs mt-1 text-center text-muted">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div
          className="px-3 py-2.5 rounded-xl text-xs font-medium"
          style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}
        >
          {error}
        </div>
      )}

      {saved && (
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold animate-fade-in"
          style={{ background: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' }}
        >
          ✓ Cambios guardados
          {saving && <Spinner size={11} />}
        </div>
      )}

      {aiField && (
        <AIGenerateModal
          fieldLabel={aiField}
          current={aiField === 'title' ? title : description}
          onClose={() => setAiField(null)}
          onAccept={(v) => (aiField === 'title' ? setTitle(v) : setDescription(v))}
        />
      )}
    </div>
  )
}
