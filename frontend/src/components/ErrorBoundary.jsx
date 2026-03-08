import { Component } from 'react'
import { ShieldAlert, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[Haven] Uncaught error:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen bg-haven-bg flex items-center justify-center p-6">
        <div className="bg-haven-card border border-haven-border rounded-2xl p-10 max-w-md w-full text-center shadow-card">
          <ShieldAlert className="mx-auto mb-4 text-haven-primary" size={48} strokeWidth={1.5} />
          <h2 className="text-xl font-semibold text-haven-text mb-2">Something went wrong</h2>
          <p className="text-haven-sub text-sm mb-6">
            Haven encountered an unexpected error. Your data is safe — please reload to continue.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 bg-haven-primary hover:bg-haven-glow text-white px-5 py-2.5 rounded-xl font-medium transition-colors"
          >
            <RefreshCw size={16} />
            Reload Haven
          </button>
        </div>
      </div>
    )
  }
}
