import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth.api.js';
import useAuthStore from '../store/authStore.js';
import { QUERY_KEYS } from '../utils/constants.js';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { log } from '../utils/logger.js';

export const useAuth = () => {
  const { user, isAuthenticated, login, logout, setLoading, activeNodeId } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // REDACT: only { userId, role, hasToken } ever logged here — never the token/credentials.
  // Keyed on the derived values themselves (not every render) so every consumer of this
  // hook doesn't spam a line per re-render — only when the auth state actually changes.
  useEffect(() => {
    log.debug('auth:state_read', {
      userId: user?.id ?? null,
      role: user?.role ?? null,
      isAuthenticated,
      hasToken: !!localStorage.getItem('access_token'),
    });
  }, [user?.id, user?.role, isAuthenticated]);

  // Fetch current user (runs once on mount)
  const { data: userData, isLoading: isFetching, error: queryError } = useQuery({
    queryKey: QUERY_KEYS.ME,
    queryFn: async () => {
      log.debug('auth:me_fetch_start', {});
      try {
        const res = await authApi.getMe();
        log.info('auth:me_fetch_success', { userId: res.data?.data?.user?.id ?? null, role: res.data?.data?.user?.role ?? null });
        return res.data.data; // contains { user, jurisdiction }
      } catch (err) {
        if (!err.response && isAuthenticated) {
          // Keep current offline user if backend is offline
          log.warn('auth:me_fetch_offline_fallback', { userId: user?.id ?? null });
          return { user };
        }
        log.error('auth:me_fetch_error', { status: err?.response?.status, message: err?.message });
        throw err;
      }
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Safe side-effect sync
  useEffect(() => {
    if (userData?.user) {
      log.debug('auth:sync_login', { userId: userData.user.id ?? null, role: userData.user.role ?? null, hasJurisdiction: !!userData.jurisdiction });
      login(userData.user, userData.jurisdiction);
    }
  }, [userData]);


  // Handle query errors
  useEffect(() => {
    if (queryError) {
      log.warn('auth:me_query_error_logout', { status: queryError?.response?.status });
      logout();
    }
  }, [queryError]);

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials) => {
      // REDACT: never log credentials.password/access_token/refresh_token — presence only.
      log.debug('auth:login_attempt', { hasEmail: !!credentials?.email, hasPassword: !!credentials?.password });
      try {
        const payload = {
          ...credentials,
          badge_no: credentials.email,
          badgeNo: credentials.email
        };
        const res = await authApi.login(payload);
        const { user, access_token, refresh_token } = res.data.data;
        if (access_token) localStorage.setItem('access_token', access_token);
        if (refresh_token) localStorage.setItem('refresh_token', refresh_token);
        log.info('auth:login_success', { userId: user?.id ?? null, role: user?.role ?? null, hasAccessToken: !!access_token, hasRefreshToken: !!refresh_token });
        return user;
      } catch (err) {
        if (!err.response) {
          const debugMode = localStorage.getItem('prism_debug_api_mode') || 'production';
          if (debugMode === 'production') {
            log.error('auth:login_error', { reason: 'backend_unreachable' });
            throw new Error('Cannot reach the server. Start the backend with npm run dev.');
          }
          console.warn("Backend offline. Simulating mock login for:", credentials.email);
          log.warn('auth:login_mock_fallback', { debugMode });
          return {
            id: "mock-user-id",
            username: credentials.email.split('@')[0] || "HC Ramesh Kumar",
            email: credentials.email,
            role: "user",
          };
        }
        log.error('auth:login_error', { status: err?.response?.status, message: err?.message });
        throw err;
      }
    },
    onSuccess: (userData) => {
      // Intentionally not passing jurisdiction here, it will be fetched by /me immediately after
      log.debug('auth:login_mutation_success', { userId: userData?.id ?? null, role: userData?.role ?? null });
      login(userData, null);
      toast.success('Welcome back!');
      navigate('/dashboard');
    },
    onError: (err) => {
      const msg = err.response?.data?.message || err.message || 'Login failed';
      log.warn('auth:login_mutation_error', { status: err?.response?.status, message: msg });
      toast.error(msg, { duration: 6000 });
    },
  });

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: async (userData) => {
      log.debug('auth:register_attempt', { hasUsername: !!userData?.username, hasEmail: !!userData?.email });
      try {
        await authApi.register(userData);
        log.info('auth:register_success', { hasUsername: !!userData?.username });
      } catch (err) {
        if (!err.response) {
          console.warn("Backend offline. Simulating mock registration for:", userData.username);
          log.warn('auth:register_mock_fallback', {});
          return;
        }
        log.error('auth:register_error', { status: err?.response?.status, message: err?.message });
        throw err;
      }
    },
    onSuccess: () => {
      toast.success('Account created! Please log in.');
      navigate('/login');
    },
    onError: (err) => {
      log.warn('auth:register_mutation_error', { status: err?.response?.status });
      toast.error(err.response?.data?.message || 'Registration failed');
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      log.debug('auth:logout_attempt', { userId: user?.id ?? null });
      try {
        await authApi.logout();
        log.info('auth:logout_success', {});
      } catch (err) {
        // Suppress offline errors on logout
        if (!err.response) return;
        log.warn('auth:logout_error', { status: err?.response?.status });
        throw err;
      }
    },
    onSettled: () => {
      log.debug('auth:logout_settled', {});
      logout();
      queryClient.clear();
      navigate('/login');
    },
  });

  return {
    user,
    isAuthenticated,
    isFetching,
    loginMutation,
    registerMutation,
    logoutMutation,
  };
};

