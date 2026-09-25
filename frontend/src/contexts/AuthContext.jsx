import React, { createContext, useContext } from 'react';
import { jwtDecode } from 'jwt-decode';
import useAuthStore from '../store/authStore.js';
import { log } from '../utils/logger.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { user, login: storeLogin, logout: storeLogout } = useAuthStore();

  const login = (tokens) => {
    // REDACT: never log token values — presence only.
    log.debug('auth:login_start', { hasToken: !!tokens?.access_token, hasRefreshToken: !!tokens?.refresh_token });
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);
    try {
      const decoded = jwtDecode(tokens.access_token);
      storeLogin(decoded);
      log.info('auth:login_success', { userId: decoded?.sub, role: decoded?.role });
    } catch (e) {
      console.error('Failed to decode token on login', e);
      log.error('auth:login_decode_failed', { err: e });
    }
  };

  const logout = () => {
    log.info('auth:logout', { userId: user?.id, role: user?.role });
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    storeLogout();
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuthContext = () => useContext(AuthContext);
