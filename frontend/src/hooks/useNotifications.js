import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore.js';
import { renderNotification } from '../utils/notificationText.js';
import { log } from '../utils/logger.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SSE_URL = `${BASE_URL}/v1/notifications/stream`;
const REST_URL = `${BASE_URL}/v1/notifications`;

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;

/**
 * useNotifications — connects to the SSE stream for real-time notification delivery
 * and provides helpers to fetch, mark-read, and mark-all-read via REST.
 *
 * Returns:
 *  - notifications: array of notification objects
 *  - unreadCount: number
 *  - isConnected: boolean (SSE stream status)
 *  - markRead(id): mark a single notification as read
 *  - markAllRead(): mark all as read
 *  - refresh(): manually re-fetch all notifications
 */
export function useNotifications() {
  const { user, isAuthenticated } = useAuthStore();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const esRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectDelayRef = useRef(RECONNECT_DELAY_MS);
  const mountedRef = useRef(true);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getToken = () => localStorage.getItem('access_token');
  const getCsrfToken = () =>
  document.cookie
    .split('; ')
    .find((c) => c.startsWith('csrfToken='))
    ?.split('=')[1];

  const fetchNotifications = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsLoading(true);
    log.debug('hook:notifications:fetch_start', { hasToken: true });
    try {
      const res = await fetch(`${REST_URL}?limit=30`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // Backend returns { status: 'success', data: [...] }
      const data = json?.data;
      if (mountedRef.current) {
        setNotifications(Array.isArray(data) ? data : []);
      }
      log.info('hook:notifications:fetch_success', { count: Array.isArray(data) ? data.length : 0 });
    } catch (err) {
      log.warn('hook:notifications:fetch_error', { message: err.message });
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  // ── SSE Connection ────────────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (!isAuthenticated) return;
    const token = getToken();
    if (!token) return;

    // Close any existing connection
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    log.debug('hook:notifications:sse_connect_start', { hasToken: true });
    const url = `${SSE_URL}?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('connected', () => {
      if (!mountedRef.current) return;
      log.info('hook:notifications:sse_connected', {});
      setIsConnected(true);
      reconnectDelayRef.current = RECONNECT_DELAY_MS; // Reset backoff on success
      fetchNotifications(); // Load existing notifications on fresh connect
    });

    es.addEventListener('notification', (e) => {
      if (!mountedRef.current) return;
      try {
        const newNotif = JSON.parse(e.data);
        log.debug('hook:notifications:sse_notification_received', { id: newNotif.id, type: newNotif.type });
        setNotifications((prev) => {
          // Avoid duplicates
          if (prev.some((n) => n.id === newNotif.id)) return prev;
          return [newNotif, ...prev];
        });
        // Show a toast for the live push
        const { title } = renderNotification(t, newNotif);
        toast(title || t('notifications.fallbackToast'), {
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
      if (!mountedRef.current) return;
      setIsConnected(false);
      es.close();
      esRef.current = null;

      // Exponential backoff reconnect
      const delay = Math.min(reconnectDelayRef.current, MAX_RECONNECT_DELAY_MS);
      log.warn('hook:notifications:sse_error_reconnecting', { nextDelayMs: delay });
      reconnectDelayRef.current = delay * 2;
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connectSSE();
      }, delay);
    };
  }, [isAuthenticated, fetchNotifications, t]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    if (isAuthenticated && user) {
      connectSSE();
    }
    return () => {
      mountedRef.current = false;
      if (esRef.current) esRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [isAuthenticated, user?.id]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const markRead = useCallback(async (id) => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${REST_URL}/${id}/read`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
            'x-csrf-token': getCsrfToken(),
},
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      log.debug('hook:notifications:mark_read_success', { id });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      log.warn('hook:notifications:mark_read_error', { id, message: err.message });
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${REST_URL}/read-all`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-csrf-token': getCsrfToken(),
},
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
