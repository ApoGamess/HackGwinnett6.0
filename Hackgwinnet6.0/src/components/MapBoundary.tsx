import { Component, type ErrorInfo, type ReactNode } from 'react'

/** A failed optional map bundle must never take away the list or communication. */
export class MapBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError('The map display is unavailable. Use List for the same places and actions.')
  }

  render() { return this.state.failed ? null : this.props.children }
}
