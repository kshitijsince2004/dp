/**
 * Access-token helpers shared by auth bootstrap and notification SSE.
 * Mock Mode login intentionally stores mock-jwt-* tokens for the axios
 * interceptor; those must never be sent to the real backend via EventSource.
 */

export const MOCK_ACCESS_TOKEN = 'mock-jwt-access-token';
export const MOCK_REFRESH_TOKEN = 'mock-jwt-refresh-token';

export function getAccessToken() {
  try {
    return localStorage.getItem('access_token');
  } catch {
    return null;
  }
}

export function getApiDebugMode() {
  try {
    return localStorage.getItem('prism_debug_api_mode') || 'production';
  } catch {
    return 'production';
  }
}

export function isLiveApiMode() {
  return getApiDebugMode() === 'production';
}

export function isMockAccessToken(token = getAccessToken()) {
  if (!token || typeof token !== 'string') return false;
  return token === MOCK_ACCESS_TOKEN || token.startsWith('mock-jwt-');
}

/** True when SSE can safely talk to the real notifications backend. */
export function canUseRealtimeNotifications(token = getAccessToken()) {
  return isLiveApiMode() && !!token && !isMockAccessToken(token);
}

/**
 * Live API + leftover mock token (e.g. after switching DebugBar modes without
 * a clean re-login) is an invalid session — clear tokens so the user re-auths.
 * Returns true if a stale mock session was cleared.
 */
export function clearStaleMockTokensInLiveMode() {
  if (!isLiveApiMode()) return false;
  const access = getAccessToken();
  const refresh = (() => {
    try {
      return localStorage.getItem('refresh_token');
    } catch {
      return null;
    }
  })();

  const stale =
    isMockAccessToken(access) ||
    refresh === MOCK_REFRESH_TOKEN ||
    (typeof refresh === 'string' && refresh.startsWith('mock-jwt-'));

  if (!stale) return false;

  try {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  } catch {
    /* ignore */
  }
  return true;
}
