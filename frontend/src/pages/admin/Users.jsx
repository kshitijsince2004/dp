import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users as UsersIcon, Plus, UserCheck, UserX, ShieldAlert, X, Trash2, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import { log } from '../../utils/logger.js';

// Roles the backend actually grants POST/PUT/DELETE on /users to (users.router.js) —
// HQ_ANALYST/DISTRICT_OFFICER can list (GET) but not mutate; mirror that here so the
// action buttons aren't shown for a request that would just 403.
const CAN_MUTATE_ROLES = ['SYSTEM_ADMIN', 'SHO'];

const ROLE_LABELS = {
  HC: 'Head Constable (Data Entry)',
  PS: 'Head Constable (Data Entry)',
  SHO: 'Station House Officer',
  DISTRICT_OFFICER: 'DCP District Officer',
  HQ_ANALYST: 'HQ Analyst (Reader)',
  HQ_ADMIN: 'HQ Administrator',
  SYSTEM_ADMIN: 'System Platform Admin',
};

const ROLE_COLORS = {
  HC: 'text-sky-400 bg-sky-950/30 border-sky-800/40',
  PS: 'text-sky-400 bg-sky-950/30 border-sky-800/40',
  SHO: 'text-amber-400 bg-amber-950/30 border-amber-800/40',
  DISTRICT_OFFICER: 'text-violet-400 bg-violet-950/30 border-violet-800/40',
  HQ_ANALYST: 'text-blue-400 bg-blue-950/30 border-blue-800/40',
  HQ_ADMIN: 'text-orange-400 bg-orange-950/30 border-orange-800/40',
  SYSTEM_ADMIN: 'text-red-400 bg-red-950/30 border-red-800/40',
};

