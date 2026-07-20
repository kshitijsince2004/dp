import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCog, Plus, X, Trash2, UserCheck, UserX } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import { validatePattern } from '../../utils/fieldPatterns.js';

const RANK_OPTIONS = [
  'Constable', 'Head Constable', 'Assistant Sub Inspector', 'Sub Inspector',
  'Inspector', 'Deputy Superintendent of Police', 'Superintendent of Police',
];

// SHO/ACP curation UI for investigating_officers (item 7's deferred half — Integration 1
// built the backend CRUD + RBAC, this is the form/dropdown wiring it explicitly left for
// this integration). Once an IO is created here, it appears in the record form's `io_id`
// dropdown (FieldRenderer's generic options_source fetch, /fields/lookup/investigating-officers)
// — retiring the old free-text io_name entry.
export default function IOManagement() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [form, setForm] = useState({ name: '', rank: '', pis_no: '', mobile: '' });

  const resetForm = () => setForm({ name: '', rank: '', pis_no: '', mobile: '' });

  const { data: ios = [], isLoading } = useQuery({
    queryKey: ['io', 'list', includeInactive],
    queryFn: async () => {
      const res = await api.get('/investigating-officers', { params: { include_inactive: includeInactive } });
      return res.data.data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/investigating-officers', payload);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Investigating officer added');
      setModalOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['io', 'list'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to add officer'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }) => {
      const res = await api.patch(`/investigating-officers/${id}`, { is_active: !is_active });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Status updated');
      queryClient.invalidateQueries({ queryKey: ['io', 'list'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update officer'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await api.delete(`/investigating-officers/${id}`);
    },
    onSuccess: () => {
      toast.success('Officer deactivated');
      queryClient.invalidateQueries({ queryKey: ['io', 'list'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to remove officer'),
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Officer name is required');
      return;
    }
    // #10 (2026-07-20): same rules as the registry-driven forms (utils/fieldPatterns.js).
    const nameErr = validatePattern('name', form.name);
    if (nameErr) { toast.error(nameErr); return; }
    // Mobile is optional; when present it must be exactly 10 digits. The input already filters
    // to digits at keystroke, so the only reachable failure here is a short (1–9 digit) number.
    if (form.mobile) {
      const mobileErr = validatePattern('mobile', form.mobile);
      if (mobileErr) { toast.error(mobileErr); return; }
    }
    createMutation.mutate(form);
  };

  return (
    <div className="space-y-6 theme-sho-page p-5 rounded-2xl bg-[var(--bg-page-main)] border border-slate-200 shadow-sm">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 font-display">
            <UserCog className="text-[var(--accent-color)]" />
            <span>Investigating Officers</span>
          </h1>
          <p className="text-slate-500 text-xs mt-1 font-semibold">
            Curate the IO roster for your police station — these officers appear in the
            Investigating Officer dropdown when registering a new record.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="accent-[var(--accent-color)]"
            />
            Show inactive
          </label>
          <button
            onClick={() => setModalOpen(true)}
            className="bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md border-none active:scale-95"
          >
            <Plus size={14} />
            <span>Add IO</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-color)] mb-4" />
          <p className="text-sm">Loading officer roster...</p>
        </div>
      ) : ios.length === 0 ? (
        <div className="border border-dashed border-slate-200 bg-white rounded-xl p-16 text-center text-slate-500 shadow-sm">
          <UserCog size={48} className="mx-auto text-slate-350 mb-3" />
          <p className="text-sm font-semibold">No investigating officers curated yet</p>
          <p className="text-xs text-slate-450 mt-1">Click "Add IO" to add the first officer for your station.</p>
        </div>
      ) : (
        <div className="border border-slate-200 bg-white rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 tracking-wider">
                  <th className="p-3.5 pl-5">Name</th>
                  <th className="p-3.5">Rank</th>
                  <th className="p-3.5">PIS No.</th>
                  <th className="p-3.5">Mobile</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {ios.map((io) => (
                  <tr key={io.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3.5 pl-5 font-semibold text-slate-750">{io.name}</td>
                    <td className="p-3.5 text-slate-500">{io.rank || '—'}</td>
                    <td className="p-3.5 font-mono text-slate-500">{io.pis_no || '—'}</td>
                    <td className="p-3.5 font-mono text-slate-500">{io.mobile || '—'}</td>
                    <td className="p-3.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        io.is_active
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-250'
                          : 'bg-red-50 text-red-600 border-red-200'
                      }`}>
                        {io.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="p-3.5 pr-5 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => toggleActiveMutation.mutate({ id: io.id, is_active: io.is_active })}
                        disabled={toggleActiveMutation.isPending}
                        className={`p-1.5 rounded transition-all cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold border ${
                          io.is_active
                            ? 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-emerald-200'
                        }`}
                      >
                        {io.is_active ? <UserX size={12} /> : <UserCheck size={12} />}
                        <span>{io.is_active ? 'Deactivate' : 'Activate'}</span>
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove ${io.name} from the roster?`)) deleteMutation.mutate(io.id);
                        }}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 rounded bg-slate-105 hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 transition-all cursor-pointer inline-flex items-center"
                        title="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center bg-zinc-950/80 border-b border-zinc-800 px-5 py-3.5">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <Plus size={14} className="text-[#cca43b]" />
                Add Investigating Officer
              </h3>
              <button onClick={() => { setModalOpen(false); resetForm(); }} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-semibold">Officer Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Inspector Ramesh Kumar"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-semibold">Rank</label>
                  <select
                    value={form.rank}
                    onChange={(e) => setForm({ ...form, rank: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] transition-all cursor-pointer"
                  >
                    <option value="">-- Select --</option>
                    {RANK_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-semibold">PIS No.</label>
                  <input
                    type="text"
                    value={form.pis_no}
                    onChange={(e) => setForm({ ...form, pis_no: e.target.value })}
                    placeholder="28081234"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] transition-all font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-zinc-400 font-semibold">Mobile</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.mobile}
                  // Constrain at keystroke: strip non-digits and cap at 10 so "abcd" / overlong
                  // input can never be entered (was previously accepted, then silently truncated
                  // to '' by io.service.js). Length is enforced on submit (handleCreate).
                  onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  maxLength={10}
                  placeholder="9876543210"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] transition-all font-mono"
                />
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
                  disabled={createMutation.isPending}
                  className="bg-[#cca43b] hover:bg-amber-600 text-zinc-950 px-5 py-2 rounded-lg font-bold shadow-md cursor-pointer text-xs disabled:opacity-60"
                >
                  {createMutation.isPending ? 'Adding…' : 'Add Officer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
