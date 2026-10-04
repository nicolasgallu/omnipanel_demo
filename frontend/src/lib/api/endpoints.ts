// Endpoint groups — one function per backend route.

import { api, apiBlob, queryString } from './client'
import type {
  Account,
  CatalogCompetition,
  CatalogEligibility,
  CatalogProduct,
  ChannelActionResult,
  ChannelStatus,
  Employee,
  InventoryQuery,
  ImsSettingsInfo,
  ImsTestResult,
  ListingsResponse,
  ListingQuery,
  MLCategory,
  MLConfig,
  MLCredentials,
  MLListingRow,
  MLListingType,
  MLPerformance,
  MLSellingCosts,
  MLSettings,
  SizeGridMeasure,
  MsgDetail,
  MsgListResponse,
  MsgReply,
  NotifChannel,
  NotificationContact,
  NotificationSettings,
  Paginated,
  PrepublishResult,
  Product,
  ProductDetail,
  ProductImage,
  PromptsResponse,
  ScrapflySettings,
  SettingsInfo,
  TNConfig,
  TNCredentials,
  TNListingRow,
  TNSettings,
  User,
  CsSettings,
  MsgKind,
  ReplyStatus,
  SalesOrderDetail,
  SalesQuery,
  SalesReport,
  ReportQuery,
  SalesResponse,
  ShipmentsQuery,
  ShipmentsResponse,
} from './types'

export const authApi = {
  login: (email: string, password: string) =>
    api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  me: () => api<{ user: User }>('/api/auth/me'),
}

export const inventoryApi = {
  list: (params: InventoryQuery) =>
    api<Paginated<Product>>(`/api/inventory/products${queryString(params)}`),

  categories: () => api<{ items: string[] }>('/api/inventory/categories'),

  exportCsv: (params: {
    columns: string
    limit: number
    q?: string
    category?: string
    ml_status?: string
    tn_status?: string
    channel?: string
    stock?: string
  }) => apiBlob(`/api/inventory/products/export.csv${queryString(params)}`),

  get: (id: number) => api<ProductDetail>(`/api/inventory/products/${id}`),

  channelStatuses: () =>
    api<{ statuses: { value: ChannelStatus; label: string }[] }>('/api/inventory/channel-statuses'),

  patch: (id: number, body: { title?: string; description?: string; brand?: string; model?: string; price?: number; dimensions_cm_g?: object }) =>
    api<{ product: Product }>(`/api/inventory/products/${id}`, {
      method: 'PATCH',
      body,
    }),

  remove: (id: number) => api<void>(`/api/inventory/products/${id}`, { method: 'DELETE' }),

  uploadImage: (id: number, file: Blob, filename: string) => {
    const form = new FormData()
    form.append('file', file, filename)
    return api<ProductImage>(`/api/inventory/products/${id}/images`, {
      method: 'POST',
      form,
    })
  },

  removeImage: (productId: number, imageId: number) =>
    api<void>(`/api/inventory/products/${productId}/images/${imageId}`, {
      method: 'DELETE',
    }),

  prepublish: (id: number) =>
    api<PrepublishResult>(`/api/inventory/products/${id}/prepublish`, {
      method: 'POST',
      body: {},
    }),
}

export const aiApi = {
  generate: (kind: 'title' | 'description', prompt: string, current?: string) =>
    api<{ text: string }>('/api/ai/generate', {
      method: 'POST',
      body: { kind, prompt, current },
    }),
  getPrompts: () => api<PromptsResponse>('/api/ai/prompts'),
  savePrompts: (prompts?: Record<string, string>, settings?: CsSettings) =>
    api<PromptsResponse>('/api/ai/prompts', {
      method: 'PUT',
      body: {
        ...(prompts !== undefined ? { prompts } : {}),
        ...(settings !== undefined ? { settings } : {}),
      },
    }),
}

