import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Top-level crash guard: renders a recovery screen instead of a white page. */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: ErrorBoundaryProps;
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div
          className="min-h-screen flex items-center justify-center p-6"
          style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}
        >
          <div className="card p-6 max-w-md w-full text-center">
            <div className="text-3xl mb-2">⚠️</div>
            <h1 className="text-lg font-semibold mb-1">Something went wrong</h1>
            <p className="text-sm text-muted mb-4">
              An unexpected error occurred. Reloading usually fixes it.
            </p>
            <pre className="text-[11px] text-left bg-well rounded-md p-3 mb-4 overflow-auto max-h-32 whitespace-pre-wrap break-words">
              {this.state.error.message}
            </pre>
            <button type="button" className="btn-min btn-primary w-full" onClick={this.handleReload}>
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
