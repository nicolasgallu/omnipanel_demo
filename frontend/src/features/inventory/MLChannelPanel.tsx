import { useCallback, useEffect, useRef, useState } from 'react'
import { catalogApi, channelsApi } from '../../lib/api/endpoints'
import type {
  Account,
  CatalogProduct,
  ChannelStatus,
  MLCategory,
  MLConfig,
  MLListingType,
  MLPerformance,
  MLSettings,
  MLSettingsItem,
  Product,
  ProductListing,
  SizeGridMeasure,
} from '../../lib/api/types'
import { ConfirmDialog, ErrorBox, Spinner, Toggle } from '../../components/ui'
import {
  ChannelTracker,
  FailedPanel,
  SellingCosts,
  Chevron,
  ConfigSummary,
  HeroChip,
  ICONS,
  IconTile,
  ListingTypePicker,
  PublishSuccessCard,
  SectionLabel,
  ValueCard,
  type BubbleRect,
} from './shared'
import { PerformanceLoading, PerfBuckets, ScoreRing, perfStats } from './MLPerformance'
import { BLOCKED_ELIGIBILITY, CatalogMatcher, MLCatalogCard, MLCatalogConfigStep, MLPubTypeStep } from './MLCatalog'
import type { MLSellingCosts } from '../../lib/api/types'

const ACCENT = '#4F46E5'

// Panel-level state: los valores de TODOS los atributos del wizard (dinámicos,
// leídos de mercadolibre.attributes.settings — cada categoría trae los suyos)
// más el tipo de publicación. El id de cada item es la clave.
type MLCfgState = {
  values: Record<string, string>
  listing_type: string
}

const ML_CONFIG_DEFAULT: MLCfgState = { values: {}, listing_type: 'gold_special' }

const SECTIONS = ['attributes', 'shipping', 'sale_terms', 'listing'] as const
type SectionKey = (typeof SECTIONS)[number]

const SECTION_LABELS: Record<SectionKey, string> = {
  attributes: 'Atributos',
  shipping: 'Envío',
  sale_terms: 'Condiciones de venta',
  listing: 'Publicación',
}

// ─── Envío ML: traducciones de los códigos que manda Meli ───────────────────
// Meli manda los valores en inglés (códigos). Acá se muestran en español, pero
// el valor guardado/enviado SIEMPRE es el código original (sin tocar backend).
const SHIPPING_ITEM_LABEL: Record<string, string> = {
  MODE: 'Método de envío',
  LOGISTIC_TYPE: 'Tipo de logística',
  LOCAL_PICK_UP: 'Buscar en local',
  FREE_SHIPPING: 'Envío gratis',
}

const SHIPPING_MODE_LABEL: Record<string, string> = {
  me2: 'Mercado Envíos',
  me1: 'Mercado Envíos',
  custom: 'Envío a convenir',
  not_specified: 'Sin especificar',
}

const LOGISTIC_TYPE_LABEL: Record<string, string> = {
  fulfillment: 'Full',
  cross_docking: 'Cross docking',
  self_service: 'Flex',
  drop_off: 'Punto de despacho',
  custom: 'A convenir',
}

// MODE trae me1 y me2 (ambos "Mercado Envíos"): se unifican en me2 (el
// vigente) para que el dropdown muestre una sola opción.
function dedupeModes(codes: string[]): string[] {
  const out: string[] = []
  for (const c of codes) {
    const canonical = c === 'me1' ? 'me2' : c
    if (!out.includes(canonical)) out.push(canonical)
  }
  return out
}

// Valor legible para el resumen de la vista "Publicado": "Sí"/"No" para los
// booleanos y etiqueta en español para los códigos; el resto pasa tal cual.
function shippingSummaryValue(id: string, raw: unknown): string {
  const v = raw === undefined || raw === null || String(raw).trim() === '' ? '' : String(raw)
  if (!v) return '—'
  if (id === 'FREE_SHIPPING' || id === 'LOCAL_PICK_UP') {
    return BOOLEAN_TRUE.has(v) ? 'Sí' : 'No'
  }
  if (id === 'MODE') return SHIPPING_MODE_LABEL[v] ?? v
  if (id === 'LOGISTIC_TYPE') return LOGISTIC_TYPE_LABEL[v] ?? v
  return v
}

function sectionItems(settings: MLSettings | null, section: SectionKey): MLSettingsItem[] {
  if (!settings || !Array.isArray(settings.settings)) return []
  const out: MLSettingsItem[] = []
  for (const group of settings.settings) {
    const items = group[section]
    if (Array.isArray(items)) out.push(...items)
  }
  return out
}

// Opciones de un item (value_examples/values pueden venir planos, anidados
// como [["a","b"]] o con objetos [{name}]).
function optionsOf(item: MLSettingsItem): string[] {
  const raw = item.value_examples ?? item.values
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const push = (v: unknown) => {
    if (v === null || v === undefined) return
    if (typeof v === 'string' || typeof v === 'number') {
      out.push(String(v))
    } else if (typeof v === 'object') {
      const n = (v as { name?: unknown }).name
      if (typeof n === 'string' || typeof n === 'number') out.push(String(n))
    }
  }
  for (const v of raw) {
    if (Array.isArray(v)) v.forEach(push)
    else push(v)
  }
  return out
}

function listingTypesFromSettings(settings: MLSettings | null): MLListingType[] {
  if (!settings || !Array.isArray(settings.settings)) return []
  for (const group of settings.settings) {
    const items = group.listing
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (item.id !== 'LISTING_TYPE') continue
      const raw = item.value_examples ?? item.values
      if (!Array.isArray(raw)) return []
      const flat: unknown[] = []
      for (const v of raw) {
        if (Array.isArray(v)) flat.push(...v)
        else flat.push(v)
      }
      const round1 = (n: number) => Math.round(n * 10) / 10
      const round2 = (n: number) => Math.round(n * 100) / 100
      const num = (v: unknown) => {
        const n = Number(v)
        return Number.isFinite(n) ? n : 0
      }
      const out: MLListingType[] = []
      for (const v of flat) {
        if (!v || typeof v !== 'object') continue
        const o = v as Record<string, unknown>
        if (!o.id || !o.name) continue
        const sale = (o.sale_fee_details ?? {}) as Record<string, unknown>
        const listing = (o.listing_fee_details ?? {}) as Record<string, unknown>
        const pct = round1(num(sale.percentage_fee))
        const meli = round1(num(sale.meli_percentage_fee) || pct)
        const fin = round1(num(sale.financing_add_on_fee))
        const fixed = round2(num(sale.fixed_fee) + num(listing.fixed_fee))
        out.push({
          id: String(o.id),
          name: String(o.name),
          sale_fee: num(o.sale_fee_amount),
          pct,
          meli_pct: meli,
          financing: fin,
          fixed,
        })
      }
      return out
    }
  }
  return []
}

function mlCfgFromSettings(settings: MLSettings | null): MLCfgState {
  const values: Record<string, string> = {}
  for (const section of SECTIONS) {
    for (const item of sectionItems(settings, section)) {
      if (item.user_input_value !== undefined && item.user_input_value !== null) {
        values[item.id] = String(item.user_input_value)
      }
    }
  }
  return {
    values,
    listing_type: values['LISTING_TYPE'] || ML_CONFIG_DEFAULT.listing_type,
  }
}