export const adminApi = {
  employees: () => api<{ items: Employee[] }>('/api/employees'),
  createEmployee: (body: { full_name: string; email: string; password: string }) =>
    api<{ id: number }>('/api/employees', { method: 'POST', body }),
  toggleEmployee: (id: number, active: boolean) =>
    api<{ id: number; active: boolean }>(`/api/employees/${id}`, {
      method: 'PATCH',
      body: { active },
    }),
  settings: () => api<SettingsInfo>('/api/settings'),
  scrapfly: () => api<ScrapflySettings>('/api/settings/scrapfly'),
  saveScrapfly: (api_key: string) =>
    api<{ status: string }>('/api/settings/scrapfly', {
      method: 'PUT',
      body: { api_key },
    }),
  imsSettings: () => api<ImsSettingsInfo>('/api/settings/stock-sync'),
  imsSave: (body: { provider: string; config: Record<string, string> }) =>
    api<{ status: string }>('/api/settings/stock-sync', {
      method: 'POST',
      body,
    }),
  imsTrigger: (trigger: 'paid' | 'confirmed') =>
    api<{ status: string; trigger: string }>('/api/settings/stock-sync/trigger', {
      method: 'PATCH',
      body: { trigger },
    }),
  imsTest: (body: { provider: string; config: Record<string, string> }) =>
    api<ImsTestResult>('/api/settings/stock-sync/test', {
      method: 'POST',
      body,
    }),
  changePassword: (current_password: string, new_password: string) =>
    api<{ status: string }>('/api/auth/password', {
      method: 'PATCH',
      body: { current_password, new_password },
    }),
  uploadLogo: (file: Blob) => {
    const form = new FormData()
    form.append('file', file, 'logo.png')
    return api<{ logo_url: string }>('/api/settings/logo', { method: 'POST', form })
  },
}

export const notificationsApi = {
  settings: () => api<NotificationSettings>('/api/notifications/settings'),
  saveSettings: (settings: NotificationSettings) =>
    api<{ status: string }>('/api/notifications/settings', {
      method: 'PUT',
      body: settings,
    }),
  test: (
    channel: NotifChannel,
    contact: Pick<NotificationContact, 'destination'>,
  ) =>
    api<{ status: string }>('/api/notifications/test', {
      method: 'POST',
      body: { channel, contact },
    }),
}

// ─── Mensajes de MercadoLibre (Preguntas · Atención al cliente) ──────────────

export const messagesApi = {
  list: (params: {
    kind: MsgKind
    reply_status: ReplyStatus[]
    q: string
    page: number
    page_size: number
  }) =>
    api<MsgListResponse>(
      `/api/mercadolibre/messages${queryString({
        kind: params.kind,
        reply_status: params.reply_status.length
          ? params.reply_status.join(',')
          : undefined,
        q: params.q,
        page: params.page,
        page_size: params.page_size,
      })}`,
    ),
  get: (id: string) => api<MsgDetail>(`/api/mercadolibre/messages/${id}`),
  aiSuggest: (id: string) =>
    api<{ reply: MsgReply; audit: { verdict: 'approved' | 'corrected'; score: number; issues: string[] } }>(
      `/api/mercadolibre/messages/${id}/ai-suggest`,
      { method: 'POST' },
    ),
  improve: (id: string, text: string) =>
    api<{ text: string }>(`/api/mercadolibre/messages/${id}/improve`, {
      method: 'POST',
      body: { text },
    }),
  reply: (id: string, text: string) =>
    api<{ reply: MsgReply }>(`/api/mercadolibre/messages/${id}/reply`, {
      method: 'POST',
      body: { text },
    }),
  discardSuggestion: (id: string) =>
    api<{ ok: true }>(`/api/mercadolibre/messages/${id}/discard-suggestion`, {
      method: 'POST',
    }),
  assign: (id: string) =>
    api<{ assigned_to: string | null }>(`/api/mercadolibre/messages/${id}/assign`, {
      method: 'POST',
    }),
}

