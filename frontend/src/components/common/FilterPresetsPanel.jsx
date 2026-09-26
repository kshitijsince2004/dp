import React, { useState } from 'react';
import { Trash2, Save, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFilterPresets } from '../../hooks/useFilterPresets.js';
import { formatDMY } from '../../utils/dateFormat.js';

/**
 * FilterPresetsPanel
 *
 * A reusable panel that lets users save and load named filter snapshots.
 *
 * Props:
 *   currentFilters  - the active filter state object (e.g. { type, status, dateFrom, dateTo, search })
 *   onLoadPreset    - callback(filters) called when user clicks a preset to apply it
 */
export default function FilterPresetsPanel({ currentFilters = {}, onLoadPreset }) {
  const { t } = useTranslation();

  const { presets, isLoading, savePreset, deletePreset, isSaving, isDeleting } = useFilterPresets();
  const [expanded, setExpanded] = useState(false);
  const [presetName, setPresetName] = useState('');

  const handleSave = (e) => {
    e.preventDefault();
    if (!presetName.trim()) return;
    savePreset(presetName.trim(), currentFilters);
    setPresetName('');
  };

  const handleLoad = (preset) => {
    const spec = preset.filter_spec || {};
    const conditions = spec.conditions || [];
    const mapped = {
      type: 'ALL',
      status: 'ALL',
      dateFrom: null,
      dateTo: null,
      search: '',
      arrestKind: undefined
    };

    if (preset.id === 'sys_preset_today') {
      mapped.type = 'CASE';
      mapped.dateFrom = formatDMY(new Date());
      mapped.dateTo = formatDMY(new Date());
    } else {
      conditions.forEach(cond => {
        const field = cond.field || '';
        const op = (cond.operator || cond.op || '').toLowerCase();
        const val = cond.value;

        if (field === '_status' || field === 'current_status') {
          mapped.status = Array.isArray(val) ? val[0] : val;
        } else if (field === '_record_type' || field === 'record_type') {
          mapped.type = val;
        } else if (field === '_record_date' || field === 'record_date') {
          let formattedDate = val;
          if (typeof val === 'string' && val.includes('-')) {
            const parts = val.split('-');
            if (parts.length === 3) {
              formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
          }
          if (op === 'gte' || op === 'gt') mapped.dateFrom = formattedDate;
          if (op === 'lte' || op === 'lt') mapped.dateTo = formattedDate;
          if (op === 'last_n_days') {
            const days = parseInt(val || 1, 10);
            const d = new Date();
            d.setDate(d.getDate() - days + 1);
            mapped.dateFrom = formatDMY(d);
            mapped.dateTo = formatDMY(new Date());
          } else if (op === 'older_than_n_days') {
            const days = parseInt(val || 1, 10);
            const d = new Date();
            d.setDate(d.getDate() - days);
            mapped.dateFrom = '';
            mapped.dateTo = formatDMY(d);
          }
        } else if (field === '_search' || field === 'data.local_head' || field === 'brief_facts') {
          mapped.search = val;
        } else if (field === 'arrestKind') {
          // Round-trips the Kalandra / Arrest (Against FIR) derived filter (see
          // UnifiedFilterStrip.jsx) — saved generically by useFilterPresets.js's
          // "any other filter property" loop, so it needs an explicit read-back here too.
          mapped.arrestKind = val;
        }
      });
    }

    onLoadPreset?.(mapped);
  };

  const hasActiveFilter = Object.values(currentFilters).some(Boolean);

  return (
    <div className="border border-[var(--border-card-theme)] bg-[var(--bg-page-main)] rounded-2xl overflow-hidden text-xs shadow-sm">
      {/* Toggle Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-[var(--text-main-theme)]/80 hover:text-[var(--accent-color)] hover:bg-[var(--bg-page-main)]/80 transition-colors cursor-pointer border-none bg-transparent font-bold"
      >
        <span className="flex items-center gap-2 font-semibold">
          {t('filters.savedPresets', 'Saved Filter Presets')}
          {presets.length > 0 && (
            <span className="bg-[var(--accent-color)] text-white text-[9px] font-bold px-2 py-0.5 rounded-full tabular-numbers shadow-sm">
              {presets.length}
            </span>
          )}
        </span>
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {expanded && (
        <div className="border-t border-[var(--border-card-theme)]/50 px-4 py-4 space-y-4">
          {/* Save current filters form */}
          <form onSubmit={handleSave} className="flex gap-2">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder={t('filters.presetNamePlaceholder', 'Preset name (e.g. This Week Cases)')}
              disabled={!hasActiveFilter}
              className="flex-1 bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl px-3.5 py-2 text-[var(--text-main-theme)] placeholder:text-[var(--text-main-theme)]/40 outline-none focus:border-[var(--accent-color)] transition-all disabled:opacity-40 shadow-sm font-semibold"
            />
            <button
              type="submit"
              disabled={!presetName.trim() || !hasActiveFilter || isSaving}
              className="flex items-center gap-1.5 bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white font-bold px-4 py-2 rounded-xl transition-all shadow-sm disabled:opacity-40 cursor-pointer border-none active:scale-95"
            >
              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {t('common.save', 'Save')}
            </button>
          </form>
          {!hasActiveFilter && (
            <p className="text-[var(--text-main-theme)]/50 text-[10px] font-semibold">
              {t('filters.applyPresetHint', 'Apply at least one filter before saving a preset.')}
            </p>
          )}

          {/* Presets list */}
          {isLoading ? (
            <div className="flex items-center gap-2 text-[var(--text-main-theme)]/60 py-2 font-semibold">
              <Loader2 size={12} className="animate-spin" />
              <span>{t('common.loading', 'Loading presets…')}</span>
            </div>
          ) : presets.length === 0 ? (
            <p className="text-[var(--text-main-theme)]/50 text-[10px] py-1 font-semibold">
              {t('filters.noPresets', 'No presets saved yet.')}
            </p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {presets.map((preset) => {
                // Bilingual name_hi is gone (single English `name` column,
                // ADR 2026-07 — Hindi in ref./config data is additive later,
                // never a redesign). name_en kept only as a compat alias.
                const displayName = preset.name || preset.name_en;
                return (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between gap-2 bg-[var(--bg-page-main)]/40 border border-[var(--border-card-theme)]/80 rounded-xl px-4 py-2 group hover:border-[var(--accent-color)]/50 transition-colors shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => handleLoad(preset)}
                      className="flex-1 text-left text-[var(--text-main-theme)]/85 hover:text-[var(--accent-color)] font-semibold truncate cursor-pointer bg-transparent border-none"
                      title="Click to apply this preset"
                    >
                      {displayName}
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePreset(preset.id)}
                      disabled={isDeleting}
                      className="text-[var(--text-main-theme)]/40 hover:text-rose-500 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 disabled:opacity-30 bg-transparent border-none"
                      title="Delete preset"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
