// Sesión del panel de plataforma: token admin en su propia key de
// localStorage (omnipanel.admin.token), separada del token de negocio.
import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import {
  getAdminMe,
  getAdminToken,
  platformApi,
  setAdminMe,
  setAdminToken,
} from './api/platform'
import type { AdminSession } from './api/platform'

interface AdminAuthValue {
  session: AdminSession | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(() => {
    const token = getAdminToken()
    const admin = getAdminMe()
    return token && admin ? { token, admin } : null
  })

  const login = useCallback(async (email: string, password: string) => {
    const s = await platformApi.login(email, password)
    setAdminToken(s.token)
    setAdminMe(s.admin)
    setSession(s)
  }, [])

  const logout = useCallback(() => {
    setAdminToken(null)
    setAdminMe(null)
    setSession(null)
  }, [])

  return (
    <AdminAuthContext.Provider value={{ session, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth debe usarse dentro de AdminAuthProvider')
  return ctx
}