export const channelsApi = {
  accounts: () => api<{ items: Account[] }>('/api/accounts'),

  mlCategories: (q: string, accountId: number) =>
    api<{ items: MLCategory[] }>(
      `/api/mercadolibre/categories${queryString({ q, account_id: accountId })}`,
    ),

  mlListingPrices: (price: number, categoryId: string, accountId: number) =>
    api<{ items: MLListingType[] }>(
      `/api/mercadolibre/listing-prices${queryString({ price, category_id: categoryId, account_id: accountId })}`,
    ),

  mlSettings: (productId: number, accountId: number) =>
    api<MLSettings>(
      `/api/mercadolibre/settings${queryString({ product_id: productId, account_id: accountId })}`,
    ),

  mlSizeGridMeasures: (productId: number, accountId: number, gender: string) =>
    api<{ measures: SizeGridMeasure[] }>(
      `/api/mercadolibre/size-grid/measures${queryString({ product_id: productId, account_id: accountId, gender })}`,
    ),

  mlConfigure: (productId: number, accountId: number, categoryId: string, refresh = false) =>
    api<MLSettings>('/api/mercadolibre/configure', {
      method: 'POST',
      body: { product_id: productId, account_id: accountId, category_id: categoryId, refresh },
    }),

  mlPublish: (productId: number, accountId: number, config: MLConfig) =>
    api<ChannelActionResult>('/api/mercadolibre/publish', {
      method: 'POST',
      body: { product_id: productId, account_id: accountId, config },
    }),

  mlAction: (
    action: 'update' | 'pause' | 'delete',
    productId: number,
    accountId: number,
    config?: MLConfig,
  ) =>
    api<ChannelActionResult>(`/api/mercadolibre/${action}`, {
      method: 'POST',
      body: config
        ? { product_id: productId, account_id: accountId, config }
        : { product_id: productId, account_id: accountId },
    }),

  mlPerformance: (productId: number, accountId: number) =>
    api<MLPerformance>(
      `/api/mercadolibre/performance${queryString({ product_id: productId, account_id: accountId })}`,
    ),

  mlPerformanceRefresh: (productId: number, accountId: number) =>
    api<MLPerformance>('/api/mercadolibre/performance/refresh', {
      method: 'POST',
      body: { product_id: productId, account_id: accountId },
    }),

  mlSellingCosts: (productId: number, accountId: number) =>
    api<{ costs: MLSellingCosts | null }>(
      `/api/mercadolibre/selling-costs${queryString({ product_id: productId, account_id: accountId })}`,
    ),

  mlPrice: (productId: number, accountId: number, price: number) =>
    api<{ status: string; price: number; price_manually_changed: boolean }>(
      '/api/mercadolibre/price',
      { method: 'PATCH', body: { product_id: productId, account_id: accountId, price } },
    ),

  tnPrice: (productId: number, accountId: number, price: number) =>
    api<{ status: string; price: number; price_manually_changed: boolean }>(
      '/api/tiendanube/price',
      { method: 'PATCH', body: { product_id: productId, account_id: accountId, price } },
    ),

  mlListings: (params: ListingQuery) =>
    api<ListingsResponse<MLListingRow>>(`/api/mercadolibre/listings${queryString(params)}`),

  tnListings: (params: ListingQuery) =>
    api<ListingsResponse<TNListingRow>>(`/api/tiendanube/listings${queryString(params)}`),

  mlExportCsv: (params: { columns: string; limit: number; q?: string; status?: string; perf?: string; category?: string }) =>
    apiBlob(`/api/mercadolibre/listings/export.csv${queryString(params)}`),

  tnExportCsv: (params: { columns: string; limit: number; q?: string; status?: string; category?: string }) =>
    apiBlob(`/api/tiendanube/listings/export.csv${queryString(params)}`),

  shipmentLabel: (external_id: string) =>
    apiBlob('/api/mercadolibre/shipments/' + encodeURIComponent(external_id) + '/label'),

  mlPictures: (productId: number, accountId: number) =>
    api<{ saved: number; images: ProductImage[] }>('/api/mercadolibre/pictures', {
      method: 'POST',
      body: { product_id: productId, account_id: accountId },
    }),

  tnSettings: (productId: number, accountId: number) =>
    api<TNSettings>(
      `/api/tiendanube/settings${queryString({ product_id: productId, account_id: accountId })}`,
    ),

  tnPublish: (productId: number, accountId: number, config: TNConfig) =>
    api<ChannelActionResult>('/api/tiendanube/publish', {
      method: 'POST',
      body: { product_id: productId, account_id: accountId, config },
    }),

  tnAction: (action: 'update' | 'delete', productId: number, accountId: number, config?: TNConfig) =>
    api<ChannelActionResult>(`/api/tiendanube/${action}`, {
      method: 'POST',
      body: config
        ? { product_id: productId, account_id: accountId, config }
        : { product_id: productId, account_id: accountId },
    }),
}

