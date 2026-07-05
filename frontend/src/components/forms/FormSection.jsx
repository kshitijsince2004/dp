import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import FieldRenderer from './FieldRenderer.jsx';
import ActsSectionsTable from './ActsSectionsTable.jsx';

function parseRules(rawRules) {
  if (!rawRules) return {};
  if (typeof rawRules === 'object') return rawRules;
  try { return JSON.parse(rawRules); } catch { return {}; }
}

function isFullWidth(field) {
  const fw = ['TEXTAREA', 'FILE'];
  return fw.includes((field.field_type || '').toUpperCase()) || field.full_width === true;
}

function evaluateShowWhen(condition, values) {
  if (!condition) return true;
  if (condition.and) {
    return condition.and.every(c => evaluateShowWhen(c, values));
  }
  const { field: targetField, value: targetValue, operator } = condition;
  const currentValue = values[targetField];
  if (operator === 'filled') {
    return currentValue !== undefined && currentValue !== null && String(currentValue).trim() !== '';
  }
  return Array.isArray(targetValue)
    ? targetValue.map(v => String(v || '').toLowerCase()).includes(String(currentValue || '').toLowerCase())
    : String(currentValue || '').toLowerCase() === String(targetValue || '').toLowerCase();
}

function RepeaterSection({
  section,
  currentStep,
  entries = [],
  onEntriesChange,
  readOnly,
  lang = 'en',
}) {
  const [collapsed, setCollapsed] = useState({});

  const addEntry = () => {
    onEntriesChange([...entries, {}]);
  };

  const removeEntry = (idx) => {
    const next = entries.filter((_, i) => i !== idx);
    onEntriesChange(next);
  };

  const updateEntryField = (idx, key, val) => {
    const next = entries.map((e, i) => i === idx ? { ...e, [key]: val } : e);
    onEntriesChange(next);
  };

  const toggleCollapse = (idx) => {
    setCollapsed(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const entityLabel = section.entity_type === 'property'
    ? (lang === 'hi' ? 'संपत्ति' : 'Property')
    : (lang === 'hi' ? 'व्यक्ति' : 'Person');

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between bg-slate-50 border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-md bg-[var(--accent-glow)] text-[var(--accent-color)] text-xs font-bold border border-[var(--accent-color)]/20">
            {currentStep + 1}
          </span>
          <h2 className="text-base font-bold text-slate-800 tracking-wide">
            {lang === 'hi' ? (section.title_hi || section.title_en) : section.title_en}
          </h2>
          <span className="text-xs font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
            {entries.length}
          </span>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={addEntry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[var(--accent-color)] hover:bg-[var(--accent-color)]/90 rounded-lg shadow transition-all cursor-pointer"
          >
            <Plus size={13} />
            {lang === 'hi' ? `${entityLabel} जोड़ें` : `Add ${entityLabel}`}
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
            <p className="text-sm font-semibold">
              {lang === 'hi'
                ? `कोई ${entityLabel} नहीं जोड़ा गया`
                : `No ${entityLabel.toLowerCase()} added yet`}
            </p>
            {!readOnly && (
              <p className="text-xs">
                {lang === 'hi'
                  ? `ऊपर "जोड़ें" बटन दबाएं`
                  : `Click "Add ${entityLabel}" above to begin`}
              </p>
            )}
          </div>
        )}

        {entries.map((entry, idx) => {
          const isCollapsed = collapsed[idx];
          const summaryKey = section.fields.find(f => f.field_key.endsWith('_first_name') || f.field_key.endsWith('_major_category'))?.field_key;
          const summary = summaryKey ? entry[summaryKey] : null;

          return (
            <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => toggleCollapse(idx)}
                  className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer"
                >
                  {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  <span>
                    {entityLabel} #{idx + 1}
                    {summary && <span className="text-slate-400 font-normal ml-2">— {summary}</span>}
                  </span>
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeEntry(idx)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                  {section.fields.map((field) => {
                    const key = field.field_key;
                    if (field.show_when) {
                      const { field: triggerKey, value: triggerValue, operator } = field.show_when;
                      const currentValue = entry[triggerKey];
                      let isMatch = false;
                      if (operator === 'filled') {
                        isMatch = currentValue !== undefined && currentValue !== null && String(currentValue).trim() !== '';
                      } else {
                        isMatch = Array.isArray(triggerValue)
                          ? triggerValue.map(v => String(v || '').toLowerCase()).includes(String(currentValue || '').toLowerCase())
                          : String(currentValue || '').toLowerCase() === String(triggerValue || '').toLowerCase();
                      }
                      if (!isMatch) return null;
                    }


                    const rules = parseRules(field.validation_rules);
                    const label = lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en;
                    const fw = isFullWidth(field);

                    return (
                      <div
                        key={key}
                        className={`flex flex-col gap-1.5 ${fw ? 'md:col-span-2' : ''}`}
                      >
                        <label className="form-label-custom">
                          {label}
                          {rules.required && <span className="text-red-500 font-bold ml-0.5">*</span>}
                        </label>
                        <FieldRenderer
                          field={field}
                          value={entry[key]}
                          onChange={(k, v) => updateEntryField(idx, k, v)}
                          readOnly={readOnly}
                          hasError={false}
                          lang={lang}
                          values={entry}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FormSection({
  section,
  currentStep,
  totalSteps = 1,
  values,
  errors,
  touched,
  handleChange,
  readOnly,
  targetFields = [],
  lang = 'en',
  hideHeader = false,
  // Repeater props (only used when section.is_repeater === true)
  entries,
  onEntriesChange,
  // Bundle of state/handlers the real <ActsSectionsTable> needs, passed through from
  // DynamicForm.jsx — only required when this section's fields include 'act_name'.
  actsSectionsProps,
}) {
  if (!section) return null;

  if (section.is_repeater) {
    return (
      <RepeaterSection
        section={section}
        currentStep={currentStep}
        entries={entries || []}
        onEntriesChange={onEntriesChange}
        readOnly={readOnly}
        lang={lang}
      />
    );
  }

  return (
    <div className={hideHeader ? "bg-transparent overflow-visible" : "bg-white border border-[#7a9cc5] rounded-xl shadow-sm overflow-hidden"}>
      {/* Section header */}
      {!hideHeader && (
        <div className="flex items-center justify-between bg-[#f0f5fa] border-b border-[#7a9cc5] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-[#dfeaf5] text-[#0d2a4a] text-xs font-bold border border-[#7a9cc5]/40">
              {currentStep + 1}
            </span>
            <h2 className="text-base font-bold text-[#0d2a4a] tracking-wide">
              {lang === 'hi'
                ? (section.title_hi || section.title_en)
                : section.title_en}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <FormAutosave status={saveStatus} lang={lang} />
            {totalSteps > 1 && (
              <span className="text-xs font-extrabold text-[#0d2a4a] bg-[#dfeaf5] border border-[#7a9cc5]/20 px-2.5 py-1 rounded-lg">
                {lang === 'hi' ? `चरण ${currentStep + 1} / ${totalSteps}` : `Step ${currentStep + 1} / ${totalSteps}`}
              </span>
            )}
            {readOnly && (
              <span className="text-[10px] font-bold text-slate-500 bg-slate-200 border border-slate-300 px-2 py-0.5 rounded uppercase tracking-wider">
                {lang === 'hi' ? 'केवल पठन' : 'Read Only'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Fields grid container */}
      <div className={hideHeader ? "p-0" : "p-4"}>
        {/* Enclose standard fields inside the styled blue border grid box */}
        <fieldset className={hideHeader ? "border-none p-0 bg-transparent" : "border border-[#7a9cc5] rounded px-3 py-3 bg-white"}>
          {!hideHeader && (
            <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
              {lang === 'hi'
                ? (section.title_hi || section.title_en)
                : section.title_en}
            </legend>
          )}

          <div className={hideHeader ? "grid grid-cols-1 md:grid-cols-[220px_1fr] border border-[#7a9cc5] rounded overflow-hidden" : "grid grid-cols-1 md:grid-cols-[220px_1fr] border border-[#c7d8ea]"}>
            {(() => {
              // Filter out keys we should skip
              const keysToSkip = [
                'sections',
                'ipc_sections', 'excise_sections', 'arms_sections', 'gambling_sections', 'other_sections',
                'ipc_major_head', 'excise_major_head', 'arms_major_head', 'gambling_major_head', 'other_major_head',
                'theft_minor_head', 'murder_minor_head', 'hurt_minor_head', 'cheating_minor_head', 'robbery_minor_head',
                'excise_minor_head', 'arms_minor_head', 'gambling_minor_head', 'other_minor_head'
              ];

              const visibleFields = section.fields.filter(f => {
                if (keysToSkip.includes(f.field_key)) return false;
                if (!evaluateShowWhen(f.show_when, values)) return false;
                return true;
              });

              return visibleFields.map((field, index) => {
                const key = field.field_key;
                const label = lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en;
                const rules = parseRules(field.validation_rules);
                const isRequired = !!rules.required;
                const isHighlighted = targetFields.includes(key);
                const error = touched[key] ? errors[key] : null;
                const isLast = index === visibleFields.length - 1;

                if (key === 'act_name' && actsSectionsProps) {
                  return (
                    <div key="acts-sections-block" className="col-span-1 md:col-span-2 p-2 border-b border-[#c7d8ea]">
                      <ActsSectionsTable {...actsSectionsProps} showLocalHead={false} />
                    </div>
                  );
                }

                return (
                  <React.Fragment key={key}>
                    {/* Left label cell */}
                    <div className={`bg-[#dfeaf5] px-3 py-2.5 text-[12px] font-semibold text-[#0d2a4a] flex items-center gap-1.5 min-h-[44px]
                      ${!isLast ? 'border-b border-[#c7d8ea]' : ''}
                      ${isHighlighted ? 'bg-amber-50 text-amber-900' : ''}
                    `}>
                      <span>{label}</span>
                      {isRequired && <span className="text-red-500 font-bold">*</span>}
                      {isHighlighted && (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1 py-0.5 rounded shadow-sm ml-auto">
                          <AlertTriangle size={8} />
                          {lang === 'hi' ? 'संशोधन' : 'Fix'}
                        </span>
                      )}
                    </div>

                    {/* Right field cell */}
                    <div className={`px-3 py-2 bg-white flex flex-col justify-center min-h-[44px]
                      ${!isLast ? 'border-b border-[#c7d8ea]' : ''}
                      ${isHighlighted ? 'bg-amber-50/30' : ''}
                    `}>
                      <FieldRenderer
                        field={field}
                        value={values[key]}
                        onChange={handleChange}
                        readOnly={readOnly || field.readonly === true || field.readonly === 'true'}
                        hasError={!!error}
                        lang={lang}
                        values={values}
                        selectVariant="compact"
                        selectClassName="w-full h-7 px-2 border border-[#7a9cc5] rounded bg-white text-[12px] outline-none focus:border-blue-500 cursor-text"
                      />
                      {error && (
                        <span className="flex items-center gap-1 text-xs text-red-500 font-medium mt-1">
                          <AlertCircle size={12} className="flex-shrink-0" />
                          {error}
                        </span>
                      )}
                    </div>
                  </React.Fragment>
                );
              });
            })()}
          </div>
        </fieldset>
      </div>
    </div>
  );
}
