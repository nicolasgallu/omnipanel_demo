// Error boundary: atrapa errores de render y muestra el error en pantalla
// en vez de una pantalla en blanco (el árbol entero se desmonta si no).

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Título del bloque fallido (ej. "El panel del producto"). */
  label?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Omnipanel] Error de render:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="rounded-xl px-4 py-4 text-xs leading-relaxed animate-fade-in"
          style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#B91C1C' }}
        >
          <p className="font-bold text-sm mb-1">
            Algo salió mal{this.props.label ? ` en ${this.props.label}` : ''}
          </p>
          <p className="mb-2 font-mono break-words">{this.state.error.message}</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => this.setState({ error: null })}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:brightness-95 transition-all"
              style={{ background: '#DC2626' }}
            >
              Reintentar
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-white/50"
              style={{ border: '1px solid #FECACA', color: '#B91C1C' }}
            >
              Recargar página
            </button>
          </div>
          {this.state.error.stack && (
            <details className="mt-2">
              <summary className="cursor-pointer font-semibold text-[11px]">Detalles (stack)</summary>
              <pre className="mt-1 whitespace-pre-wrap break-words text-[10px] opacity-80 max-h-40 overflow-auto">
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
