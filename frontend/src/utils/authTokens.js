/**
 * Access-token helpers shared by auth bootstrap and notification SSE.
 * SuperTokens owns live sessions; localStorage access_token is legacy-only
 * and is purged when obsolete Mock Mode keys are found.
 */

const OBSOLETE_MOCK_KEYS = [
  'prism_debug_api_mode',
  'prism_debug_api_mode_prev',
  'prism_mock_records',
  'prism_mock_users',
];

const LEGACY_MOCK_ACCESS = 'mock-jwt-access-token';
const LEGACY_MOCK_REFRESH = 'mock-jwt-refresh-token';

export function getAccessToken() {
  try {
    return localStorage.getItem('access_token');
  } catch {
    return null;
  }
}

function isObsoleteMockToken(token) {
  if (!token || typeof token !== 'string') return false;
  return token === LEGACY_MOCK_ACCESS
    || token === LEGACY_MOCK_REFRESH
    || token.startsWith('mock-jwt-');
}

/**
 * One-time cleanup of obsolete frontend Mock Mode localStorage keys.
 * Removes only Mock Mode artifacts — does not clear unrelated app state.
 * @returns {{ clearedMockTokens: boolean }} whether synthetic JWT tokens were removed
 */
export function purgeObsoleteMockModeStorage() {
  let clearedMockTokens = false;
  try {
    for (const key of OBSOLETE_MOCK_KEYS) {
      localStorage.removeItem(key);
    }

    const access = localStorage.getItem('access_token');
    const refresh = localStorage.getItem('refresh_token');
    if (isObsoleteMockToken(access) || isObsoleteMockToken(refresh)) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      clearedMockTokens = true;
    }
  } catch {
    /* ignore quota / private mode */
  }
  return { clearedMockTokens };
}
