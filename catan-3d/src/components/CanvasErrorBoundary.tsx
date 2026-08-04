import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// React error boundaries have to be class components — there is still no
// hook equivalent for componentDidCatch.
//
// Without this, anything that throws inside <Canvas> (a WebGL context the
// driver refuses, a post-processing effect that can't compile its shader,
// a bad geometry argument) unmounts the whole React tree and leaves a blank
// white page with no explanation and no way back.
export class CanvasErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Catan] 3D scene crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-board-navy p-6">
        <div
          role="alert"
          className="w-full max-w-md rounded-2xl border border-glass-border bg-glass p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        >
          <p className="font-body text-xs tracking-[0.3em] text-player-1 uppercase">Scene Error</p>
          <h2 className="mt-3 font-display text-2xl text-white">The 3D board failed to render</h2>
          <p className="mt-3 font-body text-sm text-white/60">
            Your browser or graphics driver rejected part of the scene. Reloading usually clears it.
          </p>
          <pre className="mt-4 max-h-28 overflow-auto rounded-lg bg-black/30 p-3 text-left font-data text-[10px] break-words whitespace-pre-wrap text-white/50">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2.5 font-display text-sm font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
