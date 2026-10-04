// Tests del contrato de `shipmentsApi` (panel unificado de Envíos):
// URL y query params correctos. Mismo patrón que salesApi.test.ts:
// se stubbea el `fetch` global y se verifica la URL que arma el cliente.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shipmentsApi } from './endpoints'

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

function calledUrl(): string {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
  return url
}

const EMPTY_BODY = JSON.stringify({
  items: [],
  total: 0,
  page: 0,
  page_size: 50,
  counts: { total: 0, to_prepare: 0, in_transit: 0, delivered: 0, incidents: 0 },
  account_total: 0,
})

describe('shipmentsApi — contrato de API del panel unificado de envíos', () => {
  it('list arma /api/shipments con los query params correctos', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, EMPTY_BODY))

    await shipmentsApi.list({
      q: '4391',
      channel: 'ml',
      status_group: 'in_transit',
      page: 2,
      page_size: 10,
    })

    expect(calledUrl()).toBe(
      '/api/shipments?q=4391&channel=ml&status_group=in_transit&page=2&page_size=10',
    )
  })

  it('list omite los query params vacíos (undefined y string vacío)', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, EMPTY_BODY))

    await shipmentsApi.list({ q: '', page: undefined, page_size: undefined })

    expect(calledUrl()).toBe('/api/shipments')
  })

  it('list con query vacío arma solo la base /api/shipments', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, EMPTY_BODY))

    await shipmentsApi.list({})

    expect(calledUrl()).toBe('/api/shipments')
  })

  it('list con channel all y status_group all los manda (filtros explícitos)', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, EMPTY_BODY))

    await shipmentsApi.list({ channel: 'all', status_group: 'all' })

    expect(calledUrl()).toBe('/api/shipments?channel=all&status_group=all')
  })
})
