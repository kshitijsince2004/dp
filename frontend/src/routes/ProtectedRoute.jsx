/**
 * Route gate. Session existence has one owner: probeSession().
 * This component does not log the user in and does not refresh on every navigation.
 *
 * LOADING          — session probe in flight
 * AUTHENTICATED    — SuperTokens session exists
 * UNAUTHENTICATED  — no session; persisted store is cleared so /login cannot bounce back
 * UNAVAILABLE      — API refused the connection; this is not a signed-out user
 */
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';
import { Spinner } from '../components/ui/Spinner.jsx';
import { ROUTES } from '../utils/constants.js';
import { log } from '../utils/logger.js';
import { probeSession, SESSION_STATUS } from '../auth/sessionGate.js';

export const ProtectedRoute = ({ roles = [] }) => {
  const { user } = useAuthStore();
  const location = useLocation();
  const [status, setStatus] = useState(SESSION_STATUS.LOADING);

  useEffect(() => {
    let active = true;
    probeSession().then((next) => {
      if (!active) return;
      if (next === SESSION_STATUS.UNAUTHENTICATED) {
        useAuthStore.getState().logout();
      }
      setStatus(next);
    });
    return () => { active = false; };
  }, []);

  if (status === SESSION_STATUS.LOADING) return <Spinner fullPage />;

  if (status === SESSION_STATUS.UNAVAILABLE) {
    log.warn('route:api_unreachable', { from: location.pathname });
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-semibold text-slate-900">The API is not reachable.</p>
        <p className="max-w-md text-xs text-slate-500">
          Session refresh was not repeated. The server refused the connection, so this is not a signed-out session.
        </p>
        <button
          type="button"
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
          onClick={() => {
            setStatus(SESSION_STATUS.LOADING);
            probeSession().then((next) => {
              if (next === SESSION_STATUS.UNAUTHENTICATED) useAuthStore.getState().logout();
              setStatus(next);
            });
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (status === SESSION_STATUS.UNAUTHENTICATED) {
    log.debug('route:protected_redirect', { reason: 'no_session', from: location.pathname, to: ROUTES.LOGIN });
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location }} />;
  }

  if (roles.length > 0) {
    if (!user) return <Spinner fullPage />;
    if (!roles.includes(user.role)) {
      log.debug('route:protected_redirect', { reason: 'wrong_role', from: location.pathname, role: user.role, allowedRoles: roles });
      return <Navigate to={ROUTES.HOME} replace />;
    }
  }

  return <Outlet />;
};
