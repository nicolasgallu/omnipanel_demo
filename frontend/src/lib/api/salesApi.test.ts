// Tests del contrato de `salesApi`: URLs y query params correctos (y encoding
// del orderId en el detalle). Mismo patrón que client.test.ts: se stubbea el
// `fetch` global y se verifica la URL que arma el cliente.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { salesApi, salesReportApi } from './endpoints'

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

describe('salesApi — contrato de API de ventas', () => {
  it('list arma /api/sales/orders con los query params correctos', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(
        200,
        JSON.stringify({
          items: [],
          total: 0,
          page: 2,
          page_size: 10,
          counts: { total: 0, pending_payment: 0, paid: 0, delivered: 0, cancelled: 0 },
        }),
      ),
    )

    await salesApi.list({ q: '4391', channel: 'ml', status: 'paid', page: 2, page_size: 10 })

    expect(calledUrl()).toBe('/api/sales/orders?q=4391&channel=ml&status=paid&page=2&page_size=10')
  })

  it('list omite los query params vacíos (undefined y string vacío)', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, JSON.stringify({ items: [], total: 0, page: 0, page_size: 50, counts: {} })))

    await salesApi.list({ q: '', page: undefined, page_size: undefined })

    expect(calledUrl()).toBe('/api/sales/orders')
  })

  it('list con query vacío arma solo la base /api/sales/orders', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, JSON.stringify({ items: [], total: 0, page: 0, page_size: 50, counts: {} })))

    await salesApi.list({})

    expect(calledUrl()).toBe('/api/sales/orders')
  })

  it('get arma /api/sales/orders/{platform}/{orderId}', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, JSON.stringify({})))

    await salesApi.get('mercadolibre', '43918201')

    expect(calledUrl()).toBe('/api/sales/orders/mercadolibre/43918201')
  })

  it('get encodena el orderId con caracteres especiales', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, JSON.stringify({})))

    await salesApi.get('tiendanube', 'abc/def 123')

    expect(calledUrl()).toBe('/api/sales/orders/tiendanube/abc%2Fdef%20123')
  })

  it('salesReportApi.get arma /api/sales/report con days y channel', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, JSON.stringify({})))

    await salesReportApi.get({ days: 30, channel: 'ml' })

    expect(calledUrl()).toBe('/api/sales/report?days=30&channel=ml')
  })

  it('salesReportApi.get omite los params vacíos', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, JSON.stringify({})))

    await salesReportApi.get({})

    expect(calledUrl()).toBe('/api/sales/report')
  })
})
