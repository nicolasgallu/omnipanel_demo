// Currency/date formatting (es-AR) + margin helper.

export const fmtMoney = (n: number): string => `$${n.toLocaleString('es-AR')}`

export const fmtMoneyCents = (n: number): string =>
  `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const fmtPct = (n: number): string =>
  `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })} %`

export const marginPct = (cost: number, price: number): number =>
  price > 0 ? Math.round(((price - cost) / price) * 100) : 0

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const fmtTime = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  let h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const sec = String(d.getSeconds()).padStart(2, '0')
  const suffix = h >= 12 ? 'p.m.' : 'a.m.'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${m}:${sec} ${suffix}`
}

export const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
