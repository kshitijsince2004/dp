import React from 'react';
import { Link2, Unlink, ExternalLink } from 'lucide-react';

const RECORD_TYPE_LABELS = {
  CASE: 'FIR/Case',
  ARREST: 'Arrest',
  MISSING: 'Missing Person',
  PCR_CALL: 'PCR Call',
  UIDB: 'UIDB'
};

const RECORD_TYPE_COLORS = {
  CASE: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  ARREST: 'bg-red-500/10 text-red-400 border-red-500/30',
  MISSING: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  PCR_CALL: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  UIDB: 'bg-slate-500/10 text-slate-400 border-slate-500/30'
};

const getKeySummary = (type, data) => {
  if (!data) return '';
  if (type === 'ARREST') return data.arrested_name || data.fullName || '';
  if (type === 'CASE') return data.fir_no ? `FIR ${data.fir_no}` : data.local_head || data.localHead || '';
  if (type === 'MISSING') return data.missing_name || data.name || '';
  if (type === 'PCR_CALL') return data.pcr_no || data.call_head || '';
  if (type === 'UIDB') return data.uidb_no || data.gd_no || '';
  return '';
};

const getSecondaryInfo = (type, data) => {
  if (!data) return '';
  if (type === 'ARREST') return data.crime_head || data.crimeHead || '';
  if (type === 'CASE') return data.local_head || data.localHead || '';
  if (type === 'MISSING') return data.gd_no || '';
  return '';
};

export default function LinkedRecordsPanel({ linkedRecords = [], onUnlink, userRole, onNavigate }) {
  if (!linkedRecords.length) {
    return (
      <div className="card">
        <div className="card-title">
          <Link2 size={18} aria-hidden="true" />
          <span>Linked Records</span>
        </div>
        <p className="text-sm text-slate-500 py-2">No records linked yet.</p>
      </div>
    );
  }

  const canUnlink = onUnlink && ['HC', 'SHO', 'HQ_ADMIN', 'SYSTEM_ADMIN'].includes(userRole);

  // Group by link type label
  const groups = linkedRecords.reduce((acc, row) => {
    const key = row.link_type_label_en || row.link_type_code;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  return (
    <div className="card">
      <div className="card-title">
        <Link2 size={18} aria-hidden="true" />
        <span>Linked Records</span>
        <span className="ml-auto text-xs text-slate-500 font-normal">{linkedRecords.length} link{linkedRecords.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex flex-col gap-4">
        {Object.entries(groups).map(([groupLabel, rows]) => (
          <div key={groupLabel}>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">{groupLabel}</p>
            <div className="flex flex-col gap-2">
              {rows.map(row => {
                const colorClass = RECORD_TYPE_COLORS[row.linked_record_type] || RECORD_TYPE_COLORS.CASE;
                const summary = getKeySummary(row.linked_record_type, row.linked_record_data);
                const secondary = getSecondaryInfo(row.linked_record_type, row.linked_record_data);

                return (
                  <div key={row.id} className="flex items-center gap-3 p-3 border border-slate-700 rounded-lg hover:bg-slate-800/40 transition-colors">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border shrink-0 ${colorClass}`}>
                      {RECORD_TYPE_LABELS[row.linked_record_type] || row.linked_record_type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{summary || row.linked_record_data?.uid || row.linked_record_id}</p>
                      {secondary && <p className="text-xs text-slate-400 truncate">{secondary}</p>}
                      <p className="text-xs text-slate-500">{row.linked_ps_name} &middot; {row.linked_record_status}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {onNavigate && (
                        <button
                          type="button"
                          className="text-slate-400 hover:text-slate-200 transition-colors"
                          title="View record"
                          onClick={() => onNavigate(row.linked_record_id, row.linked_record_type)}
                        >
                          <ExternalLink size={14} />
                        </button>
                      )}
                      {canUnlink && (
                        <button
                          type="button"
                          className="text-red-400/60 hover:text-red-400 transition-colors"
                          title="Remove link"
                          onClick={() => onUnlink(row.id)}
                        >
                          <Unlink size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