export function MLChannelPanel({
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
  // la vista de publicado, no en el wizard. `prepublishedView` distingue el
  // estado "en proceso" del wizard de edición (que también usa prepublished).
  const settledInit =
    listing?.status === 'published' || listing?.status === 'paused' || listing?.status === 'prepublished' || listing?.status === 'under_review'
  // Paso final del flujo de publicación (Categoría → Tipo → Configurar → Publicar).
  const [step, setStep] = useState(settledInit ? 4 : 1)
  const [showTracker, setShowTracker] = useState(!settledInit)
  const [prepublishedView, setPrepublishedView] = useState(listing?.status === 'prepublished')
  const [settings, setSettings] = useState<MLSettings | null>(null)
  // Guía de talles: la categoría la exige (SIZE_GRID_ID en sus settings) y el
  // publish la resuelve automáticamente; el wizard muestra el talle + estas
  // medidas numéricas (las manda en config.attributes como cualquier atributo).
  const [sizeGridRequired, setSizeGridRequired] = useState(false)
  // null = requisitos todavía no cargados; [] = sin medidas que completar.
  const [sizeGridMeasures, setSizeGridMeasures] = useState<SizeGridMeasure[] | null>(null)
  // Categoría que ya tenía guardada el producto (solo fallback: no se usa para
  // auto-seleccionar ni auto-avanzar — la elige siempre el usuario).
  const [savedCategoryId, setSavedCategoryId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Aviso informativo (no error): ej. Meli está revisando la publicación y el
  // cambio de estado (pause/update) se aplicará cuando termine la revisión.
  const [notice, setNotice] = useState<string | null>(null)
  // Última falla reportada por la respuesta de publish/update: reason/remedy
  // frescos del backend, aun cuando el listing del drawer todavía no se haya
  // refrescado (tras "Reintentar" el listing puede traer el error viejo).
  const [lastFailure, setLastFailure] = useState<{ reason: string | null; remedy: string | null } | null>(null)
  // null = cargando · [] = sin resultados · error = falló el fetch
  const [listingTypes, setListingTypes] = useState<MLListingType[] | null>(null)
  const [listingTypesError, setListingTypesError] = useState<string | null>(null)
  const [listingTypesKey, setListingTypesKey] = useState(0)
  const [sellingCosts, setSellingCosts] = useState<MLSellingCosts | null | undefined>(undefined)

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

  const [mlCfg, setMlCfg] = useState<MLCfgState>(ML_CONFIG_DEFAULT)
  const setMl = <K extends keyof MLCfgState>(k: K, v: MLCfgState[K]) =>
    setMlCfg((c) => ({ ...c, [k]: v }))
  const setMlValue = (id: string, v: string) =>
    setMlCfg((c) => ({ ...c, values: { ...c.values, [id]: v } }))

  // Catálogo: modalidad elegida en el wizard + ficha estándar asociada.
  const [pubMode, setPubMode] = useState<'traditional' | 'catalog'>(
    listing?.catalog_listing ? 'catalog' : 'traditional')
  const [catalogMatch, setCatalogMatch] = useState<CatalogProduct | null>(null)
  // Categoría bajo la cual se eligió la ficha (para NO descartarla al
  // reconfirmar la misma categoría — antes se borraba siempre).
  const catalogMatchCategoryRef = useRef<string | null>(null)
  const chooseCatalogMatch = useCallback(
    (c: CatalogProduct | null) => {
      setCatalogMatch(c)
      catalogMatchCategoryRef.current = c ? categoryId : null
    },
    [categoryId],
  )
  // Catálogo obligatorio para la categoría/GTIN actual: la opción tradicional
  // queda bloqueada en el paso Tipo. Se setea en el pre-flight de
  // confirmCategory (búsqueda exacta por GTIN) y, reactivamente, cuando el
  // matcher devuelve solo fichas catalog_required.
  const [catalogMandatory, setCatalogMandatory] = useState(false)

  // Precio de la publicación (product_listings.price): editable en el paso
  // Configurar. Vacío = se usa el precio del inventario al guardar.
  const [priceValue, setPriceValue] = useState<string>(
    () => String(listing?.price ?? product.price))

  // La publicación existe en Meli (meli_id). Un listing "Failed to Publish."
  // NUNCA llegó a crearse: "editar" sobre él es en realidad PUBLICAR de nuevo,
  // no actualizar (update sobre un item inexistente no hace nada).
  const hasMeliItem = Boolean(listing?.external_id)
  const verb = edited && hasMeliItem ? 'Actualizar' : 'Publicar'
  const verbDone = edited && hasMeliItem ? 'Actualizado' : 'Publicado'
  // En el flujo de edición, si el intento previo falló, el primer nodo NO es
  // "Publicado" verde: muestra la publicación como fallida.
  const publishStepLabel = edited && listing?.status === 'failed' ? 'Publicación fallida' : 'Publicado'
  const steps = edited
    ? [publishStepLabel, 'Configurar', verb]
    : ['Categoría', 'Tipo', 'Configurar', verb]
  const configStep = steps.indexOf('Configurar') + 1
  const typeStep = !edited ? 2 : 0
  const isActive =
    status !== 'published' && status !== 'paused' && status !== 'failed' && status !== 'under_review'

  // Load the business's ML account.
  useEffect(() => {
    let cancelled = false
    channelsApi
      .accounts()
      .then((res) => {
        if (cancelled) return
        setAccount(res.items.find((a) => a.platform === 'mercadolibre') ?? null)
      })
      .catch(() => {
        if (!cancelled) setAccount(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Prefill from any existing wizard state (category + settings).
  useEffect(() => {
    if (account === undefined || account === null) return
    let cancelled = false
    channelsApi
      .mlSettings(product.id, account.id)
      .then((res) => {
        if (cancelled) return
        setSettings(res)
        setSavedCategoryId(res.category_id)
        setMlCfg(mlCfgFromSettings(res))
        setSizeGridRequired(Boolean(res.size_grid_required))
        // No forzamos setStep(1) acá: para productos ya publicados /
        // pre-publicados hay que mantener la vista de publicado; el paso
        // inicial ya se calculó al montar el panel.
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [product.id, account])

  // Guía de talles: cuando la categoría la exige y el género ya está elegido,
  // cargamos las medidas requeridas del dominio (technical_specs de Meli).
  const effectiveCategory = categoryId ?? savedCategoryId
  useEffect(() => {
    if (!sizeGridRequired || !effectiveCategory || account === null || account === undefined) return
    const gender = (mlCfg.values.GENDER ?? '').trim()
    if (!gender) {
      setSizeGridMeasures([])
      return
    }
    let cancelled = false
    setSizeGridMeasures(null)
    channelsApi
      .mlSizeGridMeasures(product.id, account.id, gender)
      .then((res) => {
        if (!cancelled) setSizeGridMeasures(res.measures ?? [])
      })
      .catch(() => {
        if (!cancelled) setSizeGridMeasures([])
      })
    return () => {
      cancelled = true
    }
  }, [sizeGridRequired, effectiveCategory, account, product.id, mlCfg.values.GENDER])
  useEffect(() => {
    if (!effectiveCategory || account === null || account === undefined) return
    let cancelled = false
    setListingTypes(null)
    setListingTypesError(null)
    channelsApi
      .mlListingPrices(product.price, effectiveCategory, account.id)
      .then((res) => {
        if (!cancelled) setListingTypes(res.items ?? [])
      })
      .catch((err: Error) => {
        if (!cancelled) {
          // Fallback: si la API falla, usamos las campañas que ya están
          // guardadas en los settings (value_examples del LISTING_TYPE).
          const fromSettings = listingTypesFromSettings(settings)
          if (fromSettings.length > 0) {
            setListingTypes(fromSettings)
            setListingTypesError(null)
          } else {
            setListingTypes([])
            setListingTypesError(err.message)
          }
        }
      })
    return () => {
      cancelled = true
    }
  }, [product.price, effectiveCategory, account, listingTypesKey, settings])

  const confirmCategory = useCallback(async () => {
    if (!categoryId || loading || account === null || account === undefined) return
    setLoading(true)
    setError(null)
    try {
      const res = await channelsApi.mlConfigure(product.id, account.id, categoryId)
      setSettings(res)
      // El configure devuelve los settings con los defaults de Meli ya
      // cargados en user_input_value: re-seedear el estado del wizard para
      // que esos valores aparezcan seleccionados en los campos.
      setMlCfg(mlCfgFromSettings(res))
      // La categoría recién confirmada puede exigir (o no) guía de talles.
      // El prefill solo corre al montar el panel (con la categoría anterior),
      // así que el flag se recalcula acá para que la sección "Guía de talles"
      // aparezca/desaparezca al confirmar la categoría.
      setSizeGridRequired(
        sectionItems(res, 'attributes').some((i) => i.id === 'SIZE_GRID_ID'),
      )

      // La ficha elegida era de la categoría anterior: se descarta SOLO si la
      // categoría cambió de verdad. Reconfirmar la misma categoría mantiene
      // la ficha (antes se borraba siempre y Publicar fallaba con "Elegí una
      // ficha..." aunque ya la hubieras elegido).
      if (categoryId !== catalogMatchCategoryRef.current) {
        setCatalogMatch(null)
        catalogMatchCategoryRef.current = null
      }
      // Pre-flight catálogo obligatorio: búsqueda EXACTA por GTIN (sin
      // ambigüedad de nombres). Si todas las fichas son catalog_required,
      // el paso Tipo arranca con tradicional bloqueada y catálogo
      // preseleccionado, sin esperar a que el usuario pruebe suerte.
      let mandatory = false
      if (product.gtin) {
        try {
          const cat = await catalogApi.search(account.id, {
            product_identifier: product.gtin,
          })
          const items = cat.items ?? []
          mandatory =
            items.length > 0 &&
            items.every((c) => c.listing_strategy === 'catalog_required')
        } catch {
          // Best-effort: sin señal, se mantiene el flujo actual.
          mandatory = false
        }
      }
      setCatalogMandatory(mandatory)
      if (mandatory) setPubMode('catalog')
      setStep(typeStep)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo configurar la categoría')
    } finally {
      setLoading(false)
    }
  }, [categoryId, loading, account, product.id, product.gtin, typeStep])

  const submit = useCallback(async () => {
    if (loading || account === null || account === undefined) return
    // Guard explícito en TODOS los pasos: modo catálogo sin ficha elegida
    // (y sin item ya vinculado) no puede publicar — evita el downgrade
    // silencioso a tradicional que ocurría cuando el estado se perdía.
    if (pubMode === 'catalog' && !catalogMatch && !(edited && listing?.catalog_listing)) {
      setError('Elegí una ficha de catálogo para publicar en modo catálogo.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      // Precio local del listing primero (sin push a Meli): la acción
      // publicar/actualizar usa el valor que quedó guardado en la fila.
      const parsedPrice = Number(priceValue)
      if (Number.isFinite(parsedPrice) && parsedPrice >= 0) {
        await channelsApi.mlPrice(product.id, account.id, parsedPrice || product.price)
      }

      // Modo catálogo activo (recalculado acá: evita depender de un const
      // declarado más abajo en el componente).
      const catalogActive =
        pubMode === 'catalog' && (catalogMatch !== null || (edited && Boolean(listing?.catalog_listing)))

      // Catálogo: sin attributes (la ficha es de Meli) y, al publicar, con el
      // catalog_product_id elegido en el matching. Al editar un item ya
      // vinculado, el backend hace el update mínimo (precio/stock).
      const config: MLConfig = catalogActive
        ? {
            category_id: (categoryId ?? savedCategoryId) ?? undefined,
            listing_type: mlCfg.listing_type,
            catalog_product_id: catalogMatch ? catalogMatch.id : undefined,
            // Los atributos catalog_required (ej. "Tipo de mochila") se mandan
            // también en catálogo: Meli los exige igual.
            attributes: mlCfg.values,
          }
        : {
            category_id: (categoryId ?? savedCategoryId) ?? undefined,
            listing_type: mlCfg.listing_type,
            attributes: mlCfg.values,
          }
      const result = edited && hasMeliItem
        ? await channelsApi.mlAction('update', product.id, account.id, config)
        : await channelsApi.mlPublish(product.id, account.id, config)
      // Breadcrumb de debug: qué modo y ficha se mandaron (visible en la
      // consola del navegador; el backend también loguea su propio payload).
      console.debug('[omnipanel] mlPublish', {
        productId: product.id,
        mode: catalogActive ? 'catalog' : 'traditional',
        catalogProductId: catalogMatch?.id ?? null,
        edited,
        config,
      })
      // 'prepublished' también es éxito: el item existe y Meli lo está
      // activando. Mostramos la vista de publicado con nota de proceso.
      // 'paused' con item creado también es éxito de la publicación: Meli
      // suele arrancar los items nuevos pausados (procesando fotos) y el
      // usuario debe ver igual la confirmación de éxito.
      const isSuccess =
        result.status === 'published' ||
        result.status === 'prepublished' ||
        result.status === 'under_review' ||
        (result.status === 'paused' && Boolean(result.external_id))
      if (isSuccess) {
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
          // Tras "Actualizar en MercadoLibre" exitoso, cerrar el wizard:
          // step quedó en 2 (Configurar) y, si el resultado es
          // 'prepublished', el panel de atributos se seguiría renderizando
          // debajo del hero de estado. Volver al paso final (vista de estado).
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
  }, [loading, account, mlCfg, categoryId, savedCategoryId, edited, hasMeliItem,
      pubMode, catalogMatch, priceValue, listing, steps.length,
      product.id, product.price, onChanged, onReload])

  // Costos de venta: snapshot real de mercadolibre.selling_costs.
  useEffect(() => {
    if (status !== 'published' && status !== 'paused' && status !== 'prepublished' && status !== 'under_review') return
    let cancelled = false
    channelsApi
      .mlSellingCosts(product.id, account?.id as number)
      .then((res) => {
        if (!cancelled) setSellingCosts(res.costs)
      })
      .catch(() => {
        if (!cancelled) setSellingCosts(null)
      })
    return () => {
      cancelled = true
    }
  }, [status, product.id, account])

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

  // En el paso "Tipo", catálogo requiere una ficha elegida antes de continuar.
  const typeBlocked = !edited && step === typeStep && pubMode === 'catalog' && !catalogMatch
  // Modo catálogo activo: ficha elegida en el wizard (publicar) o item ya
  // vinculado (editar). En ambos casos la config es la simplificada.
  const catalogActive =
    pubMode === 'catalog' && (catalogMatch !== null || (edited && Boolean(listing?.catalog_listing)))

  const ctaLabel = loading
    ? 'Procesando…'
    : !edited && step === 1
      ? 'Confirmar categoría'
      : !edited && step === typeStep
        ? 'Continuar'
        : `${verb} en MercadoLibre`
  const btnLabel = loading
    ? '…'
    : !edited && step === 1
      ? 'Confirmar'
      : !edited && step === typeStep
        ? 'Continuar'
        : verb
  const onCta =
    !edited && step === 1
      ? confirmCategory
      : !edited && step === typeStep
        ? () => setStep(configStep)
        : submit

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
        <ErrorBox message="No hay una cuenta de MercadoLibre conectada. Conectala desde Configuración." />
      </div>
    )
  }

  const listingName =
    (listingTypes ?? []).find((l) => l.id === mlCfg.listing_type)?.name ?? mlCfg.listing_type

  // Resumen dinámico: todos los atributos que trajo la categoría desde Meli.
  const summaryRows = [
    { label: 'Tipo de publicación', value: listingName || '—' },
    ...(['attributes', 'shipping', 'sale_terms'] as const).flatMap((section) =>
      sectionItems(settings, section)
        .filter((i) => i.id !== 'LISTING_TYPE')
        .map((i) => ({
          label: SHIPPING_ITEM_LABEL[i.id] ?? (i.name || i.id),
          value: shippingSummaryValue(i.id, mlCfg.values[i.id]),
        })),
    ),
  ]

  const handlePause = async () => {
    await pauseAction(product, account.id, setStatus, setNotice, onChanged, onReload)
  }
  const handleUpdate = async () => {
    setEdited(true)
    await updateAction(product, account.id, setStatus, setNotice, onChanged, onReload)
  }
  const handleReactivate = async () => {
    await updateAction(product, account.id, setStatus, setNotice, onChanged, onReload)
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
    // Reset completo del wizard: la ficha y el modo de la publicación vieja
    // no deben sobrevivir al borrado (causaban publicaciones fantasma).
    setPubMode('traditional')
    setCatalogMatch(null)
    catalogMatchCategoryRef.current = null
    setPrepublishedView(false)
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-5 relative">
      {celebrate && bubbleRect && <PublishSuccessCard verbDone={verbDone} label="MercadoLibre" rect={bubbleRect} />}
      <ChannelTracker
        steps={steps}
        step={step}
        completing={completing}
        loading={loading}
        show={showTracker && (isActive || status === 'failed')}
        // Editar sobre una publicación fallida: el fallo es el PRIMER nodo
        // ("Publicación fallida"), no el último. Si el intento actual acaba
        // de fallar (status === 'failed'), el fallo vuelve al último nodo y
        // no hay CTA activo (reintentar se hace desde el panel de error).
        failedAt={
          status === 'failed'
            ? steps.length - 1
            : edited && listing?.status === 'failed'
              ? 0
              : -1
        }
        failLabel={
          edited && status !== 'failed' && listing?.status === 'failed'
            ? 'Publicación fallida'
            : undefined
        }
        verbDone={verbDone}
        ctaLabel={ctaLabel}
        btnLabel={btnLabel}
        onCta={onCta}
        ctaDisabled={(!edited && step === 1 && !categoryId) || typeBlocked}
        accent={ACCENT}
      />

      {error && (
        <div className="max-w-sm">
          <ErrorBox message={error} onRetry={() => setError(null)} />
        </div>
      )}

      {notice && (
        <div
          className="rounded-xl px-3 py-2.5 text-xs leading-relaxed"
          style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E' }}
        >
          {notice}
        </div>
      )}

      {/* Botón Volver: permite corregir categoría (paso 1) o tipo de
          publicación (paso 2) sin reiniciar el wizard. Solo dentro del
          wizard activo: en la vista asentada (p. ej. pre-publicado con
          showTracker=false) no debe filtrarse sobre el hero de estado. */}
      {isActive && !edited && step > 1 && showTracker && (
        <button
          onClick={() => setStep(step - 1)}
          className="w-fit flex items-center gap-1.5 text-xs font-semibold transition-colors hover:underline"
          style={{ color: '#64748B' }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M10 3L5.5 8l4.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Volver
        </button>
      )}

      {isActive && step === 1 && (
        <MLCategoryStep
          product={product}
          accountId={account.id}
          categoryId={categoryId}
          onSelect={setCategoryId}
          accent={ACCENT}
        />
      )}

      {isActive && !edited && step === typeStep && (
        <MLPubTypeStep
          mode={pubMode}
          setMode={setPubMode}
          match={catalogMatch}
          setMatch={chooseCatalogMatch}
          mandatory={catalogMandatory}
          setMandatory={setCatalogMandatory}
          accountId={account.id}
          initialQuery={product.gtin || product.name}
        />
      )}

      {isActive && step === configStep && (
        <div className="flex items-center gap-2 mb-3">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={catalogActive
              ? { color: '#4F46E5', background: '#EEF2FF' }
              : { color: '#475569', background: '#F1F5F9' }}
          >
            {catalogActive
              ? `Modo: Catálogo${catalogMatch ? ` · ${catalogMatch.name}` : ''}`
              : 'Modo: Tradicional'}
          </span>
        </div>
      )}

      {isActive && step === configStep && (catalogActive ? (
        <MLCatalogConfigStep
          product={product}
          match={catalogMatch}
          cfg={{ listing_type: mlCfg.listing_type }}
          set={(_, v) => setMl('listing_type', v)}
          listingTypes={listingTypes}
          listingTypesError={listingTypesError}
          onRetryListingTypes={() => setListingTypesKey((k) => k + 1)}
          priceValue={priceValue}
          onPriceChange={setPriceValue}
          beforeReadonly={
            <CatalogRequiredAttributes
              settings={settings}
              values={mlCfg.values}
              setValue={setMlValue}
            />
          }
        />
      ) : (
        <MLConfigStep
          cfg={mlCfg}
          set={setMl}
          setValue={setMlValue}
          settings={settings}
          listingTypes={listingTypes}
          listingTypesError={listingTypesError}
          onRetryListingTypes={() => setListingTypesKey((k) => k + 1)}
          accent={ACCENT}
          priceValue={priceValue}
          onPriceChange={setPriceValue}
          sizeGridRequired={sizeGridRequired}
          sizeGridMeasures={sizeGridMeasures}
        />
      ))}

      {(status === 'published' || status === 'under_review' || (status === 'prepublished' && prepublishedView)) && (
        <>
          
          <MLPublished
            product={product}
            listing={listing}
            accountId={account.id}
            verbDone={verbDone}
            accent={ACCENT}
            summaryRows={summaryRows}
            price={listing?.price ?? product.price}
            listingName={listingName}
            costs={sellingCosts}
            prepublished={status === 'prepublished'}
            underReview={status === 'under_review'}
            onEdit={editConfig}
            onUpdate={handleUpdate}
            onPause={handlePause}
            onDelete={handleDelete}
            onPicturesSaved={onReload}
          />
        </>
      )}

      {status === 'paused' && (
        <>
          
          <MLPublished
            product={product}
            listing={listing}
            accountId={account.id}
            verbDone={verbDone}
            accent={ACCENT}
            summaryRows={summaryRows}
            price={listing?.price ?? product.price}
            listingName={listingName}
            costs={sellingCosts}
            paused
            onEdit={editConfig}
            onUpdate={handleUpdate}
            onPause={handlePause}
            onReactivate={handleReactivate}
            onDelete={handleDelete}
            onPicturesSaved={onReload}
          />
        </>
      )}

      {status === 'failed' && (
        <FailedPanel
          verb={edited ? 'actualizar' : 'publicar'}
          label="MercadoLibre"
          reason={
            lastFailure?.reason ??
            listing?.reason ??
            'La publicación falló. Revisá la configuración e intentá de nuevo.'
          }
          remedy={lastFailure ? lastFailure.remedy : listing?.remedy}
          retrying={loading}
          onRetry={() => {
            if (!effectiveCategory && !edited) {
              // Sin categoría guardada no se puede reintentar: volver a elegir.
              setStatus('unpublished')
              setStep(1)
            } else {
              submit()
            }
          }}
          onEdit={editConfig}
        />
      )}
    </div>
  )
}

// ─── Acciones compartidas ────────────────────────────────────────────────────

const UNDER_REVIEW_NOTICE =
  'MercadoLibre está revisando esta publicación: el cambio de estado se aplicará cuando termine la revisión.'

async function pauseAction(
  product: Product,
  accountId: number,
  setStatus: (s: ChannelStatus) => void,
  setNotice: (n: string | null) => void,
  onChanged: () => void,
  onReload: () => void,
) {
  const result = await channelsApi.mlAction('pause', product.id, accountId)
  setStatus(result.status)
  setNotice(result.meli_status === 'under_review' ? UNDER_REVIEW_NOTICE : null)
  onChanged()
  onReload()
}

async function updateAction(
  product: Product,
  accountId: number,
  setStatus: (s: ChannelStatus) => void,
  setNotice: (n: string | null) => void,
  onChanged: () => void,
  onReload: () => void,
) {
  const result = await channelsApi.mlAction('update', product.id, accountId)
  setStatus(result.status)
  setNotice(result.meli_status === 'under_review' ? UNDER_REVIEW_NOTICE : null)
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
  await channelsApi.mlAction('delete', product.id, accountId)
  setStatus('unpublished')
  setEdited(false)
  setShowTracker(true)
  setStep(1)
  onChanged()
  onReload()
}

// ─── Step 1: category picker (Figma: checkmark list, no bottom CTA) ──────────

function MLCategoryStep({
  product,
  accountId,
  categoryId,
  onSelect,
  accent,
}: {
  product: Product
  accountId: number
  categoryId: string | null
  onSelect: (id: string | null) => void
  accent: string
}) {
  const [categories, setCategories] = useState<MLCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    (regen: boolean) => {
      setLoading(true)
      setError(null)
      if (regen) {
        setRegenerating(true)
        setOpen(true)
        onSelect(null)
      }
      channelsApi
        .mlCategories(product.name_edited || product.name, accountId)
        .then((res) => {
          // Sin auto-selección: la categoría la elige el usuario.
          setCategories(res.items)
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => {
          setLoading(false)
          if (regen) setTimeout(() => setRegenerating(false), 1200)
        })
    },
    // NOTA: categoryId NO está en las deps a propósito — elegir una categoría
    // no debe re-disparar la descarga de la lista (el botón Regenerar es
    // manual).
    [product.name, product.name_edited, accountId, onSelect],
  )

  useEffect(() => {
    load(false)
  }, [load])

  const selectedCat = categories.find((c) => c.id === categoryId)
  const visible = categories.filter(
    (c) =>
      !query ||
      c.category_name.toLowerCase().includes(query.toLowerCase()) ||
      (c.domain_name || '').toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span
            style={{
              fontSize: '10px',
              color: '#94A3B8',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              fontWeight: 600,
            }}
          >
            Categoría
          </span>
          <button
            onClick={() => load(true)}
            disabled={regenerating || loading}
            className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md transition-colors hover:bg-slate-100"
            style={{ color: regenerating || loading ? '#CBD5E1' : '#64748B' }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 14 14"
              fill="none"
              style={{ animation: regenerating ? 'spin 0.8s linear infinite' : 'none' }}
              aria-hidden
            >
              <path d="M12 7A5 5 0 1 1 7 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M7 2l1.5 1.5L7 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {regenerating ? 'Buscando…' : 'Regenerar'}
          </button>
        </div>

        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all"
          style={{
            background: open ? '#EEF2FF' : 'white',
            border: `1px solid ${open ? '#C7D2FE' : '#E2E8F0'}`,
          }}
        >
          {selectedCat ? (
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink truncate">{selectedCat.category_name}</p>
              <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '1px' }}>
                {selectedCat.domain_name} · {selectedCat.id}
              </p>
            </div>
          ) : (
            <span className="text-xs text-muted">{loading ? 'Buscando…' : 'Seleccionar categoría…'}</span>
          )}
          <Chevron open={open} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div
              className="relative mt-1 z-20 rounded-xl overflow-hidden"
              style={{
                border: '1px solid #E2E8F0',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                opacity: regenerating ? 0.4 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              <div className="relative" style={{ borderBottom: '1px solid #F1F5F9' }}>
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  width="11"
                  height="11"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden
                >
                  <circle cx="6" cy="6" r="4.5" stroke="#CBD5E1" strokeWidth="1.4" />
                  <path d="M9.5 9.5L12 12" stroke="#CBD5E1" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar…"
                  autoFocus
                  className="w-full pl-8 pr-3 py-2 text-xs outline-none bg-white text-ink"
                />
              </div>
              <div className="p-1.5 flex flex-col gap-0.5">
                {visible.map((cat) => {
                  const isSel = cat.id === categoryId
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        onSelect(cat.id)
                        setOpen(false)
                        setQuery('')
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className="text-xs truncate"
                            style={{ color: isSel ? accent : '#0A1628', fontWeight: isSel ? 600 : 500 }}
                          >
                            {cat.category_name}
                          </p>
                          <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '1px' }} className="truncate">
                            {cat.domain_name} · {cat.id}
                          </p>
                        </div>
                        {isSel && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0" style={{ color: accent }} aria-hidden>
                            <path d="M2.5 6.5l2.5 2.5 4.5-5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )
                })}
                {visible.length === 0 && (
                  <p className="px-3 py-3 text-xs text-muted">Sin resultados para “{query}”</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {error && <ErrorBox message={error} onRetry={() => load(false)} />}
    </div>
  )
}

// ─── Step 2: attributes + shipping + warranty + campaign (no bottom CTA) ─────

// Espejo de app/integrations/core/bools.is_truthy (fuente única del backend):
// no agregar variantes acá sin actualizar esa función.
const BOOLEAN_TRUE = new Set(['True', 'Si', 'Sí', 'true', 'si', 'sí', 'yes', '1', 'on'])

function AttributeCard({
  item,
  value,
  onChange,
}: {
  item: MLSettingsItem
  value: string
  onChange: (v: string) => void
}) {
  const label = SHIPPING_ITEM_LABEL[item.id] ?? (item.name || item.id)
  const options = optionsOf(item)
  const vt = item.value_type
  const empty = !String(value || '').trim()
  const requiredMark = item.required && empty ? (
    <span style={{ color: '#DC2626' }}> · obligatorio</span>
  ) : null
  const optionalMark = item.catalog_required && !item.required && empty ? (
    <span style={{ color: '#2563EB' }}> · para catálogo</span>
  ) : null

  // Envío: los booleanos de Meli (True/False) se muestran como toggle.
  if (item.id === 'LOCAL_PICK_UP' || item.id === 'FREE_SHIPPING') {
    const on = BOOLEAN_TRUE.has(value)
    return (
      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: 'white', border: '1px solid #E2E8F0' }}>
        <span style={{ fontSize: '10px', color: '#94A3B8' }}>{label}</span>
        <Toggle value={on} onChange={(v) => onChange(v ? 'True' : 'False')} />
      </div>
    )
  }

  // Envío: MODE y LOGISTIC_TYPE muestran los códigos de Meli traducidos.
  if (item.id === 'MODE' || item.id === 'LOGISTIC_TYPE') {
    return (
      <ShippingSelect
        label={label}
        value={value}
        codes={item.id === 'MODE' ? dedupeModes(optionsOf(item)) : optionsOf(item)}
        labelOf={(code) =>
          (item.id === 'MODE' ? SHIPPING_MODE_LABEL : LOGISTIC_TYPE_LABEL)[code] ?? code
        }
        onChange={onChange}
      />
    )
  }

  if (vt === 'boolean') {
    // Meli manda value_examples como ["No","Sí"] (o en otro orden). La
    // etiqueta "verdadera" es la que está en BOOLEAN_TRUE, NO options[0]:
    // con ["No","Sí"] el toggle quedaba invertido (al encender escribía
    // "No", `on` pasaba a false y volvía a apagarse solo).
    const opts = options.length >= 2 ? options : ['Sí', 'No']
    const trueLabel = BOOLEAN_TRUE.has(opts[0]) ? opts[0] : opts[1]
    const falseLabel = trueLabel === opts[0] ? opts[1] : opts[0]
    const on = BOOLEAN_TRUE.has(value)
    return (
      <div
        className="flex items-center justify-between px-3 py-2.5 rounded-xl"
        style={{ background: 'white', border: '1px solid #E2E8F0' }}
      >
        <span style={{ fontSize: '10px', color: '#94A3B8' }}>
          {label}
          {requiredMark}
          {optionalMark}
        </span>
        <Toggle value={on} onChange={(v) => onChange(v ? trueLabel : falseLabel)} />
      </div>
    )
  }

  if (vt === 'list' || options.length > 0) {
    // Valor vacío se muestra VACÍO (placeholder): nunca el primer ejemplo,
    // que antes parecía "pre-seleccionado" sin estarlo de verdad.
    return (
      <ValueCard
        label={label}
        value={value}
        options={options.length ? options : [value]}
        onChange={onChange}
        required={Boolean(item.required) && empty}
        optional={Boolean(item.catalog_required) && !item.required && empty}
      />
    )
  }

  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: 'white', border: '1px solid #E2E8F0' }}>
      <span style={{ fontSize: '10px', color: '#94A3B8', flexShrink: 0, marginRight: '8px' }}>
        {label}
        {requiredMark}
        {optionalMark}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="text-xs font-semibold text-right outline-none bg-transparent flex-1 min-w-0 text-ink"
      />
    </div>
  )
}

function ShippingSelect({
  label,
  value,
  codes,
  labelOf,
  onChange,
}: {
  label: string
  value: string
  codes: string[]
  labelOf: (code: string) => string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const empty = !String(value || '').trim()
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all"
        style={{ background: open ? '#EEF2FF' : 'white', border: `1px solid ${open ? '#C7D2FE' : '#E2E8F0'}` }}
      >
        <span style={{ fontSize: '10px', color: '#94A3B8' }}>{label}</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-xs font-semibold truncate"
            style={{ color: empty ? '#94A3B8' : '#0A1628', fontWeight: empty ? 400 : 600 }}
          >
            {empty ? 'Elegí…' : labelOf(value)}
          </span>
          <Chevron open={open} />
        </div>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-1 z-20 rounded-xl p-1.5 flex flex-col gap-0.5 min-w-full max-h-48 overflow-y-auto scroll-slim"
            style={{ background: 'white', border: '1px solid #E2E8F0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
          >
            {codes.map((code) => (
              <button
                key={code}
                onClick={() => {
                  onChange(code)
                  setOpen(false)
                }}
                className="text-left px-3 py-1.5 rounded-lg text-xs transition-all hover:bg-slate-50 whitespace-nowrap"
                style={{ color: code === value ? '#4F46E5' : '#0A1628', fontWeight: code === value ? 600 : 400 }}
              >
                {labelOf(code)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function CatalogRequiredAttributes({
  settings,
  values,
  setValue,
}: {
  settings: MLSettings | null
  values: Record<string, string>
  setValue: (id: string, v: string) => void
}) {
  // En modo catálogo Meli exige igual algunos atributos de la categoría
  // (flag `catalog_required`, ej. "Tipo de mochila"). Se muestran SOLO esos,
  // no el formulario completo (título/marca/fotos los aporta la ficha).
  const items = sectionItems(settings, 'attributes').filter(
    (i) => i.catalog_required && i.id !== 'LISTING_TYPE',
  )
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Atributos de la categoría</SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <AttributeCard
            key={item.id}
            item={item}
            value={values[item.id] ?? ''}
            onChange={(v) => setValue(item.id, v)}
          />
        ))}
      </div>
    </div>
  )
}

function MLConfigStep({
  cfg,
  set,
  setValue,
  settings,
  listingTypes,
  listingTypesError,
  onRetryListingTypes,
  accent,
  priceValue,
  onPriceChange,
  sizeGridRequired,
  sizeGridMeasures,
}: {
  cfg: MLCfgState
  set: <K extends keyof MLCfgState>(k: K, v: MLCfgState[K]) => void
  setValue: (id: string, v: string) => void
  settings: MLSettings | null
  listingTypes: MLListingType[] | null
  listingTypesError: string | null
  onRetryListingTypes: () => void
  accent: string
  priceValue?: string
  onPriceChange?: (v: string) => void
  sizeGridRequired?: boolean
  sizeGridMeasures?: SizeGridMeasure[] | null
}) {
  // Dinámico: renderizamos los items tal como vienen de Meli en los settings
  // de la categoría. Cada categoría/producto puede traer atributos distintos.
  const renderSection = (section: SectionKey) => {
    const items = sectionItems(settings, section).filter(
      (i) => i.id !== 'LISTING_TYPE'
        && i.id !== 'SIZE_GRID_ID'
        && i.id !== 'SIZE_GRID_ROW_ID')
    if (items.length === 0) return null
    return (
      <div key={section} className="flex flex-col gap-2">
        <SectionLabel>{SECTION_LABELS[section]}</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <AttributeCard
              key={item.id}
              item={item}
              value={cfg.values[item.id] ?? ''}
              onChange={(v) => setValue(item.id, v)}
            />
          ))}
        </div>
      </div>
    )
  }

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
      {renderSection('attributes')}

      {sizeGridRequired && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Guía de talles</SectionLabel>
          {sizeGridMeasures === null ? (
            <span className="text-xs text-faint">Cargando requisitos de la guía…</span>
          ) : (
            <>
              <span className="text-xs text-faint">
                La guía de talles se resuelve automáticamente al publicar con estas medidas.
              </span>
              {(sizeGridMeasures ?? []).length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {(sizeGridMeasures ?? []).map((m) => (
                    <AttributeCard
                      key={m.id}
                      item={{
                        id: m.id,
                        name: m.name + ' (' + m.unit + ')',
                        value_type: 'string',
                        required: true,
                      }}
                      value={cfg.values[m.id] ?? ''}
                      onChange={(v) => setValue(m.id, v)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {renderSection('shipping')}
      {renderSection('sale_terms')}

      <div className="flex flex-col gap-2">
        <SectionLabel>{SECTION_LABELS.listing}</SectionLabel>
        {listingTypes === null ? (
          <div
            className="w-full px-3 py-2.5 rounded-xl text-xs"
            style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#94A3B8' }}
          >
            Cargando campañas disponibles…
          </div>
        ) : listingTypesError ? (
          <div
            className="rounded-xl px-3 py-2.5 text-xs leading-relaxed"
            style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#B91C1C' }}
          >
            <p className="font-semibold mb-0.5">No se pudieron cargar las campañas</p>
            <p className="break-words line-clamp-3">{listingTypesError}</p>
            <button
              onClick={onRetryListingTypes}
              className="mt-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-white hover:brightness-95 transition-all"
              style={{ background: '#DC2626' }}
            >
              Reintentar
            </button>
          </div>
        ) : listingTypes.length === 0 ? (
          <div
            className="w-full px-3 py-2.5 rounded-xl text-xs"
            style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#94A3B8' }}
          >
            No hay campañas disponibles para esta categoría y precio.
          </div>
        ) : (
          <ListingTypePicker value={cfg.listing_type} onChange={(v) => set('listing_type', v)} items={listingTypes} accent={accent} />
        )}
      </div>
    </div>
  )
}

// ─── Published state: hero + toolbar + performance + summary ─────────────────

function MLPublished({
  product,
  listing,
  accountId,
  verbDone,
  accent,
  summaryRows,
  price,
  listingName,
  costs,
  paused = false,
  prepublished = false,
  underReview = false,
  onEdit,
  onUpdate,
  onPause,
  onReactivate,
  onDelete,
  onPicturesSaved,
}: {
  product: Product
  listing: ProductListing | null
  accountId: number
  verbDone: string
  accent: string
  summaryRows: { label: string; value: string }[]
  price: number
  listingName: string
  costs?: MLSellingCosts | null | undefined
  paused?: boolean
  prepublished?: boolean
  underReview?: boolean
  onEdit: () => void
  onUpdate: () => Promise<void>
  onPause: () => Promise<void>
  onReactivate?: () => Promise<void>
  onDelete: () => Promise<void>
  onPicturesSaved?: () => void
}) {
  const green = '#16A34A'
  const [perf, setPerf] = useState<MLPerformance | null | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // meli_pictures: descarga las fotos (mejoradas con IA por MercadoLibre) a
  // nuestro bucket. Figma: toolbar action con estados idle/loading/done.
  const [pics, setPics] = useState<'idle' | 'loading' | 'done'>('idle')
  const [picsError, setPicsError] = useState<string | null>(null)
  const downloadPics = async () => {
    if (pics !== 'idle') return
    setPics('loading')
    setPicsError(null)
    try {
      await channelsApi.mlPictures(product.id, accountId)
      setPics('done')
      onPicturesSaved?.()
      setTimeout(() => setPics('idle'), 2600)
    } catch (err) {
      setPics('idle')
      setPicsError(err instanceof Error ? err.message : 'No se pudieron descargar las fotos')
    }
  }

  useEffect(() => {
    let cancelled = false
    channelsApi
      .mlPerformance(product.id, accountId)
      .then((res) => {
        if (!cancelled) setPerf(res)
      })
      .catch(() => {
        if (!cancelled) setPerf(null)
      })
    return () => {
      cancelled = true
    }
  }, [product.id, accountId])

  // Performance manual (Figma): botón de toolbar que pide las métricas a
  // Meli on-demand (GET /item/{id}/performance) y las guarda en DB.
  const [perfBusy, setPerfBusy] = useState(false)
  const [perfError, setPerfError] = useState<string | null>(null)
  const refreshPerformance = async () => {
    if (perfBusy) return
    setPerfBusy(true)
    setPerfError(null)
    try {
      const res = await channelsApi.mlPerformanceRefresh(product.id, accountId)
      setPerf(res)
    } catch (err) {
      setPerfError(err instanceof Error ? err.message : 'No se pudieron obtener las métricas de performance')
    } finally {
      setPerfBusy(false)
    }
  }

  const { pending } = perfStats(perf ?? null)
  const hasPerf = perf !== null && perf !== undefined && perf.score !== null

  const run = async (action: 'update' | 'pause' | 'delete') => {
    setBusy(action)
    setError(null)
    try {
      if (action === 'update') await onUpdate()
      else if (action === 'pause') await onPause()
      else await onDelete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción')
    } finally {
      setBusy(null)
    }
  }

  const runReactivate = async () => {
    // Busy sobre el botón "Reactivar" (no 'update'): la animación debe verse
    // en el botón que el usuario tocó, aunque por detrás corra el mismo evento.
    setBusy('reactivate')
    setError(null)
    try {
      await (onReactivate ?? onUpdate)()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción')
    } finally {
      setBusy(null)
    }
  }

  // ── Catálogo: la acción vive en el toolbar; la card es solo datos ──
  const isCatalog = Boolean(listing?.catalog_listing)
  const canOptOut = isCatalog && Boolean(listing?.marketplace_item_id)
  const [linking, setLinking] = useState(false)
  const [pick, setPick] = useState<CatalogProduct | null>(null)
  const [confirmOut, setConfirmOut] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  const openLink = async () => {
    setLinkError(null)
    setPick(null)
    try {
      const el = await catalogApi.eligibility(product.id, accountId)
      const blocked = BLOCKED_ELIGIBILITY[el.status ?? '']
      if (blocked) {
        setLinkError(blocked)
        return
      }
    } catch {
      // sin info de elegibilidad: dejamos intentar el matching igual
    }
    setLinking(true)
  }

  const doLink = async () => {
    if (!pick || linkBusy) return
    setLinkBusy(true)
    setLinkError(null)
    try {
      await catalogApi.optin(product.id, accountId, pick.id)
      setLinking(false)
      onPicturesSaved?.() // recarga el producto (mismo callback que fotos)
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'No se pudo vincular al catálogo')
    } finally {
      setLinkBusy(false)
    }
  }

  const doUnlink = async () => {
    setLinkError(null)
    try {
      await catalogApi.optout(product.id, accountId)
      setConfirmOut(false)
      onPicturesSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo salir del catálogo')
      setConfirmOut(false)
    }
  }

  const catalogAction = isCatalog
    ? {
        key: 'catalog',
        label: 'Salir de catálogo',
        icon: (
          <>
            <path d="M9 4.5H4.5v15H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 7l5 5-5 5M20 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ),
        color: canOptOut ? '#EA580C' : '#94A3B8',
        tint: canOptOut ? '#FFF7ED' : '#F8FAFC',
        border: canOptOut ? '#FED7AA' : '#E2E8F0',
        onClick: canOptOut ? () => setConfirmOut(true) : undefined,
        disabled: !canOptOut,
        note: canOptOut
          ? ''
          : 'No se puede salir de catálogo. Esta publicación nació en el catálogo y no tiene una publicación tradicional previa a la que volver.',
      }
    : {
        key: 'catalog',
        label: 'Linkear a catálogo',
        icon: (
          <path d="M9.5 14.5l5-5M9 6l1.5-1.5a3.5 3.5 0 015 5L15 11M15 18l-1.5 1.5a3.5 3.5 0 01-5-5L9 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ),
        color: '#4F46E5',
        tint: '#EEF2FF',
        border: '#C7D2FE',
        onClick: openLink,
        disabled: false,
        note: '',
      }

  const picsAction = {
    key: 'pictures',
    label: pics === 'loading' ? 'Descargando…' : pics === 'done' ? '¡Guardadas!' : 'Descargar fotos',
    icon: pics === 'done'
      ? (
          <path d="M5 12.5l4 4 10-11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )
      : ICONS.photos,
    color: pics === 'done' ? green : '#7C3AED',
    tint: pics === 'done' ? '#F0FDF4' : '#F5F3FF',
    border: pics === 'done' ? '#BBF7D0' : '#DDD6FE',
    onClick: downloadPics,
    busy: pics === 'loading',
  }

  const perfAction = {
    key: 'perf',
    label: perfBusy ? 'Obteniendo…' : 'Performance',
    icon: ICONS.gauge,
    color: '#2563EB',
    tint: '#EFF6FF',
    border: '#BFDBFE',
    onClick: refreshPerformance,
    busy: perfBusy,
  }
  // Meli NO calcula performance para items de catálogo ("Product items are
  // not supported"): el botón y la sección no se muestran en ese caso.
  const perfSlot = isCatalog ? [] : [perfAction]

  const actions = paused
    ? [
        { key: 'reactivate', label: 'Reactivar', icon: ICONS.play, color: '#4F46E5', tint: '#EEF2FF', border: '#C7D2FE', onClick: runReactivate },
        { key: 'update', label: 'Actualizar', icon: ICONS.refresh, color: '#0A1628', tint: '#F1F5F9', border: '#E2E8F0', onClick: () => run('update') },
        catalogAction,
        picsAction,
        ...perfSlot,
        { key: 'delete', label: 'Eliminar', icon: ICONS.trash, color: '#EF4444', tint: '#FEF2F2', border: '#FECACA', onClick: () => setConfirmDelete(true) },
      ]
    : underReview
      ? [
          { key: 'update', label: 'Actualizar', icon: ICONS.refresh, color: '#0A1628', tint: '#F1F5F9', border: '#E2E8F0', onClick: () => run('update') },
          catalogAction,
          picsAction,
          ...perfSlot,
          { key: 'delete', label: 'Eliminar', icon: ICONS.trash, color: '#EF4444', tint: '#FEF2F2', border: '#FECACA', onClick: () => setConfirmDelete(true) },
        ]
      : [
          { key: 'update', label: 'Actualizar', icon: ICONS.refresh, color: '#0A1628', tint: '#F1F5F9', border: '#E2E8F0', onClick: () => run('update') },
          { key: 'pause', label: 'Pausar', icon: ICONS.pause, color: '#EA580C', tint: '#FFF7ED', border: '#FED7AA', onClick: () => run('pause') },
          catalogAction,
          picsAction,
          ...perfSlot,
          { key: 'delete', label: 'Eliminar', icon: ICONS.trash, color: '#EF4444', tint: '#FEF2F2', border: '#FECACA', onClick: () => setConfirmDelete(true) },
        ]

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
        <div
          className="flex items-center gap-4 px-4 py-4"
          style={{
            background: paused ? '#FFF7ED' : prepublished ? '#FEF3C7' : underReview ? '#EFF6FF' : '#F0FDF4',
            borderBottom: `1px solid ${paused ? '#FFEDD5' : prepublished ? '#FDE68A' : underReview ? '#BFDBFE' : '#DCFCE7'}`,
          }}
        >
          {hasPerf && <ScoreRing score={perf?.score ?? 0} />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold" style={{ color: '#0A1628' }}>
                {paused
                  ? 'Pausado en MercadoLibre'
                  : prepublished
                    ? 'Pre-publicado en MercadoLibre'
                    : underReview
                      ? 'En revisión en MercadoLibre'
                      : `${verbDone} en MercadoLibre`}
              </p>
              <HeroChip paused={paused} prepublished={prepublished} underReview={underReview} />
            </div>
            <p style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
              {paused
                ? 'Publicación oculta temporalmente'
                : prepublished
                  ? 'Publicación enviada a MercadoLibre — se está activando. El estado se actualiza automáticamente.'
                  : underReview
                    ? 'MercadoLibre está revisando la publicación. Corregí lo que pida la Sugerencia de MercadoLibre para que se active.'
                    : hasPerf
                      ? `Nivel ${perf?.level_wording ?? '—'} · ${pending.length} oportunidades de mejora`
                      : ''}
            </p>
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
        <div className="grid" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0,1fr))` }}>
          {actions.map((a, i) => {
            const isBusy = busy === a.key || Boolean((a as { busy?: boolean }).busy)
            return (
              <button
                key={a.key}
                onClick={a.onClick}
                disabled={isBusy}
                className="flex flex-col items-center gap-1.5 py-3 transition-colors hover:bg-slate-50 disabled:opacity-60"
                style={{ borderLeft: i > 0 ? '1px solid #F1F5F9' : 'none' }}
              >
                <IconTile icon={a.icon} color={a.color} tint={a.tint} border={a.border} />
                <span style={{ fontSize: '11px', fontWeight: 600, color: a.color, textAlign: 'center' }}>
                  {busy === a.key ? 'Procesando…' : a.label}
                </span>
              </button>
            )
          })}
        </div>
        {catalogAction.disabled && catalogAction.note && (
          <div className="flex items-start gap-2 px-4 py-2.5" style={{ background: '#F8FAFC', borderTop: '1px solid #F1F5F9' }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px" style={{ color: '#94A3B8' }} aria-hidden>
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 7.5v3M8 5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <p style={{ fontSize: '11px', lineHeight: 1.4, color: '#64748B' }}>{catalogAction.note}</p>
          </div>
        )}
      </div>

      {/* Buscador de fichas inline (al tocar "Linkear a catálogo") */}
      {linking && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #C7D2FE' }}>
          <div className="flex items-start justify-between gap-3 px-4 py-3.5" style={{ background: '#EEF2FF', borderBottom: '1px solid #E0E7FF' }}>
            <div>
              <h3 className="text-sm font-bold text-ink">Linkear a catálogo</h3>
              <p className="text-xs text-subtle mt-0.5">Buscá la ficha por nombre o GTIN. Tu publicación tradicional queda como respaldo.</p>
            </div>
            <button
              onClick={() => setLinking(false)}
              className="flex items-center justify-center rounded-lg flex-shrink-0 transition-colors"
              style={{ width: 26, height: 26, color: '#64748B' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#E0E7FF')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              aria-label="Cerrar"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="px-4 py-4">
            <CatalogMatcher
              accountId={accountId}
              selected={pick}
              onSelect={setPick}
              initialQuery={product.gtin || product.name}
            />
          </div>
          {linkError && (
            <div className="px-4">
              <ErrorBox message={linkError} />
            </div>
          )}
          <div className="px-4 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={() => setLinking(false)} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ border: '1px solid #E2E8F0', color: '#475569', background: 'white' }}>
              Cancelar
            </button>
            <button
              onClick={doLink}
              disabled={!pick || linkBusy}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ background: pick && !linkBusy ? '#4F46E5' : '#C7D2FE', cursor: pick ? 'pointer' : 'default' }}
            >
              {linkBusy ? 'Vinculando…' : 'Vincular'}
            </button>
          </div>
        </div>
      )}

      {/* Card de catálogo: SOLO estado/datos (sin acciones) */}
      <MLCatalogCard productId={product.id} listing={listing} accountId={accountId} />

      {/* Modal: confirmar salir de catálogo (mismo patrón que eliminar) */}
      {confirmOut && (
        <ConfirmDialog
          title="Salir de catálogo"
          body="Se cerrará la publicación de catálogo y se reactivará tu publicación tradicional. Vas a volver a controlar título, fotos y atributos, pero dejás de competir por la ficha estándar."
          confirmLabel="Salir de catálogo"
          danger
          onCancel={() => setConfirmOut(false)}
          onConfirm={() => {
            setConfirmOut(false)
            doUnlink()
          }}
        />
      )}

      {error && <ErrorBox message={error} />}
      {(prepublished || underReview) && listing?.remedy && (
        <div
          className="flex items-start gap-2 rounded-xl px-3.5 py-3"
          style={{ border: '1px solid #FDE68A', background: '#FFFBEB' }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px" aria-hidden>
            <circle cx="8" cy="8" r="6.5" stroke="#D97706" strokeWidth="1.3" />
            <path d="M8 7.5v3M8 5h.01" stroke="#D97706" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <p style={{ fontSize: '11px', lineHeight: 1.4, color: '#92400E' }}>
            <span style={{ fontWeight: 600 }}>Sugerencia de MercadoLibre:</span> {listing.remedy}
          </p>
        </div>
      )}
      {picsError && (
        <div className="max-w-sm">
          <ErrorBox message={picsError} onRetry={() => setPicsError(null)} />
        </div>
      )}

      {!paused && <SellingCosts price={price} listingName={listingName || '—'} costs={costs} />}

      {/* Performance: visible cuando la publicación existe y NO es de
          catálogo (Meli no calcula performance para items de catálogo).
          Sin datos muestra el aviso de "se está preparando" + el botón
          manual de la toolbar. */}
      {!paused && !isCatalog && (
        <div className="flex flex-col gap-2.5">
          <SectionLabel>Performance</SectionLabel>
          {perf === undefined ? (
            <PerformanceLoading />
          ) : perf && perf.score !== null && perf.buckets.length > 0 ? (
            <PerfBuckets perf={perf} accent={accent} />
          ) : (
            <div
              className="rounded-xl px-3.5 py-4 text-center text-xs"
              style={{ border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#64748B', lineHeight: 1.5 }}
            >
              Los datos de performance se están preparando: llegan solos cuando
              MercadoLibre los calcula, o presioná «Performance» para intentar ahora.
            </div>
          )}
          {perfError && (
            <div
              className="rounded-xl px-3 py-2.5 text-xs"
              style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }}
            >
              {perfError}
            </div>
          )}
        </div>
      )}

      <ConfigSummary rows={summaryRows} onEdit={onEdit} />

      {confirmDelete && (
        <ConfirmDialog
          title="¿Dar de baja la publicación?"
          body="La publicación se cerrará y eliminará en MercadoLibre. Esta acción no se puede deshacer."
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
