import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth, usePermissions } from './lib/auth'
import { Logo } from './components/Logo'
import { AppShell } from './layout/AppShell'
import { LoginPage } from './pages/LoginPage'
import { InventoryPage } from './pages/InventoryPage'
import { ChannelListingsPage } from './pages/ChannelListingsPage'
import { ShipmentsPage } from './pages/ShipmentsPage'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { UsuariosPage } from './pages/UsuariosPage'
import { PromptsAIPage } from './pages/PromptsAIPage'
import { ConfiguracionPage } from './pages/ConfiguracionPage'
import { AdminAuthProvider } from './lib/adminAuth'
import AdminPage from './pages/AdminPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <Logo size={34} />
        <span className="text-xs text-muted">Cargando Omnipanel…</span>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireBusiness({ children }: { children: ReactNode }) {
  const { isBusiness } = usePermissions()
  // Employees: no access to Ventas / Usuarios / Configuración (UI + API).
  if (!isBusiness) return <Navigate to="/inventory" replace />
  return <>{children}</>
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/inventory" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/inventory" replace />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/inventory/mercadolibre" element={<ChannelListingsPage platform="ml" />} />
        <Route path="/inventory/tiendanube" element={<ChannelListingsPage platform="tn" />} />
        <Route path="/ventas" element={<RequireBusiness><ComingSoonPage title="Ventas" icon="ventas" /></RequireBusiness>} />
        <Route path="/envios" element={<ComingSoonPage title="Envios" icon="envios" />} />
        <Route path="/envios/mercadolibre" element={<ShipmentsPage />} />
        <Route path="/envios/tiendanube" element={<ComingSoonPage title="Envios · Tienda Nube" icon="tn" />} />
        <Route path="/competencia" element={<ComingSoonPage title="Competencia" icon="competencia" />} />
        <Route path="/prompts-ai" element={<PromptsAIPage />} />
        <Route path="/preguntas" element={<ComingSoonPage title="Preguntas" icon="preguntas" />} />
        <Route path="/usuarios" element={<RequireBusiness><UsuariosPage /></RequireBusiness>} />
        <Route path="/configuracion" element={<RequireBusiness><ConfiguracionPage /></RequireBusiness>} />
      </Route>
      <Route
        path="/admin"
        element={
          <AdminAuthProvider>
            <AdminPage />
          </AdminAuthProvider>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
