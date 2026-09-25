import axios from 'axios';
import { log, newRequestId } from './logger.js';
import Session from 'supertokens-web-js/recipe/session';

// Excluded from interceptor logging by URL — see HANDOFF.md §6.2. logger.js ships its OWN batch
// of client logs via a raw `fetch` (never through this axios instance), so this guard is
// defensive-only, but it's cheap insurance against a future caller accidentally routing that
// endpoint through `api` and creating a request/response logging feedback loop.
const isLogsEndpoint = (url) => typeof url === 'string' && url.includes('/logs/client');

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Create central axios client — always talks to the real backend.
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000,
});

// SuperTokens manages the auth header and automatic token refresh on this axios instance.
Session.addAxiosInterceptors(api);

// Helper to parse cookies
const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
};

// Request Interceptor
api.interceptors.request.use(
  (config) => {
    // Auth header + token refresh are handled by SuperTokens (Session.addAxiosInterceptors).
    const csrfToken = getCookie('csrfToken');
    if (csrfToken) {
      config.headers['x-csrf-token'] = csrfToken;
    }
    // Allow credentials to ensure cookies are sent back
    config.withCredentials = true;

    // Request correlation (logging-instrumentation-2026-07-22): attach a fresh x-request-id so
    // the backend's requestLogger.middleware.js logs this exact call under the same id — see
    // utils/requestContext.js on the backend. Never logs Authorization/token/csrf header values.
    if (!isLogsEndpoint(config.url)) {
      const requestId = newRequestId();
      config.headers['x-request-id'] = requestId;
      config.metadata = { ...(config.metadata || {}), requestId, startTime: Date.now() };
      log.debug('api:request', { method: config.method, url: config.url, requestId });
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    if (!isLogsEndpoint(response.config?.url)) {
      const meta = response.config?.metadata || {};
      log.debug('api:response', {
        status: response.status,
        method: response.config?.method,
        url: response.config?.url,
        requestId: meta.requestId,
        durationMs: meta.startTime ? Date.now() - meta.startTime : undefined,
      });
    }
    return response;
  },
  async (error) => {
    // Genuine Axios failures only.
    if (!isLogsEndpoint(error.config?.url)) {
      const cfg = error.config || {};
      const meta = cfg.metadata || {};
      const status = error.response?.status ?? null;
      const level = status && status < 500 ? 'warn' : 'error';
      log[level]('api:response:error', {
        status,
        method: cfg.method,
        url: cfg.url,
        requestId: meta.requestId,
        durationMs: meta.startTime ? Date.now() - meta.startTime : undefined,
        message: error.message || error.response?.data?.message,
      });
    }

    // Token refresh is handled automatically by SuperTokens (Session.addAxiosInterceptors).
    // A 401 that reaches here means the session is genuinely invalid; surface it to the caller.
    return Promise.reject(error);
  }
);

export default api;
export { formSchemas } from './formSchemas.js';
