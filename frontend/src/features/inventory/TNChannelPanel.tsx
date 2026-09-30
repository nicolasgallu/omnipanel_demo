import { useCallback, useEffect, useRef, useState } from 'react'
import { channelsApi } from '../../lib/api/endpoints'
import type { Account, ChannelStatus, Product, ProductListing } from '../../lib/api/types'
import { ConfirmDialog, ErrorBox, Spinner, Toggle } from '../../components/ui'
import {
  ChannelTracker,
  FailedPanel,
  ConfigSummary,
  HeroChip,
  ICONS,
  IconTile,
  PublishSuccessCard,
  SectionLabel,
  ValueCard,
  type BubbleRect,
} from './shared'

const ACCENT = '#4F46E5'

// Labels en español; el backend los mapea a los enums de Tienda Nube
// (male/female/unisex y newborn/infant/kids/adult).
const GENDER_OPTIONS = ['—', 'Mujer', 'Hombre', 'Unisex']
const AGE_OPTIONS = ['—', 'Adultos', 'Niños', 'Bebés', 'Recién nacido']

// Panel-level state: every field is concrete (non-optional).
type TNCfgState = {
  gender: string
  age_group: string
  free_shipping: boolean
  mpn: string
  barcode: string
  tags: string
  promo_price: string
  video_url: string
  seo_title: string
  seo_description: string
}

const TN_CONFIG_DEFAULT: TNCfgState = {
  gender: '—',
  age_group: '—',
  free_shipping: false,
  mpn: '',
  barcode: '',
  tags: '',
  promo_price: '',
  video_url: '',
  seo_title: '',
  seo_description: '',
}

