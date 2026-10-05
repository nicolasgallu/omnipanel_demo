// Logos de marca (Figma): íconos oficiales de MercadoLibre / Tienda Nube.
// Se dibujan como un tile cuadrado con las esquinas redondeadas al 24% del
// tamaño, para reemplazar a los íconos genéricos de cada plataforma.

import mlLogoImg from '../assets/mercado-libre.svg'
import tnLogoImg from '../assets/tiendanube.svg'

function BrandLogo({ src, alt, size, zoom = 1 }: { src: string; alt: string; size: number; zoom?: number }) {
  return (
    <span
      className="inline-block flex-shrink-0 overflow-hidden"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24) }}
    >
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        style={{ display: 'block', width: '100%', height: '100%', transform: `scale(${zoom})` }}
      />
    </span>
  )
}

export function MeliLogo({ size = 16 }: { size?: number }) {
  return <BrandLogo src={mlLogoImg} alt="MercadoLibre" size={size} />
}

// El ícono de Tienda Nube viene en círculo: se apoya sobre un cuadrado del
// mismo azul (#0050C3) para que el borde del círculo desaparezca y el símbolo
// quede centrado con aire, igual que el de MercadoLibre.
export function TnubeLogo({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0 overflow-hidden"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), background: '#0050C3' }}
    >
      <img src={tnLogoImg} alt="Tienda Nube" style={{ display: 'block', width: '92%', height: '92%' }} />
    </span>
  )
}
