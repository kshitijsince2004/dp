import React, { createContext, useContext } from 'react';
import useAuthStore from '../store/authStore.js';
import { log } from '../utils/logger.js';

const AuthContext = createContext(null);

/**
 * Thin provider over the Zustand auth store.
 * Session tokens are owned by SuperTokens — do not write access_token/refresh_token
 * to localStorage from this context.
 */
export function AuthProvider({ children }) {
  const { user, logout: storeLogout } = useAuthStore();

  const logout = () => {
    log.info('auth:logout', { userId: user?.id, role: user?.role });
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } catch {
      /* ignore */
    }
    storeLogout();
  };

  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuthContext = () => useContext(AuthContext);