export const credentialsApi = {
  meli: () => api<MLCredentials>('/api/mercadolibre/credentials'),
  saveMeli: (client_id: string, client_secret: string, user_id?: string) =>
    api<{ status: string }>('/api/mercadolibre/credentials', {
      method: 'PUT',
      body: { client_id, client_secret, user_id },
    }),
  tn: () => api<TNCredentials>('/api/tiendanube/credentials'),
  saveTn: (url: string) =>
    api<{ status: string }>('/api/tiendanube/credentials', {
      method: 'PUT',
      body: { url },
    }),
}

export const catalogApi = {
  search: (accountId: number, params: { q?: string; product_identifier?: string }) =>
    api<{ items: CatalogProduct[]; total: number }>(
      `/api/mercadolibre/catalog/search${queryString({ account_id: accountId, ...params })}`,
    ),
  competition: (productId: number, accountId: number) =>
    api<CatalogCompetition>(
      `/api/mercadolibre/catalog/competition${queryString({ product_id: productId, account_id: accountId })}`,
    ),
  eligibility: (productId: number, accountId: number) =>
    api<CatalogEligibility>(
      `/api/mercadolibre/catalog/eligibility${queryString({ product_id: productId, account_id: accountId })}`,
    ),
  optin: (productId: number, accountId: number, catalogProductId: string) =>
    api<{ status: string; external_id: string; catalog_product_id: string; marketplace_item_id: string }>(
      '/api/mercadolibre/catalog/optin',
      { method: 'POST', body: { product_id: productId, account_id: accountId, catalog_product_id: catalogProductId } },
    ),
  optout: (productId: number, accountId: number) =>
    api<{ status: string; external_id: string }>('/api/mercadolibre/catalog/optout', {
      method: 'POST',
      body: { product_id: productId, account_id: accountId },
    }),
}

export const supportApi = {
  createTicket: (subject: string, description: string, priority: string = 'normal') =>
    api<{ id: number }>('/api/support/tickets', {
      method: 'POST',
      body: { subject, description, priority },
    }),
}

// ─── Ventas (panel de órdenes ML + Tienda Nube) ──────────────────────────────

export const salesApi = {
  list: (query: SalesQuery) =>
    api<SalesResponse>(`/api/sales/orders${queryString(query)}`),

  get: (platform: 'mercadolibre' | 'tiendanube', orderId: string) =>
    api<SalesOrderDetail>(
      `/api/sales/orders/${platform}/${encodeURIComponent(orderId)}`,
    ),
}

// ─── Ventas › Reportes (vista Reportes) ──────────────────────────────────────

export const salesReportApi = {
  get: (query: ReportQuery) =>
    api<SalesReport>(`/api/sales/report${queryString(query)}`),
}

// ─── Envíos unificados (panel único ML + Tienda Nube) ────────────────────────

export const shipmentsApi = {
  list: (query: ShipmentsQuery) =>
    api<ShipmentsResponse>(`/api/shipments${queryString(query)}`),
}
