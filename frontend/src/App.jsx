import { useEffect } from 'react';
import { AppRouter } from './routes/AppRouter.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import useAuthStore from './store/authStore.js';
import { HIERARCHY_THEMES } from './utils/hierarchyTheme.js';
import { LOG_ENABLED, downloadLogs } from './utils/logger.js';

/**
 * Manual "Download logs" fallback (logging-instrumentation-2026-07-22, HANDOFF.md §6.5) — for
 * when the backend client-log ingest itself is unreachable/broken. Only rendered when the
 * client logger is actually enabled (dev, or VITE_DEBUG_LOGGING=true); a no-op/absent button in
 * production otherwise. Least-invasive mount point: a small, unobtrusive floating button
 * positioned above the existing DebugBar (routes/AppRouter.jsx), not inside it.
 */
function DownloadLogsButton() {
  if (!LOG_ENABLED) return null;
  return (
    <button
      type="button"
      onClick={() => downloadLogs()}
      title="Download debug logs (PHAROS)"
      style={{
        position: 'fixed',
        bottom: 48,
        right: 12,
        zIndex: 9999,
        padding: '5px 9px',
        fontSize: 11,
        lineHeight: 1.2,
        borderRadius: 6,
        border: '1px solid rgba(148,163,184,0.4)',
        background: 'rgba(24,24,27,0.85)',
        color: '#e4e4e7',
        cursor: 'pointer',
        opacity: 0.55,
        transition: 'opacity 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.55'; }}
    >
      Download logs
    </button>
  );
}

/**
 * Root App component — delegates everything to the router.
 * Dynamically sets hierarchy level CSS variables at the document root.
 */
function App() {
  const user = useAuthStore((state) => state.user);
  const level = user?.level || 'PS';
  const theme = HIERARCHY_THEMES[level] || HIERARCHY_THEMES.PS;

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(theme).forEach(([k, v]) => {
      root.style.setProperty(k, v);
    });
  }, [level, theme]);

  return (
    <AuthProvider>
      <AppRouter />
      <DownloadLogsButton />
    </AuthProvider>
  );
}

export default App;
