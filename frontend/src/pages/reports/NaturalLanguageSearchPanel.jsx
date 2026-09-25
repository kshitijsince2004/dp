import React, { useState } from 'react';
import {
  Search, AlertTriangle, CheckCircle2, Info, RotateCcw
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import RecordTypeBadge from '../../components/common/RecordTypeBadge.jsx';
import { asArray, asSearchResults } from '../../utils/dataShape.js';

export default function NaturalLanguageSearchPanel() {
  const [queryInput, setQueryInput] = useState('');
  const [interpreting, setInterpreting] = useState(false);
  const [executing, setExecuting] = useState(false);

  // Interpretation Preview state
  const [interpretation, setInterpretation] = useState(null);

  // Search Results state
  const [searchResults, setSearchResults] = useState(null);

  // Quick Preset Queries for Officers
  const SAMPLE_QUERIES = [
    'cases of murder at parliament street police station',
    'cases of murder involving knife as the seizure weapon',
    'Arrest in cases of murder involving gun as seizure',
    'cases involving theft of mobile phones of a specific model, with their descriptions',
    'missing person cases of minors in central district'
  ];

  // Step 1: Interpret Natural Language Query
  const handleInterpret = async (queryText = queryInput) => {
    if (!queryText || !queryText.trim()) {
      toast.error('Please enter a plain-language search query.');
      return;
    }
    setInterpreting(true);
    setSearchResults(null);
    try {
      const res = await api.post('/search/interpret', { query: queryText });
      if (res.data.success) {
        const data = res.data.data;
        setInterpretation({
          ...data,
          bindings: asArray(data?.bindings),
        });
        toast.success(`Query interpreted into ${asArray(data?.bindings).length} structured catalog bindings.`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to interpret search query.');
    } finally {
      setInterpreting(false);
    }
  };

  // Step 2: Execute Confirmed Search
  const handleExecute = async () => {
    if (!interpretation) return;
    if (interpretation.is_ambiguous) {
      toast.error('Please resolve ambiguity warning before running search.');
      return;
    }
    setExecuting(true);
    try {
      const res = await api.post('/search/execute', {
        confirmationSpec: interpretation,
        page: 1,
        limit: 20
      });
      if (res.data.success) {
        const normalized = asSearchResults(res.data.data);
        setSearchResults(normalized);
        toast.success(`Search completed. Found ${normalized.totals.total} matching records.`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to execute search query.');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Input Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Universal Natural-Language Intelligence &amp; Case Finder
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Type a plain-language query to filter across any field in the field catalog with dynamic open-ended candidate binding.
          </p>
        </div>

        {/* Input Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInterpret()}
              placeholder="e.g. cases of murder at parliament street police station"
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#0f52ba] font-medium"
            />
          </div>
          <button
            onClick={() => handleInterpret()}
            disabled={interpreting}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[#0f52ba] hover:bg-[#0d2a4a] text-white rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            {interpreting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            <span>Interpret &amp; Preview</span>
          </button>
        </div>

        {/* Sample Queries Chips */}
        <div className="pt-2 border-t border-slate-200">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
            Sample Officer Queries:
          </span>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_QUERIES.map((sq, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setQueryInput(sq);
                  handleInterpret(sq);
                }}
                className="text-xs px-3 py-1.5 bg-slate-50 hover:bg-[var(--ux4g-bg-primary-soft)] border border-slate-200 text-[#0f52ba] rounded-lg transition-all cursor-pointer font-medium"
              >
                "{sq}"
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Step 2: Dynamic Mandatory Interpretation Confirmation Panel */}
      {interpretation && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 fade-in-up">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="text-[#0f52ba] font-bold text-sm">
              <span>Step 2: Dynamic Open-Ended Query Interpretation Confirmation ({interpretation.bindings?.length || 0} Bindings)</span>
            </div>
            <button
              onClick={() => {
                setInterpretation(null);
                setSearchResults(null);
              }}
              className="text-slate-500 hover:text-slate-800 text-xs flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          </div>

          {/* Ambiguity Warning */}
          {interpretation.is_ambiguous && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-center gap-3">
              <AlertTriangle size={20} className="shrink-0 text-amber-600" />
              <span>{interpretation.ambiguity_warning}</span>
            </div>
          )}

          {/* Open-Ended Dynamic Binding Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {interpretation.bindings && asArray(interpretation.bindings).map((b, idx) => (
              <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200 hover:border-[#0f52ba]/40 rounded-xl space-y-1.5 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                    {b.catalog_entry?.label_en || b.field_key}
                  </span>
                  <span className="px-1.5 py-0.5 bg-[var(--ux4g-bg-primary-soft)] text-[#0f52ba] border border-slate-200 text-[9px] font-mono rounded">
                    {b.match_type}
                  </span>
                </div>
                <span className="text-xs font-bold text-emerald-700 font-mono block truncate">
                  {b.display_label || (typeof b.resolved_value === 'object' ? b.resolved_value.name || b.resolved_value.label : b.resolved_value)}
                </span>
                <span className="text-[10px] text-slate-500 italic block truncate">
                  Matched phrase: "{b.matched_phrase}"
                </span>
              </div>
            ))}
          </div>

          {/* Disclosure Notice */}
          {interpretation.disclosure_notice && (
            <div className="p-3.5 bg-[var(--ux4g-bg-primary-soft)] border border-slate-200 rounded-xl text-[#0d2a4a] text-xs flex items-center gap-2">
              <Info size={16} className="shrink-0 text-[#0f52ba]" />
              <span>{interpretation.disclosure_notice}</span>
            </div>
          )}

          {/* Action Confirm Button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleExecute}
              disabled={executing || interpretation.is_ambiguous}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#0f52ba] hover:bg-[#0d2a4a] text-white rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {executing ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              <span>Run Confirmed Search</span>
            </button>
          </div>
        </div>
      )}

      {/* Tiered Results Presentation */}
      {searchResults && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6 fade-in-up">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-3 gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Search Results ({searchResults.totals.total} Records Found)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Query: "{searchResults.query}"
              </p>
            </div>

            <div className="flex gap-2">
              <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-md text-xs font-bold font-mono">
                Structured: {searchResults.totals.structured}
              </span>
              <span className="px-2.5 py-1 bg-[var(--ux4g-bg-primary-soft)] border border-slate-200 text-[#0f52ba] rounded-md text-xs font-bold font-mono">
                Free-Text: {searchResults.totals.free_text}
              </span>
              <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-md text-xs font-bold font-mono">
                Low Confidence: {searchResults.totals.low_confidence}
              </span>
            </div>
          </div>

          {/* Tier 1: Structured Matches */}
          {searchResults.results.structured_matches.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 size={14} />
                <span>Tier 1: Canonical Structured Matches ({searchResults.results.structured_matches.length})</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {searchResults.results.structured_matches.map((item) => (
                  <div key={item.id} className="p-4 bg-slate-50 border border-emerald-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 font-mono">{item.record_number}</span>
                      <RecordTypeBadge recordType={item.record_type} />
                    </div>
                    <p className="text-xs text-slate-700 font-semibold">{item.crime_head_name}</p>
                    <p className="text-label-s text-slate-500">{item.ps_name} ({item.district_name})</p>
                    {item.snippet && (
                      <p className="text-label-s text-slate-600 italic bg-white p-2 rounded border border-slate-200">
                        "{item.snippet}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tier 2: Free-Text Matches */}
          {searchResults.results.free_text_matches.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <h4 className="text-xs font-bold text-[#0f52ba] uppercase tracking-wider">
                Tier 2: Description &amp; Free-Text Matches ({searchResults.results.free_text_matches.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {searchResults.results.free_text_matches.map((item) => (
                  <div key={item.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 font-mono">{item.record_number}</span>
                      <RecordTypeBadge recordType={item.record_type} />
                    </div>
                    <p className="text-xs text-slate-700 font-semibold">{item.crime_head_name}</p>
                    <p className="text-label-s text-slate-500">{item.ps_name} ({item.district_name})</p>
                    {item.snippet && (
                      <p className="text-label-s text-slate-600 italic bg-[var(--ux4g-bg-primary-soft)] p-2 rounded border border-slate-200">
                        "{item.snippet}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchResults.totals.total === 0 && (
            <div className="p-12 text-center text-slate-500 text-xs font-semibold space-y-2">
              <p>No matching records found matching the confirmed search parameters under your assigned user scope.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
