// Thin typed fetch wrapper around the backend REST API.

export const TOKEN_KEY = 'omnipanel.token'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, message: string, code = 'error') {
    super(message)
    this.status = status
    this.code = code
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

interface RequestOptions {
  method?: string
  body?: unknown
  form?: FormData
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let body: BodyInit | undefined
  if (opts.form) {
    body = opts.form
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }

  const res = await fetch(BASE + path, {
    method: opts.method || 'GET',
    headers,
    body,
  })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let data: Record<string, unknown> | null = null
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : null
  } catch {
    data = null
  }

  if (!res.ok) {
    const message =
      (data?.message as string) ||
      (data?.error as string) ||
      `Error ${res.status}`
    throw new ApiError(res.status, message, (data?.error as string) || 'error')
  }
  return data as T
}

export async function apiBlob(path: string, opts: RequestOptions = {}): Promise<Blob> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(BASE + path, {
    method: opts.method || 'GET',
    headers,
  })

  if (!res.ok) {
    const text = await res.text()
    let data: Record<string, unknown> | null = null
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : null
    } catch {
      data = null
    }
    const message =
      (data?.message as string) ||
      (data?.error as string) ||
      `Error ${res.status}`
    throw new ApiError(res.status, message, (data?.error as string) || 'error')
  }
  return res.blob()
}

export function queryString(params: object): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}
