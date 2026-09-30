// Tests de la infraestructura de edición por fila (Figma Option A):
// contrato estable de EditableCell + RowEditAction.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditableCell, RowEditAction, RowEditContext } from './rowEdit'

const provider = (active: number | null, saveTick = 0, cancelTick = 0) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <RowEditContext.Provider value={{ active, saveTick, cancelTick }}>
      {children}
    </RowEditContext.Provider>
  )
  return Wrapper
}

describe('EditableCell', () => {
  it('muestra el valor formateado en reposo', () => {
    render(
      <EditableCell rowId={1} value="27000" align type="number" prefix="$" format={(v) => `$${v}`} />,
      { wrapper: provider(null) },
    )
    expect(screen.getByText('$27000')).toBeTruthy()
  })

  it('entra en edición cuando la fila se activa y Enter guarda', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <EditableCell rowId={1} value="27000" type="number" onSave={onSave} />,
      { wrapper: provider(1) },
    )
    const input = screen.getByDisplayValue('27000') as HTMLInputElement
    fireEvent.change(input, { target: { value: '30000' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // commit async: esperar microtasks
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith('30000'))
  })

  it('Escape cancela y revierte el draft', () => {
    render(<EditableCell rowId={1} value="27000" type="number" />, { wrapper: provider(1) })
    const input = screen.getByDisplayValue('27000') as HTMLInputElement
    fireEvent.change(input, { target: { value: '99999' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    // Vuelve al modo idle: se muestra el valor original.
    expect(screen.getByText('27000')).toBeTruthy()
    expect(screen.queryByDisplayValue('99999')).toBeNull()
  })

  it('valida números y muestra error sin guardar', async () => {
    const onSave = vi.fn()
    render(
      <EditableCell rowId={1} value="27000" type="number" onSave={onSave} />,
      { wrapper: provider(1) },
    )
    const input = screen.getByDisplayValue('27000') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await vi.waitFor(() => expect(screen.getByText('Ingresá un número válido')).toBeTruthy())
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('RowEditAction', () => {
  it('muestra Guardar/Cancelar en edición y dispara los callbacks', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    const { rerender } = render(
      <RowEditAction editing={false} onStart={vi.fn()} onSave={onSave} onCancel={onCancel} />,
    )
    rerender(<RowEditAction editing={true} onStart={vi.fn()} onSave={onSave} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Guardar'))
    fireEvent.click(screen.getByText('Cancelar'))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
