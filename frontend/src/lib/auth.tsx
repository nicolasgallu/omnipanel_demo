// Auth session: token in localStorage, user hydrated from /api/auth/me.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { authApi } from './api/endpoints'
import { getToken, setToken } from './api/client'
import type { User } from './api/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      if (!getToken()) {
        setLoading(false)
        return
      }
      try {
        const { user: me } = await authApi.me()
        if (!cancelled) setUser(me)
      } catch {
        setToken(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: logged } = await authApi.login(email, password)
    setToken(token)
    setUser(logged)
    return logged
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export function usePermissions(): { isBusiness: boolean } {
  const { user } = useAuth()
  // Employees are blocked from Ventas / Configuración / Usuarios.
  // Keep in sync with the backend's @require_business decorator.
  return { isBusiness: user?.role === 'business' }
}
