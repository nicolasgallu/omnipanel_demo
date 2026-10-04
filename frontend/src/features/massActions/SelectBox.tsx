// Checkbox de selección con estado "a medias" (indeterminate), usado en las
// tres vistas de inventario para la selección masiva.

import { useEffect, useRef } from 'react'

export function SelectBox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="w-3.5 h-3.5 cursor-pointer"
      style={{ accentColor: '#4F46E5' }}
      aria-label="Seleccionar"
    />
  )
}
