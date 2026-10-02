// Edición inline por FILA en tablas (Figma "Option A"): un lápiz por fila
// (al hover) pone TODAS las celdas editables de la fila en modo input, con
// barra Guardar/Cancelar. Enter guarda, Esc cancela; blur commitea.
// Gesto separado: la edición nunca abre el panel del producto (stopPropagation).

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export const RowEditContext = createContext<{
  active: number | null
  saveTick: number
  cancelTick: number
}>({ active: null, saveTick: 0, cancelTick: 0 })

export function PencilIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11 2.5l2.5 2.5M3 13l.7-2.6 6.6-6.6 2.5 2.5-6.6 6.6L3 13z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function RowEditAction({
  editing,
  onStart,
  onSave,
  onCancel,
}: {
  editing: boolean
  onStart: () => void
  onSave: () => void
  onCancel: () => void
}) {
  if (editing) {
    return (
      <div className="inline-flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onSave()
          }}
          className="inline-flex items-center gap-1 rounded-md text-white px-2 py-1 transition-colors hover:brightness-95"
          style={{ fontSize: '11px', fontWeight: 600, background: '#4F46E5' }}
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Guardar
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onCancel()
          }}
          className="rounded-md px-2 py-1 transition-colors hover:bg-slate-100"
          style={{ fontSize: '11px', fontWeight: 600, border: '1px solid #E2E8F0', color: '#64748B' }}
        >
          Cancelar
        </button>
      </div>
    )
  }
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onStart()
      }}
      title="Editar fila"
      className="inline-flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
      style={{ width: 26, height: 26, border: '1px solid #E2E8F0', color: '#4F46E5' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#EEF2FF')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <PencilIcon size={13} />
    </button>
  )
}

export function EditableCell({
  value,
  rowId,
  align,
  type = 'text',
  prefix,
  format,
  leading,
  onSave,
}: {
  value: string
  rowId?: number
  align?: boolean
  type?: 'text' | 'number'
  prefix?: string
  format?: (v: string) => ReactNode
  leading?: ReactNode
  onSave?: (v: string) => Promise<void>
}) {
  const [committed, setCommitted] = useState(value)
  const [mode, setMode] = useState<'idle' | 'edit' | 'saving' | 'error'>('idle')
  const [draft, setDraft] = useState(value)
  const [err, setErr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const rowEdit = useContext(RowEditContext)
  const rowActive = rowId != null && rowEdit.active === rowId
  const savedTick = useRef(rowEdit.saveTick)
  const cancelledTick = useRef(rowEdit.cancelTick)

  useEffect(() => {
    if (mode === 'edit') inputRef.current?.focus()
  }, [mode])
  useEffect(() => {
    if (mode === 'idle') {
      setCommitted(value)
      setDraft(value)
    }
    // Intencional: sincroniza SOLO cuando cambia `value` (no al entrar/salir
    // de edición, para no pisar el draft del usuario).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Entrar / salir del modo edición junto con la fila.
  useEffect(() => {
    if (rowActive) {
      setDraft(committed)
      setErr('')
      setMode((m) => (m === 'saving' ? m : 'edit'))
    } else {
      setMode((m) => (m === 'edit' || m === 'error' ? 'idle' : m))
    }
    // Intencional: solo al togglear rowActive (no en cada cambio de committed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowActive])

  // Commit / cancel en conjunto disparados por la barra de la fila.
  useEffect(() => {
    if (!rowActive) {
      savedTick.current = rowEdit.saveTick
      return
    }
    if (rowEdit.saveTick !== savedTick.current) {
      savedTick.current = rowEdit.saveTick
      void commit()
    }
    // Intencional: patrón tick/ref — commit es de la render actual cuando
    // cambia el tick (agregarlo a las deps correría el efecto en cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowEdit.saveTick])
  useEffect(() => {
    if (!rowActive) {
      cancelledTick.current = rowEdit.cancelTick
      return
    }
    if (rowEdit.cancelTick !== cancelledTick.current) {
      cancelledTick.current = rowEdit.cancelTick
      cancel()
    }
    // Intencional: mismo patrón tick/ref que el commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowEdit.cancelTick])

  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const start = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDraft(committed)
    setErr('')
    setMode('edit')
  }
  const cancel = (e?: React.SyntheticEvent) => {
    e?.stopPropagation()
    setMode('idle')
    setErr('')
    setDraft(committed)
  }
  const fail = (m: string) => {
    setErr(m)
    setMode('error')
    setTimeout(() => {
      setMode('idle')
      setDraft(committed)
      setErr('')
    }, 2200)
  }
  const commit = async (e?: React.SyntheticEvent) => {
    e?.stopPropagation()
    const v = draft.trim()
    if (!v) return fail('No puede quedar vacío')
    if (type === 'number' && !/^\d+([.,]\d+)?$/.test(v)) return fail('Ingresá un número válido')
    setMode('saving')
    try {
      await onSave?.(v)
      setCommitted(v)
      setMode('idle')
    } catch (ex) {
      fail(ex instanceof Error ? ex.message : 'No se pudo guardar')
    }
  }

  if (mode === 'edit' || mode === 'error') {
    return (
      <div className={`inline-flex flex-col gap-1 ${align ? 'items-end' : 'items-start'}`} onClick={stop}>
        <div
          className="inline-flex items-center rounded-lg overflow-hidden"
          style={{
            border: `1px solid ${mode === 'error' ? '#FCA5A5' : '#4F46E5'}`,
            boxShadow:
              mode === 'error'
                ? '0 0 0 3px rgba(220,38,38,0.12)'
                : '0 0 0 3px rgba(79,70,229,0.14)',
          }}
        >
          {prefix && (
            <span className="pl-2 text-xs" style={{ color: '#94A3B8' }}>
              {prefix}
            </span>
          )}
          <input
            ref={inputRef}
            value={draft}
            inputMode={type === 'number' ? 'decimal' : 'text'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') void commit(e)
              else if (e.key === 'Escape') cancel(e)
            }}
            onBlur={() => {
              if (!rowActive) void commit()
            }}
            className="px-2 py-1 text-xs outline-none bg-transparent"
            style={{ color: '#0A1628', width: type === 'number' ? 96 : 160, textAlign: align ? 'right' : 'left' }}
          />
        </div>
        {mode === 'error' ? (
          <span style={{ fontSize: '10px', color: '#DC2626' }}>{err}</span>
        ) : (
          !rowActive && <span style={{ fontSize: '9px', color: '#94A3B8' }}>Enter guarda · Esc cancela</span>
        )}
      </div>
    )
  }

  const spinner = (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      className="flex-shrink-0"
      style={{ color: '#4F46E5', animation: 'spin 1s linear infinite' }}
      aria-hidden
    >
      <circle cx="8" cy="8" r="6" stroke="#E2E8F0" strokeWidth="2" />
      <path d="M8 2a6 6 0 016 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
  const affordance = mode === 'saving' ? spinner : null
  // Columnas numéricas (precios) nunca se truncan: el número debe verse completo.
  const baseCls = type === 'number' ? 'whitespace-nowrap' : align ? 'whitespace-nowrap' : 'truncate'
  const valueNode = <span className={baseCls}>{format ? format(committed) : committed}</span>
  return (
    <button
      onClick={start}
      title="Editar"
      className="inline-flex items-center gap-1.5 rounded-lg px-1 -mx-1 py-0.5 transition-colors max-w-full"
      style={{ cursor: 'text' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {leading}
      {align ? (
        <>
          {affordance}
          {valueNode}
        </>
      ) : (
        <>
          {valueNode}
          {affordance}
        </>
      )}
    </button>
  )
}
