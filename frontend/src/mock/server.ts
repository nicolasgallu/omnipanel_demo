// Vite dev middleware that serves an in-memory mock of the whole /api surface.
// Enabled with VITE_USE_MOCK=1 — lets you run the frontend without the backend
// or the GCP database. This file is dev-only: it never reaches the app bundle.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { createMockDb, DEMO_USERS, LISTING_TYPES, ML_CATEGORIES, MOCK_ACCOUNTS, mlSettingsTemplate, TN_SETTINGS_TEMPLATE } from './data'
import type { ChannelStatus, ChannelActionResult, MLPerformance, Shipment } from '../lib/api/types'

const sleep = (ms = 300) => new Promise((r) => setTimeout(r, ms + Math.random() * 250))

// MercadoLibre item health (mirrors the Figma mock, shape = mercadolibre.performance)
const MOCK_PERFORMANCE: MLPerformance = {
  score: 65,
  level: 'medium',
  level_wording: 'Estándar',
  updated_at: '2026-09-19 18:12:22',
  buckets: [
    {
      key: 'USER_PRODUCT',
      title: 'Datos del producto',
      score: 72,
      variables: [
        { key: 'UP_STOCK_AVAILABILITY_TIME', score: 100, title: 'Quitá el tiempo de disponibilidad para que tu publicación sea más competitiva', status: 'COMPLETED', rule: { status: 'COMPLETED', label: 'Quitar tiempo', title: 'Quitá el tiempo de disponibilidad para que tu publicación sea más competitiva', link: 'https://www.mercadolibre.com.ar' } },
        { key: 'UP_TITLE', score: 100, title: 'Mejorá el título o usá nuestra sugerencia para atraer a más compradores', status: 'COMPLETED', rule: { status: 'COMPLETED', label: 'Agregar detalles', title: 'Sumá más detalles, el título debe tener al menos 3 palabras.', link: 'https://www.mercadolibre.com.ar' } },
        { key: 'UP_PICTURES', score: 100, title: 'Mejorá las fotos para tener más visitas', status: 'COMPLETED', rule: { status: 'COMPLETED', label: 'Generar fotos', title: 'Agregá más fotos para mostrar tu producto desde diferentes ángulos, subí 3 como mínimo.', link: 'https://www.mercadolibre.com.ar' } },
        { key: 'UP_CATALOG', score: 100, title: 'Verificá el producto de catálogo que te sugerimos y competí para ser la primera opción de compra', status: 'COMPLETED', rule: { status: 'COMPLETED', label: 'Verificar producto', title: 'Verificá el producto de catálogo que te sugerimos y competí para ser la primera opción de compra.', link: 'https://www.mercadolibre.com.ar' } },
        { key: 'UP_TECHNICAL_SPECIFICATIONS_MAIN', score: 100, title: 'Corregí las características para recibir menos preguntas y devoluciones', status: 'COMPLETED', rule: { status: 'COMPLETED', label: 'Completar', title: 'Completá las características principales.', link: 'https://www.mercadolibre.com.ar' } },
        { key: 'UP_GTIN', score: 100, title: 'Indicá el código universal de tu producto para no perder exposición', status: 'COMPLETED', rule: { status: 'COMPLETED', label: 'Completar código', title: 'Asegurate de completar el código que pertenezca a este producto para estar más arriba en los resultados de búsqueda.', link: 'https://www.mercadolibre.com.ar' } },
        { key: 'UP_SHORTS', score: 0, title: 'Creá un video para no perder ventas', status: 'PENDING', rule: { status: 'PENDING', label: 'Crear video', title: 'Los videos tienen que ser de hasta un minuto, en formato vertical y se van a publicar en todas tus variantes.', link: 'https://www.mercadolibre.com.ar' } },
        { key: 'UP_STOCK_DEPOSITO', score: 0, title: 'Agregá más stock y evitá perder ventas', status: 'PENDING', rule: { status: 'PENDING', label: 'Agregar stock', title: 'Asegurate de que tu publicación tenga 2 o más unidades disponibles.', link: 'https://www.mercadolibre.com.ar' } },
      ],
    },
    {
      key: 'ITEM',
      title: 'Condiciones de venta',
      score: 55,
      variables: [
        { key: 'UP_PROMOTIONS', score: 0, title: 'Participá de una promoción para recibir más visitas', status: 'PENDING', rule: { status: 'PENDING', label: 'Participar', title: 'Participá de una promoción para recibir más visitas', link: 'https://www.mercadolibre.com.ar' } },
        { key: 'UP_FREE_SHIPPING', score: 100, title: 'Ofrecé envío gratis para que tu publicación sea más competitiva', status: 'COMPLETED', rule: { status: 'COMPLETED', label: 'Ofrecer envío', title: 'Ofrecé envío gratis para que tu publicación sea más competitiva', link: 'https://www.mercadolibre.com.ar' } },
        { key: 'UP_ME_FLEX_ITEM_OPTIN', score: 100, title: 'Entregá en el día con Envíos Flex para que tu publicación sea más competitiva', status: 'COMPLETED', rule: { status: 'COMPLETED', label: 'Ofrecer envío', title: 'Entregá en el día con Envíos Flex para que tu publicación sea más competitiva', link: 'https://www.mercadolibre.com.ar' } },
        { key: 'UP_FINANCING', score: 0, title: 'Agregá cuotas al mismo precio que publicaste para que tu publicación sea más competitiva', status: 'PENDING', rule: { status: 'PENDING', label: 'Agregar cuotas', title: 'Agregá cuotas al mismo precio que publicaste para que tu publicación sea más competitiva', link: 'https://www.mercadolibre.com.ar' } },
      ],
    },
  ],
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

const productOut = (p: (typeof db.products)[number]) => ({
  id: p.id,
  internal_code: p.internal_code,
  sku: p.sku,
  gtin: p.gtin,
  name: p.name,
  name_edited: p.name_edited,
  brand: p.brand,
  model: p.model,
  category: p.category,
  stock: p.stock,
  cost: p.cost,
  price: p.price,
  dimensions: p.dimensions,
  created_at: p.created_at,
  updated_at: p.updated_at,
  ml_price: db.mlListings.get(p.id)?.price ?? null,
  tn_price: db.tnListings.get(p.id)?.price ?? null,
  ml_status: p.ml_status,
  tn_status: p.tn_status,
  image_url: db.images.get(p.id)?.[0]?.url ?? null,
})

const listingOut = (l: (typeof db.mlListings extends Map<number, infer V> ? V : never)) => {
  const status: ChannelStatus =
    l.db_status === 'active' || l.db_status === 'Published' || l.db_status === 'Updated.'
      ? 'published'
      : l.db_status === 'Paused.' || l.db_status === 'paused'
        ? 'paused'
        : l.db_status === 'Procesando..'
          ? 'prepublished'
          : l.db_status?.startsWith('Failed')
            ? 'failed'
            : 'unpublished'
  const cat = (l as unknown as Record<string, unknown>).catalog_product_id ?? null
  return {
    id: l.id,
    platform: l.platform,
    account_id: l.account_id,
    account_name: l.platform === 'mercadolibre' ? 'Guías Locales ML' : 'Guías Locales TN',
    external_id: l.external_id,
    price: l.price,
    status,
    db_status: l.db_status,
    reason: l.reason,
    remedy: l.remedy,
    permalink: l.permalink,
    catalog_listing: Boolean(cat),
    catalog_product_id: (cat as string | null) ?? null,
    marketplace_item_id: ((l as unknown as Record<string, unknown>).marketplace_item_id as string | null) ?? null,
    marketplace_status: ((l as unknown as Record<string, unknown>).marketplace_status as string | null) ?? null,
    created_at: l.updated_at,
    updated_at: l.updated_at,
  }
}

// ── Catálogo mock (Configuración > publicaciones ML) ──
const MOCK_CATALOG_PRODUCTS = [
  { id: 'MLA19283', name: 'Tabla De Madera Premium Para Picada 35x20cm', domain_id: 'MLA-HOME_DECOR', status: 'active', listing_strategy: null as string | null, attributes: [
    { id: 'BRAND', name: 'Marca', value_name: 'Gourmet AR' },
    { id: 'MODEL', name: 'Modelo', value_name: 'GRM-TBL35' },
    { id: 'COLOR', name: 'Color', value_name: 'Madera natural' },
  ]},
  { id: 'MLA44821', name: 'Set De Mate Completo Acero Inoxidable', domain_id: 'MLA-HOME_DECOR', status: 'active', listing_strategy: 'catalog_required', attributes: [
    { id: 'BRAND', name: 'Marca', value_name: 'Yerba & Co' },
    { id: 'MODEL', name: 'Modelo', value_name: 'YC-MATE-01' },
  ]},
  { id: 'MLA77390', name: 'Paño Decorativo Estampado 40x60cm', domain_id: 'MLA-HOME_DECOR', status: 'active', listing_strategy: null, attributes: [
    { id: 'BRAND', name: 'Marca', value_name: 'Textil Sur' },
  ]},
  { id: 'MLA55018', name: 'Quesera Plástica Con Tapa Regulable 3 Posiciones', domain_id: 'MLA-HOME_DECOR', status: 'active', listing_strategy: 'catalog_required', attributes: [
    { id: 'BRAND', name: 'Marca', value_name: 'HomeDeco' },
  ]},
  { id: 'MLA88117', name: 'Combo Mate + Bombilla + Yerbera Set Completo', domain_id: 'MLA-HOME_DECOR', status: 'active', listing_strategy: null, attributes: [
    { id: 'BRAND', name: 'Marca', value_name: 'Yerba & Co' },
  ]},
]

let mockEmployees = [
  { id: 1, full_name: 'Empleado Test 1', email: 'employee1@test.com', active: true, created_at: '2026-09-25' },
  { id: 2, full_name: 'María González', email: 'maria@importfull.com', active: true, created_at: '2026-08-14' },
  { id: 3, full_name: 'Javier Torres', email: 'javier@importfull.com', active: true, created_at: '2026-07-02' },
  { id: 4, full_name: 'Lucía Fernández', email: 'lucia@importfull.com', active: false, created_at: '2026-06-19' },
]

// ── Envíos de MercadoLibre (Figma SHIPMENTS, forma de mercadolibre.shipments) ──
const MOCK_SHIPMENTS: Shipment[] = [
  { external_id: '43308302844', order_id: '2000003508419013', status: 'ready_to_ship', substatus: 'ready_to_print', tracking_number: null, logistic_type: 'cross_docking', mode: 'me2', receiver: { city: 'São Paulo', state: 'SP', zip_code: '01310-100' }, items: [{ id: 'MLB123456789', title: 'Fone de Ouvido Bluetooth', quantity: 1 }], last_updated: '2026-09-25T10:30:00' },
  { external_id: '28264263908', order_id: '2000003508419013', status: 'shipped', substatus: 'out_for_delivery', tracking_number: 'OP123456789AR', logistic_type: 'drop_off', mode: 'me1', receiver: { city: 'Rio de Janeiro', state: 'RJ', zip_code: '20040-020' }, items: [{ id: 'MLB987654321', title: 'Capa de Celular', quantity: 2 }], last_updated: '2026-09-27T08:00:00' },
  { external_id: '43120094551', order_id: '2000003508420115', status: 'delivered', substatus: null, tracking_number: 'OP998877665AR', logistic_type: 'fulfillment', mode: 'me2', receiver: { city: 'Belo Horizonte', state: 'MG', zip_code: '30110-002' }, items: [{ id: 'MLB556677889', title: 'Teclado Mecânico RGB', quantity: 1 }], last_updated: '2026-09-26T17:42:00' },
  { external_id: '43990010233', order_id: '2000003508421220', status: 'handling', substatus: 'manufacturing', tracking_number: null, logistic_type: 'self_service', mode: 'me2', receiver: { city: 'Curitiba', state: 'PR', zip_code: '80010-010' }, items: [{ id: 'MLB111222333', title: 'Mouse Gamer 12000 DPI', quantity: 1 }, { id: 'MLB111222999', title: 'Mousepad XL', quantity: 1 }], last_updated: '2026-09-27T09:20:00' },
  { external_id: '44001299877', order_id: '2000003508422331', status: 'pending', substatus: null, tracking_number: null, logistic_type: 'cross_docking', mode: 'me2', receiver: { city: 'Porto Alegre', state: 'RS', zip_code: '90010-150' }, items: [{ id: 'MLB444555666', title: 'Carregador USB-C 65W', quantity: 3 }], last_updated: '2026-09-27T07:05:00' },
  { external_id: '42887654120', order_id: '2000003508423442', status: 'not_delivered', substatus: 'delivery_failed', tracking_number: 'OP334455112AR', logistic_type: 'drop_off', mode: 'me1', receiver: { city: 'Salvador', state: 'BA', zip_code: '40010-000' }, items: [{ id: 'MLB777888999', title: 'Smartwatch Fit Pro', quantity: 1 }], last_updated: '2026-09-26T14:10:00' },
  { external_id: '43550998741', order_id: '2000003508424553', status: 'delivered', substatus: null, tracking_number: 'OP221100443AR', logistic_type: 'fulfillment', mode: 'me2', receiver: { city: 'Fortaleza', state: 'CE', zip_code: '60010-000' }, items: [{ id: 'MLB222333444', title: 'Caixa de Som Portátil', quantity: 1 }], last_updated: '2026-09-25T19:55:00' },
  { external_id: '44120557001', order_id: '2000003508425664', status: 'ready_to_ship', substatus: 'printed', tracking_number: 'OP556677889AR', logistic_type: 'cross_docking', mode: 'me2', receiver: { city: 'Recife', state: 'PE', zip_code: '50010-000' }, items: [{ id: 'MLB888999000', title: 'Cabo HDMI 2.1 · 2m', quantity: 2 }], last_updated: '2026-09-27T06:40:00' },
]

// ── Credenciales mock (Configuración > MercadoLibre / Tienda Nube) ──
let mockMeliCreds = {
  client_id: '',
  client_secret: '',
  external_account_id: '182931344' as string | null,
  access_token: null as string | null,
  refresh_token: null as string | null,
  code: null as string | null,
  expires_at: null as string | null,
  redirect_uri: '',
}
let mockTnCreds = { url: '', access_token: null as string | null, client_id: '29440' }

// ── Notificaciones + Scrapfly (business-only, Configuración) ──
// Seed para revisar estados: WhatsApp con Nico (activo) y Depósito
// (silenciado), Telegram vacío. Los destinos terminados en "00" hacen
// fallar el mensaje de prueba (mock del rechazo del proveedor).
let mockNotifSettings = {
  whatsapp_contacts: [
    { id: 'wa-1', label: 'Nico', destination: '+54 9 11 2345 6789', enabled: true },
    { id: 'wa-2', label: 'Depósito', destination: '+54 9 11 5555 0100', enabled: false },
  ] as { id: string; label: string; destination: string; enabled: boolean }[],
  telegram_contacts: [] as { id: string; label: string; destination: string; enabled: boolean }[],
  events: {
    order_confirmed: { whatsapp: true, telegram: true },
    order_cancelled: { whatsapp: true, telegram: true },
    order_delivered: { whatsapp: false, telegram: false },
    shipment_ready: { whatsapp: true, telegram: true },
    scraping_finished: { whatsapp: false, telegram: true },
  },
}
let mockScrapflyKey: string | null = null

const db = createMockDb()

// Deterministic perf score per product (Figma listingScore).
const listingScore = (p: (typeof db.products)[number]) => 45 + ((p.id * 17) % 50)
const mockSellingCost = (price: number) => {
  const pct = 14.5
  const fixed = price >= 12000 ? 1330 : price >= 5000 ? 1390 : 1410
  const percPart = Math.round(price * pct) / 100
  const total = percPart + fixed
  return Math.round(total * 1.21 * 100) / 100
}

export function mockApiPlugin({ enabled }: { enabled: boolean }): Plugin {
  return {
    name: 'omnipanel-mock-api',
    configureServer(server) {
      if (!enabled) return
      server.middlewares.use((req, res, next) => {
        if (!(req.url || '').startsWith('/api/')) return next()
        handle(req, res).catch(() => next())
      })
    },
  }
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://localhost')
  const path = url.pathname
  const method = req.method || 'GET'
  const body = await readBody(req)

  const send = (status: number, data: unknown) => json(res, status, data)
  const authed = () => {
    const header = req.headers.authorization || ''
    if (header === 'Bearer mock-token') return DEMO_USERS[0].user
    if (header === 'Bearer mock-token-employee') return DEMO_USERS[1].user
    return null
  }

  // ── AI generate ──
  if (method === 'POST' && path === '/api/ai/generate') {
    await sleep(900)
    const kind = String(body.kind || 'title')
    const prompt = String(body.prompt || '').trim()
    if (!prompt) return send(400, { error: 'bad_request', message: 'Escribí un prompt' })
    if (kind === 'title') {
      const t = prompt.charAt(0).toUpperCase() + prompt.slice(1)
      return send(200, { text: t.slice(0, 60) })
    }
    const d = prompt.charAt(0).toUpperCase() + prompt.slice(1)
    return send(200, {
      text: `${d}. Producto de calidad premium, ideal para uso diario. Envío rápido y garantía incluida.`,
    })
  }

  // ── auth ──
  if (method === 'POST' && path === '/api/auth/login') {
    await sleep()
    const email = String((body.email as string) || '').toLowerCase()
    const password = String(body.password || '')
    const found = DEMO_USERS.find((u) => u.email === email && u.password === password)
    if (!found) {
      return send(401, { error: 'invalid_credentials', message: 'Email o contraseña incorrectos' })
    }
    const token = found.user.role === 'business' ? 'mock-token' : 'mock-token-employee'
    return send(200, { token, user: found.user })
  }
  if (method === 'GET' && path === '/api/auth/me') {
    const u = authed()
    if (!u) return send(401, { error: 'unauthorized' })
    return send(200, { user: u })
  }

  const currentUser = authed()
  if (!currentUser) return send(401, { error: 'unauthorized', message: 'Sesión inválida o expirada' })
  const currentIsBusiness = currentUser.role === 'business'

  // ── accounts ──
  if (method === 'GET' && path === '/api/accounts') {
    await sleep(150)
    return send(200, { items: MOCK_ACCOUNTS })
  }

  // ── categorías del inventario ──
  if (method === 'GET' && path === '/api/inventory/categories') {
    await sleep(150)
    const cats = Array.from(new Set(db.products.map((p) => p.category).filter(Boolean))).sort()
    return send(200, { items: cats })
  }

  // ── products list ──
  if (method === 'GET' && path === '/api/inventory/products') {
    await sleep()
    const q = (url.searchParams.get('q') || '').toLowerCase()
    const channel = url.searchParams.get('channel') || ''
    const mlStatus = url.searchParams.get('ml_status') || ''
    const tnStatus = url.searchParams.get('tn_status') || ''
    const category = url.searchParams.get('category') || ''
    const stock = url.searchParams.get('stock') || ''
    const page = Math.max(1, Number(url.searchParams.get('page') || 1))
    const pageSize = Math.min(200, Number(url.searchParams.get('page_size') || 50))

    let items = db.products.filter((p) => {
      if (q) {
        const haystack = `${p.name} ${p.name_edited ?? ''} ${p.internal_code} ${p.sku}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (channel === 'ml' && p.ml_status === 'unpublished') return false
      if (channel === 'tn' && p.tn_status === 'unpublished') return false
      if (mlStatus && p.ml_status !== mlStatus) return false
      if (tnStatus && p.tn_status !== tnStatus) return false
      if (category && p.category !== category) return false
      if (stock === 'in' && p.stock <= 0) return false
      if (stock === 'out' && p.stock > 0) return false
      return true
    })

    const total = items.length
    const pages = Math.ceil(total / pageSize)
    items = items.slice((page - 1) * pageSize, page * pageSize)
    return send(200, { items: items.map(productOut), total, page, page_size: pageSize, pages })
  }

  // ── product detail / edit / delete ──
  const productMatch = path.match(/^\/api\/inventory\/products\/(\d+)$/)
  if (productMatch) {
    const id = Number(productMatch[1])
    const product = db.products.find((p) => p.id === id)
    if (!product) return send(404, { error: 'not_found', message: 'Producto no encontrado' })

    if (method === 'GET') {
      await sleep()
      const ml = db.mlListings.get(id)
      const tn = db.tnListings.get(id)
      return send(200, {
        product: {
          ...productOut(product),
          description: product.description,
          drive_url: product.drive_url,
        },
        images: db.images.get(id) ?? [],
        variations: [],
        listings: [ml ? listingOut(ml) : null, tn ? listingOut(tn) : null].filter(Boolean),
        movements: db.movements.get(id) ?? [],
      })
    }

    if (method === 'PATCH') {
      await sleep()
      if (body.title !== undefined) product.name_edited = String(body.title) || null
      if (body.brand !== undefined) product.brand = String(body.brand) || null
      if (body.model !== undefined) product.model = String(body.model) || null
      if (body.price !== undefined) product.price = Number(body.price) || 0
      if (body.description !== undefined) product.description = String(body.description)
      if (body.dimensions_cm_g) {
        const d = body.dimensions_cm_g as Record<string, number>
        product.dimensions = `${d.height ?? 0}x${d.width ?? 0}x${d.depth ?? 0},${d.weight ?? 0}`
      }
      return send(200, { product: productOut(product) })
    }

    if (method === 'DELETE') {
      await sleep()
      db.products = db.products.filter((p) => p.id !== id)
      res.statusCode = 204
      return res.end()
    }
  }

  // ── images ──
  const imgMatch = path.match(/^\/api\/inventory\/products\/(\d+)\/images(?:\/(\d+))?$/)
  if (imgMatch) {
    const productId = Number(imgMatch[1])
    const imageId = imgMatch[2] ? Number(imgMatch[2]) : null
    const product = db.products.find((p) => p.id === productId)
    if (!product) return send(404, { error: 'not_found', message: 'Producto no encontrado' })

    if (method === 'POST') {
      await sleep(500)
      const list = db.images.get(productId) ?? []
      if (list.length >= 10) return send(400, { error: 'limit_reached', message: 'Máximo 10 imágenes por producto' })
      const image = { id: db.imageSeq++, url: `mock://image/${productId}/${list.length + 1}` }
      list.push(image)
      db.images.set(productId, list)
      return send(201, image)
    }

    if (method === 'DELETE' && imageId) {
      await sleep()
      const list = db.images.get(productId) ?? []
      db.images.set(productId, list.filter((i) => i.id !== imageId))
      res.statusCode = 204
      return res.end()
    }
  }

  // ── ML: categories / listing prices / settings / actions ──
  if (method === 'GET' && path === '/api/mercadolibre/categories') {
    await sleep(400)
    const q = (url.searchParams.get('q') || '').toLowerCase()
    const items = ML_CATEGORIES.filter(
      (c) => !q || c.category_name.toLowerCase().includes(q) || c.domain_name.toLowerCase().includes(q),
    )
    return send(200, { items })
  }

  if (method === 'GET' && path === '/api/mercadolibre/listing-prices') {
    await sleep(400)
    return send(200, { items: LISTING_TYPES })
  }

  if (method === 'GET' && path === '/api/mercadolibre/performance') {
    await sleep(400)
    const productId = Number(url.searchParams.get('product_id'))
    const listing = db.mlListings.get(productId)
    if (!listing || (listing.db_status !== 'active' && listing.db_status !== 'Paused.')) {
      return send(200, { score: null, level: null, level_wording: null, updated_at: null, buckets: [] })
    }
    return send(200, MOCK_PERFORMANCE)
  }

  if (method === 'GET' && path === '/api/mercadolibre/settings') {
    await sleep(200)
    const productId = Number(url.searchParams.get('product_id'))
    const settings = db.mlSettings.get(productId) ?? mlSettingsTemplate(null)
    // Variación por producto (espeja categorías reales distintas): algunos
    // productos traen atributos extra, igual que Meli por categoría.
    const attrs = settings.settings[0]?.attributes ?? []
    const has = (id: string) => attrs.some((i) => i.id === id)
    if (productId % 2 === 1 && !has('UNITS_PER_PACK')) {
      attrs.push({ id: 'UNITS_PER_PACK', name: 'Unidades por pack', value_type: 'number', user_input_value: '1' })
    }
    if (productId % 3 === 0 && !has('VOLUME_CAPACITY')) {
      attrs.push({ id: 'VOLUME_CAPACITY', name: 'Volumen', value_type: 'number_unit', user_input_value: '1 mL' })
    }
    return send(200, settings)
  }

  if (method === 'POST' && path === '/api/mercadolibre/configure') {
    await sleep(900)
    const productId = Number(body.product_id)
    const categoryId = String(body.category_id)
    const settings = mlSettingsTemplate(categoryId)
    db.mlSettings.set(productId, settings)
    return send(200, settings)
  }

  if (method === 'POST' && path === '/api/mercadolibre/publish') {
    await sleep(1200)
    const productId = Number(body.product_id)
    const product = db.products.find((p) => p.id === productId)
    if (!product) return send(404, { error: 'not_found' })
    const cfg = (body.config as Record<string, unknown>) || {}
    const catalogId = String(cfg.catalog_product_id || '')
    const listing = {
      id: productId,
      platform: 'mercadolibre' as const,
      account_id: 10,
      external_id: `MLA${1100000000 + productId * 137}`,
      price: product.price,
      db_status: 'active',
      reason: null,
      remedy: null,
      permalink: `https://articulo.mercadolibre.com.ar/MLA${1100000000 + productId * 137}`,
      catalog_product_id: catalogId || null,
      marketplace_item_id: null,
      marketplace_status: null,
      updated_at: '2025-09-26 10:00:00',
    }
    db.mlListings.set(productId, listing)
    product.ml_status = 'published'
    return send(200, listingOut(listing))
  }

  const mlActionMatch = path.match(/^\/api\/mercadolibre\/(update|pause|delete)$/)
  if (mlActionMatch && method === 'POST') {
    await sleep(800)
    const action = mlActionMatch[1]
    const productId = Number(body.product_id)
    const product = db.products.find((p) => p.id === productId)
    if (!product) return send(404, { error: 'not_found' })
    if (action === 'update' && body.config) {
      // Persistir la config del wizard (flujo "Actualizar").
      const cfg = body.config as { category_id?: string }
      db.mlSettings.set(
        productId,
        db.mlSettings.get(productId) ?? mlSettingsTemplate(cfg.category_id ?? null),
      )
    }
    if (action === 'delete') {
      db.mlListings.delete(productId)
      product.ml_status = 'unpublished'
      return send(200, { status: 'unpublished', external_id: null, db_status: null, reason: null, remedy: null, permalink: null } satisfies ChannelActionResult)
    }
    const listing = db.mlListings.get(productId) ?? {
      id: productId,
      platform: 'mercadolibre' as const,
      account_id: 10,
      external_id: `MLA${1100000000 + productId * 137}`,
      price: product.price,
      db_status: 'active',
      reason: null,
      remedy: null,
      permalink: null,
      updated_at: '2025-09-26 10:00:00',
    }
    listing.db_status = action === 'pause' ? 'Paused.' : 'active'
    product.ml_status = action === 'pause' ? 'paused' : 'published'
    db.mlListings.set(productId, listing)
    return send(200, listingOut(listing))
  }

  // ── TN: settings / actions ──
  const applyTnConfig = (productId: number, config: Record<string, unknown>) => {
    const base = JSON.parse(JSON.stringify(TN_SETTINGS_TEMPLATE))
    const map: Record<string, string> = {
      free_shipping: 'FREE_SHIPPING',
      promo_price: 'PROMOTIONAL_PRICE',
      age_group: 'AGE_GROUP',
      gender: 'GENDER',
      mpn: 'MPN',
      barcode: 'BARCODE',
      tags: 'TAGS',
      video_url: 'VIDEO_URL',
      seo_title: 'SEO_TITLE',
      seo_description: 'SEO_DESCRIPTION',
    }
    for (const [k, key] of Object.entries(map)) {
      const v = config[k]
      if (v !== undefined && v !== null) {
        base[key] = { DEFAULT_VALUE: base[key]?.DEFAULT_VALUE ?? null, USER_INPUT_VALUE: v }
      }
    }
    db.tnSettings.set(productId, base)
  }

  if (method === 'GET' && path === '/api/tiendanube/settings') {
    await sleep(200)
    const productId = Number(url.searchParams.get('product_id'))
    const settings = db.tnSettings.get(productId) ?? JSON.parse(JSON.stringify(TN_SETTINGS_TEMPLATE))
    return send(200, { settings })
  }

  if (method === 'POST' && path === '/api/tiendanube/publish') {
    await sleep(1200)
    const productId = Number(body.product_id)
    const product = db.products.find((p) => p.id === productId)
    if (!product) return send(404, { error: 'not_found' })
    applyTnConfig(productId, (body.config as Record<string, unknown>) || {})
    const listing = {
      id: productId,
      platform: 'tiendanube' as const,
      account_id: 11,
      external_id: String(2000 + productId),
      price: product.price,
      db_status: 'Published',
      reason: null,
      remedy: null,
      permalink: `https://mitienda.mitiendanube.com/productos/mock-${productId}`,
      updated_at: '2025-09-26 10:00:00',
    }
    db.tnListings.set(productId, listing)
    product.tn_status = 'published'
    return send(200, listingOut(listing))
  }

  const tnActionMatch = path.match(/^\/api\/tiendanube\/(update|delete)$/)
  if (tnActionMatch && method === 'POST') {
    await sleep(800)
    const action = tnActionMatch[1]
    const productId = Number(body.product_id)
    const product = db.products.find((p) => p.id === productId)
    if (!product) return send(404, { error: 'not_found' })
    if (action === 'update' && body.config) {
      applyTnConfig(productId, body.config as Record<string, unknown>)
    }
    if (action === 'delete') {
      db.tnListings.delete(productId)
      product.tn_status = 'unpublished'
      return send(200, { status: 'unpublished', external_id: null, db_status: null, reason: null, remedy: null, permalink: null } satisfies ChannelActionResult)
    }
    const listing = db.tnListings.get(productId)
    if (listing) {
      listing.db_status = 'Updated.'
      product.tn_status = 'published'
      return send(200, listingOut(listing))
    }
    return send(200, { status: 'unpublished', external_id: null, db_status: null, reason: null, remedy: null, permalink: null } satisfies ChannelActionResult)
  }

  // ── Empleados (business-only) ──
  if (path.startsWith('/api/employees')) {
    if (!currentIsBusiness) {
      return send(403, { error: 'forbidden', message: 'No tenés permisos para esta sección' })
    }
  }
  if (method === 'GET' && path === '/api/employees') {
    await sleep(200)
    return send(200, { items: mockEmployees })
  }
  if (method === 'POST' && path === '/api/employees') {
    await sleep(400)
    const full_name = String(body.full_name || '').trim()
    const email = String(body.email || '').trim()
    if (mockEmployees.some((u) => u.email === email)) {
      return send(409, { error: 'duplicate_email', message: 'Ya existe un usuario con ese email' })
    }
    const user = {
      id: Math.max(0, ...mockEmployees.map((u) => u.id)) + 1,
      full_name,
      email,
      active: true,
      created_at: new Date().toISOString().slice(0, 10),
    }
    mockEmployees.push(user)
    return send(201, { id: user.id })
  }
  const empMatch = path.match(/^\/api\/employees\/(\d+)$/)
  if (empMatch && method === 'PATCH') {
    await sleep(300)
    const id = Number(empMatch[1])
    const user = mockEmployees.find((u) => u.id === id)
    if (!user) return send(404, { error: 'not_found' })
    user.active = Boolean(body.active)
    return send(200, { id, active: user.active })
  }

  // ── Prompts de IA ──
  let mockPrompts: Record<string, string> = {
    ai_generate_title: 'Sos un experto en marketplaces argentinos. Generá un título de venta claro y optimizado para SEO (máximo 60 caracteres) usando marca, modelo y características principales del producto.',
    ai_generate_description: 'Redactá una descripción de producto persuasiva y estructurada en párrafos cortos. Tono profesional y cercano, en español rioplatense.',
    ai_generate_brand: 'Indicá únicamente la marca del producto. Si no podés determinarla, respondé "Genérico".',
    ai_generate_model: 'Indicá únicamente el modelo o versión. Si no existe, generá un código corto basado en el nombre.',
    ai_category: 'Seleccioná la categoría de MercadoLibre más específica y correcta. Devolvé el id y su ruta.',
    ai_auditor: 'Actuá como auditor de calidad. Revisá título, descripción, fotos y atributos, y devolvé mejoras priorizadas.',
    ai_improving_human_reply: 'Mejorá la redacción de la respuesta del vendedor manteniendo el sentido original.',
    ai_inventory_search: 'Convertí la consulta del usuario en filtros de inventario. Devolvé un JSON con los filtros detectados.',
    ai_general: 'Sos el asistente de Omnipanel para un vendedor de e-commerce en Argentina.',
    rules: 'Nunca prometas envíos gratis salvo que esté configurado. Ante datos faltantes, pedí aclaración.',
  }
  if (method === 'GET' && path === '/api/ai/prompts') {
    await sleep(200)
    return send(200, { prompts: mockPrompts, supported: Object.keys(mockPrompts) })
  }
  if (method === 'PUT' && path === '/api/ai/prompts') {
    await sleep(400)
    const incoming = (body.prompts as Record<string, string>) || {}
    mockPrompts = { ...mockPrompts, ...incoming }
    return send(200, { prompts: mockPrompts, supported: Object.keys(mockPrompts) })
  }

  // ── Settings / password / logo (business-only) ──
  if (path.startsWith('/api/settings') || (path === '/api/auth/password' && method === 'PATCH')) {
    if (!currentIsBusiness) {
      return send(403, { error: 'forbidden', message: 'No tenés permisos para esta sección' })
    }
  }
  if (method === 'GET' && path === '/api/settings') {
    await sleep(150)
    return send(200, { email: 'demo@guiaslocales.com', full_name: 'Nicolas Gallucci', logo_url: null })
  }
  if (method === 'PATCH' && path === '/api/auth/password') {
    await sleep(400)
    if (String(body.current_password || '') !== 'demo1234') {
      return send(401, { error: 'invalid_password', message: 'La contraseña actual no es correcta' })
    }
    return send(200, { status: 'ok' })
  }
  if (method === 'POST' && path === '/api/settings/logo') {
    await sleep(500)
    return send(200, { logo_url: 'mock://logo.png' })
  }
  if (method === 'GET' && path === '/api/settings/scrapfly') {
    await sleep(150)
    return send(200, { api_key: mockScrapflyKey })
  }
  if (method === 'PUT' && path === '/api/settings/scrapfly') {
    await sleep(400)
    const apiKey = String(body.api_key || '').trim()
    if (!apiKey) return send(400, { error: 'bad_request', message: 'El token de Scrapfly es obligatorio' })
    mockScrapflyKey = apiKey
    return send(200, { status: 'ok' })
  }

  // ── Notificaciones (business-only) ──
  if (path.startsWith('/api/notifications')) {
    if (!currentIsBusiness) {
      return send(403, { error: 'forbidden', message: 'No tenés permisos para esta sección' })
    }
  }
  if (method === 'GET' && path === '/api/notifications/settings') {
    await sleep(200)
    return send(200, JSON.parse(JSON.stringify(mockNotifSettings)))
  }
  if (method === 'PUT' && path === '/api/notifications/settings') {
    await sleep(400)
    const wa = Array.isArray(body.whatsapp_contacts) ? body.whatsapp_contacts : mockNotifSettings.whatsapp_contacts
    const tg = Array.isArray(body.telegram_contacts) ? body.telegram_contacts : mockNotifSettings.telegram_contacts
    const events = (body.events ?? mockNotifSettings.events) as typeof mockNotifSettings.events
    mockNotifSettings = {
      whatsapp_contacts: JSON.parse(JSON.stringify(wa)),
      telegram_contacts: JSON.parse(JSON.stringify(tg)),
      events: JSON.parse(JSON.stringify(events)),
    }
    return send(200, { status: 'ok' })
  }
  if (method === 'POST' && path === '/api/notifications/test') {
    await sleep(900)
    const channel = String(body.channel || '')
    const contact = (body.contact ?? {}) as { destination?: string }
    let dest = typeof contact.destination === 'string' ? contact.destination.trim() : ''
    if (!dest) {
      const list = channel === 'whatsapp' ? mockNotifSettings.whatsapp_contacts : mockNotifSettings.telegram_contacts
      dest = list.find((c) => c.enabled)?.destination ?? ''
    }
    if (!dest) {
      return send(400, {
        error: 'missing_destination',
        message: channel === 'whatsapp'
          ? 'Configurá un contacto de WhatsApp antes de enviar una prueba'
          : 'Configurá un contacto de Telegram antes de enviar una prueba',
      })
    }
    // Mock: los destinos terminados en "00" simulan un rechazo del proveedor.
    if (dest.replace(/\D/g, '').endsWith('00')) {
      return send(502, {
        error: 'send_failed',
        message: channel === 'whatsapp'
          ? 'WhatsApp rechazó el envío: el número no tiene una cuenta activa.'
          : 'Telegram rechazó el envío: este chat todavía no le escribió al bot.',
      })
    }
    return send(200, { status: 'ok' })
  }

  // ── Costos de venta ML ──
  if (method === 'GET' && path === '/api/mercadolibre/selling-costs') {
    await sleep(300)
    const productId = Number(url.searchParams.get('product_id'))
    const listing = db.mlListings.get(productId)
    if (!listing) return send(200, { costs: null })
    return send(200, { costs: null })
  }

  // ── Prepublicar ──
  const prepubMatch = path.match(/^\/api\/inventory\/products\/(\d+)\/prepublish$/)
  if (prepubMatch && method === 'POST') {
    await sleep(1000)
    const id = Number(prepubMatch[1])
    const product = db.products.find((p) => p.id === id)
    if (!product) return send(404, { error: 'not_found' })
    const filled: string[] = []
    if (!product.name_edited) {
      product.name_edited = product.name.slice(0, 60)
      filled.push('name_edited')
    }
    if (!product.description) {
      product.description = `${product.name}. Producto de calidad premium, ideal para uso diario. Envío rápido y garantía incluida.`
      filled.push('description')
    }
    if (!product.brand) {
      product.brand = 'Genérico'
      filled.push('brand')
    }
    if (!product.model) {
      product.model = `${product.internal_code}-STD`
      filled.push('model')
    }
    return send(200, { product: productOut(product), filled })
  }

  // ── Publicaciones por canal (Inventario > MercadoLibre / Tienda Nube) ──
  const listingStatusOf = (p: (typeof db.products)[number], platform: 'ml' | 'tn'): ChannelStatus =>
    platform === 'ml' ? p.ml_status : p.tn_status
  const isListed = (s: ChannelStatus) => s === 'published' || s === 'paused' || s === 'prepublished'

  const listingsHandler = (platform: 'ml' | 'tn') => {
    if (method !== 'GET') return false
    const pathName = platform === 'ml' ? '/api/mercadolibre/listings' : '/api/tiendanube/listings'
    if (path !== pathName) return false
    void sleep()
    const q = (url.searchParams.get('q') || '').toLowerCase()
    const status = url.searchParams.get('status') || ''
    const perf = url.searchParams.get('perf') || ''
    const category = url.searchParams.get('category') || ''
    const page = Math.max(1, Number(url.searchParams.get('page') || 1))
    const pageSize = Math.min(200, Number(url.searchParams.get('page_size') || 50))

    const all = db.products.filter((p) => isListed(listingStatusOf(p, platform)))
    const items = all.filter((p) => {
      const s = listingStatusOf(p, platform)
      if (q && !`${p.name} ${p.name_edited ?? ''} ${p.internal_code} ${p.sku}`.toLowerCase().includes(q)) return false
      if (status && s !== status) return false
      if (category && p.category !== category) return false
      if (platform === 'ml' && perf) {
        const score = listingScore(p)
        if (perf === 'high' && score < 80) return false
        if (perf === 'mid' && (score < 50 || score >= 80)) return false
        if (perf === 'low' && score >= 50) return false
      }
      return true
    })

    const summary = {
      listed: all.length,
      published: all.filter((p) => listingStatusOf(p, platform) === 'published').length,
      paused: all.filter((p) => listingStatusOf(p, platform) === 'paused').length,
      avg_perf: platform === 'ml'
        ? (() => {
            const scored = all.filter((p) => listingStatusOf(p, platform) !== 'prepublished')
            if (!scored.length) return null
            return Math.round(scored.reduce((a, p) => a + listingScore(p), 0) / scored.length)
          })()
        : null,
    }

    const total = items.length
    const pages = Math.ceil(total / pageSize)
    const slice = items.slice((page - 1) * pageSize, page * pageSize)
    const rows = slice.map((p) => {
      const mlListing = db.mlListings.get(p.id)
      const tnListing = db.tnListings.get(p.id)
      const base = {
        id: p.id,
        internal_code: p.internal_code,
        sku: p.sku,
        name: p.name,
        name_edited: p.name_edited,
        category: p.category,
        stock: p.stock,
        cost: p.cost,
        price: p.price,
        image_url: db.images.get(p.id)?.[0]?.url ?? null,
        updated_at: p.updated_at,
        status: listingStatusOf(p, platform),
      }
      if (platform === 'ml') {
        const score = p.ml_status === 'prepublished' ? null : listingScore(p)
        const cat = (mlListing as unknown as Record<string, unknown> | undefined)?.catalog_product_id ?? null
        const listingPrice = mlListing?.price ?? p.price
        const suggested = p.id % 2 === 0 ? Math.round(listingPrice * 0.93) : null
        return {
          ...base,
          external_id: mlListing?.external_id ?? null,
          account_id: 10,
          listing_price: listingPrice,
          permalink: mlListing?.permalink ?? null,
          reason: null,
          brand: p.brand ?? null,
          model: p.model ?? null,
          listing_updated_at: mlListing?.updated_at ?? '2025-09-26 10:00:00',
          price_manually_changed: false,
          catalog_listing: Boolean(cat),
          catalog_product_id: (cat as string | null) ?? null,
          marketplace_item_id: ((mlListing as unknown as Record<string, unknown> | undefined)?.marketplace_item_id as string | null) ?? null,
          marketplace_status: ((mlListing as unknown as Record<string, unknown> | undefined)?.marketplace_status as string | null) ?? null,
          perf_score: score,
          perf_level: score === null ? null : score >= 80 ? 'Óptimo' : score >= 50 ? 'Estándar' : 'Básico',
          selling_cost: score === null ? null : mockSellingCost(mlListing?.price ?? p.price),
          total_selling_cost: score === null ? null : mockSellingCost(listingPrice) / 1.21,
          percentage_fee: score === null ? null : Math.round(listingPrice * 14.5) / 100,
          ship_list_cost: score === null ? null : 0,
          suggested_price: suggested,
          suggested_current_price: suggested != null ? listingPrice : null,
          suggested_status: suggested != null ? 'with_benchmark_high' : null,
        }
      }
      return {
        ...base,
        external_id: tnListing?.external_id ?? null,
        account_id: 11,
        listing_price: tnListing?.price ?? p.price,
        permalink: tnListing?.permalink ?? null,
        listing_updated_at: tnListing?.updated_at ?? '2025-09-26 10:00:00',
      }
    })
    send(200, { items: rows, summary, total, page, page_size: pageSize, pages })
    return true
  }
  if (listingsHandler('ml')) return
  if (listingsHandler('tn')) return

  // ── Envíos de MercadoLibre ──
  if (method === 'GET' && path === '/api/mercadolibre/shipments') {
    await sleep(400)
    return send(200, { items: MOCK_SHIPMENTS })
  }

  // ── Descargar fotos de la publicación ML (meli_pictures) ──
  if (method === 'POST' && path === '/api/mercadolibre/pictures') {
    await sleep(1300)
    const productId = Number(body.product_id)
    const product = db.products.find((p) => p.id === productId)
    if (!product) return send(404, { error: 'not_found' })
    const existing = db.images.get(productId) ?? []
    if (existing.length >= 10) {
      return send(400, { error: 'no_new_pictures', message: 'No hay fotos nuevas para descargar' })
    }
    const saved: { id: number; url: string }[] = []
    for (let n = 1; n <= 3 && existing.length + saved.length < 10; n++) {
      const image = { id: db.imageSeq++, url: `mock://image/${productId}/ml-${existing.length + saved.length + 1}` }
      saved.push(image)
    }
    db.images.set(productId, [...existing, ...saved])
    return send(201, { saved: saved.length, images: saved })
  }

  // ── Credenciales de integración (business-only) ──
  const meliCredsMatch = path === '/api/mercadolibre/credentials'
  const tnCredsMatch = path === '/api/tiendanube/credentials'
  if (meliCredsMatch || tnCredsMatch) {
    if (!currentIsBusiness) {
      return send(403, { error: 'forbidden', message: 'No tenés permisos para esta sección' })
    }
    if (meliCredsMatch) {
      if (method === 'GET') {
        await sleep(200)
        return send(200, {
          account_id: 10,
          connected: Boolean(mockMeliCreds.access_token),
          ...mockMeliCreds,
        })
      }
      if (method === 'PUT') {
        await sleep(400)
        mockMeliCreds.client_id = String(body.client_id || '')
        mockMeliCreds.client_secret = String(body.client_secret || '')
        if (String(body.user_id || '').trim()) {
          mockMeliCreds.external_account_id = String(body.user_id).trim()
        }
        return send(200, { status: 'ok' })
      }
    } else {
      if (method === 'GET') {
        await sleep(200)
        return send(200, {
          account_id: 11,
          connected: Boolean(mockTnCreds.access_token),
          ...mockTnCreds,
        })
      }
      if (method === 'PUT') {
        await sleep(400)
        mockTnCreds.url = String(body.url || '')
        return send(200, { status: 'ok' })
      }
    }
  }

  // ── Precio local del listing (sin push a la plataforma) ──
  if (method === 'PATCH' && path === '/api/mercadolibre/price') {
    await sleep(300)
    const productId = Number(body.product_id)
    const l = db.mlListings.get(productId)
    if (!l) return send(404, { error: 'not_found', message: 'Producto no encontrado' })
    const price = Number(body.price)
    if (!Number.isFinite(price) || price < 0) return send(400, { error: 'bad_request', message: 'El precio debe ser numérico' })
    l.price = price
    return send(200, { status: 'ok', price, price_manually_changed: true })
  }
  if (method === 'PATCH' && path === '/api/tiendanube/price') {
    await sleep(300)
    const productId = Number(body.product_id)
    const l = db.tnListings.get(productId)
    if (!l) return send(404, { error: 'not_found', message: 'Producto no encontrado' })
    const price = Number(body.price)
    if (!Number.isFinite(price) || price < 0) return send(400, { error: 'bad_request', message: 'El precio debe ser numérico' })
    l.price = price
    return send(200, { status: 'ok', price, price_manually_changed: true })
  }

  // ── Catálogo ML: search / eligibility / optin / optout ──
  if (method === 'GET' && path === '/api/mercadolibre/catalog/search') {
    await sleep(400)
    const q = String(url.searchParams.get('q') || '').toLowerCase()
    const gtin = String(url.searchParams.get('product_identifier') || '').toLowerCase()
    const items = MOCK_CATALOG_PRODUCTS.filter(
      (c) => !q && !gtin ? false : (
        (q && c.name.toLowerCase().includes(q)) ||
        (gtin && gtin.length > 0 && c.id.toLowerCase().includes(gtin))
      ),
    )
    return send(200, { items, total: items.length })
  }
  if (method === 'GET' && path === '/api/mercadolibre/catalog/competition') {
    await sleep(400)
    const productId = Number(url.searchParams.get('product_id'))
    const l = db.mlListings.get(productId)
    if (!l) return send(400, { error: 'bad_request', message: 'El producto todavía no está publicado' })
    const rec = l as unknown as Record<string, unknown>
    if (!rec.catalog_product_id) {
      return send(409, { error: 'not_catalog', message: 'El producto no está vinculado al catálogo' })
    }
    const price = l.price ?? 10000
    const losing = productId % 3 === 1
    return send(200, {
      status: losing ? 'competing' : 'winning',
      current_price: price,
      currency_id: 'ARS',
      price_to_win: losing ? Math.round(price * 0.93) : null,
      visit_share: losing ? 'medium' : 'maximum',
      competitors_sharing_first_place: losing ? 1 : 0,
      reason: [],
      catalog_product_id: rec.catalog_product_id,
      winner: losing ? { item_id: 'MLA765432', price: Math.round(price * 0.93), currency_id: 'ARS' } : null,
      boosts: [
        { id: 'free_shipping', status: 'boosted', description: 'Envíos gratis por Mercado Envíos' },
        { id: 'fulfillment', status: losing ? 'opportunity' : 'boosted', description: 'Mercado Envíos Full' },
        { id: 'free_installments', status: 'opportunity', description: 'Cuotas sin interés' },
      ],
    })
  }
  if (method === 'GET' && path === '/api/mercadolibre/catalog/eligibility') {
    await sleep(400)
    const productId = Number(url.searchParams.get('product_id'))
    const l = db.mlListings.get(productId)
    if (!l) return send(400, { error: 'bad_request', message: 'El producto todavía no está publicado' })
    const isCatalog = Boolean((l as unknown as Record<string, unknown>).catalog_product_id)
    const notEligible = productId % 5 === 0 && !isCatalog
    return send(200, {
      id: l.external_id ?? null,
      status: isCatalog ? 'ALREADY_OPTED_IN' : notEligible ? 'NOT_ELIGIBLE' : 'READY_FOR_OPTIN',
      buy_box_eligible: !notEligible,
      reason: notEligible ? 'MercadoLibre todavía no tiene una ficha de catálogo para este producto.' : null,
    })
  }
  if (method === 'POST' && path === '/api/mercadolibre/catalog/optin') {
    await sleep(900)
    const productId = Number(body.product_id)
    const l = db.mlListings.get(productId)
    if (!l) return send(400, { error: 'bad_request', message: 'El producto todavía no está publicado' })
    const rec = l as unknown as Record<string, unknown>
    if (rec.catalog_product_id) {
      return send(409, { error: 'already_catalog', message: 'El producto ya está vinculado al catálogo' })
    }
    const old = l.external_id
    rec.marketplace_item_id = old
    rec.marketplace_status = 'active'
    rec.catalog_product_id = String(body.catalog_product_id || '')
    l.external_id = `MLA${2100000000 + productId * 13}`
    return send(200, { status: 'ok', external_id: l.external_id, catalog_product_id: rec.catalog_product_id, marketplace_item_id: old })
  }
  if (method === 'POST' && path === '/api/mercadolibre/catalog/optout') {
    await sleep(900)
    const productId = Number(body.product_id)
    const l = db.mlListings.get(productId)
    if (!l) return send(400, { error: 'bad_request', message: 'El producto no está publicado' })
    const rec = l as unknown as Record<string, unknown>
    if (!rec.catalog_product_id) {
      return send(409, { error: 'not_catalog', message: 'El producto no está vinculado al catálogo' })
    }
    if (!rec.marketplace_item_id) {
      return send(400, { error: 'no_marketplace_item', message: 'Esta publicación nació en el catálogo y no tiene una publicación tradicional a la que volver. Para venderla como tradicional tenés que publicarla de nuevo.' })
    }
    l.external_id = String(rec.marketplace_item_id)
    rec.marketplace_item_id = null
    rec.marketplace_status = null
    rec.catalog_product_id = null
    return send(200, { status: 'ok', external_id: l.external_id })
  }

  // ── Tickets de soporte ──
  if (method === 'POST' && path === '/api/support/tickets') {
    await sleep(500)
    const subject = String(body.subject || '').trim()
    const description = String(body.description || '').trim()
    if (!subject || !description) {
      return send(400, { error: 'bad_request', message: 'El asunto y la descripción son obligatorios' })
    }
    return send(201, { id: Math.floor(1000 + Math.random() * 9000) })
  }

  return json(res, 404, { error: 'not_found', message: `Mock: ${method} ${path} no implementado` })
}
