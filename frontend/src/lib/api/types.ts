// Domain types mirroring the DB schemas + the Figma statuses.

export type ChannelStatus = 'unpublished' | 'prepublished' | 'under_review' | 'published' | 'paused' | 'failed'
export type Platform = 'mercadolibre' | 'tiendanube'

export interface User {
  id: number
  business_id: number
  role: 'business' | 'employee'
  email: string
  full_name: string
}

export interface Account {
  id: number
  platform: Platform
  external_account_id: string
  name: string
  has_credentials: number
}

export interface Product {
  id: number
  internal_code: string | null
  sku: string | null
  name: string
  name_edited: string | null
  brand: string | null
  category: string | null
  stock: number
  cost: number
  price: number
  updated_at: string
  ml_status: ChannelStatus
  tn_status: ChannelStatus
  image_url: string | null
  // Campos extra (el listado ya los incluye)
  gtin?: string | null
  model?: string | null
  dimensions?: string | null
  created_at?: string | null
  ml_price?: number | null
  tn_price?: number | null
  ml_price_manual?: boolean
  ml_price_updated?: string | null
  tn_price_manual?: boolean
  tn_price_updated?: string | null
  // Detail-only fields
  description?: string | null
  drive_url?: string | null
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface ProductImage {
  id: number
  url: string
}

export interface ProductVariation {
  id: number
  sku: string | null
  gtin: string | null
  price: number | null
  cost: number | null
  stock: number
}

export interface ProductListing {
  id: number
  platform: Platform
  account_id: number
  account_name: string | null
  external_id: string | null
  price: number | null
  status: ChannelStatus
  db_status: string | null
  reason: string | null
  remedy: string | null
  permalink: string | null
  // Catálogo: true cuando la publicación está vinculada a un producto estándar.
  catalog_listing: boolean
  catalog_product_id: string | null
  marketplace_item_id: string | null
  marketplace_status: string | null
  created_at: string | null
  updated_at: string | null
}

export interface StockMovement {
  id: number
  account_id: number
  order_id: string
  direction: 'sale' | 'reversal'
  quantity: number
  unit_price: number | null
  target_system: string | null
  provider_doc_id: string | null
  status: string
  error_message: string | null
  created_at: string
}

export interface ProductDetail {
  product: Product
  images: ProductImage[]
  variations: ProductVariation[]
  listings: ProductListing[]
  movements: StockMovement[]
}

export interface MLCategory {
  id: string
  category_name: string
  domain_id?: string
  domain_name?: string
}

export interface MLListingType {
  id: string
  name: string
  sale_fee: number
  pct: number
  meli_pct: number
  financing: number
  fixed: number
}

export interface MLSettings {
  category_id: string | null
  settings: MLSettingsGroup[]
}

export interface MLSettingsItem {
  id: string
  name?: string
  value_type?: string
  user_input_value?: unknown
  values?: unknown
  value_examples?: unknown
  // Flags del builder de settings: required = Meli rechaza la publicación si
  // viaja vacío; catalog_required = recomendado para calificar al catálogo.
  required?: boolean
  catalog_required?: boolean
}

export type MLSettingsGroup = {
  attributes?: MLSettingsItem[]
  shipping?: MLSettingsItem[]
  sale_terms?: MLSettingsItem[]
  listing?: MLSettingsItem[]
}

export interface MLConfig {
  category_id?: string
  // Genérico: {item_id: valor} para TODOS los atributos del wizard dinámico.
  attributes?: Record<string, string>
  // Compat con el formato anterior (claves conocidas).
  iva?: string
  import_duty?: string
  is_kit?: boolean
  mode?: string
  logistic_type?: string
  local_pickup?: boolean
  free_shipping?: boolean
  warranty_type?: string
  warranty_time?: string
  listing_type?: string
  // Catálogo: producto estándar elegido en el matching del wizard. El backend
  // lo persiste antes del POST /items (catalog_product_id + catalog_listing).
  catalog_product_id?: string
}

// ─── Catálogo de MercadoLibre ────────────────────────────────────────────────

export interface CatalogAttribute {
  id: string
  name?: string
  value_id?: string | null
  value_name?: string | null
}

export interface CatalogProduct {
  id: string
  name: string
  domain_id: string | null
  status: string | null
  listing_strategy: string | null
  attributes: CatalogAttribute[]
}

export interface CatalogBoost {
  id: string
  status: string | null
  description: string | null
}

export interface CatalogCompetition {
  status: string | null
  current_price: number | null
  price_to_win: number | null
  currency_id: string | null
  visit_share: string | null
  competitors_sharing_first_place: number | null
  reason: string[] | null
  catalog_product_id: string | null
  winner: { item_id: string | null; price: number | null; currency_id: string | null } | null
  boosts: CatalogBoost[]
}

export interface CatalogEligibility {
  id: string | null
  status: string | null
  buy_box_eligible: boolean | null
  reason: string | null
  variations?: unknown
}

export interface TNSettings {
  settings: Record<string, { DEFAULT_VALUE: unknown; USER_INPUT_VALUE: unknown }>
}

export interface TNConfig {
  free_shipping?: string | boolean
  promo_price?: string
  age_group?: string
  gender?: string
  mpn?: string
  barcode?: string
  tags?: string
  video_url?: string
  seo_title?: string
  seo_description?: string
}

// MercadoLibre item health (mercadolibre.performance table)
export interface PerfRule {
  status: 'COMPLETED' | 'PENDING'
  label: string
  title: string
  link: string
}

export interface PerfVariable {
  key: string
  score: number
  title: string
  status: 'COMPLETED' | 'PENDING'
  rule: PerfRule
}

export interface PerfBucket {
  key: string
  title: string
  score: number
  variables: PerfVariable[]
}

export interface MLPerformance {
  score: number | null
  level: string | null
  level_wording: string | null
  updated_at: string | null
  buckets: PerfBucket[]
}

export interface ChannelActionResult {
  status: ChannelStatus
  external_id: string | null
  db_status: string | null
  reason: string | null
  remedy: string | null
  permalink: string | null
  // Estado REAL de Meli tras la acción (sincronizado por el backend):
  // 'under_review' = Meli está moderando y el cambio de estado se aplicará
  // cuando termine la revisión.
  meli_status?: string | null
  sub_status?: string[]
  catalog_listing?: boolean
  catalog_product_id?: string | null
  marketplace_item_id?: string | null
  marketplace_status?: string | null
}

export type InventoryQuery = {
  q?: string
  category?: string
  ml_status?: ChannelStatus | ''
  tn_status?: ChannelStatus | ''
  channel?: 'ml' | 'tn' | ''
  stock?: 'in' | 'out' | ''
  page?: number
  page_size?: number
}

// ─── Mensajes de MercadoLibre (Preguntas · Atención al cliente) ──────────────

export type MsgKind = 'question' | 'post_sale'
export type ReplyStatus = 'new' | 'ai_suggested' | 'needs_review' | 'answered' | 'closed'
export type AiMode = 'off' | 'suggest' | 'autopilot'
export type MsgListingStatus = 'published' | 'paused' | 'unpublished' | 'failed'

export interface MsgListItem {
  id: string
  kind: MsgKind
  buyer_name: string
  product_title: string
  last_text: string
  reply_status: ReplyStatus
  assigned_to: string | null
  ai_confidence: number | null
  created_at: string
  last_activity: string
  listing_id: string
  last_reply_mode: 'ai' | 'human' | null
  ml_url: string
}

export interface MsgReply {
  author: 'buyer' | 'seller'
  mode: 'ai' | 'human' | null
  text: string
  status: 'received' | 'sent' | 'failed' | 'draft'
  audit_verdict: 'approved' | 'corrected' | null
  audit_score: number | null
  audit_issues: string[]
  created_at: string
  cited_products?: { title: string; price: number; stock: number }[]
}

export interface MsgDetail {
  message: MsgListItem & {
    product_id: number | null
    answered_externally: boolean
    closed_reason: string | null
    review_reason: string | null
    ai_error: string | null
  }
  replies: MsgReply[]
  product: { title: string; price: number; stock: number; listing_status: MsgListingStatus }
}

export interface MsgListResponse {
  items: MsgListItem[]
  page: number
  page_size: number
  total: number
  counts: {
    question: Record<ReplyStatus, number> & { total: number }
    post_sale: Record<ReplyStatus, number> & { total: number }
  }
}

export interface CsSettings {
  mode: AiMode
  min_confidence: number // 0-100
  audit: boolean
}

// ─── Administración ──────────────────────────────────────────────────────────

export interface Employee {
  id: number
  full_name: string
  email: string
  active: boolean
  created_at: string
}

export interface PromptsResponse {
  prompts: Record<string, string>
  supported: string[]
  settings: CsSettings
  message?: string
}

export interface SettingsInfo {
  email: string
  full_name: string
  logo_url: string | null
}

// ─── Notificaciones (Configuración) ───────────────────────────────────────────

export type NotificationEventKey =
  | 'order_confirmed'
  | 'order_cancelled'
  | 'order_delivered'
  | 'label_ready'
  | 'scraping_finished'
  | 'message_needs_review'

export interface NotificationEventSetting {
  whatsapp: boolean
  telegram: boolean
}

export type NotifChannel = 'whatsapp' | 'telegram'

export interface NotificationContact {
  id: string
  label: string
  destination: string
  enabled: boolean
}

export interface NotificationSettings {
  whatsapp_contacts: NotificationContact[]
  telegram_contacts: NotificationContact[]
  events: Record<NotificationEventKey, NotificationEventSetting>
}

export interface ScrapflySettings {
  api_key: string | null
}

export interface ImsSettingsInfo {
  provider: string
  config: Record<string, string>
}

export interface ImsTestResult {
  ok: boolean
  message: string
}

export interface MLSellingCosts {
  price: number | null
  sale_fee_amount: number | null
  sale_fixed_fee: number | null
  financing_add_on_fee: number | null
  meli_percentage_fee: number | null
  percentage_fee: number | null
  gross_amount: number | null
  listing_fixed_fee: number | null
  fee_tax: number | null
  ship_list_cost: number | null
  total_selling_cost: number | null
  total_selling_cost_with_tax: number | null
  created_at: string | null
}

export interface PrepublishResult {
  product: Product
  filled: string[]
}

// ─── Publicaciones por canal (vistas Inventario > MercadoLibre / Tienda Nube) ──

export interface MLListingRow {
  id: number
  internal_code: string | null
  sku: string | null
  name: string
  name_edited: string | null
  category: string | null
  stock: number
  cost: number
  price: number
  image_url: string | null
  updated_at: string
  external_id: string | null
  account_id: number
  listing_price: number | null
  permalink: string | null
  status: ChannelStatus
  reason: string | null
  brand: string | null
  model: string | null
  listing_updated_at: string | null
  price_manually_changed: boolean
  catalog_listing: boolean
  catalog_product_id: string | null
  marketplace_item_id: string | null
  marketplace_status: string | null
  perf_score: number | null
  perf_level: string | null
  selling_cost: number | null
  total_selling_cost: number | null
  percentage_fee: number | null
  ship_list_cost: number | null
  suggested_price: number | null
  suggested_current_price: number | null
  suggested_status: string | null
}

export interface TNListingRow {
  id: number
  internal_code: string | null
  sku: string | null
  name: string
  name_edited: string | null
  category: string | null
  stock: number
  cost: number
  price: number
  image_url: string | null
  updated_at: string
  external_id: string | null
  account_id: number
  listing_price: number | null
  permalink: string | null
  status: ChannelStatus
  listing_updated_at: string | null
}

export interface ListingSummary {
  listed: number
  published: number
  paused: number
  avg_perf: number | null
}

export interface ListingsResponse<T> extends Paginated<T> {
  summary: ListingSummary
}

export type ListingQuery = {
  q?: string
  status?: '' | 'published' | 'paused' | 'prepublished' | 'under_review'
  perf?: '' | 'high' | 'mid' | 'low'
  category?: string
  page?: number
  page_size?: number
}

// ─── Envíos de MercadoLibre (mercadolibre.shipments) ─────────────────────────

export interface ShipmentItem {
  id: string
  title: string
  quantity: number
}

export interface ShipmentReceiver {
  city: string
  state: string
  zip_code: string
}

export interface Shipment {
  external_id: string
  order_id: string | null
  status: string
  substatus: string | null
  tracking_number: string | null
  logistic_type: string
  mode: string
  receiver: ShipmentReceiver
  items: ShipmentItem[]
  last_updated: string
}

export interface ShipmentSummary {
  pending: number
  on_way: number
  delivered: number
  issues: number
}

export interface ShipmentsResponse {
  items: Shipment[]
  total: number
  page: number
  page_size: number
  summary: ShipmentSummary
}

// ─── Credenciales de integración (Configuración) ─────────────────────────────

export interface MLCredentials {
  account_id: number | null
  connected: boolean
  client_id: string | null
  client_secret: string | null
  external_account_id: string | null
  access_token: string | null
  refresh_token: string | null
  code: string | null
  expires_at: string | null
  redirect_uri: string
}

export interface TNCredentials {
  account_id: number | null
  connected: boolean
  client_id: string | null
  url: string | null
  access_token: string | null
  // ID de la tienda (user_id del OAuth); la API lo usa en la URL /v1/{id}/...
  external_account_id: string | null
}
