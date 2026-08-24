import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, Filter, Clock, User, Database, FileEdit, LogIn, Send, AlertTriangle } from 'lucide-react';
import api from '../../utils/api.js';
import { log as clientLog } from '../../utils/logger.js';

const ACTION_STYLES = {
  CREATE:   { label: 'CREATE',   cls: 'bg-emerald-550/10 text-emerald-700 border-emerald-250/30 bg-emerald-50 text-emerald-700 border-emerald-200', icon: FileEdit },
  UPDATE:   { label: 'UPDATE',   cls: 'bg-blue-550/10 text-blue-700 border-blue-250/30 bg-blue-50 text-blue-700 border-blue-200',         icon: FileEdit },
  OVERRIDE: { label: 'OVERRIDE', cls: 'bg-amber-550/10 text-amber-700 border-amber-250/30 bg-amber-50 text-amber-700 border-amber-200',      icon: AlertTriangle },
  SUBMIT:   { label: 'SUBMIT',   cls: 'bg-purple-550/10 text-purple-700 border-purple-250/30 bg-purple-50 text-purple-700 border-purple-200',   icon: Send },
  LOGIN:    { label: 'LOGIN',    cls: 'bg-cyan-550/10 text-cyan-700 border-cyan-250/30 bg-cyan-50 text-cyan-700 border-cyan-200',         icon: LogIn },
  DELETE:   { label: 'DELETE',   cls: 'bg-red-550/10 text-red-700 border-red-250/30 bg-red-50 text-red-700 border-red-200',            icon: AlertTriangle },
};

const DEFAULT_STYLE = { label: '—', cls: 'bg-slate-50 text-slate-600 border-slate-200', icon: Database };

