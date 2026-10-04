// Acciones masivas: constantes compartidas (barra, modal y página Ejecuciones).

import type { MassAction, MassRunStatus } from '../../lib/api/types'

export const MASS_ACTIONS: { action: MassAction; label: string; verb: string; platforms: ('ml' | 'tn')[] }[] = [
  { action: 'publish', label: 'Publicar', verb: 'publicar', platforms: ['ml', 'tn'] },
  { action: 'update', label: 'Actualizar', verb: 'actualizar', platforms: ['ml', 'tn'] },
  { action: 'pause', label: 'Pausar', verb: 'pausar', platforms: ['ml'] },
  { action: 'delete', label: 'Borrar', verb: 'borrar', platforms: ['ml', 'tn'] },
  { action: 'link', label: 'Vincular a catálogo', verb: 'vincular', platforms: ['ml'] },
  { action: 'unlink', label: 'Desvincular de catálogo', verb: 'desvincular', platforms: ['ml'] },
]

export function actionLabel(action: MassAction): string {
  return MASS_ACTIONS.find((a) => a.action === action)?.label ?? action
}

export const RUN_STATUS: Record<MassRunStatus, { label: string; color: string; bg: string }> = {
  queued: { label: 'En cola', color: '#64748B', bg: '#F1F5F9' },
  running: { label: 'Ejecutando', color: '#2563EB', bg: '#DBEAFE' },
  done: { label: 'Completada', color: '#16A34A', bg: '#DCFCE7' },
  done_errors: { label: 'Completada con errores', color: '#D97706', bg: '#FEF3C7' },
  failed: { label: 'Fallida', color: '#DC2626', bg: '#FEE2E2' },
  cancelled: { label: 'Cancelada', color: '#64748B', bg: '#F1F5F9' },
}

export function runStatusLabel(status: MassRunStatus): string {
  return RUN_STATUS[status]?.label ?? status
}

export const CHANNEL_LABEL: Record<'ml' | 'tn', string> = {
  ml: 'MercadoLibre',
  tn: 'Tienda Nube',
}
