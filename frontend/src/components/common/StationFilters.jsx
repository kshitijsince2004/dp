import React from "react";
import DateInput from "../ui/DateInput.jsx";

export default function StationFilters({
  districts = [],
  stations = [],
  filters = {},
  setFilters,
  isHq = false,
  allNodes = [],
}) {
  const handleChange = (key, value) => {
    setFilters((prev) => {
      const updated = { ...prev, [key]: value };
      // If district changes, reset selected station
      if (key === "districtId") {
        updated.psId = "";
      }
      return updated;
    });
  };

  // Filter stations based on selected district
  const visibleStations = React.useMemo(() => {
    if (!filters.districtId) return stations;

    const isStationUnderDistrict = (stationNode, districtId) => {
      let current = stationNode;
      const visited = new Set();
      while (current && current.parent_id && !visited.has(current.id)) {
        visited.add(current.id);
        if (current.parent_id === districtId) return true;
        
        const cleanParent = current.parent_id.replace(/^DISTRICT_/, "DIST_");
        const cleanDistrict = districtId.replace(/^DISTRICT_/, "DIST_");
        if (cleanParent === cleanDistrict) return true;

        let parent = allNodes.find((n) => n.id === current.parent_id);
        if (!parent) {
          parent = districts.find((d) => d.id === current.parent_id);
        }
        current = parent;
      }
      return false;
    };

    return stations.filter((s) => {
      const cleanDistrictId = filters.districtId.replace("DISTRICT_", "DIST_");
      const shortCode = filters.districtId.replace(/^(DISTRICT_|DIST_)/, "");
      
      if (s.id.includes(cleanDistrictId) || s.id.includes(`_${shortCode}_`)) return true;
      if (s.district_id === filters.districtId) return true;
      
      const distNode = districts.find(d => d.id === filters.districtId);
      if (distNode) {
        const distName = distNode.name_en || distNode.name || "";
        if (s.districtKey && distName.includes(s.districtKey)) return true;
      }

      return isStationUnderDistrict(s, filters.districtId);
    });
  }, [filters.districtId, stations, districts, allNodes]);


  return (
    <div className="mb-2" style={{ backgroundColor: 'transparent' }}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* District Filter (HQ only) */}
        {isHq && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">District</label>
            <select
              value={filters.districtId || ""}
              onChange={(e) => handleChange("districtId", e.target.value)}
              className="console-switcher-select w-full border border-[var(--border-light)] bg-white rounded p-2 text-sm text-slate-900 font-semibold"
              style={{ minHeight: '38px', borderColor: 'var(--border-light)' }}
            >
              <option value="">All Districts</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name_en || d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Station Filter */}
        {visibleStations.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Police Station</label>
            <select
              value={filters.psId || ""}
              onChange={(e) => handleChange("psId", e.target.value)}
              className="console-switcher-select w-full border border-[var(--border-light)] bg-white rounded p-2 text-sm text-slate-900 font-semibold"
              style={{ minHeight: '38px', borderColor: 'var(--border-light)' }}
            >
              <option value="">All Stations</option>
              {visibleStations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_en || s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Record Type Filter */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Record Type</label>
          <select
            value={filters.recordType || ""}
            onChange={(e) => handleChange("recordType", e.target.value)}
            className="console-switcher-select w-full border border-[var(--border-light)] bg-white rounded p-2 text-sm text-slate-900 font-semibold"
            style={{ minHeight: '38px', borderColor: 'var(--border-light)' }}
          >
            <option value="">All Categories</option>
            <option value="CASE">Cases (FIR)</option>
            <option value="ARREST">Arrests</option>
            <option value="PCR_CALL">PCR Calls</option>
            <option value="MISSING">Missing Persons</option>
            <option value="UIDB">UIDB</option>
          </select>
        </div>

        {/* Date From */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Date From</label>
          <DateInput
            value={filters.dateFrom || ""}
            onChange={(val) => handleChange("dateFrom", val)}
            inputClassName="w-full border border-[var(--border-light)] bg-white rounded p-2 pr-9 text-sm text-slate-900 font-semibold"
          />
        </div>

        {/* Date To */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Date To</label>
          <DateInput
            value={filters.dateTo || ""}
            onChange={(val) => handleChange("dateTo", val)}
            inputClassName="w-full border border-[var(--border-light)] bg-white rounded p-2 pr-9 text-sm text-slate-900 font-semibold"
          />
        </div>
      </div>
    </div>
  );
}
