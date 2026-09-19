import React, { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, AlertTriangle, CheckCircle2, Lock, FileText, Info } from 'lucide-react';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import { log } from '../../utils/logger.js';

/**
 * Statutory 14-Digit FIR Input Component
 * Format: [8-digit derived prefix] + [2-digit Year (YY)] + [4-digit Serial (NNNN)]
 * Supports backwards compatibility with legacy formats (e.g., 104/2026).
 */
export default function StatutoryFirField({
  value = '',
  onChange,
  readOnly = false,
  lang = 'en',
  values = {},
  handleFieldChange,
  compositeDateTimeCell,
  disabledClass = '',
}) {
  const { user } = useAuthStore();
  const registrationType = values?.registration_type || 'MANUAL_CCTNS';
  const hierarchyNodeId = values?.hierarchy_node_id || values?.ps_id || user?.ps_id;

  // Fetch the statutory 8-digit prefix for the current registration type & police station
  const { data: prefixData, isLoading: isPrefixLoading, error: prefixError } = useQuery({
    queryKey: ['statutoryFirPrefix', registrationType, hierarchyNodeId],
    queryFn: async () => {
      const res = await api.get('/records/statutory-fir/prefix', {
        params: {
          registration_type: registrationType,
          hierarchy_node_id: hierarchyNodeId || undefined,
        },
      });
      return res.data?.data || null;
    },
    staleTime: 60_000,
  });

  const statutoryPrefix = prefixData?.prefix || '';
  const currentYear2Digit = String(new Date().getFullYear()).slice(-2);

  // Determine if current value is 14-digit statutory or legacy
  const isLegacy = useMemo(() => {
    if (!value) return false;
    const str = String(value).trim();
    return str.includes('/') || (str.length > 0 && str.length !== 14);
  }, [value]);

  const [mode, setMode] = useState(isLegacy ? 'legacy' : 'statutory');

  // Internal state for YY (2 digits) and Serial (4 digits)
  const [yearSegment, setYearSegment] = useState(() => {
    if (value && /^\d{14}$/.test(value)) {
      return value.slice(8, 10);
    }
    return currentYear2Digit;
  });

  const [serialSegment, setSerialSegment] = useState(() => {
    if (value && /^\d{14}$/.test(value)) {
      return value.slice(10, 14);
    }
    return '';
  });

  // Sync state if external value changes (e.g. initial load or record load)
  useEffect(() => {
    if (value && /^\d{14}$/.test(value)) {
      setYearSegment(value.slice(8, 10));
      setSerialSegment(value.slice(10, 14));
      setMode('statutory');
    } else if (value && (value.includes('/') || (value.length > 0 && value.length !== 14))) {
      setMode('legacy');
    }
  }, [value]);

  // Propagate assembled 14-digit value whenever prefix, year, or serial changes (in statutory mode)
  const commitStatutoryFir = (pfx, yr, ser) => {
    if (!pfx) return;
    const cleanYr = (yr || currentYear2Digit).replace(/\D/g, '').slice(0, 2).padStart(2, '0');
    const cleanSer = (ser || '').replace(/\D/g, '').slice(0, 4);
    
    if (cleanSer) {
      const paddedSer = cleanSer.padStart(4, '0');
      const full14 = `${pfx}${cleanYr}${paddedSer}`;
      onChange(full14);
    } else {
      // Partial representation while typing
      onChange(`${pfx}${cleanYr}${cleanSer}`);
    }
  };

  const handleYearChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    setYearSegment(raw);
    if (statutoryPrefix) {
      commitStatutoryFir(statutoryPrefix, raw, serialSegment);
    }
  };

  const handleSerialChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
    setSerialSegment(raw);
    if (statutoryPrefix) {
      commitStatutoryFir(statutoryPrefix, yearSegment, raw);
    }
  };

  const handleSerialBlur = () => {
    if (serialSegment && serialSegment.length < 4) {
      const padded = serialSegment.padStart(4, '0');
      setSerialSegment(padded);
      if (statutoryPrefix) {
        commitStatutoryFir(statutoryPrefix, yearSegment, padded);
      }
    }
  };

  const handleLegacyChange = (e) => {
    onChange(e.target.value);
  };

  const isValidStatutory = value && /^\d{14}$/.test(value);

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {mode === 'legacy' ? (
          /* Legacy input view */
          <div className="flex-1 flex items-center bg-white border-2 border-amber-300 rounded-xl px-3 py-1.5 shadow-sm">
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono font-bold mr-2">
              LEGACY
            </span>
            <input
              type="text"
              disabled={readOnly}
              value={value || ''}
              onChange={handleLegacyChange}
              placeholder={lang === 'hi' ? 'प्राथमिकी संख्या (e.g. 104/2026)' : 'FIR Number (e.g. 104/2026)'}
              className={`flex-1 bg-transparent border-0 text-sm outline-none placeholder:text-slate-400 font-mono ${disabledClass}`}
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  setMode('statutory');
                  if (statutoryPrefix) {
                    commitStatutoryFir(statutoryPrefix, yearSegment, serialSegment);
                  }
                }}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline ml-2"
              >
                {lang === 'hi' ? '14-अंकीय प्रारूप में बदलें' : 'Use 14-digit format'}
              </button>
            )}
          </div>
        ) : (
          /* Statutory 14-digit composite widget */
          <div className="flex-1 flex flex-wrap items-center bg-white border-2 border-slate-200 focus-within:border-[var(--accent-color,#3b82f6)] rounded-xl p-1 gap-1.5 transition-colors">
            {/* 8-Digit Statutory Prefix Chip */}
            <div
              className="flex items-center gap-1 bg-slate-100 text-slate-800 px-2.5 py-1.5 rounded-lg font-mono text-sm font-bold border border-slate-300 select-none shadow-inner"
              title={
                prefixData?.isManual
                  ? `CCTNS Code: State 08 | District ${prefixData.districtCode} | PS ${prefixData.psCode}`
                  : `Unified Code: Type ${prefixData?.unifiedTypePrefix} | PS ${prefixData?.psUnifiedCode}`
              }
            >
              <Lock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <span>
                {statutoryPrefix ? (
                  prefixData?.isManual ? (
                    <>
                      <span className="text-blue-700">08</span>
                      <span className="text-slate-400 mx-0.5">·</span>
                      <span className="text-emerald-700">{prefixData.districtCode}</span>
                      <span className="text-slate-400 mx-0.5">·</span>
                      <span className="text-purple-700">{prefixData.psCode}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-indigo-700">{prefixData?.unifiedTypePrefix}</span>
                      <span className="text-slate-400 mx-0.5">·</span>
                      <span className="text-amber-700">{prefixData?.psUnifiedCode}</span>
                    </>
                  )
                ) : isPrefixLoading ? (
                  <span className="text-slate-400 text-xs animate-pulse">Loading...</span>
                ) : (
                  <span className="text-red-500 text-xs">Prefix Error</span>
                )}
              </span>
            </div>

            <span className="text-slate-300 font-bold hidden sm:inline">-</span>

            {/* 2-Digit Year Input (YY) */}
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus-within:bg-white focus-within:border-blue-400 transition-colors">
              <span className="text-[10px] uppercase font-bold text-slate-400 mr-1 select-none">YY</span>
              <input
                type="text"
                maxLength={2}
                disabled={readOnly}
                value={yearSegment}
                onChange={handleYearChange}
                placeholder={currentYear2Digit}
                className={`w-8 bg-transparent border-0 text-sm font-mono font-bold text-slate-800 text-center outline-none ${disabledClass}`}
              />
            </div>

            <span className="text-slate-300 font-bold hidden sm:inline">-</span>

            {/* 4-Digit Serial Input (NNNN) */}
            <div className="flex-1 flex items-center min-w-[90px] bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 focus-within:bg-white focus-within:border-blue-400 transition-colors">
              <span className="text-[10px] uppercase font-bold text-slate-400 mr-1.5 select-none">Seq</span>
              <input
                type="text"
                maxLength={4}
                disabled={readOnly}
                value={serialSegment}
                onChange={handleSerialChange}
                onBlur={handleSerialBlur}
                placeholder="0001"
                className={`w-full bg-transparent border-0 text-sm font-mono font-bold text-slate-800 outline-none placeholder:text-slate-300 ${disabledClass}`}
              />
            </div>

            {/* Status indicator */}
            <div className="px-1 flex items-center">
              {isValidStatutory ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" title="Valid 14-digit statutory FIR number" />
              ) : (
                <span className="text-[11px] text-slate-400 font-mono">
                  {value ? `${value.length}/14` : '14 digits'}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Date & Time Picker */}
        {compositeDateTimeCell && compositeDateTimeCell('fir_date', 'fir_time', 'w-full sm:w-[220px]')}
      </div>

      {/* Helper caption / Pragati Maidan / Mode switch info */}
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 px-1">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span>
            {prefixData?.isManual ? (
              <span>
                <b>08</b> (State) + <b>{prefixData.districtCode}</b> (District) + <b>{prefixData.psCode}</b> (PS) + <b>YY</b> + <b>Seq</b>
              </span>
            ) : prefixData ? (
              <span>
                <b>{prefixData.unifiedTypePrefix}</b> (Type) + <b>{prefixData.psUnifiedCode}</b> (PS Unified) + <b>YY</b> + <b>Seq</b>
              </span>
            ) : (
              <span>14-digit statutory number: 8-digit jurisdiction code + 2-digit year + 4-digit serial</span>
            )}
          </span>
        </div>

        {prefixError && (
          <span className="text-red-500 font-medium flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {prefixError?.response?.data?.message || 'Failed to resolve statutory prefix'}
          </span>
        )}
      </div>
    </div>
  );
}
