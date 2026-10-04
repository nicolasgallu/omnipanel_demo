// Tests de gating de rutas (<RequireAuth> + <RequireBusiness>).
// Se mockea TODO el módulo de endpoints: authApi.me para hidratar el usuario,
// e inventoryApi.list/categories para que InventoryPage renderice sin crash.

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { TOKEN_KEY } from './lib/api/client'
import type { User } from './lib/api/types'

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  login: vi.fn(),
  list: vi.fn(),
  categories: vi.fn(),
  settings: vi.fn(),
  salesList: vi.fn(),
}))

vi.mock('./lib/api/endpoints', () => ({
  authApi: { me: mocks.me, login: mocks.login },
  inventoryApi: {
    list: mocks.list,
    categories: mocks.categories,
    get: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
    uploadImage: vi.fn(),
    removeImage: vi.fn(),
    prepublish: vi.fn(),
  },
  aiApi: { generate: vi.fn(), getPrompts: vi.fn(), savePrompts: vi.fn() },
  adminApi: {
    employees: vi.fn(),
    createEmployee: vi.fn(),
    toggleEmployee: vi.fn(),
    settings: mocks.settings,
    changePassword: vi.fn(),
    uploadLogo: vi.fn(),
  },
  channelsApi: {
    accounts: vi.fn(),
    mlCategories: vi.fn(),
    mlListingPrices: vi.fn(),
    mlSettings: vi.fn(),
    mlConfigure: vi.fn(),
    mlPublish: vi.fn(),
    mlAction: vi.fn(),
    mlPerformance: vi.fn(),
    mlSellingCosts: vi.fn(),
    mlListings: vi.fn(),
    tnListings: vi.fn(),
    shipmentLabel: vi.fn(),
    mlPictures: vi.fn(),
    tnSettings: vi.fn(),
    tnPublish: vi.fn(),
    tnAction: vi.fn(),
    tnPause: vi.fn(),
  },
  credentialsApi: { meli: vi.fn(), saveMeli: vi.fn(), tn: vi.fn(), saveTn: vi.fn() },
  supportApi: { createTicket: vi.fn() },
  salesApi: { list: mocks.salesList, get: vi.fn() },
  salesReportApi: { get: vi.fn() },
  shipmentsApi: { list: vi.fn() },
}))

const BUSINESS: User = { id: 1, business_id: 1, role: 'business', email: 'owner@x.com', full_name: 'Dueño' }
const EMPLOYEE: User = { id: 2, business_id: 1, role: 'employee', email: 'emp@x.com', full_name: 'Empleado' }

function renderApp(initialEntries: string[], user: User) {
  localStorage.setItem(TOKEN_KEY, 'test-token')
  mocks.me.mockResolvedValue({ user })
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  mocks.me.mockReset()
  mocks.login.mockReset()
  mocks.list.mockReset()
  mocks.categories.mockReset()
  mocks.settings.mockReset()
  mocks.salesList.mockReset()
  mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50, pages: 0 })
  mocks.categories.mockResolvedValue({ items: [] })
  mocks.settings.mockResolvedValue({ logo_url: null, email: '', full_name: '' })
  mocks.salesList.mockResolvedValue({
    items: [],
    total: 0,
    page: 0,
    page_size: 50,
    counts: { total: 0, pending_payment: 0, paid: 0, delivered: 0, cancelled: 0 },
  })
})

afterEach(() => cleanup())

describe('Gating de rutas por rol', () => {
  it('employee en /ventas es redirigido a inventario (no se ve el título "Ventas")', async () => {
    renderApp(['/ventas'], EMPLOYEE)

    // Termina en Inventario (buscador presente) y el ComingSoon de Ventas no aparece.
    expect(await screen.findByPlaceholderText('Buscar producto…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ventas' })).not.toBeInTheDocument()
  })

  it('employee en /usuarios es redirigido (no se ve el contenido de UsuariosPage)', async () => {
    renderApp(['/usuarios'], EMPLOYEE)

    expect(await screen.findByPlaceholderText('Buscar producto…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Usuarios' })).not.toBeInTheDocument()
  })

  it('employee en /configuracion es redirigido (no se ve el contenido de ConfiguracionPage)', async () => {
    renderApp(['/configuracion'], EMPLOYEE)

    expect(await screen.findByPlaceholderText('Buscar producto…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Configuración' })).not.toBeInTheDocument()
  })

  it('business en /ventas ve la página Ventas con el título "Ventas" (sin subtab de canal)', async () => {
    renderApp(['/ventas'], BUSINESS)

    expect(await screen.findByRole('heading', { name: 'Ventas' })).toBeInTheDocument()
  })
})