export default function Users() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const isSHO = currentUser?.role === 'SHO';
  const canMutate = CAN_MUTATE_ROLES.includes(currentUser?.role);
  const [modalOpen, setModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  // Form fields
  const [form, setForm] = useState({
    badgeNo: '',
    name_en: '',
    role: 'HC',
    password: '',
    psId: '',
    districtId: '',
  });

  const resetForm = () => setForm({ badgeNo: '', name_en: '', role: 'HC', password: '', psId: '', districtId: '' });

  useEffect(() => {
    log.debug('page:mount', { route: '/admin/users', userId: currentUser?.id, role: currentUser?.role });
    return () => log.debug('page:unmount', { route: '/admin/users' });
  }, []);

  // ── Fetch Users ──────────────────────────────────────────────────────────
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'admin_users' });
      try {
        const res = await api.get('/users');
        // Backend returns { data: [...] } or { data: { data: [...] } }
        const payload = res.data?.data;
        const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
        log.debug('data:load_success', { what: 'admin_users', count: rows.length });
        return rows;
      } catch (err) {
        log.error('data:load_error', { what: 'admin_users', err });
        throw err;
      }
    },
  });

  // ── Create User ───────────────────────────────────────────────────────────
  const createUserMutation = useMutation({
    mutationFn: async (payload) => {
      log.info('action:user_create_start', { badgeNo: payload.badgeNo, role: payload.role, hasPassword: !!payload.password });
      const res = await api.post('/users', payload);
      return res.data.data;
    },
    onSuccess: (data, payload) => {
      log.info('action:user_create_success', { badgeNo: payload.badgeNo, role: payload.role });
      toast.success('User profile registered successfully');
      setModalOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err, payload) => {
      log.error('action:user_create_failed', { badgeNo: payload?.badgeNo, err });
      toast.error(err.response?.data?.message || 'Failed to register user');
    },
  });

  // ── Toggle Active Status ──────────────────────────────────────────────────
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, is_active }) => {
      log.debug('action:user_toggle_status_start', { userId: id, newActive: !is_active });
      const res = await api.put(`/users/${id}`, { is_active: !is_active });
      return res.data.data;
    },
    onSuccess: (_, { id, is_active }) => {
      log.info('action:user_toggle_status_success', { userId: id, newActive: !is_active });
      toast.success(is_active ? 'User deactivated' : 'User reactivated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err, { id }) => {
      log.error('action:user_toggle_status_failed', { userId: id, err });
      toast.error(err.response?.data?.message || 'Failed to update user status');
    },
  });

  // ── Delete User ───────────────────────────────────────────────────────────
  const deleteUserMutation = useMutation({
    mutationFn: async (id) => {
      log.info('action:user_delete_start', { userId: id });
      await api.delete(`/users/${id}`);
    },
    onSuccess: (_, id) => {
      log.info('action:user_delete_success', { userId: id });
      toast.success('User removed from registry');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err, id) => {
      log.error('action:user_delete_failed', { userId: id, err });
      toast.error(err.response?.data?.message || 'Failed to remove user');
    },
  });

  // ── Reset Password ────────────────────────────────────────────────────────
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, newPassword }) => {
      log.info('action:user_reset_password_start', { userId: id, hasNewPassword: !!newPassword, newPasswordLength: newPassword?.length ?? 0 });
      const res = await api.post(`/users/${id}/reset-password`, { newPassword });
      return res.data;
    },
    onSuccess: (_, { id }) => {
      log.info('action:user_reset_password_success', { userId: id });
      toast.success('Password reset successfully');
      setResetModalOpen(false);
      setNewPassword('');
      setSelectedUser(null);
    },
    onError: (err, { id }) => {
      log.error('action:user_reset_password_failed', { userId: id, err });
      toast.error(err.response?.data?.message || 'Failed to reset password');
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.badgeNo || !form.password || !form.name_en || !form.role) {
      toast.error('Badge No, Name, Role, and Password are required');
      return;
    }
    log.debug('action:user_form_submit', { badgeNo: form.badgeNo, role: form.role });
    createUserMutation.mutate(form);
  };

  const openResetModal = (user) => {
    setSelectedUser(user);
    setNewPassword('');
    setResetModalOpen(true);
  };

  return (
    <div className="space-y-6 theme-admin-page p-5 rounded-2xl bg-[var(--bg-page-main)] border border-slate-200 shadow-sm">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 font-display">
            <UsersIcon className="text-[var(--accent-color)]" />
            <span>{isSHO ? 'My Police Station Officers' : 'Users Register Console'}</span>
          </h1>
          <p className="text-slate-500 text-xs mt-1 font-semibold">
            {isSHO
              ? 'Register and manage Head Constable (HC) accounts for your own police station.'
              : 'Manage officer accounts, roles, and jurisdiction permissions across the PHAROS platform.'}
          </p>
        </div>

        {canMutate && (
          <button
            onClick={() => setModalOpen(true)}
            className="bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md border-none active:scale-95"
          >
            <Plus size={14} />
            <span>{isSHO ? 'Register New HC' : 'Register New Officer'}</span>
          </button>
        )}
      </div>
 
      {/* ── Users Table ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-color)] mb-4" />
          <p className="text-sm">Syncing security profiles register...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="border border-dashed border-slate-200 bg-white rounded-xl p-16 text-center text-slate-500 shadow-sm">
          <UsersIcon size={48} className="mx-auto text-slate-350 mb-3" />
          <p className="text-sm font-semibold">No users registered yet</p>
          <p className="text-xs text-slate-450 mt-1">Click "Register New Officer" to add the first user.</p>
        </div>
      ) : (
        <div className="border border-slate-200 bg-white rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm sm:text-base">
              <thead>
                <tr className="bg-slate-50 text-slate-750 font-bold border-b border-slate-200 tracking-wider">
                  <th className="p-4 pl-5">Badge / PIS</th>
                  <th className="p-4">Officer Name</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Station / District</th>
                  <th className="p-4">Auth Status</th>
                  {canMutate && <th className="p-4 pr-5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {users.map((item) => {
                  const isActive = item.is_active ?? item.active ?? true;
                  const roleKey = item.role || 'HC';
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 pl-5 font-mono font-bold text-slate-900">
                        {item.badge_no || item.badgeNo || '—'}
                      </td>
                      <td className="p-4 font-bold text-slate-900">
                        {item.name || item.username || '—'}
                      </td>
                      <td className="p-4">
                        <span className={`text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg border ${ROLE_COLORS[roleKey] || 'text-slate-600 bg-slate-50 border-slate-200'}`}>
                          {roleKey}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600 font-medium">
                        {item.ps_name || item.station_id || item.district_name || item.district_id || 'HQ / Platform'}
                      </td>
                      <td className="p-4">
                        <span className={`text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg border ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : 'bg-red-50 text-red-700 border-red-300'
                        }`}>
                          {isActive ? 'ACTIVE' : 'DEACTIVATED'}
                        </span>
                      </td>
                      {canMutate && (
                      <td className="p-4 pr-5 text-right space-x-2 whitespace-nowrap">
                        {/* Toggle Active */}
                        <button
                          onClick={() => toggleStatusMutation.mutate({ id: item.id, is_active: isActive })}
                          disabled={toggleStatusMutation.isPending}
                          className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold border ${
                            isActive
                              ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                          }`}
                          title={isActive ? 'Deactivate' : 'Reactivate'}
                        >
                          {isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                          <span>{isActive ? 'Deactivate' : 'Activate'}</span>
                        </button>
 
                        {/* Reset Password */}
                        <button
                          onClick={() => openResetModal(item)}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold shadow-xs"
                          title="Reset Password"
                        >
                          <KeyRound size={14} />
                          <span>Reset PW</span>
                        </button>
 
                        {/* Delete */}
                        <button
                          onClick={() => {
                            log.debug('action:user_delete_click', { userId: item.id });
                            if (window.confirm(`Permanently remove ${item.name || item.username} from the registry?`)) {
                              deleteUserMutation.mutate(item.id);
                            }
                          }}
                          disabled={deleteUserMutation.isPending}
                          className="p-2 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 transition-all cursor-pointer inline-flex items-center"
                          title="Remove User"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CREATE USER MODAL ─────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center bg-zinc-950/80 border-b border-zinc-800 px-5 py-3.5">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <Plus size={14} className="text-[#cca43b]" />
                Register New Operational User
              </h3>
              <button onClick={() => { setModalOpen(false); resetForm(); }} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-semibold">Badge / PIS Number *</label>
                  <input
                    type="text"
                    value={form.badgeNo}
                    onChange={(e) => setForm({ ...form, badgeNo: e.target.value })}
                    placeholder="HC99014"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] transition-all"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-semibold">Full Name *</label>
                  <input
                    type="text"
                    value={form.name_en}
                    onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                    placeholder="Ramesh Singh"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] transition-all"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-semibold">Role *</label>
                  {isSHO ? (
                    // SHO may only ever create HC users — the backend stamps this server-side
                    // regardless, but the form shouldn't imply a choice that doesn't exist.
                    <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-400">
                      Head Constable (HC)
                    </div>
                  ) : (
                    <select
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] transition-all cursor-pointer"
                    >
                      <option value="HC">Head Constable (HC)</option>
                      <option value="SHO">Station House Officer (SHO)</option>
                      <option value="DISTRICT_OFFICER">DCP District Officer</option>
                      <option value="HQ_ANALYST">HQ Analyst</option>
                      <option value="HQ_ADMIN">HQ Administrator</option>
                      <option value="SYSTEM_ADMIN">System Admin</option>
                    </select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-semibold">Initial Password *</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Min 8 characters"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] transition-all"
                    required
                    minLength={8}
                  />
                </div>
              </div>

              {/* SHO's PS is stamped server-side from their own JWT (never trusted from this
                  form) — no scope fields to show. */}
              {!isSHO && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-semibold">Police Station ID</label>
                  <input
                    type="text"
                    value={form.psId}
                    onChange={(e) => setForm({ ...form, psId: e.target.value })}
                    placeholder="PS_NDD_PARLIAMENT_STREET"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] transition-all font-mono text-[10px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-semibold">District ID</label>
                  <input
                    type="text"
                    value={form.districtId}
                    onChange={(e) => setForm({ ...form, districtId: e.target.value })}
                    placeholder="DIST_NDD"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] transition-all font-mono text-[10px]"
                  />
                </div>
              </div>
              )}

              <div className="bg-zinc-950 border border-zinc-800/80 p-2.5 rounded text-label-s text-zinc-500 flex gap-2">
                <ShieldAlert size={14} className="flex-shrink-0 mt-0.5 text-amber-600" />
                <span>Creating a profile auto-binds security signatures to all submitted operations in audit logs.</span>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => { setModalOpen(false); resetForm(); }}
                  className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg font-semibold cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="bg-[#cca43b] hover:bg-amber-600 text-zinc-950 px-5 py-2 rounded-lg font-bold shadow-md cursor-pointer text-xs disabled:opacity-60"
                >
                  {createUserMutation.isPending ? 'Registering…' : 'Register User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── RESET PASSWORD MODAL ─────────────────────────────────────────── */}
      {resetModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-sm w-full overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center bg-zinc-950/80 border-b border-zinc-800 px-5 py-3.5">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <KeyRound size={14} className="text-amber-500" />
                Reset Password
              </h3>
              <button onClick={() => { setResetModalOpen(false); setSelectedUser(null); }} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-zinc-400">
                Resetting password for <strong className="text-zinc-200">{selectedUser.name || selectedUser.username}</strong> ({selectedUser.badge_no || selectedUser.badgeNo}).
              </p>

              <div className="space-y-1.5">
                <label className="text-zinc-400 font-semibold">New Password *</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] transition-all"
                  minLength={8}
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => { setResetModalOpen(false); setSelectedUser(null); }}
                  className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg font-semibold cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={() => resetPasswordMutation.mutate({ id: selectedUser.id, newPassword })}
                  disabled={resetPasswordMutation.isPending || newPassword.length < 8}
                  className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2 rounded-lg font-bold cursor-pointer text-xs disabled:opacity-60"
                >
                  {resetPasswordMutation.isPending ? 'Resetting…' : 'Reset Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
