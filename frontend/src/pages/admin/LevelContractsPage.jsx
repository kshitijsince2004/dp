import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, AlertTriangle, ChevronDown, ChevronUp, Info, Settings2,
} from 'lucide-react';
import api from '../../utils/api.js';
import { log } from '../../utils/logger.js';

// ── Collapsible Contract Row ──────────────────────────────────────────────────
// Level contracts are read-only over the API (config-as-data — see the banner below);
// this page only renders what `level_data_contracts` actually stores: `code`,
// `from_level`/`to_level`, `route`, `record_type`, `visible_field_keys`,
// `aggregate_definitions`, `is_active`.
function ContractRow({ contract }) {
  const [expanded, setExpanded] = useState(false);

  const LEVEL_COLORS = {
    PS:       'bg-emerald-50 text-emerald-700 border-emerald-200',
    SUB_DIV:  'bg-purple-50 text-purple-700 border-purple-200',
    DISTRICT: 'bg-rose-50 text-rose-700 border-rose-200',
    JCP:      'bg-amber-50 text-amber-700 border-amber-200',
    SCP:      'bg-orange-50 text-orange-700 border-orange-200',
    HQ:       'bg-blue-50 text-blue-700 border-blue-200',
  };

  const levelBadge = (level) => (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${LEVEL_COLORS[level] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {level}
    </span>
  );

  return (
    <div className="border border-slate-200 bg-white rounded-xl overflow-hidden shadow-sm">
      <div
        className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-mono text-[10px] text-slate-400 font-bold">{contract.code}</span>
        {levelBadge(contract.from_level)}
        <span className="text-slate-400 text-xs">&rarr;</span>
        {levelBadge(contract.to_level)}
        <span className="font-bold text-slate-800 text-xs">{contract.record_type}</span>
        <span className="text-slate-550 text-label-s ml-auto font-semibold">
          {contract.route}
          {' · '}
          <span className={contract.is_active ? 'text-emerald-600' : 'text-slate-400'}>
            {contract.is_active ? 'Active' : 'Inactive'}
          </span>
        </span>
        {expanded ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
      </div>

      {expanded && (
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 space-y-3 text-xs text-slate-600 font-semibold">
          <div>
            <p className="text-slate-500 mb-1">Visible field keys ({(contract.visible_field_keys || []).length})</p>
            <div className="flex flex-wrap gap-1.5">
              {(contract.visible_field_keys || []).map((k) => (
                <span key={k} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                  {k}
                </span>
              ))}
              {(!contract.visible_field_keys || contract.visible_field_keys.length === 0) && (
                <span className="text-slate-400 italic">none defined</span>
              )}
            </div>
          </div>

          {(contract.aggregate_definitions || []).length > 0 && (
            <div>
              <p className="text-slate-500 mb-1">Aggregate definitions</p>
              <ul className="list-disc list-inside space-y-0.5">
                {(contract.aggregate_definitions || []).map((a, i) => (
                  <li key={i}>{a.label_en || a.type}{a.field ? ` (${a.field})` : ''}</li>
                ))}
              </ul>
            </div>
          )}

          {contract.updated_at && (
            <p className="text-slate-400 font-mono text-[10px]">
              Last synced: {new Date(contract.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LevelContractsPage() {
  useEffect(() => {
    log.debug('page:mount', { route: '/admin/level-contracts' });
    return () => log.debug('page:unmount', { route: '/admin/level-contracts' });
  }, []);

  const { data: contracts = [], isLoading, isError } = useQuery({
    queryKey: ['admin', 'level-contracts'],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'level_contracts' });
      try {
        const res = await api.get('/level-contracts');
        const raw = res.data?.data;
        const rows = Array.isArray(raw) ? raw : [];
        log.debug('data:load_success', { what: 'level_contracts', count: rows.length });
        return rows;
      } catch (err) {
        log.error('data:load_error', { what: 'level_contracts', err });
        throw err;
      }
    },
  });

  return (
    <div className="space-y-6 theme-admin-page p-5 rounded-2xl bg-[var(--bg-page-main)] border border-slate-200 shadow-sm font-sans text-slate-800">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-display">
            <span>Level Contracts</span>
          </h1>
          <p className="text-slate-500 text-xs mt-1 font-semibold">
            Field visibility rules governing what each hierarchy level sees when records move up the ops chain (PS to DISTRICT to JCP/SCP to HQ).
          </p>
        </div>
      </div>

      {/* ── Config-as-data notice (read-only) ─────────────────────────────── */}
      <div className="flex items-start gap-3 border border-blue-200 bg-blue-50/50 rounded-xl p-4 text-xs text-blue-750 font-semibold shadow-sm">
        <Settings2 size={14} className="mt-0.5 flex-shrink-0 text-blue-600" />
        <p>
          Level contracts are <strong>config-as-data</strong>: they are authored in
          <code className="mx-1 px-1.5 py-0.5 rounded bg-white border border-blue-200 font-mono text-label-s">config/contracts/*.json</code>
          and applied by running <code className="mx-1 px-1.5 py-0.5 rounded bg-white border border-blue-200 font-mono text-label-s">npm run sync-config</code>.
          This page is a read-only viewer — contracts can no longer be created or edited from the API or the UI.
        </p>
      </div>

      {/* ── Contracts List ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 text-slate-500 border border-slate-200 bg-white rounded-xl shadow-sm">
          <Loader2 size={28} className="animate-spin mb-3 text-[var(--accent-color)]" />
          <p className="text-sm font-semibold">Loading level contracts…</p>
        </div>
      ) : isError ? (
        <div className="border border-red-200 bg-red-50/50 rounded-xl p-8 text-center shadow-sm">
          <AlertTriangle size={28} className="mx-auto text-red-500 mb-2" />
          <p className="text-red-700 text-sm font-semibold">Failed to load contracts</p>
        </div>
      ) : contracts.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl p-16 text-center text-slate-400 bg-white shadow-sm">
          <p className="text-sm font-bold text-slate-700">No level contracts defined yet</p>
          <p className="text-xs mt-1 text-slate-500 flex items-center justify-center gap-1.5">
            <Info size={12} />
            Add an entry to <code className="font-mono">config/contracts/*.json</code> and run <code className="font-mono">npm run sync-config</code>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((contract) => (
            <ContractRow key={contract.id} contract={contract} />
          ))}
        </div>
      )}
    </div>
  );
}
