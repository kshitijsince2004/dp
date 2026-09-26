/**
 * Single browser-side API address.
 *
 * VITE_API_URL is the axios base and includes the /api prefix
 * (default http://localhost:5000/api, matching backend PORT and API_DOMAIN).
 * SuperTokens needs only the origin; it appends apiBasePath /api/v1/auth itself.
 */
const RAW = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

export function getApiBaseUrl() {
  return RAW;
}

export function getApiOrigin() {
  return RAW.replace(/\/api(\/v1)?$/, '');
}
