import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';

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
          if (!userData) return;

          set({
            user: normalizeUser(userData),
            jurisdiction: jurisdictionData || null,
            isAuthenticated: true
          });
        },

        logout: () => {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          set({ user: null, jurisdiction: null, isAuthenticated: false });
        },

        updateUser: (updates) =>
          set((state) => ({
            user: state.user ? { ...state.user, ...updates } : null,
          })),

        hasRole: (...roles) => roles.includes(get().user?.role),
      }),
      {
        name: 'crime-diaries-auth',
        partialize: (state) => ({ 
          user: state.user,
          jurisdiction: state.jurisdiction,
          isAuthenticated: state.isAuthenticated
        }),
      }
    ),
    { name: 'AuthStore' }
  )
);

export default useAuthStore;
