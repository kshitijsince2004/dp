import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth.api.js';
import useAuthStore from '../store/authStore.js';
import { QUERY_KEYS } from '../utils/constants.js';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { log } from '../utils/logger.js';
import Session from 'supertokens-web-js/recipe/session';

export const useAuth = () => {
  const { user, isAuthenticated, login, logout } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Session existence is owned by probeSession() in ProtectedRoute.
  // This hook must not call Session.doesSessionExist — that call refreshes the
  // access token, and every consumer (navbar, login page) was starting its own refresh.
  useEffect(() => {
    log.debug('auth:state_read', {
      userId: user?.id ?? null,
      role: user?.role ?? null,
      isAuthenticated,
    });
  }, [user?.id, user?.role, isAuthenticated]);

  // Fetch current user (runs once on mount)
  const { data: userData, isLoading: isFetching, error: queryError } = useQuery({
    queryKey: QUERY_KEYS.ME,
    queryFn: async () => {
      log.debug('auth:me_fetch_start', {});
      try {
        const res = await authApi.getMe();
        const body = res.data?.data;
        const profile = body?.user;
        const userId = profile?.id || profile?.sub || null;
        if (!userId) {
          log.error('auth:me_contract_error', {
            role: profile?.role ?? null,
            level: profile?.level ?? null,
          });
          const contract = new Error('Profile response is missing user.id');
          contract.code = 'AUTH_CONTRACT';
          contract.response = res;
          throw contract;
        }
        log.info('auth:me_fetch_success', {
          userId,
          role: profile.role ?? null,
          level: profile.level ?? null,
        });
        return body;
      } catch (err) {
        if (!err.response) {
          log.warn('auth:me_fetch_unreachable', { userId: user?.id ?? null });
          const unreachable = new Error('API unreachable');
          unreachable.code = 'API_UNREACHABLE';
          throw unreachable;
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
    const profile = userData?.user;
    const userId = profile?.id || profile?.sub;
    if (!userId) return;
    log.debug('auth:sync_login', {
      userId,
      role: profile.role ?? null,
      level: profile.level ?? null,
      hasJurisdiction: !!userData.jurisdiction,
    });
    login(profile, userData.jurisdiction);
  }, [userData, login]);


  // Handle query errors
  useEffect(() => {
    if (!queryError) return;
    if (queryError.code === 'API_UNREACHABLE' || queryError.code === 'AUTH_CONTRACT' || !queryError.response) return;
    log.warn('auth:me_query_error_logout', { status: queryError?.response?.status });
    logout();
  }, [queryError, logout]);

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
        // SuperTokens establishes the session from the login response headers automatically
        // (via the axios interceptors attached to this `api` instance). No manual token storage.
        const user = res.data?.data?.user;
        const userId = user?.id || user?.sub;
        if (!userId) {
          log.error('auth:login_contract_error', {
            role: user?.role ?? null,
            level: user?.level ?? null,
          });
          throw new Error('Login response is missing user.id');
        }

        log.info('auth:login_success', {
          userId,
          role: user.role ?? null,
          level: user.level ?? null,
        });
        return user;
      } catch (err) {
        if (!err.response) {
          log.error('auth:login_error', { reason: 'backend_unreachable' });
          throw new Error('Cannot reach the server. Start the backend with npm run dev.', { cause: err });
        }
        log.error('auth:login_error', { status: err?.response?.status, message: err?.message });
        throw err;
      }
    },
    onSuccess: (userData) => {
      // Intentionally not passing jurisdiction here, it will be fetched by /me immediately after
      log.debug('auth:login_mutation_success', {
        userId: userData?.id ?? userData?.sub ?? null,
        role: userData?.role ?? null,
        level: userData?.level ?? null,
      });
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
          log.error('auth:register_error', { reason: 'backend_unreachable' });
          throw new Error('Cannot reach the server. Start the backend with npm run dev.', { cause: err });
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
        await Session.signOut(); // revokes the SuperTokens session and clears its tokens
        try {
          await authApi.logout();
        } catch {
          /* best-effort app logout after ST signOut */
        }
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
