import React from 'react';
import { log } from '../utils/logger.js';

// Minimal React error boundary (logging-instrumentation-2026-07-22 — F2 scope: pages/routing/
// context). No error boundary existed anywhere in the app before this pass, so every render
// error below the router just produced a white screen with nothing in the client log pipe.
// Wrapped around <Suspense> in AppRouter.jsx (not App.jsx — foundation already owns that file
// for the Download-logs button, see HANDOFF.md §4) so it catches render errors AND lazy-chunk
// load failures, while <DebugBar/> stays outside it and survives a crash below.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    log.error('react:error_boundary', { err: error, componentStack: errorInfo?.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-main-theme, #1A202C)' }}>
          <h2>Something went wrong.</h2>
          <p style={{ opacity: 0.7, fontSize: '0.85rem' }}>
            The error has been logged. Please refresh the page or contact support if this persists.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
