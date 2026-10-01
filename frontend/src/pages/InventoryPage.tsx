import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { inventoryApi } from '../lib/api/endpoints'
import { PencilIcon, RowEditAction, RowEditContext } from '../features/inventory/rowEdit'
import type { Paginated, Product } from '../lib/api/types'
import { ErrorBox } from '../components/ui'
import { ProductDrawer } from '../features/inventory/ProductDrawer'
import {
  COLUMNS,
  COL_MAP,
  ColumnManager,
  DEFAULT_FILTERS,
  FilterPanel,
  loadCols,
  saveCols,
  type ColKey,
  type InventoryFilters,
} from '../features/inventory/inventoryColumns'
import { CsvExportButton } from '../components/CsvExportButton'

// Columnas exportables del CSV: las mismas de la vista (producto = nombre).
const CSV_COLUMNS = [
  { key: 'name', label: 'Producto' },
  ...COLUMNS.filter((c) => c.key !== 'producto').map((c) => ({ key: c.key, label: c.label })),
]

export function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const channel = (searchParams.get('channel') as 'ml' | 'tn' | null) || ''

  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_FILTERS)
  const [categories, setCategories] = useState<string[]>([])
  const [cols, setColsState] = useState<ColKey[]>(loadCols)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [data, setData] = useState<Paginated<Product> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [drawerProduct, setDrawerProduct] = useState<Product | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Deep link desde Preguntas: /inventory?product={id} abre el drawer de ese producto.
  useEffect(() => {
    const raw = searchParams.get('product')
    if (!raw) return
    const productId = Number(raw)
    if (!Number.isFinite(productId)) return
    let alive = true
    inventoryApi
      .get(productId)
      .then((res) => {
        if (alive) setDrawerProduct(res.product)
      })
      .catch(() => {
        /* producto inexistente: no se abre nada */
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setCols = useCallback((c: ColKey[]) => {
    setColsState(c)
    saveCols(c)
  }, [])

  // Categorías para el filtro.
  useEffect(() => {
    inventoryApi
      .categories()
      .then((res) => setCategories(res.items))
      .catch(() => setCategories([]))
  }, [])

  // Debounce del buscador.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    setPage(1)
  }, [debouncedQ, channel, filters])

  const requestId = useRef(0)
  useEffect(() => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    inventoryApi
      .list({
        q: debouncedQ,
        channel,
        category: filters.category !== 'all' ? filters.category : '',
        ml_status: filters.ml !== 'all' ? (filters.ml as never) : '',
        tn_status: filters.tn !== 'all' ? (filters.tn as never) : '',
        stock: filters.stock !== 'all' ? (filters.stock as 'in' | 'out') : '',
        page,
        page_size: pageSize,
      })
      .then((res) => {
        if (requestId.current === id) {
          setData(res)
          setSelected(new Set())
        }
      })
      .catch((err: Error) => {
        if (requestId.current === id) setError(err.message)
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false)
      })
  }, [debouncedQ, channel, filters, page, pageSize, refreshKey])

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const pages = data?.pages ?? 0
  const defs = cols.map((k) => COL_MAP[k]).filter(Boolean)

  // Edición inline: actualiza la fila local sin recargar la página.
  const onCellSaved = useCallback((updated: Product) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            // Merge: la respuesta del PATCH puede no traer todos los campos
            // de la fila (ml_status/tn_status/image_url) — no perder los viejos.
            items: prev.items.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)),
          }
        : prev,
    )
  }, [])

  const [dragKey, setDragKey] = useState<ColKey | null>(null)
  const [overKey, setOverKey] = useState<ColKey | null>(null)

  // Edición por fila (Figma): un lápiz por fila, Enter guarda / Esc cancela.
  const [editRow, setEditRow] = useState<number | null>(null)
  const [saveTick, setSaveTick] = useState(0)
  const [cancelTick, setCancelTick] = useState(0)
  const saveRow = () => {
    setSaveTick((t) => t + 1)
    setTimeout(() => setEditRow(null), 900)
  }
  const cancelRow = () => {
    setCancelTick((t) => t + 1)
    setEditRow(null)
  }
  const startRow = (id: number) => {
    if (editRow != null && editRow !== id) {
      // Cambiar de fila guarda la anterior automáticamente.
      setSaveTick((t) => t + 1)
      setTimeout(() => setEditRow(id), 0)
    } else setEditRow(id)
  }

  const reorderCols = (target: ColKey) => {
    if (!dragKey || dragKey === target) return
    const next = [...cols]
    next.splice(next.indexOf(dragKey), 1)
    next.splice(next.indexOf(target), 0, dragKey)
    setCols(next)
  }

  const allChecked = items.length > 0 && items.every((p) => selected.has(p.id))
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allChecked) items.forEach((p) => next.delete(p.id))
      else items.forEach((p) => next.add(p.id))
      return next
    })
  }
  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Los cambios del drawer (publicar, pausar, etc.) refrescan la tabla pero
  // NO cierran el drawer: el usuario se queda viendo el resultado.
  const onDrawerChanged = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header con buscador */}
      <header className="flex items-center gap-3 px-6 py-3 flex-shrink-0 bg-white" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar producto…"
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none transition-all text-ink placeholder:text-faint"
            style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0' }}
            onFocus={(e) => {
              e.target.style.borderColor = '#4F46E5'
              e.target.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.08)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#E2E8F0'
              e.target.style.boxShadow = 'none'
            }}
          />
        </div>
      </header>

      {/* Toolbar: título + contador + filtros + columnas (Figma) */}
      <div className="px-5 pt-5 flex-shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-base font-bold text-ink">Inventario</h1>
            <span className="text-xs font-medium text-muted">
              {total.toLocaleString('es-AR')} {total === 1 ? 'producto' : 'productos'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <FilterPanel filters={filters} setFilters={setFilters} categories={categories} />
            <ColumnManager cols={cols} setCols={setCols} />
            <CsvExportButton
              columns={CSV_COLUMNS}
              label="Inventario"
              filenameBase="inventario"
              rowsTotal={total}
              onExport={(colsKeys, limit) =>
                inventoryApi.exportCsv({
                  columns: colsKeys.join(','),
                  limit,
                  q: debouncedQ,
                  channel,
                  category: filters.category !== 'all' ? filters.category : '',
                  ml_status: filters.ml !== 'all' ? (filters.ml as never) : '',
                  tn_status: filters.tn !== 'all' ? (filters.tn as never) : '',
                  stock: filters.stock !== 'all' ? (filters.stock as 'in' | 'out') : '',
                })
              }
            />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-hidden flex flex-col p-5 min-h-0 pt-3">
        {error ? (
          <div className="max-w-xl">
            <ErrorBox message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
          </div>
        ) : (
          <RowEditContext.Provider value={{ active: editRow, saveTick, cancelTick }}>
          <div className="flex-1 overflow-auto rounded-2xl bg-white scroll-slim" style={{ border: '1px solid #E2E8F0' }}>
            <table className="w-full text-xs border-collapse" style={{ minWidth: '680px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr className="bg-white" style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  </th>
                  {defs.map((c) => (
                    <th
                      key={c.key}
                      className="px-2 py-3 font-semibold tracking-wider select-none"
                      draggable={!c.locked}
                      onDragStart={() => setDragKey(c.key)}
                      onDragEnd={() => {
                        setDragKey(null)
                        setOverKey(null)
                      }}
                      onDragOver={(e) => {
                        if (dragKey && !c.locked) {
                          e.preventDefault()
                          setOverKey(c.key)
                        }
                      }}
                      onDragLeave={() => setOverKey((k) => (k === c.key ? null : k))}
                      onDrop={() => {
                        reorderCols(c.key)
                        setOverKey(null)
                      }}
                      style={{
                        color: '#94A3B8',
                        fontSize: '10px',
                        letterSpacing: '0.07em',
                        textAlign: 'left',
                        cursor: c.locked ? 'default' : 'grab',
                        opacity: dragKey === c.key ? 0.4 : 1,
                        boxShadow: overKey === c.key && dragKey !== c.key ? 'inset 2px 0 0 #4F46E5' : 'none',
                        background: overKey === c.key && dragKey !== c.key ? '#EEF2FF' : 'transparent',
                        transition: 'background 0.12s',
                      }}
                    >
                      <span className="inline-flex items-center gap-1" style={{ justifyContent: 'flex-start' }}>
                        {!c.locked && (
                          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" style={{ color: '#CBD5E1', flexShrink: 0 }} aria-hidden>
                            <circle cx="4" cy="3" r="1" fill="currentColor" /><circle cx="8" cy="3" r="1" fill="currentColor" />
                            <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="8" cy="6" r="1" fill="currentColor" />
                            <circle cx="4" cy="9" r="1" fill="currentColor" /><circle cx="8" cy="9" r="1" fill="currentColor" />
                          </svg>
                        )}
                        {c.label}
                        {c.editable && (
                          <span className="flex-shrink-0" style={{ color: '#4F46E5' }} title="Columna editable">
                            <PencilIcon size={10} />
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                  {/* Columna comodín: absorbe el ancho sobrante */}
                  <th style={{ width: '100%' }} />
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <SkeletonRows />
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={defs.length + 2} className="px-4 py-16 text-center text-muted">
                      No hay productos que coincidan con la búsqueda o los filtros.
                    </td>
                  </tr>
                ) : (
                  items.map((p) => (
                    <tr
                      key={p.id}
                      className="group cursor-pointer transition-colors hover:bg-slate-50"
                      style={{ borderBottom: '1px solid #F8FAFC' }}
                      onClick={() => {
                        if (editRow === p.id) return
                        setDrawerProduct(p)
                      }}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} />
                      </td>
                      {defs.map((c) => (
                        <td key={c.key} className="px-2 py-3" style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                          {c.render(p, { onSaved: onCellSaved })}
                        </td>
                      ))}
                      <td className="pl-2 pr-4 py-3" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <RowEditAction editing={editRow === p.id} onStart={() => startRow(p.id)} onSave={saveRow} onCancel={cancelRow} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          </RowEditContext.Provider>
        )}
      </div>

      {/* Footer / paginación */}
      <div className="flex items-center justify-between px-6 py-3 flex-shrink-0 bg-white" style={{ borderTop: '1px solid #E2E8F0' }}>
        <span className="text-xs text-muted">
          {selected.size > 0 ? (
            <span className="font-semibold text-primary">
              {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
            </span>
          ) : (
            <>
              {total.toLocaleString('es-AR')} resultados · Click en un producto para ver detalles
            </>
          )}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">Mostrar</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(1)
            }}
            className="text-xs px-2 py-1 rounded-lg outline-none"
            style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#475569' }}
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
          <span className="text-xs font-medium text-subtle tabular">
            {from} – {to}
          </span>
          {['‹', '›'].map((ch, i) => {
            const isPrev = i === 0
            const disabled = isPrev ? page <= 1 : page >= pages
            return (
              <button
                key={ch}
                disabled={disabled}
                onClick={() => setPage((p) => (isPrev ? Math.max(1, p - 1) : Math.min(pages, p + 1)))}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-sm disabled:opacity-40"
                style={{ color: '#94A3B8', border: '1px solid #E2E8F0' }}
              >
                {ch}
              </button>
            )
          })}
        </div>
      </div>

      {drawerProduct && (
        <ProductDrawer
          product={drawerProduct}
          onClose={() => {
            setDrawerProduct(null)
            if (searchParams.has('product')) {
              const next = new URLSearchParams(searchParams)
              next.delete('product')
              setSearchParams(next, { replace: true })
            }
          }}
          onChanged={onDrawerChanged}
        />
      )}
    </div>
  )
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
          <td className="px-4 py-3">
            <div className="w-3.5 h-3.5 rounded bg-line-soft" />
          </td>
          <td className="px-3 py-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-line-soft" />
              <div className="w-40 h-3 rounded bg-line-soft animate-pulse" />
            </div>
          </td>
          <td className="px-3 py-3">
            <div className="w-16 h-4 rounded bg-line-soft animate-pulse" />
          </td>
          <td className="px-3 py-3">
            <div className="w-8 h-4 rounded-full bg-line-soft animate-pulse" />
          </td>
          <td className="px-3 py-3">
            <div className="w-12 h-3 rounded bg-line-soft animate-pulse" />
          </td>
          <td className="px-3 py-3">
            <div className="w-12 h-3 rounded bg-line-soft animate-pulse" />
          </td>
          <td className="px-3 py-3">
            <div className="w-16 h-4 rounded-full bg-line-soft animate-pulse" />
          </td>
          <td className="px-3 py-3">
            <div className="w-16 h-4 rounded-full bg-line-soft animate-pulse" />
          </td>
        </tr>
      ))}
    </>
  )
}
