import React from 'react';

export default function CommunitySafetyCard({ data = {}, isLoading = false }) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-card p-5 border border-slate-200 animate-pulse min-h-[300px]">
        <div className="h-4 bg-slate-200 rounded w-1/3 mb-4" />
        <div className="h-10 bg-slate-100 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-4 bg-slate-100 rounded" />
          <div className="h-4 bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  const pcr = data.pcr || {};
  const missing = data.missing_persons || {};
  const uidb = data.uidb_inquests || {};

  return (
    <div className="bg-white rounded-card p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#0A1628]">
              Citizen Safety & Emergency Response
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">PCR emergency response, Missing Persons tracing & UIDB identification</p>
          </div>
        </div>

        {/* 3 Columns: PCR, Missing, UIDB */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-2">
          {/* PCR Calls */}
          <div className="p-3.5 bg-amber-50/50 border border-amber-100 rounded-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-amber-800">
                  <span>PCR Calls</span>
                </div>
                <span className="text-[10px] font-extrabold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-full">
                  {pcr.action_rate_pct || 0}% Actioned
                </span>
              </div>
              <div className="text-xl font-black text-amber-950 mt-2 tabular-nums">
                {pcr.total_calls || 0}
              </div>
              <div className="text-[11px] text-amber-700 mt-0.5">
                {pcr.actioned_calls || 0} actionable responses
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-amber-100/80 text-[10px] text-slate-600 space-y-1">
              {(pcr.top_categories || []).slice(0, 2).map(c => (
                <div key={c.head} className="flex justify-between">
                  <span className="truncate pr-2">{c.head}</span>
                  <span className="font-bold">{c.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Missing Persons / Operation Muskaan */}
          <div className="p-3.5 bg-sky-50/50 border border-sky-100 rounded-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-sky-800">
                  <span>Missing Persons</span>
                </div>
                <span className="text-[10px] font-extrabold text-sky-700 bg-sky-100/70 px-2 py-0.5 rounded-full">
                  {missing.tracing_rate_pct || 0}% Traced
                </span>
              </div>
              <div className="text-xl font-black text-sky-950 mt-2 tabular-nums">
                {missing.total_reported || 0}
              </div>
              <div className="text-[11px] text-sky-700 mt-0.5">
                {missing.total_traced || 0} safely reunited
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-sky-100/80 text-[10px] text-sky-900 flex justify-between items-center">
              <span className="font-bold text-sky-800">Op. Muskaan (Minors):</span>
              <span className="font-extrabold text-sky-700">{missing.operation_muskaan_rate_pct || 0}%</span>
            </div>
          </div>

          {/* UIDB Identification */}
          <div className="p-3.5 bg-teal-50/50 border border-teal-100 rounded-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-teal-800">
                  <span>UIDB Inquests</span>
                </div>
                <span className="text-[10px] font-extrabold text-teal-700 bg-teal-100/70 px-2 py-0.5 rounded-full">
                  {uidb.identification_rate_pct || 0}% Identified
                </span>
              </div>
              <div className="text-xl font-black text-teal-950 mt-2 tabular-nums">
                {uidb.total_bodies_found || 0}
              </div>
              <div className="text-[11px] text-teal-700 mt-0.5">
                {uidb.identified || 0} identified / {uidb.unidentified || 0} unidentified
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-teal-100/80 text-[10px] text-teal-900 flex justify-between items-center">
              <span>Bio-matching match rate:</span>
              <span className="font-extrabold">{uidb.identification_rate_pct || 0}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
