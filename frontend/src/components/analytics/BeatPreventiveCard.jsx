import React from 'react';

export default function BeatPreventiveCard({ data = {}, isLoading = false }) {
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

  const beatRankings = data.beat_rankings || [];
  const preventive = data.preventive_enforcement || {};

  return (
    <div className="bg-white rounded-card p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#0A1628]">
              Beat Hotspot Density & Preventive Action
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Beat-level concentration and preventive Kalandra enforcement</p>
          </div>
          <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 px-3 py-1 rounded-full">
            <span className="text-xs font-semibold text-violet-700">Preventive Actions:</span>
            <span className="text-xs font-extrabold text-violet-800">{preventive.total_kalandras || 0}</span>
          </div>
        </div>

        {/* 2-Column Split: Beat Ranking vs Preventive Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Beat Rankings */}
          <div>
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
              <span>Crime Concentration by Beat</span>
            </div>
            <div className="space-y-2">
              {beatRankings.slice(0, 4).map((beat, idx) => (
                <div key={beat.beat_name} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-extrabold ${
                      idx === 0 ? 'bg-rose-100 text-rose-700' : idx === 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {beat.rank}
                    </span>
                    <span className="font-semibold text-slate-800">{beat.beat_name}</span>
                  </div>
                  <span className="font-bold text-slate-700">{beat.incidents} cases</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Preventive Actions */}
          <div>
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
              <span>Preventive Action Breakdown</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 bg-violet-50/70 border border-violet-100 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-bold text-violet-900">Sec 107/151 CrPC / BNSS</div>
                  <div className="text-[10px] text-violet-600">Breach of peace / preventive custody</div>
                </div>
                <div className="font-extrabold text-violet-900 text-sm tabular-nums">
                  {preventive.sec_107_151_crpc_bnss || 0}
                </div>
              </div>

              <div className="p-2.5 bg-blue-50/70 border border-blue-100 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-bold text-blue-900">Sec 110 CrPC (Habitual)</div>
                  <div className="text-[10px] text-blue-600">Good behavior bonds / bad characters</div>
                </div>
                <div className="font-extrabold text-blue-900 text-sm tabular-nums">
                  {preventive.sec_110_habitual_offenders || 0}
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">Delhi Police Act Actions</div>
                  <div className="text-[10px] text-slate-500">Sec 65/66 DP Act / Nuisance</div>
                </div>
                <div className="font-extrabold text-slate-800 text-sm tabular-nums">
                  {preventive.delhi_police_act_actions || 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
