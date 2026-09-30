// Tests del NAV del AppShell (Figma: grupos con hijos por canal).
// businessOnly filtra Ventas / Usuarios / Configuración para empleados.
// Se mockea authApi.me para hidratar el usuario.

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import { AuthProvider } from '../lib/auth'
import { TOKEN_KEY } from '../lib/api/client'
import type { User } from '../lib/api/types'

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  settings: vi.fn(),
}))

vi.mock('../lib/api/endpoints', () => ({
  authApi: { me: mocks.me, login: vi.fn() },
  adminApi: { settings: mocks.settings },
}))

const BUSINESS: User = { id: 1, business_id: 1, role: 'business', email: 'owner@x.com', full_name: 'Dueño' }
const EMPLOYEE: User = { id: 2, business_id: 1, role: 'employee', email: 'emp@x.com', full_name: 'Empleado' }

const BUSINESS_GROUPS = ['Inventario', 'Ventas', 'Envios', 'Competencia', 'Prompts AI', 'Preguntas', 'Usuarios', 'Configuración']
const EMPLOYEE_GROUPS = ['Inventario', 'Envios', 'Competencia', 'Prompts AI', 'Preguntas']
const EMPLOYEE_HIDDEN = ['Ventas', 'Usuarios', 'Configuración']

function renderShell(user: User) {
  localStorage.setItem(TOKEN_KEY, 'tok')
  mocks.me.mockResolvedValue({ user })
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  mocks.me.mockReset()
  mocks.settings.mockReset()
  mocks.settings.mockResolvedValue({ logo_url: null, email: '', full_name: '' })
})

afterEach(() => cleanup())

describe('AppShell — NAV por rol (grupos por canal)', () => {
  it('business ve los 8 grupos del menú', async () => {
    renderShell(BUSINESS)

    const nav = screen.getByRole('navigation', { name: 'Principal' })
    await waitFor(() => expect(within(nav).getByText('Inventario')).toBeInTheDocument())
    for (const label of BUSINESS_GROUPS) {
      expect(within(nav).getByText(label)).toBeInTheDocument()
    }
  })

  it('business ve los hijos de Inventario (MercadoLibre / Tienda Nube) expandidos por defecto', async () => {
    renderShell(BUSINESS)

    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(await within(nav).findByText('MercadoLibre')).toBeInTheDocument()
    expect(within(nav).getByText('Tienda Nube')).toBeInTheDocument()
  })

  it('employee ve solo sus grupos y NO Ventas/Usuarios/Configuración', async () => {
    renderShell(EMPLOYEE)

    const nav = screen.getByRole('navigation', { name: 'Principal' })
    await waitFor(() => expect(within(nav).getByText('Envios')).toBeInTheDocument())
    for (const label of EMPLOYEE_GROUPS) {
      expect(within(nav).getByText(label)).toBeInTheDocument()
    }
    for (const label of EMPLOYEE_HIDDEN) {
      expect(within(nav).queryByText(label)).not.toBeInTheDocument()
    }
  })
})