export function TNChannelPanel({
  product,
  listing,
  onReload,
  onChanged,
}: {
  product: Product
  listing: ProductListing | null
  onReload: () => void
  onChanged: () => void
}) {
  const [account, setAccount] = useState<Account | null | undefined>(undefined)
  const [status, setStatus] = useState<ChannelStatus>(listing?.status ?? 'unpublished')
  const [edited, setEdited] = useState(false)
  // Publicación ya existente (published/paused/pre-published): arrancamos en
  // la vista de publicado, no en el wizard.
  const settledInit =
    listing?.status === 'published' || listing?.status === 'paused' || listing?.status === 'prepublished'
  const [step, setStep] = useState(settledInit ? 2 : 1)
  const [showTracker, setShowTracker] = useState(!settledInit)
  const [prepublishedView, setPrepublishedView] = useState(listing?.status === 'prepublished')
  const [completing, setCompleting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Última falla reportada por la respuesta de publish/update: reason/remedy
  // frescos del backend, aun cuando el listing del drawer todavía no se haya
  // refrescado (tras "Reintentar" el listing puede traer el error viejo).
  const [lastFailure, setLastFailure] = useState<{ reason: string | null; remedy: string | null } | null>(null)

  const [tnCfg, setTnCfg] = useState<TNCfgState>(TN_CONFIG_DEFAULT)
  // Precio de la publicación (tiendanube.product_listings.price): editable en
  // el paso Configurar. Vacío = precio del inventario al guardar.
  const [priceValue, setPriceValue] = useState<string>(
    () => String(listing?.price ?? product.price))
  const setTn = <K extends keyof TNCfgState>(k: K, v: TNCfgState[K]) =>
    setTnCfg((c) => ({ ...c, [k]: v }))

  // Card de éxito al publicar (Figma PublishSuccessCard) sobre el panel.
  const rootRef = useRef<HTMLDivElement>(null)
  const [celebrate, setCelebrate] = useState(false)
  const [bubbleRect, setBubbleRect] = useState<BubbleRect | null>(null)
  const measureBox = () => {
    const box = rootRef.current?.closest('[data-panel-scroll]') as HTMLElement | null
    if (box) {
      const r = box.getBoundingClientRect()
      setBubbleRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
  }

  const verb = edited ? 'Actualizar' : 'Publicar'
  const verbDone = edited ? 'Actualizado' : 'Publicado'
  const steps = edited ? ['Publicado', 'Configurar', verb] : ['Configurar', verb]
  const configStep = edited ? 2 : 1
  const isActive = status !== 'published' && status !== 'paused' && status !== 'failed'

  // Load the business's TN account.
  useEffect(() => {
    let cancelled = false
    channelsApi
      .accounts()
      .then((res) => {
        if (cancelled) return
        setAccount(res.items.find((a) => a.platform === 'tiendanube') ?? null)
      })
      .catch(() => {
        if (!cancelled) setAccount(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Prefill the wizard from previously saved settings.
  useEffect(() => {
    if (account === undefined || account === null) return
    let cancelled = false
    channelsApi
      .tnSettings(product.id, account.id)
      .then((res) => {
        if (cancelled) return
        const get = (key: string) => {
          const entry = res.settings[key]
          const value = entry?.USER_INPUT_VALUE ?? entry?.DEFAULT_VALUE
          return value === null || value === undefined ? null : value
        }
        setTnCfg({
          gender: get('GENDER') ? String(get('GENDER')) : '—',
          age_group: get('AGE_GROUP') ? String(get('AGE_GROUP')) : '—',
          free_shipping: get('FREE_SHIPPING') === true || get('FREE_SHIPPING') === 'Si',
          mpn: get('MPN') ? String(get('MPN')) : '',
          barcode: get('BARCODE') ? String(get('BARCODE')) : '',
          tags: get('TAGS') ? String(get('TAGS')) : '',
          promo_price: get('PROMOTIONAL_PRICE') ? String(get('PROMOTIONAL_PRICE')) : '',
          video_url: get('VIDEO_URL') ? String(get('VIDEO_URL')) : '',
          seo_title: get('SEO_TITLE') ? String(get('SEO_TITLE')) : '',
          seo_description: get('SEO_DESCRIPTION') ? String(get('SEO_DESCRIPTION')) : '',
        })
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [product.id, account])

  const submit = useCallback(async () => {
    if (loading || account === null || account === undefined) return
    setLoading(true)
    setError(null)
    try {
      // Precio local del listing primero (sin push a Tienda Nube).
      const parsedPrice = Number(priceValue)
      if (Number.isFinite(parsedPrice) && parsedPrice >= 0) {
        await channelsApi.tnPrice(product.id, account.id, parsedPrice || product.price)
      }
      const result = edited
        ? await channelsApi.tnAction('update', product.id, account.id, tnCfg)
        : await channelsApi.tnPublish(product.id, account.id, tnCfg)
      if (result.status === 'published' || result.status === 'prepublished') {
        // Beat verde del tracker, luego la card de confirmación (Figma).
        setCompleting(true)
        setLastFailure(null)
        setTimeout(() => {
          measureBox()
          setCelebrate(true)
        }, 350)
        setTimeout(() => {
          if (result.status === 'prepublished') setPrepublishedView(true)
          setStatus(result.status)
          // Mismo fix que ML: cerrar el wizard tras el update exitoso para
          // que no quede el panel de configuración bajo la vista de estado.
          setStep(steps.length)
          setShowTracker(false)
          setCompleting(false)
          onChanged()
        }, 900)
        setTimeout(() => {
          setCelebrate(false)
          setBubbleRect(null)
        }, 1950)
      } else {
        setStatus(result.status)
        if (result.status === 'failed') {
          // Guardar reason/remedy frescos de la respuesta: el listing del
          // drawer puede tardar en refrescar y mostrar el error anterior.
          setLastFailure({ reason: result.reason, remedy: result.remedy })
          setStep(steps.length)
          setShowTracker(true)
        } else {
          setLastFailure(null)
        }
        onChanged()
      }
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar')
    } finally {
      setLoading(false)
    }
  }, [loading, account, tnCfg, edited, product.id, onChanged, onReload])

  const editConfig = useCallback(() => {
    setEdited(true)
    setPrepublishedView(false)
    setStatus('prepublished')
    // En el flujo editado los pasos son ['Publicado', 'Configurar', verb]:
    // "Configurar" SIEMPRE es el paso 2 (no usar configStep, que depende del
    // estado `edited` y quedaba capturado viejo en este callback).
    setStep(2)
    setShowTracker(true)
  }, [])

  const ctaLabel = loading ? 'Procesando…' : `${verb} en Tienda Nube`
  const btnLabel = loading ? '…' : verb

  if (account === undefined) {
    return (
      <div className="py-8 flex justify-center">
        <Spinner />
      </div>
    )
  }
  if (account === null) {
    return (
      <div className="max-w-sm">
        <ErrorBox message="No hay una cuenta de Tienda Nube conectada. Conectala desde Configuración." />
      </div>
    )
  }

  const summaryRows = [
    { label: 'MPN', value: tnCfg.mpn || '—' },
    { label: 'Código de barras', value: tnCfg.barcode || '—' },
    { label: 'Tags', value: tnCfg.tags || '—' },
    { label: 'Género', value: tnCfg.gender || '—' },
    { label: 'Grupo etario', value: tnCfg.age_group || '—' },
    { label: 'Envío gratis', value: tnCfg.free_shipping ? 'Sí' : 'No' },
    { label: 'Precio promocional', value: tnCfg.promo_price || '—' },
    { label: 'URL de video', value: tnCfg.video_url || '—' },
    { label: 'Título SEO', value: tnCfg.seo_title || '—' },
  ]

  const handleUpdate = async () => {
    setEdited(true)
    await updateAction(product, account.id, setStatus, onChanged, onReload)
  }
  const handleDelete = async () => {
    await deleteAction(
      product,
      account.id,
      setStatus,
      setEdited,
      setShowTracker,
      setStep,
      onChanged,
      onReload,
    )
    setPrepublishedView(false)
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-5 relative">
      {celebrate && bubbleRect && <PublishSuccessCard verbDone={verbDone} label="Tienda Nube" rect={bubbleRect} />}

      <ChannelTracker
        steps={steps}
        step={step}
        completing={completing}
        loading={loading}
        show={showTracker && (isActive || status === 'failed')}
        failedAt={status === 'failed' ? steps.length - 1 : -1}
        verbDone={verbDone}
        ctaLabel={ctaLabel}
        btnLabel={btnLabel}
        onCta={submit}
        accent={ACCENT}
      />

      {error && (
        <div className="max-w-sm">
          <ErrorBox message={error} onRetry={() => setError(null)} />
        </div>
      )}

      {isActive && step === configStep && (
        <TNConfigStep cfg={tnCfg} set={setTn} priceValue={priceValue} onPriceChange={setPriceValue} />
      )}

      {(status === 'published' || (status === 'prepublished' && prepublishedView)) && (
        <TNPublished
          listing={listing}
          verbDone={verbDone}
          summaryRows={summaryRows}
          prepublished={status === 'prepublished'}
          onEdit={editConfig}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}

      {status === 'failed' && (
        <FailedPanel
          verb={edited ? 'actualizar' : 'publicar'}
          label="Tienda Nube"
          reason={
            lastFailure?.reason ??
            listing?.reason ??
            'La publicación falló. Revisá la configuración e intentá de nuevo.'
          }
          remedy={lastFailure ? lastFailure.remedy : listing?.remedy}
          retrying={loading}
          onRetry={submit}
          onEdit={editConfig}
        />
      )}
    </div>
  )
}

// ─── Acciones compartidas ────────────────────────────────────────────────────

async function updateAction(
  product: Product,
  accountId: number,
  setStatus: (s: ChannelStatus) => void,
  onChanged: () => void,
  onReload: () => void,
) {
  const result = await channelsApi.tnAction('update', product.id, accountId)
  setStatus(result.status)
  onChanged()
  onReload()
}

async function deleteAction(
  product: Product,
  accountId: number,
  setStatus: (s: ChannelStatus) => void,
  setEdited: (v: boolean) => void,
  setShowTracker: (v: boolean) => void,
  setStep: (s: number) => void,
  onChanged: () => void,
  onReload: () => void,
) {
  await channelsApi.tnAction('delete', product.id, accountId)
  setStatus('unpublished')
  setEdited(false)
  setShowTracker(true)
  setStep(1)
  onChanged()
  onReload()
}

// ─── Config step (Figma: Identificación / Audiencia / Comercial / SEO) ───────

function TextCard({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  placeholder?: string
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'textarea'
}) {
  const focus = (e: React.FocusEvent<HTMLElement>) => {
    const p = e.target.closest('[data-card]') as HTMLElement | null
    if (p) {
      p.style.borderColor = '#818CF8'
      p.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.08)'
    }
  }
  const blur = (e: React.FocusEvent<HTMLElement>) => {
    const p = e.target.closest('[data-card]') as HTMLElement | null
    if (p) {
      p.style.borderColor = '#E2E8F0'
      p.style.boxShadow = 'none'
    }
  }

  if (type === 'textarea') {
    return (
      <div data-card className="px-3 py-2.5 rounded-xl transition-all" style={{ background: 'white', border: '1px solid #E2E8F0' }}>
        <p style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '6px' }}>{label}</p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          placeholder={placeholder ?? '—'}
          onFocus={focus}
          onBlur={blur}
          className="w-full text-xs outline-none bg-transparent resize-none leading-relaxed text-ink placeholder:text-faint"
        />
      </div>
    )
  }

  return (
    <div data-card className="flex items-center justify-between px-3 py-2.5 rounded-xl transition-all" style={{ background: 'white', border: '1px solid #E2E8F0' }}>
      <span style={{ fontSize: '10px', color: '#94A3B8', flexShrink: 0, marginRight: '8px' }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '—'}
        onFocus={focus}
        onBlur={blur}
        className="text-xs font-medium text-right outline-none bg-transparent flex-1 min-w-0 text-ink placeholder:text-faint"
      />
    </div>
  )
}

export function TNConfigStep({
  cfg,
  set,
  priceValue,
  onPriceChange,
}: {
  cfg: TNCfgState
  set: <K extends keyof TNCfgState>(k: K, v: TNCfgState[K]) => void
  priceValue?: string
  onPriceChange?: (v: string) => void
}) {
  const {
    gender,
    age_group,
    free_shipping,
    mpn,
    barcode,
    tags,
    promo_price,
    video_url,
    seo_title,
    seo_description,
  } = cfg

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      {priceValue !== undefined && onPriceChange && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Precio</SectionLabel>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: 'white', border: '1px solid #E2E8F0' }}>
            <span className="text-xs text-faint">Precio de la publicación</span>
            <div className="flex items-center gap-0.5">
              <span className="text-xs font-semibold text-faint">$</span>
              <input
                value={priceValue}
                onChange={(e) => onPriceChange(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                className="text-xs font-semibold text-right outline-none bg-transparent tabular-nums text-ink"
                style={{ width: '90px' }}
              />
            </div>
          </div>
          <span className="text-xs text-faint">Si lo dejás vacío se usa el precio del inventario.</span>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <SectionLabel>Identificación</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <TextCard label="MPN" value={mpn} onChange={(v) => set('mpn', v)} />
          <TextCard label="Código de barras" value={barcode} onChange={(v) => set('barcode', v)} />
        </div>
        <TextCard label="Tags" placeholder="verano, promo, regalo…" value={tags} onChange={(v) => set('tags', v)} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Audiencia</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <ValueCard label="Género" value={gender} options={GENDER_OPTIONS} onChange={(v) => set('gender', v)} />
          <ValueCard label="Grupo etario" value={age_group} options={AGE_OPTIONS} onChange={(v) => set('age_group', v)} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Comercial</SectionLabel>
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: 'white', border: '1px solid #E2E8F0' }}>
          <span style={{ fontSize: '10px', color: '#94A3B8' }}>Envío gratis</span>
          <Toggle value={free_shipping} onChange={(v) => set('free_shipping', v)} />
        </div>
        <TextCard label="Precio promocional" value={promo_price} onChange={(v) => set('promo_price', v)} />
        <TextCard label="URL de video" placeholder="youtube.com/…" value={video_url} onChange={(v) => set('video_url', v)} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>SEO</SectionLabel>
        <TextCard label="Título SEO" value={seo_title} onChange={(v) => set('seo_title', v)} />
        <TextCard label="Descripción SEO" type="textarea" value={seo_description} onChange={(v) => set('seo_description', v)} />
      </div>
    </div>
  )
}

// ─── Published state: hero + toolbar + summary ───────────────────────────────

function TNPublished({
  listing,
  verbDone,
  summaryRows,
  prepublished = false,
  onEdit,
  onUpdate,
  onDelete,
}: {
  listing: ProductListing | null
  verbDone: string
  summaryRows: { label: string; value: string }[]
  prepublished?: boolean
  onEdit: () => void
  onUpdate: () => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: 'update' | 'delete') => {
    setBusy(action)
    setError(null)
    try {
      if (action === 'update') await onUpdate()
      else await onDelete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción')
    } finally {
      setBusy(null)
    }
  }

  const actions = [
    { key: 'update', label: 'Actualizar', icon: ICONS.refresh, color: '#0A1628', tint: '#F1F5F9', border: '#E2E8F0', onClick: () => run('update') },
    { key: 'delete', label: 'Eliminar', icon: ICONS.trash, color: '#EF4444', tint: '#FEF2F2', border: '#FECACA', onClick: () => setConfirmDelete(true) },
  ]

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
        <div
          className="flex items-center gap-3 px-4 py-4"
          style={{
            background: prepublished ? '#FEF3C7' : '#F0FDF4',
            borderBottom: `1px solid ${prepublished ? '#FDE68A' : '#DCFCE7'}`,
          }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold" style={{ color: '#0A1628' }}>
                {prepublished ? 'Pre-publicado en Tienda Nube' : `${verbDone} en Tienda Nube`}
              </p>
              <HeroChip paused={false} prepublished={prepublished} />
            </div>
            {listing?.permalink && (
              <a
                href={listing.permalink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 mt-1.5 transition-opacity hover:opacity-70"
                style={{ fontSize: '11px', fontWeight: 600, color: '#4F46E5' }}
              >
                Ver publicación
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M4 2h6v6M10 2L3 9" stroke="#4F46E5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2">
          {actions.map((a, i) => (
            <button
              key={a.key}
              onClick={a.onClick}
              disabled={busy === a.key}
              className="flex flex-col items-center gap-1.5 py-3 transition-colors hover:bg-slate-50 disabled:opacity-60"
              style={{ borderLeft: i > 0 ? '1px solid #F1F5F9' : 'none' }}
            >
              <IconTile icon={a.icon} color={a.color} tint={a.tint} border={a.border} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: a.color }}>
                {busy === a.key ? 'Procesando…' : a.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      <ConfigSummary rows={summaryRows} onEdit={onEdit} />

      {confirmDelete && (
        <ConfirmDialog
          title="¿Dar de baja la publicación?"
          body="La publicación se eliminará en Tienda Nube. Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          busy={busy === 'delete'}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            run('delete')
          }}
        />
      )}
    </div>
  )
}
