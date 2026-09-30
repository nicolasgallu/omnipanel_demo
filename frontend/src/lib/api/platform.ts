// Cliente HTTP del panel de plataforma (/api/platform).
// Token admin en su propia key de localStorage: NO usa el token de negocio.

import { ApiError, queryString } from './client'

export const ADMIN_TOKEN_KEY = 'omnipanel.admin.token'
export const ADMIN_ME_KEY = 'omnipanel.admin.me'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

export type AdminPlatform = 'mercadolibre' | 'tiendanube'

export interface AdminMe {
  id: number
  email: string
  full_name: string
}

export interface AdminSession {
  token: string
  admin: AdminMe
}

export interface AdminBusiness {
  id: number
  email: string
  full_name: string
  active: boolean
  accounts_count: number
  created_at: string
}

export interface AdminAccount {
  id: number
  platform: AdminPlatform
  external_account_id: string | null
  name: string
  has_credentials: boolean
  has_access_token: boolean
  expires_at: string | null
  created_at: string
}

interface PagedBusinesses {
  items: AdminBusiness[]
  total: number
  page: number
  page_size: number
  pages: number
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY)
}

export function setAdminToken(token: string | null) {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token)
  else localStorage.removeItem(ADMIN_TOKEN_KEY)
}

export function getAdminMe(): AdminMe | null {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_ME_KEY) || 'null') as AdminMe | null
  } catch {
    return null
  }
}

export function setAdminMe(me: AdminMe | null) {
  if (me) localStorage.setItem(ADMIN_ME_KEY, JSON.stringify(me))
  else localStorage.removeItem(ADMIN_ME_KEY)
}

async function platform<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getAdminToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(BASE + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  const text = await res.text()
  let data: Record<string, unknown> | null = null
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : null
  } catch {
    data = null
  }

  if (!res.ok) {
    const message =
      (data?.message as string) || (data?.error as string) || `Error ${res.status}`
    throw new ApiError(res.status, message, (data?.error as string) || 'error')
  }
  return data as T
}

export const platformApi = {
  login: (email: string, password: string) =>
    platform<AdminSession>('/api/platform/login', {
      method: 'POST',
      body: { email, password },
    }),

  listBusinesses: (q = '', page = 1, pageSize = 8) =>
    platform<PagedBusinesses>(
      `/api/platform/businesses${queryString({ q, page, page_size: pageSize })}`,
    ),

  createBusiness: (input: { email: string; full_name: string; password: string }) =>
    platform<{ business: AdminBusiness }>('/api/platform/businesses', {
      method: 'POST',
      body: input,
    }),

  setActive: (id: number, active: boolean) =>
    platform<{ business: AdminBusiness }>(`/api/platform/businesses/${id}`, {
      method: 'PATCH',
      body: { active },
    }),

  listAccounts: (businessId: number) =>
    platform<{ items: AdminAccount[] }>(`/api/platform/businesses/${businessId}/accounts`),

  createAccount: (
    businessId: number,
    input: {
      platform: AdminPlatform
      name?: string
      client_id?: string
      client_secret?: string
      external_account_id?: string
    },
  ) =>
    platform<{ account: AdminAccount }>(`/api/platform/businesses/${businessId}/accounts`, {
      method: 'POST',
      body: input,
    }),
}
