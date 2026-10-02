// Logos oficiales de Omnipanel (exportados desde Figma).
// Variantes:
//   - "iso": solo la marca (cuadrada, fondo transparente) → login y pantalla de carga.
//   - "ngo": marca + nombre (proporción 3:1, fondo transparente) → sidebar.

import isoLogo from '../assets/logo-omni-iso.png'
import ngoLogo from '../assets/logo-omni-ngo.png'

export function Logo({ size = 26, variant = 'iso' }: { size?: number; variant?: 'iso' | 'ngo' }) {
  if (variant === 'ngo') {
    return (
      <img
        src={ngoLogo}
        alt="Omnipanel"
        style={{ height: size, width: 'auto', display: 'block' }}
      />
    )
  }
  return (
    <img
      src={isoLogo}
      alt="Omnipanel"
      width={size}
      height={size}
      style={{ display: 'block' }}
    />
  )
}
