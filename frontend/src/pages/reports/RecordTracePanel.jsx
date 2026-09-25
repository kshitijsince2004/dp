import React, { useState } from 'react';
import { Search, MapPin, FileText, CheckCircle2, Shield, Calendar, ArrowRight, CornerDownRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import { asTraceData } from '../../utils/dataShape.js';

export default function RecordTracePanel() {
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [traceData, setTraceData] = useState(null);

  const handleTrace = async (e) => {
    e.preventDefault();
    if (!searchInput.trim()) {
      toast.error('Please enter an FIR Number or Record ID');
      return;
    }

    setLoading(true);
    setTraceData(null);

    try {
      const res = await api.get(`/reports/trace/${encodeURIComponent(searchInput.trim())}`);
      setTraceData(asTraceData(res.data.data));
      toast.success('Record traced across report engines!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Record not found or failed to trace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700/70 rounded-2xl p-6 shadow-2xl space-y-6 text-slate-100 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2 font-display">
            <Search className="text-emerald-400" size={20} />
            <span>Real-Record Report Trace Tool</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Search any FIR Number or Record ID to see every report cell, row, and diary sheet it lands on with exact mathematical reasoning.
          </p>
        </div>
      </div>

      {/* Search Input Bar */}
      <form onSubmit={handleTrace} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Enter FIR Number (e.g. 002) or Record ID (UUID)..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500 font-semibold"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-3 rounded-xl transition-all shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <span>Tracing...</span>
          ) : (
            <>
              <span>Trace Record</span>
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </form>

      {/* Results Display */}
      {traceData && (
        <div className="space-y-6 animate-fade-in">
          {/* Record Summary Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">FIR / Record ID</span>
              <span className="text-xs font-bold text-emerald-400 font-mono">{traceData.record.fir_no}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Canonical Head</span>
              <span className="text-xs font-bold text-amber-300">{traceData.record.canonical_code}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Police Station</span>
              <span className="text-xs font-medium text-slate-200">{traceData.record.ps_name}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Current Status</span>
              <span className="text-xs font-bold text-blue-400">{traceData.record.current_status}</span>
            </div>
          </div>

          {/* Contributions List */}
          <div>
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-400" />
              <span>Report Cell Contributions ({traceData.contributions.length} matched cells)</span>
            </h3>

            {traceData.contributions.length === 0 ? (
              <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-slate-500 text-xs italic">
                This record does not match any current report contract rules (e.g. status is DRAFT or head is unclassified).
              </div>
            ) : (
              <div className="space-y-2.5">
                {traceData.contributions.map((c, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 rounded-xl flex items-start gap-3 transition-all"
                  >
                    <CornerDownRight size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-white">{c.report}</span>
                        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                          Sheet: {c.sheet} ({c.sheet_title})
                        </span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-bold">
                          Row {c.row}: {c.label}
                        </span>
                      </div>
                      <p className="text-label-s text-slate-400 font-medium">{c.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
