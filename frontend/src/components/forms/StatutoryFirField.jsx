import React, { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Lock, Info } from 'lucide-react';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import { log } from '../../utils/logger.js';

export function mapCaseTypeToRegistrationType(val) {
  if (!val) return 'MANUAL_CCTNS';
  const s = String(val).trim().toLowerCase();
  if (s.includes('cctns') || s.includes('manual')) return 'MANUAL_CCTNS';
  if (s.includes('etheft') || s.includes('theft')) return 'E_THEFT';
  if (s.includes('emvt') || s.includes('mvt') || s.includes('vehicle')) return 'E_MVT';
  if (s.includes('ncrp') || s.includes('cyber')) return 'NCRP';
  if (s.includes('zero')) return 'ZERO_FIR';
  const u = String(val).trim().toUpperCase();
  if (['MANUAL_CCTNS', 'E_THEFT', 'E_MVT', 'NCRP', 'ZERO_FIR'].includes(u)) return u;
  return 'MANUAL_CCTNS';
}

/**
 * Statutory 14-Digit FIR Input Component
 * Format: [8-digit derived non-editable prefix] + [2-digit Year (YY)] + [4-digit Serial (NNNN)]
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
  const rawRegType = values?.registration_type || values?.case_type || 'MANUAL_CCTNS';
  const registrationType = mapCaseTypeToRegistrationType(rawRegType);
  const hierarchyNodeId = values?.hierarchy_node_id || values?.ps_id || user?.ps_id || user?.station_id || user?.police_station_id;

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

  const statutoryPrefix = prefixData?.prefix8 || prefixData?.prefix || '';
  const isManual = prefixData?.districtCode != null;
  const currentYear2Digit = String(new Date().getFullYear()).slice(-2);

  const lastEmittedRef = useRef('');

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

  // Sync state ONLY if external value changes (e.g. record load/reset)
  useEffect(() => {
    if (value && value !== lastEmittedRef.current && /^\d{14}$/.test(value)) {
      setYearSegment(value.slice(8, 10));
      setSerialSegment(value.slice(10, 14));
      lastEmittedRef.current = value;
    }
  }, [value]);

  // Propagate assembled 14-digit value whenever prefix, year, or serial changes
  const commitStatutoryFir = (pfx, yr, ser, pad = false) => {
    const cleanYr = (yr || currentYear2Digit).replace(/\D/g, '').slice(0, 2).padStart(2, '0');
    const cleanSer = (ser || '').replace(/\D/g, '').slice(0, 4);
    
    let full = '';
    if (pfx) {
      if (pad && cleanSer) {
        const paddedSer = cleanSer.padStart(4, '0');
        full = `${pfx}${cleanYr}${paddedSer}`;
      } else {
        full = `${pfx}${cleanYr}${cleanSer}`;
      }
    } else {
      full = cleanSer;
    }
    
    lastEmittedRef.current = full;
    onChange(full);
  };

  // Recommit when prefixData, registrationType, yearSegment, or serialSegment changes
  useEffect(() => {
    commitStatutoryFir(statutoryPrefix, yearSegment || currentYear2Digit, serialSegment, false);
  }, [statutoryPrefix, registrationType, yearSegment, serialSegment]);

  const handleYearChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    setYearSegment(raw);
    commitStatutoryFir(statutoryPrefix, raw, serialSegment, false);
  };

  const handleYearBlur = () => {
    let clean = (yearSegment || '').replace(/\D/g, '');
    if (!clean) {
      clean = currentYear2Digit;
    } else if (clean.length === 1) {
      clean = clean.padStart(2, '0');
    }
    setYearSegment(clean);
    commitStatutoryFir(statutoryPrefix, clean, serialSegment, true);
  };

  const handleSerialChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
    setSerialSegment(raw);
    commitStatutoryFir(statutoryPrefix, yearSegment || currentYear2Digit, raw, false);
  };

  const handleSerialBlur = () => {
    if (serialSegment) {
      let num = parseInt(serialSegment, 10);
      if (!isNaN(num) && num > 9999) {
        num = 9999;
        const padded = String(num).padStart(4, '0');
        setSerialSegment(padded);
        commitStatutoryFir(statutoryPrefix, yearSegment || currentYear2Digit, padded, true);
      } else {
        const padded = serialSegment.padStart(4, '0');
        setSerialSegment(padded);
        commitStatutoryFir(statutoryPrefix, yearSegment || currentYear2Digit, padded, true);
      }
    }
  };

  const serialInt = value && /^\d{14}$/.test(value) ? parseInt(value.slice(10, 14), 10) : 0;
  const isValidStatutory = value && /^\d{14}$/.test(value) && serialInt >= 1 && serialInt <= 9999;
  const isZeroSerial = serialSegment === '0000' || (serialSegment.length > 0 && parseInt(serialSegment, 10) === 0);

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {/* Statutory 14-digit composite widget */}
        <div className={`flex-1 flex flex-wrap items-center bg-white border-2 rounded-xl p-1 gap-2 transition-colors ${isZeroSerial ? 'border-red-500 bg-red-50/20' : 'border-slate-200 focus-within:border-[var(--accent-color,#3b82f6)]'}`}>
          {/* 8-Digit Statutory Prefix Chip (Non-editable fixed prefix) */}
          <div
            className="flex items-center gap-1.5 bg-slate-100 text-slate-800 px-3 py-1.5 rounded-lg font-mono text-sm font-bold border border-slate-300 select-none shadow-inner"
            title={
              isManual
                ? `CCTNS Code: State 08 | District ${prefixData?.districtCode} | PS ${prefixData?.psCode}`
                : `Unified Code: Type ${prefixData?.typePrefix} | PS ${prefixData?.psCode}`
            }
          >
            <Lock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <span>
              {statutoryPrefix ? (
                isManual ? (
                  <>
                    <span className="text-blue-700">08</span>
                    <span className="text-slate-400 mx-0.5">·</span>
                    <span className="text-emerald-700">{prefixData?.districtCode}</span>
                    <span className="text-slate-400 mx-0.5">·</span>
                    <span className="text-purple-700">{prefixData?.psCode}</span>
                  </>
                ) : (
                  <>
                    <span className="text-indigo-700">{prefixData?.typePrefix}</span>
                    <span className="text-slate-400 mx-0.5">·</span>
                    <span className="text-amber-700">{prefixData?.psCode}</span>
                  </>
                )
              ) : isPrefixLoading ? (
                <span className="text-slate-400 text-xs animate-pulse">Loading prefix...</span>
              ) : (
                <span className="text-red-500 text-xs">Prefix Error</span>
              )}
            </span>
          </div>

          <span className="text-slate-300 font-bold hidden sm:inline">-</span>

          {/* 2-Digit Year Input (YY) with ample width */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 focus-within:bg-white focus-within:border-blue-400 transition-colors">
            <span className="text-[10px] uppercase font-bold text-slate-400 mr-1.5 select-none">YY</span>
            <input
              type="text"
              maxLength={2}
              disabled={readOnly}
              value={yearSegment}
              onChange={handleYearChange}
              onBlur={handleYearBlur}
              placeholder={currentYear2Digit}
              className={`w-12 bg-transparent border-0 text-sm font-mono font-bold text-slate-800 text-center outline-none ${disabledClass}`}
            />
          </div>

          <span className="text-slate-300 font-bold hidden sm:inline">-</span>

          {/* 4-Digit Serial Input (NNNN) with comfortable width */}
          <div className={`flex-1 flex items-center min-w-[120px] rounded-lg px-2.5 py-1 transition-colors border ${isZeroSerial ? 'bg-red-50 border-red-300 focus-within:border-red-500' : 'bg-slate-50 border-slate-200 focus-within:bg-white focus-within:border-blue-400'}`}>
            <span className="text-[10px] uppercase font-bold text-slate-400 mr-1.5 select-none">Seq</span>
            <input
              type="text"
              maxLength={4}
              disabled={readOnly}
              value={serialSegment}
              onChange={handleSerialChange}
              onBlur={handleSerialBlur}
              placeholder="0001"
              className={`w-full bg-transparent border-0 text-sm font-mono font-bold outline-none placeholder:text-slate-300 ${isZeroSerial ? 'text-red-600 font-extrabold' : 'text-slate-800'} ${disabledClass}`}
            />
          </div>

          {/* Status indicator */}
          <div className="px-1.5 flex items-center">
            {isValidStatutory ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" title="Valid 14-digit statutory FIR number" />
            ) : isZeroSerial ? (
              <AlertTriangle className="w-4 h-4 text-red-500 animate-bounce" title="Invalid serial 0000" />
            ) : (
              <span className="text-[11px] text-slate-400 font-mono">
                {value ? `${value.length}/14` : '14 digits'}
              </span>
            )}
          </div>
        </div>

        {/* Date & Time Picker */}
        {compositeDateTimeCell && compositeDateTimeCell('fir_date', 'fir_time', 'w-full sm:w-[220px]')}
      </div>

      {/* Explicit Red Warning for 0000 */}
      {isZeroSerial && (
        <div className="flex items-center gap-1.5 text-red-600 font-bold text-xs bg-red-50 border border-red-300 rounded-lg p-2.5 shadow-sm">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>You have entered a wrong FIR serial number (0000). It must be between 0001 and 9999.</span>
        </div>
      )}

      {/* Helper caption info */}
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 px-1">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span>
            {isManual && prefixData ? (
              <span>
                <b>08</b> (State) + <b>{prefixData.districtCode}</b> (District) + <b>{prefixData.psCode}</b> (PS) + <b>YY</b> ({yearSegment || currentYear2Digit}) + <b>Seq</b> ({serialSegment ? serialSegment.padStart(4, '0') : '0001'})
              </span>
            ) : prefixData ? (
              <span>
                <b>{prefixData.typePrefix}</b> (Type) + <b>{prefixData.psCode}</b> (PS Unified) + <b>YY</b> ({yearSegment || currentYear2Digit}) + <b>Seq</b> ({serialSegment ? serialSegment.padStart(4, '0') : '0001'})
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
