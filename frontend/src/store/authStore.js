import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { log } from '../utils/logger.js';
import { purgeObsoleteMockModeStorage } from '../utils/authTokens.js';

const RANK_BY_ROLE = {
  HC: 'Head Constable',
  SHO: 'Station House Officer',
  ACP: 'Assistant Commissioner of Police',
  DISTRICT_OFFICER: 'Deputy Commissioner of Police',
  SYSTEM_ADMIN: 'System Administrator',
};

// Normalizes whatever shape the caller has on hand — the raw JWT payload
// (ids only: sub/ps_id/district_id/sub_div_id, no name/no id key) from
// AuthContext's decode path, or the full /me response (id, name, ps_name,
// sub_div_name, district_name) — into one consistent user object so the rest
// of the app never has to guess which source it's reading.
const normalizeUser = (userData) => {
  const role = userData.role || 'GUEST';
  return {
    ...userData,
    id: userData.id || userData.sub,
    role,
    rank: RANK_BY_ROLE[role] || 'Officer',
    ps_id: userData.ps_id ?? null,
    psId: userData.ps_id ?? null,
    district_id: userData.district_id ?? null,
    districtId: userData.district_id ?? null,
    sub_div_id: userData.sub_div_id ?? null,
    stationName: userData.ps_name || userData.ps_name_en || userData.stationName || null,
    districtKey: userData.district_name || userData.district_name_en || userData.districtKey || null,
  };
};

const useAuthStore = create(
  devtools(
    persist(
      (set, get) => ({
        user: null,
        jurisdiction: null,
        isAuthenticated: false,
        isLoading: false,

        setUser: (user, jurisdiction) => set({ user, jurisdiction, isAuthenticated: !!user }),

        setLoading: (isLoading) => set({ isLoading }),

        login: (userData, jurisdictionData) => {
          const identity = userData?.id || userData?.sub;
          if (!userData || !identity) {
            log.warn('authStore:login skipped — missing user id', {
              role: userData?.role ?? null,
              level: userData?.level ?? null,
            });
            return;
          }

          const nextUser = normalizeUser(userData);
          const nextJurisdiction = jurisdictionData || null;
          const current = get();
          const sameUser = current.user
            && current.user.id === nextUser.id
            && current.user.role === nextUser.role
            && current.isAuthenticated;
          const sameJurisdiction = JSON.stringify(current.jurisdiction || null) === JSON.stringify(nextJurisdiction);
          if (sameUser && sameJurisdiction) return;

          // REDACT: log identifiers only, never the raw userData/jurisdiction payload.
          log.info('authStore:login', { userId: nextUser.id, role: nextUser.role });
          set({
            user: nextUser,
            jurisdiction: nextJurisdiction,
            isAuthenticated: true
          });
        },

        logout: () => {
          const current = get();
          if (!current.isAuthenticated && !current.user) return;
          log.info('authStore:logout', { userId: current.user?.id, role: current.user?.role });
          // SuperTokens Session.signOut() (called from useAuth) clears its own session tokens.
          // Also clear any leftover legacy localStorage bearer tokens.
          try {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
          } catch {
            /* ignore */
          }
          set({ user: null, jurisdiction: null, isAuthenticated: false });
        },

        updateUser: (updates) => {
          log.debug('authStore:updateUser', { userId: get().user?.id, keys: Object.keys(updates || {}) });
          set((state) => ({
            user: state.user ? { ...state.user, ...updates } : null,
          }));
        },

        hasRole: (...roles) => roles.includes(get().user?.role),
      }),
      {
        name: 'crime-diaries-auth',
        partialize: (state) => ({
          user: state.user,
          jurisdiction: state.jurisdiction,
          isAuthenticated: state.isAuthenticated
        }),
        onRehydrateStorage: () => (state) => {
          // Purge obsolete Mock Mode keys; if synthetic JWTs were present, drop
          // the persisted Zustand session so the user re-auths via SuperTokens.
          const { clearedMockTokens } = purgeObsoleteMockModeStorage();
          if (clearedMockTokens && state?.isAuthenticated) {
            log.warn('authStore:rehydrate_cleared_stale_mock_session', {});
            state?.logout?.();
          }
        },
      }
    ),
    { name: 'AuthStore' }
  )
);

export default useAuthStore;
