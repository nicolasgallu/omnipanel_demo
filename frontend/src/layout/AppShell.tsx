import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { NavIcon } from '../components/NavIcon'
import type { NavIconKey } from '../components/NavIcon'
import { SupportFab } from '../components/SupportFab'
import { useAuth, usePermissions } from '../lib/auth'
import { adminApi } from '../lib/api/endpoints'

type NavChild = { label: string; icon: NavIconKey; path: string }
type NavItem = {
  label: string
  icon: NavIconKey
  path: string
  businessOnly?: boolean
  children?: NavChild[]
}

// Figma NAV: Inventario/Ventas/Envios agrupan vistas por canal.
const NAV: NavItem[] = [
  {
    label: 'Inventario',
    icon: 'inventario',
    path: '/inventory',
    children: [
      { label: 'MercadoLibre', icon: 'ml', path: '/inventory/mercadolibre' },
      { label: 'Tienda Nube', icon: 'tn', path: '/inventory/tiendanube' },
    ],
  },
  {
    label: 'Ventas',
    icon: 'ventas',
    path: '/ventas',
    businessOnly: true,
  },
  {
    label: 'Envios',
    icon: 'envios',
    path: '/envios',
    children: [
      { label: 'MercadoLibre', icon: 'ml', path: '/envios/mercadolibre' },
      { label: 'Tienda Nube', icon: 'tn', path: '/envios/tiendanube' },
    ],
  },
  { label: 'Competencia', icon: 'competencia', path: '/competencia' },
  { label: 'Prompts AI', icon: 'prompts', path: '/prompts-ai' },
  { label: 'Preguntas', icon: 'preguntas', path: '/preguntas' },
  { label: 'Usuarios', icon: 'usuarios', path: '/usuarios', businessOnly: true },
  { label: 'Configuración', icon: 'configuracion', path: '/configuracion', businessOnly: true },
]

export function AppShell() {
  const { user, logout } = useAuth()
  const { isBusiness } = usePermissions()
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Inventario: true })

  // Keep only the group that owns the active page expanded (Figma behavior).
  useEffect(() => {
    const owner = NAV.find(
      (item) =>
        item.path === pathname ||
        (item.children && item.children.some((c) => c.path === pathname)),
    )?.label
    if (!owner) return
    setOpenGroups((prev) => {
      const next: Record<string, boolean> = {}
      for (const item of NAV) {
        if (item.children) next[item.label] = item.label === owner
      }
      // Preserve a manually opened group while its page is not active yet.
      return { ...prev, ...next }
    })
  }, [pathname])

  const navItems = NAV.filter((item) => !item.businessOnly || isBusiness)

  const isActive = (path: string) => pathname === path

  const initial = (user?.full_name || '?').trim().charAt(0).toUpperCase()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  // Logo del negocio (Configuración → General): se usa como foto de perfil
  // de la empresa y de los usuarios mientras no existan fotos propias.
  useEffect(() => {
    let cancelled = false
    adminApi
      .settings()
      .then((res) => {
        if (!cancelled) setLogoUrl(res.logo_url || null)
      })
      .catch(() => {
        if (!cancelled) setLogoUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <aside className="w-52 flex flex-col flex-shrink-0 bg-white" style={{ borderRight: '1px solid #E2E8F0' }}>
        <div className="flex items-center gap-2.5 px-5 py-5" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <Logo variant="ngo" size={42} />
        </div>

        <nav className="flex flex-col gap-0.5 px-3 py-4 flex-1 overflow-y-auto scroll-slim" aria-label="Principal">
          {navItems.map((item) => {
            const open = item.children ? (openGroups[item.label] ?? false) : false
            const active = isActive(item.path) || (item.children?.some((c) => isActive(c.path)) ?? false)
            const bold = active || (item.children && open)
            return (
              <div key={item.label}>
                <button
                  onClick={() => {
                    if (item.children) {
                      setOpenGroups((g) => ({ ...g, [item.label]: true }))
                      navigate(item.path)
                    } else {
                      navigate(item.path)
                    }
                  }}
                  className="flex items-center gap-2.5 w-full text-left text-sm px-3 py-2 rounded-lg transition-all"
                  style={{
                    background: isActive(item.path) ? '#EEF2FF' : 'transparent',
                    color: isActive(item.path) ? '#4F46E5' : '#64748B',
                    fontWeight: bold ? 600 : 400,
                    borderLeft: isActive(item.path) ? '2px solid #4F46E5' : '2px solid transparent',
                  }}
                >
                  <span style={{ opacity: 0.75, display: 'flex' }}>
                    <NavIcon name={item.icon} />
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {item.children && (
                    <span
                      role="button"
                      aria-label={`${open ? 'Contraer' : 'Expandir'} ${item.label}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenGroups((g) => ({ ...g, [item.label]: !open }))
                      }}
                      style={{
                        fontSize: '10px',
                        opacity: 0.35,
                        transform: open ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s',
                      }}
                    >
                      ▾
                    </span>
                  )}
                </button>
                {item.children && open && (
                  <div className="ml-5 mt-0.5 mb-1 flex flex-col gap-0.5">
                    {item.children.map((child) => {
                      const childActive = isActive(child.path)
                      return (
                        <button
                          key={child.path}
                          onClick={() => navigate(child.path)}
                          className="flex items-center gap-2 w-full text-left text-xs px-3 py-1.5 rounded-lg transition-all"
                          style={{
                            background: childActive ? '#EEF2FF' : 'transparent',
                            color: childActive ? '#4F46E5' : '#94A3B8',
                            fontWeight: childActive ? 600 : 400,
                          }}
                        >
                          <span style={{ display: 'flex' }}>
                            <NavIcon name={child.icon} size={13} />
                          </span>
                          {child.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="px-4 py-4" style={{ borderTop: '1px solid #F1F5F9' }}>
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden"
              style={{ background: '#4F46E5' }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                initial
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate text-ink">{user?.full_name}</p>
              <button className="text-xs text-muted hover:text-subtle" onClick={logout}>
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        <Outlet />
      </div>

      <SupportFab />
    </div>
  )
}
