// Chip de categoría con color estable por categoría (Figma): fondo suave,
// texto del mismo tono y un puntito. Mismo color en TODAS las tablas.
//
// El tono sale de un hash del nombre (no del orden alfabético): las categorías
// de la app son dinámicas y paginadas, así el color de una categoría nunca
// cambia aunque aparezcan categorías nuevas. Con más de 8, algunas comparten.

const CATEGORY_TONES = [
  { color: '#7C3AED', bg: '#F3EEFF' }, // violeta
  { color: '#0E7490', bg: '#E6F6FA' }, // turquesa
  { color: '#BE185D', bg: '#FDECF4' }, // rosa
  { color: '#B45309', bg: '#FEF5E7' }, // ámbar
  { color: '#15803D', bg: '#EAF7EE' }, // verde
  { color: '#1D4ED8', bg: '#EBF1FE' }, // azul
  { color: '#9A3412', bg: '#FDF0EA' }, // terracota
  { color: '#4D7C0F', bg: '#F1F8E6' }, // oliva
]

const categoryTone = (category: string) => {
  const h = [...category].reduce((a, ch) => a + ch.charCodeAt(0), 0)
  return CATEGORY_TONES[h % CATEGORY_TONES.length]
}

export function CategoryChip({ category }: { category: string | null | undefined }) {
  if (!category) return <span className="text-faint">—</span>
  const t = categoryTone(category)
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap"
      style={{ background: t.bg, color: t.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
      {category}
    </span>
  )
}
