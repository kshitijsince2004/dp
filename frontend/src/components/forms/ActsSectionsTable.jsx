/**
 * Acts & Sections registered-list panel + Major/Minor Head cascading table +
 * Local Head select + "Add Acts & Section" modal.
 *
 * Used identically by the ARREST/UIDB general-info step and the CASE
 * acts-and-sections step — the only visual difference between the two call
 * sites is whether the Local Head select sits in its own fieldset below
 * Major/Minor (`localHeadLayout="split"`) or inline inside the Major/Minor
 * fieldset (`localHeadLayout="combined"`).
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
}) {
  const rawActs = values.act_name ? values.act_name.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const acts = [];
  for (const item of rawActs) {
    if (/^\d{4}$/.test(item) && acts.length > 0) {
      acts[acts.length - 1] = `${acts[acts.length - 1]}, ${item}`;
    } else {
      acts.push(item);
    }
  }
  const secs = values.sections ? values.sections.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const maxLen = Math.max(acts.length, secs.length);

  const chosenActObj = actsSectionsRegistry.find((item) => item.act === newAct);
  const availableSections = chosenActObj ? chosenActObj.sections : [];

  const handleDeleteRow = (i) => {
    const nextActs = acts.filter((_, idx) => idx !== i);
    const nextSecs = secs.filter((_, idx) => idx !== i);
    handleChange('act_name', nextActs.join(', '));
    handleChange('sections', nextSecs.join(', '));
  };

  const closeAddModal = () => {
    setNewAct('');
    setNewSection('');
    setShowAddRow(false);
  };

  const saveAddModal = () => {
    if (newAct.trim() || newSection.trim()) {
      const updatedActs = [...acts, newAct.trim()].join(', ');
      const updatedSections = [...secs, newSection.trim()].join(', ');
      handleChange('act_name', updatedActs);
      handleChange('sections', updatedSections);
    }
    closeAddModal();
  };

  const majorMinorBlock = (
    <>
      <div className="flex flex-col gap-1">
        <label className="text-[#0d2a4a] font-bold">Major Head</label>
        <select
          disabled={readOnly}
          value={selectedMajorHead}
          onChange={(e) => {
            setSelectedMajorHead(e.target.value);
            setSelectedMinorHead('');
          }}
          className="w-full h-6 px-1 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-pointer"
        >
          <option value="">------Select------</option>
          {getMajorHeadOptions().map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label || (lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en) || opt.value}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[#0d2a4a] font-bold">Minor Head</label>
        <div className="flex items-center gap-2">
          <select
            disabled={readOnly || !selectedMajorHead}
            value={selectedMinorHead}
            onChange={(e) => setSelectedMinorHead(e.target.value)}
            className="flex-1 h-6 px-1 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="">------Select------</option>
            {getMinorHeadOptions().map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label || (lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en) || opt.value}
              </option>
            ))}
          </select>
          {!readOnly && (
            <button
              type="button"
              onClick={onAddMajorMinorRow}
              disabled={!selectedMajorHead || !selectedMinorHead}
              className="bg-[#ea580c] hover:bg-[#c2410c] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-bold px-2 py-0.5 rounded transition shadow-sm flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              + Add
            </button>
          )}
        </div>
      </div>

      <div className="w-full overflow-x-auto mt-1">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#d0e0f8] text-[#0d2a4a] border-b border-[#7a9cc5]">
              <th className="px-2 py-1 text-left font-bold w-10 border-r border-[#7a9cc5]">S.No.</th>
              <th className="px-2 py-1 text-left font-bold border-r border-[#7a9cc5]">Major Head</th>
              <th className="px-2 py-1 text-left font-bold border-r border-[#7a9cc5]">Minor Head</th>
              {!readOnly && <th className="px-2 py-1 text-center font-bold w-14">Delete</th>}
            </tr>
          </thead>
          <tbody>
            {majorMinorRows.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 3 : 4} className="px-2 py-2 text-center text-gray-500 italic">
                  No entries added yet.
                </td>
              </tr>
            ) : (
              majorMinorRows.map((row, idx) => (
                <tr key={idx} className="border-b border-[#7a9cc5] bg-white">
                  <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a] font-mono text-center">{idx + 1}</td>
                  <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a]">{row.majorHead}</td>
                  <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a]">{row.minorHead}</td>
                  {!readOnly && (
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => onDeleteMajorMinorRow(idx)}
                        className="text-red-600 hover:text-red-800 text-[10px] font-bold underline cursor-pointer"
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
    <select
      disabled={readOnly}
      value={values.local_head || ''}
      onChange={(e) => handleChange('local_head', e.target.value)}
      className="w-full h-6 px-1 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-pointer"
    >
      <option value="">------Select------</option>
      {getLocalHeadOptions().map((opt) => (
        <option key={opt.value} value={opt.value}>
          {lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <div className="flex flex-col md:flex-row gap-3">
        {/* Left: Acts & Sections */}
        <fieldset className="flex-1 border border-[#7a9cc5] rounded px-3 py-2 bg-[#f0f4f8]/20 min-h-[140px]">
          <legend className="text-[#0d2a4a] text-[11px] font-bold px-1.5 uppercase tracking-wide">
            Acts & Sections
          </legend>

          <div className="flex items-center justify-between mb-2">
            <span className="text-[#0d2a4a] text-[10px] font-bold opacity-60">Registered List</span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setShowAddRow(true)}
                className="bg-[#ea580c] hover:bg-[#c2410c] text-white text-[10px] font-bold px-2 py-0.5 rounded transition shadow-sm flex items-center gap-1 cursor-pointer"
              >
                + Add Acts & Section
              </button>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-[#d0e0f8] text-[#0d2a4a] border-b border-[#7a9cc5]">
                  <th className="px-2 py-1 text-left font-bold w-12 border-r border-[#7a9cc5]">S.No.</th>
                  <th className="px-2 py-1 text-left font-bold border-r border-[#7a9cc5]">Acts</th>
                  <th className="px-2 py-1 text-left font-bold border-r border-[#7a9cc5]">Sections</th>
                  {!readOnly && <th className="px-2 py-1 text-center font-bold w-16">Delete</th>}
                </tr>
              </thead>
              <tbody>
                {maxLen === 0 ? (
                  <tr>
                    <td colSpan={readOnly ? 3 : 4} className="px-2 py-3 text-center text-gray-500 italic">
                      No Acts & Sections added yet. Click "+ Add Acts & Section" to add.
                    </td>
                  </tr>
                ) : (
                  Array.from({ length: maxLen }).map((_, i) => (
                    <tr key={i} className="border-b border-[#7a9cc5] bg-white">
                      <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a] font-mono text-center">
                        {i + 1}
                      </td>
                      <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a]">
                        {acts[i] || ''}
                      </td>
                      <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a]">
                        {secs[i] || ''}
                      </td>
                      {!readOnly && (
                        <td className="px-2 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(i)}
                            className="text-red-500 hover:text-red-700 font-bold bg-transparent border-none cursor-pointer"
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

        {/* Right: Major/Minor / Local Head */}
        {localHeadLayout === 'split' ? (
          <div className="flex-1 flex flex-col gap-3">
            <fieldset className="border border-[#7a9cc5] rounded px-3 py-2 bg-[#f0f4f8]/20 min-h-[140px] flex-1">
              <legend className="text-[#0d2a4a] text-[11px] font-bold px-1.5 uppercase tracking-wide">
                Major / Minor
              </legend>
              <div className="flex flex-col gap-2 text-[11px]">{majorMinorBlock}</div>
            </fieldset>

            <fieldset className="border border-[#7a9cc5] rounded px-3 py-2 bg-[#f0f4f8]/20 flex-shrink-0">
              <legend className="text-[#0d2a4a] text-[11px] font-bold px-1.5 uppercase tracking-wide">
                Local Head
              </legend>
              <div className="grid grid-cols-[80px_1fr] gap-x-2 text-[11px] items-center">
                <span className="text-[#0d2a4a] font-bold">Local Head</span>
                {localHeadBlock}
              </div>
            </fieldset>
          </div>
        ) : (
          <fieldset className="flex-1 border border-[#7a9cc5] rounded px-3 py-2 bg-[#f0f4f8]/20">
            <legend className="text-[#0d2a4a] text-[11px] font-bold px-1.5 uppercase tracking-wide">
              Major / Minor
            </legend>
            <div className="flex flex-col gap-2 text-[11px]">
              {majorMinorBlock}
              <div className="flex flex-col gap-1 mt-1">
                <label className="text-[#0d2a4a] font-bold">Local Head</label>
                {localHeadBlock}
              </div>
            </div>
          </fieldset>
        )}
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
                  <select
                    value={newAct}
                    onChange={(e) => {
                      setNewAct(e.target.value);
                      setNewSection('');
                    }}
                    className="w-full h-8 px-2 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-[#ea580c] cursor-pointer"
                    autoFocus
                  >
                    <option value="">----select----</option>
                    {actsSectionsRegistry.map((item) => (
                      <option key={item.act} value={item.act}>
                        {item.act}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 text-[11px] text-left">
                  <label className="text-[#0d2a4a] font-bold">Section(s)</label>
                  <select
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value)}
                    disabled={!newAct}
                    className="w-full h-8 px-2 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-[#ea580c] cursor-pointer disabled:bg-slate-50 disabled:cursor-not-allowed"
                  >
                    <option value="">----select----</option>
                    {availableSections.map((sec) => (
                      <option key={sec} value={sec}>
                        {sec}
                      </option>
                    ))}
                  </select>
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
