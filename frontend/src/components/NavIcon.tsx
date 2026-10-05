// Íconos SVG del sidebar (Figma: trazos 20x20, currentColor).
// Los logos de MercadoLibre / Tienda Nube viven en BrandLogos.

import { MeliLogo, TnubeLogo } from './BrandLogos'

export type NavIconKey =
  | 'inventario'
  | 'ml'
  | 'tn'
  | 'ejecuciones'
  | 'ventas'
  | 'envios'
  | 'competencia'
  | 'prompts'
  | 'preguntas'
  | 'usuarios'
  | 'configuracion'
  | 'notificaciones'

export function NavIcon({ name, size = 16 }: { name: NavIconKey; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'inventario':
      return (
        <svg {...p}>
          <path d="M10 2.5l6 3.2v8.6l-6 3.2-6-3.2V5.7l6-3.2z" />
          <path d="M4 5.7l6 3.2 6-3.2M10 8.9v8.6" />
        </svg>
      )
    case 'ventas':
      return (
        <svg {...p}>
          <path d="M3 16.5h14" />
          <path d="M4.5 13l3.5-4 3 2.5L17 5.5" />
          <path d="M13.5 5.5H17V9" />
        </svg>
      )
    case 'ml':
      // logo oficial de MercadoLibre, un 35% más grande que el ícono genérico
      return <MeliLogo size={Math.round(size * 1.35)} />
    case 'tn':
      // logo oficial de Tienda Nube, un 35% más grande que el ícono genérico
      return <TnubeLogo size={Math.round(size * 1.35)} />
    case 'ejecuciones':
      // corrida: play dentro de una tarjeta (Figma)
      return (
        <svg {...p}>
          <rect x="2.5" y="2.5" width="15" height="15" rx="3.5" />
          <path d="M8.5 7.2l4 2.8-4 2.8V7.2z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'envios':
      // delivery truck
      return (
        <svg {...p}>
          <path d="M2.5 5.5h9v8h-9z" />
          <path d="M11.5 8h3l2.5 2.5v3h-5.5" />
          <circle cx="6" cy="15" r="1.4" />
          <circle cx="14" cy="15" r="1.4" />
        </svg>
      )
    case 'competencia':
      return (
        <svg {...p}>
          <circle cx="10" cy="10" r="6.5" />
          <circle cx="10" cy="10" r="3" />
          <circle cx="10" cy="10" r="0.4" fill="currentColor" />
        </svg>
      )
    case 'prompts':
      return (
        <svg {...p}>
          <path d="M9 3l1.4 3.6L14 8l-3.6 1.4L9 13l-1.4-3.6L4 8l3.6-1.4L9 3z" />
          <path d="M15 12l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
        </svg>
      )
    case 'preguntas':
      return (
        <svg {...p}>
          <path d="M17 12.5a2 2 0 0 1-2 2H8l-3.5 3v-3H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          <path d="M8.6 7.6a1.6 1.6 0 1 1 2.2 1.5c-.5.2-.8.6-.8 1.1" />
          <path d="M10 12.2h.01" />
        </svg>
      )
    case 'usuarios':
      return (
        <svg {...p}>
          <circle cx="7.5" cy="7" r="2.8" />
          <path d="M2.5 16.5c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" />
          <path d="M13 4.6a2.8 2.8 0 010 4.8M14.5 12.4c1.9.5 3 2.1 3 4.1" />
        </svg>
      )
    case 'configuracion':
      return (
        <svg {...p} viewBox="0 0 24 24" strokeWidth={1.9}>
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'notificaciones':
      // bell (Figma)
      return (
        <svg {...p}>
          <path d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 3-1 4.5-2 5.5h13c-1-1-2-2.5-2-5.5A4.5 4.5 0 0 0 10 3z" />
          <path d="M8.2 16a2 2 0 0 0 3.6 0" />
        </svg>
      )
  }
}
