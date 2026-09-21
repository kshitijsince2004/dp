import React from 'react';
import { IndianRupee, ShieldCheck, TrendingUp, Car, Smartphone, Watch, Banknote, ShieldAlert } from 'lucide-react';

const formatCurrency = (val) => {
  if (val === null || val === undefined) return '₹ 0';
  return `₹ ${Number(val).toLocaleString('en-IN')}`;
};

const CATEGORY_ICONS = {
  'Motor Vehicle Theft (MVT)': Car,
  'Gold / Jewelry / Valuables': Watch,
  'Cash / Currency': Banknote,
  'Electronics & Mobiles': Smartphone,
  'Illegal Arms & Contraband': ShieldAlert,
};

export default function PropertyRecoveryCard({ data = {}, isLoading = false }) {
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

  const stolen = data.stolen_value_inr || 0;
  const recovered = data.recovered_value_inr || 0;
  const recoveryRate = data.recovery_rate_pct ?? (stolen > 0 ? Math.round((recovered / stolen) * 100) : 0);
  const categories = data.categories || [];

  return (
    <div className="bg-white rounded-card p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#0A1628] flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-emerald-600" />
              Property & Economic Recovery Analysis
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Valuation of Stolen vs Recovered assets in reported crime</p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
            <span className="text-xs font-semibold text-emerald-700">Recovery Rate:</span>
            <span className="text-xs font-extrabold text-emerald-800">{recoveryRate}%</span>
          </div>
        </div>

        {/* Top Summary Metrics */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-3.5 bg-rose-50/60 border border-rose-100 rounded-xl">
            <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wide">Total Stolen Valuation</div>
            <div className="text-lg font-black text-rose-900 mt-1 tabular-nums">{formatCurrency(stolen)}</div>
          </div>
          <div className="p-3.5 bg-emerald-50/60 border border-emerald-100 rounded-xl">
            <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">Total Recovered Valuation</div>
            <div className="text-lg font-black text-emerald-900 mt-1 tabular-nums">{formatCurrency(recovered)}</div>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="mb-5">
          <div className="flex justify-between text-xs font-bold text-slate-600 mb-1.5">
            <span>Overall Recovery Progress</span>
            <span>{recoveryRate}% Recovered</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(2, recoveryRate))}%` }}
            />
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">Category-Wise Asset Tracking</div>
          {categories.slice(0, 4).map((cat) => {
            const Icon = CATEGORY_ICONS[cat.name] || ShieldCheck;
            return (
              <div key={cat.name} className="p-2.5 bg-slate-50/80 rounded-lg border border-slate-100 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-white rounded-md border border-slate-200 text-slate-700">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">{cat.name}</div>
                    <div className="text-[10px] text-slate-500">{cat.count || 0} items tracked</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-extrabold text-slate-800 tabular-nums">{formatCurrency(cat.recovered_val)}</div>
                  <div className="text-[10px] text-slate-500">of {formatCurrency(cat.stolen_val)} ({cat.recovery_rate_pct || 0}%)</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