const PAGE_SIZE = 15;

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('ALL');

  useEffect(() => {
    clientLog.debug('page:mount', { route: '/admin/audit' });
    return () => clientLog.debug('page:unmount', { route: '/admin/audit' });
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'audit', page, actionFilter],
    queryFn: async () => {
      clientLog.debug('data:load_start', { what: 'audit_logs', page, actionFilter });
      try {
        const res = await api.get('/audit');
        const logs = res.data?.data?.logs || res.data?.data || [];
        clientLog.debug('data:load_success', { what: 'audit_logs', count: logs.length });
        return { logs, total: logs.length };
      } catch (err) {
        clientLog.error('data:load_error', { what: 'audit_logs', err });
        throw err;
      }
    },
    staleTime: 30 * 1000,
    retry: 1,
  });

  const rawLogs = data?.logs || [];

  const filteredLogs = actionFilter === 'ALL'
    ? rawLogs
    : rawLogs.filter((l) => l.action === actionFilter);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const pagedLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleFilterChange = (f) => {
    clientLog.debug('action:audit_filter_change', { actionFilter: f });
    setActionFilter(f);
    setPage(1);
  };

  return (
    <div className="space-y-6 theme-admin-page p-5 rounded-2xl bg-[var(--bg-page-main)] border border-slate-200 shadow-sm font-sans text-slate-800">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 font-display">
          <ShieldAlert className="text-[var(--accent-color)]" />
          <span>Immutable Audit Ledger</span>
        </h1>
        <p className="text-slate-500 text-xs mt-1 font-semibold">
          Append-only transaction log. Every CREATE, UPDATE, OVERRIDE, and SUBMIT action is recorded with identity, timestamp, and IP address.
        </p>
      </div>

      {/* ── Action Filters ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-500 text-xs font-semibold flex items-center gap-1">
          <Filter size={12} /> Filter:
        </span>
        {['ALL', 'CREATE', 'UPDATE', 'OVERRIDE', 'SUBMIT', 'LOGIN', 'DELETE'].map((action) => {
          const isActive = actionFilter === action;
          return (
            <button
              key={action}
              onClick={() => handleFilterChange(action)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                isActive
                  ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)] shadow-sm'
                  : 'bg-white border-slate-200 text-slate-650 hover:text-slate-900 hover:border-slate-350'
              }`}
            >
              {action}
            </button>
          );
        })}

        <span className="ml-auto text-slate-500 text-[11px] font-mono font-semibold">
          {filteredLogs.length} entries
        </span>
      </div>

      {/* ── Log Table ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-500 border border-slate-200 bg-white rounded-xl shadow-sm">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-color)] mb-4" />
          <p className="text-sm font-semibold">Loading immutable audit trail...</p>
        </div>
      ) : isError ? (
        <div className="border border-red-200 bg-red-50/50 rounded-xl p-6 text-center shadow-sm">
          <AlertTriangle size={32} className="mx-auto text-red-500 mb-2" />
          <p className="text-red-700 text-sm font-semibold">Could not retrieve audit logs</p>
          <p className="text-red-500 text-xs mt-1">Ensure you have HQ_ADMIN or SYSTEM_ADMIN privileges and the backend is reachable.</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl p-16 text-center text-slate-400 bg-white shadow-sm">
          <ShieldAlert size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-700">No audit entries found</p>
          <p className="text-xs text-slate-400 mt-1">Actions will appear here as officers use the system.</p>
        </div>
      ) : (
        <div className="border border-slate-200 bg-white rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm sm:text-base">
              <thead>
                <tr className="bg-slate-50 text-slate-750 font-bold border-b border-slate-200 tracking-wider">
                  <th className="p-4 pl-5">Action</th>
                  <th className="p-4">Record / Type</th>
                  <th className="p-4">Performer Officer</th>
                  <th className="p-4">Field Modifications</th>
                  <th className="p-4">IP Address</th>
                  <th className="p-4">Comment</th>
                  <th className="p-4 pr-5 text-right">Timestamp (IST)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 text-slate-700">
                {pagedLogs.map((log) => {
                  const style = ACTION_STYLES[log.action] || DEFAULT_STYLE;
                  const IconComp = style.icon;
                  const officerName = log.operator_name || log.changed_by_name || '—';
                  const badgeNo = log.badge_no || '—';
                  const role = log.changed_by_role || log.role || '—';
                  const changes = Array.isArray(log.field_changes) ? log.field_changes : [];

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-4 pl-5">
                          <span className={`inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg border ${style.cls}`}>
                            <IconComp size={12} />
                            {log.action}
                          </span>
                        </td>
                        <td className="p-4 font-semibold text-slate-800 text-sm">
                          {log.record_id ? (
                            <a
                              href={`/records/${log.record_id}`}
                              className="text-[var(--accent-color)] font-mono hover:underline font-bold"
                            >
                              {log.table_name || 'RECORD'} (#{String(log.record_id).slice(0, 8)})
                            </a>
                          ) : (
                            <span className="font-mono">{log.table_name || '—'}</span>
                          )}
                        </td>
                        <td className="p-4">
                          <div>
                            <div className="font-bold text-slate-900 text-sm">{officerName}</div>
                            <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                              <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-bold text-[10px]">
                                {role}
                              </span>
                              {badgeNo !== '—' && <span>Badge #{badgeNo}</span>}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 font-mono text-sm">
                          {changes.length > 0 ? (
                            <span className="bg-blue-50 text-blue-800 border border-blue-200 text-xs font-bold px-2 py-1 rounded-md">
                              {changes.length} field{changes.length > 1 ? 's' : ''} modified
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs font-semibold">No field diffs</span>
                          )}
                        </td>
                        <td className="p-4 font-mono text-slate-600 text-xs font-semibold">{log.ip_address || '::1'}</td>
                        <td className="p-4 text-slate-600 font-medium max-w-[200px] truncate text-xs" title={log.comment}>
                          {log.comment || '—'}
                        </td>
                        <td className="p-4 pr-5 text-right font-mono text-slate-700 text-xs font-semibold whitespace-nowrap">
                          {log.changed_at
                            ? new Date(log.changed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </td>
                      </tr>
                      {changes.length > 0 && (
                        <tr className="bg-slate-50/40">
                          <td colSpan={7} className="px-5 py-3 border-t border-slate-100">
                            <div className="text-xs space-y-1.5 pl-6">
                              <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Diff Summary:</div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {changes.map((c, cIdx) => (
                                  <div key={cIdx} className="bg-white p-2 rounded-lg border border-slate-200 text-xs font-mono">
                                    <span className="font-bold text-slate-800">{c.entity_label ? `${c.entity_label} — ` : ''}{c.label || c.field_key}: </span>
                                    <span className="line-through text-red-500 font-bold ml-1">{String(c.old_value ?? '(empty)')}</span>
                                    <span className="mx-1 text-slate-400">→</span>
                                    <span className="text-emerald-700 font-bold">{String(c.new_value ?? '(empty)')}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 bg-slate-50">
              <span className="text-slate-600 text-sm font-bold">
                Page {page} of {totalPages} · {filteredLogs.length} total entries
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-slate-900 disabled:opacity-40 text-sm cursor-pointer transition-colors font-bold shadow-xs"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-slate-900 disabled:opacity-40 text-sm cursor-pointer transition-colors font-bold shadow-xs"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
