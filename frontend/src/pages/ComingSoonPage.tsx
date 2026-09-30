import { NavIcon } from '../components/NavIcon'
import type { NavIconKey } from '../components/NavIcon'

export function ComingSoonPage({ title, icon }: { title: string; icon: NavIconKey }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="flex flex-col items-center text-center gap-4 max-w-sm">
        <div className="flex items-center justify-center rounded-2xl" style={{ width: 64, height: 64, background: '#EEF2FF', color: '#4F46E5' }}>
          <NavIcon name={icon} size={30} />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-bold text-ink">{title}</h1>
          <span
            className="inline-flex items-center gap-1.5 mx-auto px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ color: '#D97706', background: '#FEF3C7' }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#D97706' }} />
            En construcción
          </span>
          <p className="text-sm mt-1 text-subtle">
            Estamos trabajando en esta sección. Muy pronto vas a poder usarla desde acá.
          </p>
        </div>
      </div>
    </div>
  )
}
