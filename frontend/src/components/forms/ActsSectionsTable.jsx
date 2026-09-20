import { useState, useEffect } from 'react';
import SearchableSelect from './SearchableSelect.jsx';
import { log } from '../../utils/logger.js';

/** Rejoins a bare trailing 4-digit-year fragment (e.g. "1959", "2016") onto the fragment before
 * it — unconditional, no registry lookup. This is the OLD fix's entire logic, kept as a
 * pre-pass for `reMergeKnownActFragments` below because it covers a gap that registry (act-list)
 * membership alone cannot: `/acts-sections` (`fields.service.js`'s `getActsSectionsRegistry`)
 * COLLAPSES every act sharing a group alias (IPC / Arms Act / Delhi Excise Act / Gambling Act)
 * into ONE registry entry keyed by the alias — the underlying `ref.acts.act_long` strings those
 * aliases stand for ('ARMS ACT, 1959', 'DELHI EXCISE ACT, 2009'/'...2010', 'THE PUBLIC GAMBLING
 * ACT, 1867', 'DELHI PUBLIC GAMBLING ACT, 1955') are never exposed to the frontend as their own
 * selectable/known label. But records.service.js's recompose hands back the raw act_long (NOT
 * the alias) as `act_name` when loading an existing record for edit, so a saved Arms/Excise/
 * Gambling offence round-trips as e.g. "ARMS ACT, 1959" — which no width of the registry-aware
 * merge below could ever recognise as whole, alias included, since the alias text itself doesn't
 * even textually match two of the four raw act_longs. Bare-year rejoin fixes it without needing
 * the frontend to know anything about ref.acts at all. */
