import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  // Identifies which model failed in the console log only — there's no
  // visible fallback UI (see render() below), so this is the only trace
  // left of a dropped model.
  label: string
}

interface State {
  hasError: boolean
}

// useGLTF's cache (primed ahead of time by each file's own useGLTF.preload
// calls) re-throws a rejected promise synchronously the moment a component
// calls useGLTF on a URL that failed to fetch or parse. Without a boundary
// placed AT each model, that throw would be caught by CanvasErrorBoundary —
// the outermost one, wrapping the whole <Canvas> — taking down every tile,
// piece, port, and the robber for the failure of a single GLB. This
// boundary is meant to sit as close as possible to one model's own
// useGLTF/useClonedModel call (a leaf component, not the parent that also
// renders sibling content) so only that one model disappears, silently,
// while the rest of the scene keeps working.
export class ModelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error(`[Catan] Model failed to load (${this.props.label}):`, error)
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}
