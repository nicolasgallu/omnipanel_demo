// Tests del wrapper `api()`: contrato de headers, 204 y errores (ApiError).
// Se stubbea el `fetch` global con respuestas mínimas que solo exponen la
// superficie que `api()` realmente usa (status, ok, text()).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api, ApiError, TOKEN_KEY } from './client'

// Respuesta falsa con la mínima superficie que lee `api()`.
function fakeResponse(status: number, body: string) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api() — cliente HTTP', () => {
  it('envía Authorization: Bearer <token> cuando hay token en localStorage', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok-123')
    fetchMock.mockResolvedValue(fakeResponse(200, '{"ok":true}'))

    await api('/api/test')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/test')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123')
  })

  it('una respuesta 204 resuelve undefined', async () => {
    fetchMock.mockResolvedValue(fakeResponse(204, ''))

    await expect(api('/api/test')).resolves.toBeUndefined()
  })

  it('error JSON {error, message} lanza ApiError con message, code y status', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(401, JSON.stringify({ error: 'invalid_credentials', message: 'Email o contraseña incorrectos' })),
    )

    const err = await api('/api/test').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 401, code: 'invalid_credentials', message: 'Email o contraseña incorrectos' })
  })

  it('body de error no-JSON usa el fallback "Error <status>"', async () => {
    fetchMock.mockResolvedValue(fakeResponse(500, 'Internal Server Error'))

    const err = await api('/api/test').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 500, code: 'error', message: 'Error 500' })
  })
})
