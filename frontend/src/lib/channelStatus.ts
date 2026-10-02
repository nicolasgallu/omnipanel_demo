// Catálogo de estados de canal (ML/TN): fuente única de etiquetas en el front.
//
// Los VALORES y ETIQUETAS viven en el backend (GET /api/inventory/channel-statuses);
// acá hay un respaldo idéntico para no depender del fetch en el primer render.
// Los colores/íconos son presentación y quedan en los componentes.

import { useEffect, useReducer } from 'react'
import type { ChannelStatus } from './api/types'
import { inventoryApi } from './api/endpoints'

export const CHANNEL_STATUS_VALUES: ChannelStatus[] = [
  'unpublished',
  'prepublished',
  'under_review',
  'published',
  'paused',
  'failed',
]

// Respaldo (coincide con el backend); el backend es la autoridad.
const FALLBACK_LABELS: Record<ChannelStatus, string> = {
  unpublished: 'Sin publicar',
  prepublished: 'Pre-publicado',
  under_review: 'En revisión',
  published: 'Publicado',
  paused: 'Pausado',
  failed: 'Error de publicación',
}

let backendLabels: Partial<Record<ChannelStatus, string>> | null = null
let loadPromise: Promise<void> | null = null

export function loadChannelStatuses(): Promise<void> {
  if (!loadPromise) {
    loadPromise = inventoryApi
      .channelStatuses()
      .then((res) => {
        const labels: Partial<Record<ChannelStatus, string>> = {}
        for (const s of res.statuses ?? []) labels[s.value] = s.label
        backendLabels = labels
      })
      .catch(() => {
        // sin backend: quedan los labels de respaldo
      })
  }
  return loadPromise
}

export function statusLabel(status: ChannelStatus): string {
  return backendLabels?.[status] ?? FALLBACK_LABELS[status]
}

// Re-renderiza el componente cuando llegan las etiquetas del backend.
export function useChannelStatuses(): void {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    let alive = true
    loadChannelStatuses()
      .then(() => {
        if (alive) force()
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
}
