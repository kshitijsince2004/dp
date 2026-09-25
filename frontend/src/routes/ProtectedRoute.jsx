import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Session from 'supertokens-web-js/recipe/session';
import useAuthStore from '../store/authStore.js';
import { Spinner } from '../components/ui/Spinner.jsx';
import { ROUTES } from '../utils/constants.js';
import { log } from '../utils/logger.js';
import { isLiveApiMode } from '../utils/authTokens.js';

/**
 * Enforces authentication (and optional role) at the route level.
 *
 * Live API: confirms a live SuperTokens session (Session.doesSessionExist), not just
 * the persisted store, so a stale persisted user cannot grant access after the session expires.
 * Mock Mode: falls back to the persisted auth store (DebugBar offline demos).
 *
 * Usage:
 *   <Route element={<ProtectedRoute />}> ... </Route>
 *   <Route element={<ProtectedRoute roles={['SYSTEM_ADMIN','HQ_ADMIN']} />}> ... </Route>
 */
export const ProtectedRoute = ({ roles = [] }) => {
  const { user, isAuthenticated } = useAuthStore();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let active = true;

    if (!isLiveApiMode()) {
      // Mock / debug modes use store auth, not SuperTokens.
      if (active) {
        setHasSession(!!isAuthenticated);
        setChecking(false);
      }
      return () => { active = false; };
    }

    Session.doesSessionExist()
      .then((exists) => { if (active) { setHasSession(exists); setChecking(false); } })
      .catch(() => { if (active) { setHasSession(false); setChecking(false); } });
    return () => { active = false; };
  }, [location.pathname, isAuthenticated]);

  if (checking) return <Spinner fullPage />;

  if (!hasSession) {
    log.debug('route:protected_redirect', { reason: 'no_session', from: location.pathname, to: ROUTES.LOGIN });
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location }} />;
  }

  if (roles.length > 0) {
    // Session exists but /me may not have populated the store yet — hold rather than bounce.
    if (!user) return <Spinner fullPage />;
    if (!roles.includes(user.role)) {
      log.debug('route:protected_redirect', { reason: 'wrong_role', from: location.pathname, role: user.role, allowedRoles: roles });
      return <Navigate to={ROUTES.HOME} replace />;
    }
  }

  return <Outlet />;
};
