// Tests del contrato de `massActionsApi` (acciones masivas + ejecuciones):
// URLs, query params y bodies correctos. Mismo patrón que shipmentsApi.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { massActionsApi } from './endpoints'

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

function lastCall(): [string, RequestInit] {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  return fetchMock.mock.calls[0] as [string, RequestInit]
}

describe('massActionsApi — contrato', () => {
  it('eligibility hace POST /api/mass-actions/eligibility con product_ids', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, '{"products":1}'))
    await massActionsApi.eligibility([7, 9])
    const [url, init] = lastCall()
    expect(url).toBe('/api/mass-actions/eligibility')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ product_ids: [7, 9] })
  })

  it('create hace POST /api/mass-actions con action, channel y product_ids', async () => {
    fetchMock.mockResolvedValue(fakeResponse(202, '{"run":{"id":1}}'))
    await massActionsApi.create('pause', 'ml', [5])
    const [url, init] = lastCall()
    expect(url).toBe('/api/mass-actions')
    expect(JSON.parse(String(init.body))).toEqual({ action: 'pause', channel: 'ml', product_ids: [5] })
  })

  it('list arma /api/mass-actions con filtros y paginación', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, '{"items":[],"total":0}'))
    await massActionsApi.list({ channel: 'ml', status: 'running', page: 2, page_size: 10 })
    expect(lastCall()[0]).toBe('/api/mass-actions?channel=ml&status=running&page=2&page_size=10')
  })

  it('list sin filtros arma solo la base', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, '{"items":[],"total":0}'))
    await massActionsApi.list()
    expect(lastCall()[0]).toBe('/api/mass-actions')
  })

  it('get arma /api/mass-actions/:id', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, '{"id":3}'))
    await massActionsApi.get(3)
    expect(lastCall()[0]).toBe('/api/mass-actions/3')
  })

  it('remove hace DELETE /api/mass-actions/:id', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, '{"id":3,"status":"cancelled"}'))
    await massActionsApi.remove(3)
    const [url, init] = lastCall()
    expect(url).toBe('/api/mass-actions/3')
    expect(init.method).toBe('DELETE')
  })
})
