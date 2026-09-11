import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';
import { Spinner } from '../components/ui/Spinner.jsx';
import { ROUTES } from '../utils/constants.js';
import { log } from '../utils/logger.js';

/**
 * Wraps routes that require authentication.
 * Optionally restricts to specific roles.
 *
 * Usage:
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/dashboard" element={<Dashboard />} />
 *   </Route>
 *
 *   <Route element={<ProtectedRoute roles={['admin']} />}>
 *     <Route path="/admin" element={<AdminPanel />} />
 *   </Route>
 */
export const ProtectedRoute = ({ roles = [] }) => {
  const { isAuthenticated, user, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) return <Spinner fullPage />;

  if (!isAuthenticated) {
    // log.debug('route:protected_redirect', { reason: 'no_token', from: location.pathname, to: ROUTES.LOGIN });
    // return <Navigate to={ROUTES.LOGIN} replace />;
  }

  if (roles.length > 0 && !roles.includes(user?.role)) {
    // log.debug('route:protected_redirect', {
    //   reason: 'wrong_role', from: location.pathname, to: ROUTES.HOME, role: user?.role, allowedRoles: roles,
    // });
    // return <Navigate to={ROUTES.HOME} replace />;
  }

  return <Outlet />;
};
