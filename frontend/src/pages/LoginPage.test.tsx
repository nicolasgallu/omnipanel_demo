// Tests del formulario de login: éxito (guarda token + navega), error 401
// (muestra el mensaje del body) y submit vacío (no llama a login).

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../lib/auth'
import { LoginPage } from './LoginPage'
import { ApiError, TOKEN_KEY } from '../lib/api/client'
import type { User } from '../lib/api/types'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
}))

vi.mock('../lib/api/endpoints', () => ({
  authApi: { me: vi.fn(), login: mocks.login },
}))

const BUSINESS: User = { id: 1, business_id: 1, role: 'business', email: 'owner@x.com', full_name: 'Dueño' }

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/inventory" element={<div>INVENTORY_OK</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  mocks.login.mockReset()
})

afterEach(() => cleanup())

describe('LoginPage', () => {
  it('login exitoso llama login(email,password), guarda el token y navega a /inventory', async () => {
    mocks.login.mockResolvedValue({ token: 'tok-123', user: BUSINESS })
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByPlaceholderText('tu@negocio.com'), 'owner@x.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith('owner@x.com', 'secret'))
    expect(await screen.findByText('INVENTORY_OK')).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBe('tok-123')
  })

  it('login fallido (401) muestra el mensaje del body', async () => {
    mocks.login.mockRejectedValue(new ApiError(401, 'Email o contraseña incorrectos', 'invalid_credentials'))
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByPlaceholderText('tu@negocio.com'), 'wrong@x.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'nope')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByText('Email o contraseña incorrectos')).toBeInTheDocument()
  })

  it('empleado inactivo (mismo 401) muestra el error', async () => {
    mocks.login.mockRejectedValue(new ApiError(401, 'Email o contraseña incorrectos', 'invalid_credentials'))
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByPlaceholderText('tu@negocio.com'), 'inactivo@x.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'clave')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByText('Email o contraseña incorrectos')).toBeInTheDocument()
    expect(mocks.login).toHaveBeenCalledWith('inactivo@x.com', 'clave')
  })

  it('submit con campos vacíos NO llama a login', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(mocks.login).not.toHaveBeenCalled()
  })
})
