// Tests de usePermissions(): el rol del usuario hidratado vía authApi.me()
// define isBusiness. Se mockea el módulo de endpoints para controlar `me()`.

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AuthProvider, usePermissions } from './auth'
import { TOKEN_KEY } from './api/client'
import type { User } from './api/types'

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
}))

vi.mock('./api/endpoints', () => ({
  authApi: { me: mocks.me, login: vi.fn() },
}))

// Componente sonda: renderiza 'business' o 'employee' según usePermissions().
function Probe() {
  const { isBusiness } = usePermissions()
  return <span data-testid="probe">{isBusiness ? 'business' : 'employee'}</span>
}

const BUSINESS: User = { id: 1, business_id: 1, role: 'business', email: 'owner@x.com', full_name: 'Dueño' }
const EMPLOYEE: User = { id: 2, business_id: 1, role: 'employee', email: 'emp@x.com', full_name: 'Empleado' }

beforeEach(() => {
  localStorage.clear()
  mocks.me.mockReset()
})

afterEach(() => cleanup())

describe('usePermissions', () => {
  it('isBusiness === true cuando el rol es "business"', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok')
    mocks.me.mockResolvedValue({ user: BUSINESS })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('business'))
  })

  it('isBusiness === false cuando el rol es "employee"', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok')
    mocks.me.mockResolvedValue({ user: EMPLOYEE })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    // Esperamos a que termine la hidratación (me() fue llamado) y verificamos
    // que el empleado SIGUE siendo no-business.
    await waitFor(() => expect(mocks.me).toHaveBeenCalled())
    expect(screen.getByTestId('probe')).toHaveTextContent('employee')
  })
})
