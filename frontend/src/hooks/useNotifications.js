import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Session from 'supertokens-web-js/recipe/session';
import useAuthStore from '../store/authStore.js';
import api from '../utils/api.js';
import { renderNotification } from '../utils/notificationText.js';
import { log } from '../utils/logger.js';
import { getApiBaseUrl } from '../config/apiBase.js';

const BASE_URL = getApiBaseUrl();
const SSE_URL = `${BASE_URL}/v1/notifications/stream`;

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;

/** Module-level in-flight dedupe — survives Strict Mode remounts. */
let notificationsFetchInFlight = null;

/** Resolve the SuperTokens access token for notifications REST + SSE. */
const resolveAccessToken = async () => {
  try {
    return (await Session.getAccessToken()) || null;
  } catch {
    return null;
  }
};

/**
 * useNotifications — SSE for real-time delivery + REST helpers.
 *
 * EventSource cannot set Authorization headers; the backend expects
 * `?token=` (see sseAuthMiddleware). Uses the live SuperTokens session token.
 */
export function useNotifications() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const esRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectDelayRef = useRef(RECONNECT_DELAY_MS);
  const mountedRef = useRef(true);
  /** Bumped on cleanup / auth change so stale reconnect timers & SSE handlers no-op. */
  const connectionGenRef = useRef(0);
  /** After a confirmed 401, do not reconnect until auth state resets. */
  const unauthorizedRef = useRef(false);
  const tRef = useRef(t);
  tRef.current = t;

  const getCsrfToken = () =>
    document.cookie
      .split('; ')
      .find((c) => c.startsWith('csrfToken='))
      ?.split('=')[1];

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const closeEventSource = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (mountedRef.current) setIsConnected(false);
  }, []);

  const fetchNotifications = useCallback(async () => {
    const token = await resolveAccessToken();
    if (!token) return;

    if (notificationsFetchInFlight) {
      return notificationsFetchInFlight;
    }

    if (mountedRef.current) setIsLoading(true);
    log.debug('hook:notifications:fetch_start', { hasToken: true });

    notificationsFetchInFlight = (async () => {
      try {
        const res = await api.get('/v1/notifications', { params: { limit: 30 } });
        const data = res.data?.data;
        if (mountedRef.current) {
          setNotifications(Array.isArray(data) ? data : []);
        }
        log.info('hook:notifications:fetch_success', { count: Array.isArray(data) ? data.length : 0 });
      } catch (err) {
        const status = err?.response?.status;
        log.warn('hook:notifications:fetch_error', { message: err.message, status });
        if (status === 401) {
          unauthorizedRef.current = true;
          closeEventSource();
          clearReconnectTimer();
          logout();
        }
      } finally {
        notificationsFetchInFlight = null;
        if (mountedRef.current) setIsLoading(false);
      }
    })();

    return notificationsFetchInFlight;
  }, [closeEventSource, logout]);

  const connectSSE = useCallback(async () => {
    if (!mountedRef.current || !isAuthenticated) return;
    if (unauthorizedRef.current) {
      log.debug('hook:notifications:sse_skip', { reason: 'unauthorized_latched' });
      return;
    }

    const token = await resolveAccessToken();
    if (!token) {
      log.debug('hook:notifications:sse_skip', { reason: 'no_token' });
      closeEventSource();
      return;
    }

    // Reuse an already-open stream for the same token (Strict Mode remount).
    if (
      esRef.current &&
      esRef.current.readyState !== EventSource.CLOSED &&
      esRef.current.url.includes(encodeURIComponent(token))
    ) {
      log.debug('hook:notifications:sse_reuse', {});
      return;
    }

    clearReconnectTimer();
    closeEventSource();

    const gen = connectionGenRef.current;
    log.debug('hook:notifications:sse_connect_start', { hasToken: true });
    const url = `${SSE_URL}?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('connected', () => {
      if (!mountedRef.current || gen !== connectionGenRef.current) return;
      log.info('hook:notifications:sse_connected', {});
      setIsConnected(true);
      reconnectDelayRef.current = RECONNECT_DELAY_MS;
      // Initial list is loaded once from the lifecycle effect — do not re-fetch here.
    });

    es.addEventListener('notification', (e) => {
      if (!mountedRef.current || gen !== connectionGenRef.current) return;
      try {
        const newNotif = JSON.parse(e.data);
        log.debug('hook:notifications:sse_notification_received', { id: newNotif.id, type: newNotif.type });
        setNotifications((prev) => {
          if (prev.some((n) => n.id === newNotif.id)) return prev;
          return [newNotif, ...prev];
        });
        const { title } = renderNotification(tRef.current, newNotif);
        toast(title || tRef.current('notifications.fallbackToast'), {
          icon: '🔔',
          style: {
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid #334155',
          },
        });
      } catch (err) {
        log.warn('hook:notifications:sse_parse_error', { message: err.message });
      }
    });

    es.onerror = () => {
      if (!mountedRef.current || gen !== connectionGenRef.current) return;

      setIsConnected(false);
      try {
        es.close();
      } catch {
        /* ignore */
      }
      if (esRef.current === es) esRef.current = null;

      // EventSource does not expose HTTP status — probe REST with the same token.
      (async () => {
        if (!mountedRef.current || gen !== connectionGenRef.current) return;

        const latest = await resolveAccessToken();
        if (!latest) {
          log.debug('hook:notifications:sse_stop', { reason: 'token_unusable_after_error' });
          return;
        }

        let status = null;
        try {
          const probe = await api.get('/v1/notifications', { params: { limit: 1 } });
          status = probe.status;
        } catch (err) {
          status = err?.response?.status ?? null;
          if (status === 401) {
            unauthorizedRef.current = true;
            log.warn('hook:notifications:sse_unauthorized_stop', {});
            clearReconnectTimer();
            logout();
            return;
          }
        }

        if (!mountedRef.current || gen !== connectionGenRef.current || unauthorizedRef.current) {
          return;
        }

        const delay = Math.min(reconnectDelayRef.current, MAX_RECONNECT_DELAY_MS);
        log.warn('hook:notifications:sse_error_reconnecting', { nextDelayMs: delay, probeStatus: status });
        reconnectDelayRef.current = delay * 2;
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current && gen === connectionGenRef.current && !unauthorizedRef.current) {
            connectSSE();
          }
        }, delay);
      })();
    };
  }, [isAuthenticated, closeEventSource, logout]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  // Defer boot so React Strict Mode's immediate unmount cancels before connect/fetch.
  useEffect(() => {
    mountedRef.current = true;
    unauthorizedRef.current = false;
    const gen = ++connectionGenRef.current;

    if (!isAuthenticated || !user?.id) {
      closeEventSource();
      clearReconnectTimer();
      return () => {
        mountedRef.current = false;
      };
    }

    let cancelled = false;
    const bootTimer = setTimeout(async () => {
      if (cancelled || gen !== connectionGenRef.current) return;

      const token = await resolveAccessToken();
      if (!token) return;

      // One REST hydrate for the bell — shared in-flight promise across Strict Mode.
      fetchNotifications();
      connectSSE();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(bootTimer);
      mountedRef.current = false;
      connectionGenRef.current += 1;
      clearReconnectTimer();
      closeEventSource();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  const markRead = useCallback(async (id) => {
    const token = await resolveAccessToken();
    if (!token) return;
    try {
      await api.patch(`/v1/notifications/${id}/read`, {}, {
        headers: { 'x-csrf-token': getCsrfToken() },
      });
      log.debug('hook:notifications:mark_read_success', { id });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      log.warn('hook:notifications:mark_read_error', { id, message: err.message });
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const token = await resolveAccessToken();
    if (!token) return;
    try {
      await api.patch('/v1/notifications/read-all', {}, {
        headers: { 'x-csrf-token': getCsrfToken() },
      });
      log.debug('hook:notifications:mark_all_read_success', {});
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      log.warn('hook:notifications:mark_all_read_error', { message: err.message });
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return {
    notifications,
    unreadCount,
    isConnected,
    isLoading,
    markRead,
    markAllRead,
    refresh: fetchNotifications,
  };
}