function rejoinBareYearFragments(fragments) {
  const out = [];
  for (const item of fragments) {
    if (/^\d{4}$/.test(item) && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]}, ${item}`;
    } else {
      out.push(item);
    }
  }
  return out;
}

export function reMergeKnownActFragments(fragments, knownLabelsLower) {
  const yearJoined = rejoinBareYearFragments(fragments);
  if (!knownLabelsLower || !knownLabelsLower.size) return yearJoined;
  const merged = [];
  let i = 0;
  const n = yearJoined.length;
  while (i < n) {
    let bestEnd = -1;
    let buffer = '';
    for (let j = i; j < n; j++) {
      buffer = buffer ? `${buffer}, ${yearJoined[j]}` : yearJoined[j];
      if (knownLabelsLower.has(buffer.trim().toLowerCase())) bestEnd = j + 1;
    }
    if (bestEnd === -1) {
      merged.push(yearJoined[i]);
      i += 1;
    } else {
      merged.push(yearJoined.slice(i, bestEnd).join(', '));
      i = bestEnd;
    }
  }
  return merged;
}

/**
 * Acts & Sections registered-list panel + Major/Minor Head cascading table +
 * Local Head select + "Add Acts & Section" modal.
 */
export default function ActsSectionsTable({
  values,
  handleChange,
  readOnly,
  lang,
  actsSectionsRegistry,
  showAddRow,
  setShowAddRow,
  newAct,
  setNewAct,
  newSection,
  setNewSection,
  selectedMajorHead,
  setSelectedMajorHead,
  selectedMinorHead,
  setSelectedMinorHead,
  majorMinorRows,
  onAddMajorMinorRow,
  onDeleteMajorMinorRow,
  getMajorHeadOptions,
  getMinorHeadOptions,
  getLocalHeadOptions,
  localHeadLayout = 'split',
  primaryActIndex = 0,
  onPrimaryChange,
}) {
  const [actSearchInput, setActSearchInput] = useState('');
  const [actDropdownOpen, setActDropdownOpen] = useState(false);

  useEffect(() => {
    if (!actDropdownOpen) {
      setActSearchInput(newAct || '');
    }
  }, [newAct, actDropdownOpen]);

  const knownActLabelsLower = new Set(actsSectionsRegistry.map((item) => item.act.trim().toLowerCase()));
  const rawActs = values.act_name ? String(values.act_name).split(',').map((s) => s.trim()).filter(Boolean) : [];
  const acts = reMergeKnownActFragments(rawActs, knownActLabelsLower);
  const mergedActsLen = acts.length; // captured before the fill-loop below mutates `acts`
  const secs = values.sections ? String(values.sections).split(',').map((s) => s.trim()).filter(Boolean) : [];
  let maxLen = Math.max(acts.length, secs.length);

  // Fill missing acts with the last available act to ensure equal length
  while (acts.length > 0 && acts.length < maxLen) {
    acts.push(acts[acts.length - 1]);
  }

  useEffect(() => {
    if (readOnly) return;
    const secsLen = secs.length;
    if (mergedActsLen > 0 && mergedActsLen < secsLen) {
      handleChange('act_name', acts.join(', '));
    }
  }, [values.act_name, secs.length, readOnly]);

  // Alphabetically sort the acts registry
  const sortedActsRegistry = [...actsSectionsRegistry].sort((a, b) =>
    a.act.localeCompare(b.act)
  );

  const filteredActs = sortedActsRegistry.filter((item) =>
    item.act.toLowerCase().includes(actSearchInput.toLowerCase())
  );

  const chosenActObj = actsSectionsRegistry.find((item) => item.act === newAct);
  const availableSections = chosenActObj ? chosenActObj.sections : [];

  const handleDeleteRow = (i) => {
    log.debug('form:acts_section_delete', { index: i, act: acts[i], section: secs[i] });
    const nextActs = acts.filter((_, idx) => idx !== i);
    const nextSecs = secs.filter((_, idx) => idx !== i);
    handleChange('act_name', nextActs.join(', '));
    handleChange('sections', nextSecs.join(', '));
    if (onPrimaryChange) {
      if (i < primaryActIndex) onPrimaryChange(primaryActIndex - 1);
      else if (i === primaryActIndex) onPrimaryChange(0);
    }
  };

  const closeAddModal = () => {
    setNewAct('');
    setNewSection('');
    setShowAddRow(false);
  };

  const saveAddModal = () => {
    if (newAct.trim() || newSection.trim()) {
      const selectedSecs = newSection
        ? newSection.split(',').map((s) => s.trim()).filter(Boolean)
        : [''];

      const newActsList = selectedSecs.map(() => newAct.trim());
      const newSecsList = selectedSecs;

      const updatedActs = [...acts, ...newActsList].join(', ');
      const updatedSections = [...secs, ...newSecsList].join(', ');

      log.debug('form:acts_section_add', { act: newAct, sections: newSecsList, rowsAdded: newActsList.length });
      handleChange('act_name', updatedActs);
      handleChange('sections', updatedSections);
    } else {
      log.debug('form:acts_section_add_skipped', { reason: 'no act or section entered' });
    }
    closeAddModal();
  };

  const isMajorHeadLocked = majorMinorRows.length > 0;
  const majorMinorBlock = (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[#0d2a4a] font-bold text-xs sm:text-sm">Major Head</span>
          <SearchableSelect
            disabled={readOnly || isMajorHeadLocked}
            value={selectedMajorHead}
            onChange={(val) => {
              setSelectedMajorHead(val);
              setSelectedMinorHead('');
            }}
            options={getMajorHeadOptions()}
            placeholder="Select Major Head"
            lang={lang}
            title={isMajorHeadLocked ? 'Major Head is locked to the first entry added below — delete all rows to pick a different one.' : undefined}
            className={`w-full min-h-[38px] px-3 py-1.5 border border-[#7a9cc5] rounded-xl bg-white text-xs sm:text-sm outline-none focus:border-blue-600 ${
              isMajorHeadLocked ? 'cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500' : 'cursor-text'
            }`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[#0d2a4a] font-bold text-xs sm:text-sm">Minor Head</span>
          <div className="flex items-center gap-2">
            <SearchableSelect
              disabled={readOnly || !selectedMajorHead}
              value={selectedMinorHead}
              onChange={(val) => setSelectedMinorHead(val)}
              options={getMinorHeadOptions()}
              placeholder="Select Minor Head"
              lang={lang}
              className="flex-1 min-h-[38px] px-3 py-1.5 border border-[#7a9cc5] rounded-xl bg-white text-xs sm:text-sm outline-none focus:border-blue-600 cursor-text"
            />
            {!readOnly && (
              <button
                type="button"
                onClick={onAddMajorMinorRow}
                disabled={!selectedMajorHead || !selectedMinorHead}
                className="bg-[#ea580c] hover:bg-[#c2410c] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-sm flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                + Add
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="w-full overflow-x-auto mt-2 max-h-[140px] overflow-y-auto border border-[#7a9cc5] rounded-xl">
        <table className="w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-[#d0e0f8] text-[#0d2a4a] border-b border-[#7a9cc5] sticky top-0">
              <th className="px-3 py-1.5 text-left font-bold w-12 border-r border-[#7a9cc5]">S.No.</th>
              <th className="px-3 py-1.5 text-left font-bold border-r border-[#7a9cc5]">Major Head</th>
              <th className="px-3 py-1.5 text-left font-bold border-r border-[#7a9cc5]">Minor Head</th>
              {!readOnly && <th className="px-3 py-1.5 text-center font-bold w-16">Delete</th>}
            </tr>
          </thead>
          <tbody>
            {majorMinorRows.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 3 : 4} className="px-3 py-3 text-center text-slate-500 italic text-xs">
                  No entries added yet.
                </td>
              </tr>
            ) : (
              majorMinorRows.map((row, idx) => (
                <tr key={idx} className="border-b border-[#7a9cc5] bg-white">
                  <td className="px-3 py-1.5 border-r border-[#7a9cc5] text-[#0d2a4a] font-mono text-center font-bold">{idx + 1}</td>
                  <td className="px-3 py-1.5 border-r border-[#7a9cc5] text-[#0d2a4a] font-semibold">{row.majorHead}</td>
                  <td className="px-3 py-1.5 border-r border-[#7a9cc5] text-[#0d2a4a]">{row.minorHead}</td>
                  {!readOnly && (
                    <td className="px-3 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => onDeleteMajorMinorRow(idx)}
                        className="text-red-600 hover:text-red-800 text-xs font-bold underline cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );

  const localHeadBlock = (
    <SearchableSelect
      disabled={readOnly}
      value={values.local_head || ''}
      onChange={(val) => handleChange('local_head', val)}
      options={getLocalHeadOptions()}
      placeholder="Select Local Head"
      lang={lang}
      className="w-full min-h-[38px] px-3 py-1.5 border border-[#7a9cc5] rounded-xl bg-white text-xs sm:text-sm outline-none focus:border-blue-500 cursor-text"
    />
  );

  return (
    <>
      <div className="flex flex-col md:flex-row gap-3">
        {/* Left: Acts & Sections */}
        <fieldset className="flex-1 border-2 border-[#7a9cc5] rounded-2xl p-3.5 bg-[#f0f4f8]/20 shadow-sm flex flex-col">
          <legend className="text-[#0d2a4a] text-xs sm:text-sm font-black px-2.5 uppercase tracking-wide">
            Acts &amp; Sections
          </legend>

          <div className="flex items-center justify-between mb-2">
            <span className="text-[#0d2a4a] text-xs font-bold opacity-75">Registered List</span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setShowAddRow(true)}
                className="bg-[#ea580c] hover:bg-[#c2410c] text-white text-xs font-extrabold px-3 py-1 rounded-xl transition shadow-sm flex items-center gap-1 cursor-pointer uppercase tracking-wider"
              >
                + Add Acts &amp; Section
              </button>
            )}
          </div>

          <div className="w-full overflow-x-auto max-h-[190px] overflow-y-auto border border-[#7a9cc5] rounded-xl">
            <table className="w-full border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-[#d0e0f8] text-[#0d2a4a] border-b border-[#7a9cc5] sticky top-0">
                  <th className="px-3 py-1.5 text-left font-bold w-12 border-r border-[#7a9cc5]">S.No.</th>
                  <th className="px-3 py-1.5 text-left font-bold border-r border-[#7a9cc5]">Acts</th>
                  <th className="px-3 py-1.5 text-left font-bold border-r border-[#7a9cc5]">Sections</th>
                  <th className="px-3 py-1.5 text-center font-bold w-16 border-r border-[#7a9cc5]" title="Primary act used for statistical reporting">Primary</th>
                  {!readOnly && <th className="px-3 py-1.5 text-center font-bold w-16">Delete</th>}
                </tr>
              </thead>
              <tbody>
                {maxLen === 0 ? (
                  <tr>
                    <td colSpan={readOnly ? 4 : 5} className="px-3 py-4 text-center text-slate-500 italic text-xs">
                      No Acts &amp; Sections added yet. Click "+ Add Acts &amp; Section" to add.
                    </td>
                  </tr>
                ) : (
                  Array.from({ length: maxLen }).map((_, i) => (
                    <tr key={i} className={`border-b border-[#7a9cc5] ${i === primaryActIndex ? 'bg-[#eef6ff]' : 'bg-white'}`}>
                      <td className="px-3 py-1.5 border-r border-[#7a9cc5] text-[#0d2a4a] font-mono text-center font-bold">
                        {i + 1}
                      </td>
                      <td className="px-3 py-1.5 border-r border-[#7a9cc5] text-[#0d2a4a] font-semibold">
                        {acts[i] || ''}
                      </td>
                      <td className="px-3 py-1.5 border-r border-[#7a9cc5] text-[#0d2a4a] font-medium">
                        {secs[i] || ''}
                      </td>
                      <td className="px-3 py-1.5 text-center border-r border-[#7a9cc5]">
                        <input
                          type="radio"
                          name="primary_act_radio"
                          checked={i === primaryActIndex}
                          disabled={readOnly}
                          onChange={() => onPrimaryChange && onPrimaryChange(i)}
                          className="accent-[#0f52ba] cursor-pointer disabled:cursor-default w-3.5 h-3.5"
                          title="Mark as primary act for reporting"
                        />
                      </td>
                      {!readOnly && (
                        <td className="px-3 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(i)}
                            className="text-red-500 hover:text-red-700 font-bold bg-transparent border-none cursor-pointer text-xs underline"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </fieldset>

        {/* Right: Unified Major/Minor & Local Head */}
        <fieldset className="flex-1 border-2 border-[#7a9cc5] rounded-2xl p-3.5 bg-[#f0f4f8]/20 shadow-sm flex flex-col justify-between">
          <legend className="text-[#0d2a4a] text-xs sm:text-sm font-black px-2.5 uppercase tracking-wide">
            Major / Minor &amp; Local Head
          </legend>

          <div className="flex flex-col gap-2.5">
            {majorMinorBlock}

            {localHeadLayout !== 'hidden' && (
              <div className="border-t border-[#7a9cc5]/40 pt-2 mt-1 flex items-center gap-2">
                <span className="text-[#0d2a4a] font-bold text-xs sm:text-sm whitespace-nowrap">Local Head<span className="text-red-500 ml-0.5">*</span></span>
                <div className="flex-1">{localHeadBlock}</div>
              </div>
            )}
          </div>
        </fieldset>
      </div>

      {/* Modal for adding Act & Section */}
      {showAddRow && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={closeAddModal} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] bg-white border border-[#7a9cc5] rounded shadow-2xl z-50 p-4 flex flex-col justify-between text-slate-800">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h3 className="text-xs font-bold text-[#0d2a4a] uppercase tracking-wider">
                  Add Acts & Section
                </h3>
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold bg-transparent border-none cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-1 text-[11px] text-left">
                  <label className="text-[#0d2a4a] font-bold">Act / Law Name</label>
                  <div className="relative w-full">
                    <input
                      type="text"
                      value={actSearchInput}
                      onChange={(e) => {
                        setActSearchInput(e.target.value);
                        setActDropdownOpen(true);
                        if (e.target.value === '') {
                          setNewAct('');
                          setNewSection('');
                        }
                      }}
                      onFocus={() => setActDropdownOpen(true)}
                      onBlur={() => {
                        // Small timeout to allow click event to register before closing dropdown
                        setTimeout(() => setActDropdownOpen(false), 200);
                      }}
                      placeholder="Search and select Act..."
                      className="w-full h-8 px-2 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-[#ea580c] cursor-text"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[8px]">
                      ▼
                    </span>
                    {actDropdownOpen && (
                      <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto border border-[#7a9cc5] rounded bg-white shadow-lg z-50 text-left">
                        {filteredActs.length === 0 ? (
                          <div className="px-2 py-1.5 text-gray-500 italic text-[11px]">
                            No matching acts found
                          </div>
                        ) : (
                          filteredActs.map((item) => (
                            <div
                              key={item.act}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setNewAct(item.act);
                                setActSearchInput(item.act);
                                setNewSection('');
                                setActDropdownOpen(false);
                              }}
                              className={`px-2 py-1.5 cursor-pointer text-[11px] hover:bg-[#f0f4f8] transition-colors ${
                                newAct === item.act
                                  ? 'bg-[#d0e0f8] font-bold text-[#0d2a4a]'
                                  : 'text-slate-700'
                              }`}
                            >
                              {item.act}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-[11px] text-left">
                  <label className="text-[#0d2a4a] font-bold">Section(s)</label>
                  <SearchableSelect
                    disabled={!newAct}
                    value={newSection}
                    onChange={(val) => setNewSection(val)}
                    options={availableSections.map((sec) => {
                      const val = sec && typeof sec === 'object' ? sec.section : sec;
                      const desc = sec && typeof sec === 'object' && sec.desc ? ` - ${sec.desc}` : '';
                      return {
                        value: val,
                        label: `${val}${desc}`
                      };
                    })}
                    placeholder="select an option"
                    lang={lang}
                    multiple={true}
                    className="w-full h-8 px-2 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-[#ea580c] cursor-text disabled:bg-slate-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 mt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={closeAddModal}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-[#0d2a4a] text-[11px] font-bold rounded cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAddModal}
                className="px-3 py-1 bg-[#ea580c] hover:bg-[#c2410c] text-white text-[11px] font-bold rounded cursor-pointer transition-colors shadow-sm"
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
