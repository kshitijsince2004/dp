import React, { useState, useEffect, useMemo } from "react";
import DateInput from "../ui/DateInput.jsx";
import api from "../../utils/api.js";
import SearchableSelect from "../forms/SearchableSelect.jsx";

export default function StationFilters({
  districts = [],
  stations = [],
  filters = {},
  setFilters,
  isHq = false,
  allNodes = [],
}) {
  const [localHeads, setLocalHeads] = useState([]);
  const [datePresets, setDatePresets] = useState([]);
  const [recordTypes, setRecordTypes] = useState([]);

  useEffect(() => {
    // 1. Fetch Local Heads
    api.get("/fields/lookup/local-heads")
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          setLocalHeads(res.data.data);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch local heads:", err);
      });

    // 2. Fetch Date/Filter Presets
    api.get("/filters/presets")
      .then((res) => {
        const raw = res.data?.data;
        if (Array.isArray(raw)) {
          const filtered = raw.filter(p => {
            const spec = p.filter_spec || {};
            const conds = spec.conditions || [];
            return conds.some(c => c.field === '_record_date' && (c.operator === 'last_n_days' || c.operator === 'older_than_n_days'));
          });
          setDatePresets(filtered);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch presets:", err);
      });

    // 3. Fetch Record Types dynamically
    api.get("/fields/lookup/record-types")
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          setRecordTypes(res.data.data);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch record types:", err);
      });
  }, []);

  const handleChange = (key, value) => {
    setFilters((prev) => {
      const updated = { ...prev, [key]: value };
      if (key === "districtId") {
        updated.psId = "";
      }
      if (key === "dateFrom" || key === "dateTo") {
        updated.datePreset = "";
      }
      return updated;
    });
  };

  const handlePresetChange = (presetId) => {
    setFilters((prev) => {
      const updated = { ...prev, datePreset: presetId };
      if (!presetId) {
        return updated;
      }
      const preset = datePresets.find(p => p.id === presetId);
      if (preset) {
        const spec = preset.filter_spec || {};
        const conditions = spec.conditions || [];
        conditions.forEach(cond => {
          const field = cond.field || '';
          const op = (cond.operator || cond.op || '').toLowerCase();
          const val = cond.value;
          if (field === '_record_date' || field === 'record_date') {
            if (op === 'last_n_days') {
              const days = parseInt(val || 1, 10);
              const d = new Date();
              d.setDate(d.getDate() - days + 1);
              updated.dateFrom = d.toISOString().split('T')[0];
              updated.dateTo = new Date().toISOString().split('T')[0];
            } else if (op === 'older_than_n_days') {
              const days = parseInt(val || 1, 10);
              const d = new Date();
              d.setDate(d.getDate() - days);
              updated.dateFrom = "";
              updated.dateTo = d.toISOString().split('T')[0];
            }
          }
        });
      }
      return updated;
    });
  };

  // Filter stations based on selected district
  const visibleStations = useMemo(() => {
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

  const districtOptions = useMemo(() => {
    const list = [{ value: "", label_en: "All Districts", label_hi: "सभी जिले" }];
    districts.forEach(d => {
      list.push({ value: d.id, label_en: d.name_en || d.name, label_hi: d.name_hi || d.name });
    });
    return list;
  }, [districts]);

  const stationOptions = useMemo(() => {
    const list = [{ value: "", label_en: "All Stations", label_hi: "सभी थाने" }];
    visibleStations.forEach(s => {
      list.push({ value: s.id, label_en: s.name_en || s.name, label_hi: s.name_hi || s.name });
    });
    return list;
  }, [visibleStations]);

  const recordTypeOptions = useMemo(() => {
    const list = [{ value: "", label_en: "All Categories", label_hi: "सभी श्रेणियां" }];
    recordTypes.forEach(rt => {
      list.push({ value: rt.value, label_en: rt.label_en || rt.label, label_hi: rt.label_hi || rt.label });
    });
    return list;
  }, [recordTypes]);

  const localHeadOptions = useMemo(() => {
    const list = [{ value: "", label_en: "All Local Heads", label_hi: "सभी स्थानीय शीर्ष" }];
    localHeads.forEach(lh => {
      list.push({ value: lh.label, label_en: lh.label, label_hi: lh.label });
    });
    return list;
  }, [localHeads]);

  const presetOptions = useMemo(() => {
    const list = [{ value: "", label_en: "All Durations", label_hi: "सभी अवधियां" }];
    datePresets.forEach(p => {
      list.push({ value: p.id, label_en: p.name, label_hi: p.name });
    });
    return list;
  }, [datePresets]);

  const selectClassName = "w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFF] px-4 py-2.5 text-sm font-medium text-[#1A202C] shadow-sm outline-none transition-all duration-150 hover:border-[#003087] focus:border-[#003087] focus:ring-2 focus:ring-[#003087]/10 cursor-pointer";

  const selectStyle = {
    minHeight: '42px',
    border: '1px solid #E2E8F0',
    borderRadius: '12px',
    backgroundColor: '#F8FAFF',
    paddingLeft: '16px',
    paddingRight: '20px',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  };

  return (
    <div className="mb-2" style={{ backgroundColor: 'transparent' }}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* District Filter (HQ only) */}
        {isHq && (
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">District</label>
            <SearchableSelect
              value={filters.districtId || ""}
              onChange={(val) => handleChange("districtId", val)}
              options={districtOptions}
              placeholder="All Districts"
              className={selectClassName}
              style={selectStyle}
            />
          </div>
        )}

        {/* Station Filter */}
        {visibleStations.length > 0 && (
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Police Station</label>
            <SearchableSelect
              value={filters.psId || ""}
              onChange={(val) => handleChange("psId", val)}
              options={stationOptions}
              placeholder="All Stations"
              className={selectClassName}
              style={selectStyle}
            />
          </div>
        )}

        {/* Record Type Filter */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Record Type</label>
          <SearchableSelect
            value={filters.recordType || ""}
            onChange={(val) => handleChange("recordType", val)}
            options={recordTypeOptions}
            placeholder="All Categories"
            className={selectClassName}
            style={selectStyle}
          />
        </div>

        {/* Local Head Filter */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Local Head</label>
          <SearchableSelect
            value={filters.localHead || ""}
            onChange={(val) => handleChange("localHead", val)}
            options={localHeadOptions}
            placeholder="All Local Heads"
            className={selectClassName}
            style={selectStyle}
          />
        </div>

        {/* Duration/Preset Filter */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Duration</label>
          <SearchableSelect
            value={filters.datePreset || ""}
            onChange={handlePresetChange}
            options={presetOptions}
            placeholder="All Durations"
            className={selectClassName}
            style={selectStyle}
          />
        </div>

        {/* Date From */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Date From</label>
          <DateInput
            value={filters.dateFrom || ""}
            onChange={(val) => handleChange("dateFrom", val)}
            inputClassName={selectClassName + " animate-none"}
            style={{ minHeight: '42px', backgroundColor: '#F8FAFF' }}
          />
        </div>

        {/* Date To */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Date To</label>
          <DateInput
            value={filters.dateTo || ""}
            onChange={(val) => handleChange("dateTo", val)}
            inputClassName={selectClassName + " animate-none"}
            style={{ minHeight: '42px', backgroundColor: '#F8FAFF' }}
          />
        </div>
      </div>
    </div>
  );
}
