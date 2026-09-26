import React from 'react';

export default function InvestigationDisposalCard({ data = {}, isLoading = false }) {
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

  const total = data.total_cases || 0;
  const pending = data.pending_investigation || 0;
  const chargeSheet = data.charge_sheet_filed || 0;
  const untraced = data.untraced_final_reports || 0;
  const cancelled = data.cancelled_cases || 0;
  const chargeSheetRate = data.charge_sheet_rate_pct || 0;
  const disposalRate = data.disposal_rate_pct || 0;
  const topIos = data.top_investigating_officers || [];

  return (
    <div className="bg-white rounded-card p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#0A1628]">
              Investigation & Court Disposal Pipeline
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Court filing status, charge-sheeting rate & IO productivity</p>
          </div>
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
            <span className="text-xs font-semibold text-blue-700">Charge-Sheet Rate:</span>
            <span className="text-xs font-extrabold text-blue-800">{chargeSheetRate}%</span>
          </div>
        </div>

        {/* Status Funnel Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-xl text-center">
            <div className="text-[11px] font-bold text-amber-700">
              <span>Pending</span>
            </div>
            <div className="text-base font-black text-amber-900 mt-1 tabular-nums">{pending}</div>
          </div>
          <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl text-center">
            <div className="text-[11px] font-bold text-emerald-700">
              <span>Charge Sheet</span>
            </div>
            <div className="text-base font-black text-emerald-900 mt-1 tabular-nums">{chargeSheet}</div>
          </div>
          <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-xl text-center">
            <div className="text-[11px] font-bold text-purple-700">
              <span>Untraced</span>
            </div>
            <div className="text-base font-black text-purple-900 mt-1 tabular-nums">{untraced}</div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
            <div className="text-[11px] font-bold text-slate-600">
              <span>Cancelled</span>
            </div>
            <div className="text-base font-black text-slate-800 mt-1 tabular-nums">{cancelled}</div>
          </div>
        </div>

        {/* IO Workload Breakdown */}
        <div>
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center justify-between">
            <span>Investigating Officer (IO) Workload</span>
            <span className="text-[10px] text-slate-400 font-normal">Active cases</span>
          </div>
          <div className="space-y-2">
            {topIos.length === 0 && (
              <div className="text-xs text-slate-400 italic py-2 text-center">No assigned IO data recorded.</div>
            )}
            {topIos.map((io) => (
              <div key={io.name} className="flex items-center justify-between p-2 rounded-lg bg-slate-50/80 border border-slate-100 text-xs">
                <div>
                  <span className="font-semibold text-slate-800">{io.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">{io.total_assigned} assigned</span>
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {io.solved_count} solved ({io.clearance_rate_pct}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
