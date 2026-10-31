import { Component, type ReactNode } from 'react'

/** A failed optional camera bundle must leave navigation and communication usable. */
export class CameraBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    const es = document.documentElement.lang === 'es'
    return <section className="panel stack"><h1 tabIndex={-1}>{es ? 'Asistencia con cámara' : 'Camera assistance'}</h1><p role="alert">{es ? 'No se pudo cargar la cámara. Vuelve a cargar esta página para intentarlo de nuevo. El mapa, la lista y la comunicación siguen disponibles.' : 'Camera assistance could not load. Reload this page to retry. The map, list, and communication remain available.'}</p><button className="btn btn-secondary" onClick={() => window.location.reload()}>{es ? 'Volver a cargar' : 'Reload page'}</button></section>
  }
}
