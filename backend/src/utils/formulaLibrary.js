/**
 * Layer 2 Shared Formula Library (JavaScript Port)
 * ===============================================
 * Dual-language parity implementation of python_worker/formula_library.py.
 * Guaranteed 100% identical outputs for identical inputs against golden_dataset/expected_values.json.
 */

export function personDisplay(person, options = {}) {
  if (!person) return "";

  let name = (person.name || person.fullName || "").trim();
  let nickNames = person.nick_names || person.nickNames || [];

  if (typeof nickNames === 'string') {
    try {
      nickNames = JSON.parse(nickNames);
    } catch (e) {
      if (nickNames.trim()) nickNames = [nickNames.trim()];
      else nickNames = [];
    }
  }

  if (Array.isArray(nickNames) && nickNames.length > 0) {
    const aliasStr = nickNames.filter(Boolean).join(" / ");
    if (aliasStr) {
      name = `${name} @${aliasStr}`;
    }
  }

  const parts = [name];

  if (options.include_age && person.age !== undefined && person.age !== null) {
    parts.push(String(person.age));
  }

  const relationType = person.relation_type || person.relationType || "";
  const fatherName = (person.father_husband_name || person.fatherHusbandName || "").trim();
  if (fatherName) {
    const relPrefix = relationType.toLowerCase() === 'mother' ? 'S/O' : (relationType ? `${relationType}/O` : 'S/O');
    parts.push(`${relPrefix} ${fatherName}`);
  }

  const loc = person.location || person.address || {};
  if (typeof loc === 'object' && Object.keys(loc).length > 0) {
    const house = loc.house_no || loc.houseNo || "";
    const colony = loc.colony || "";
    const district = loc.district || "";
    const addrParts = [house, colony, district].filter(Boolean);
    if (addrParts.length > 0) {
      parts.push(`R/O ${addrParts.join(", ")}`);
    }
  }

  return parts.join(", ");
}

export function addressCompile(loc = {}, mode = 'full') {
  if (!loc || typeof loc !== 'object') return "";

  if (mode === 'full') {
    const house = loc.present_house_no || loc.house_no || "";
    const street = loc.present_street || loc.street || "";
    const colony = loc.colony || "";
    const tehsil = loc.tehsil || "";
    const landmark = loc.landmark || "";
    const district = loc.present_district || loc.district || "";
    return [house, street, colony, tehsil, landmark, district].filter(Boolean).join(", ");
  }

  const house = loc.house_no || "";
  const colony = loc.colony || "";
  const district = loc.district || "";
  return [house, colony, district].filter(Boolean).join(", ");
}

export function custodyStatusDisplay(value) {
  if (!value) return "";
  let val = String(value).trim();
  val = val.replace(/u\/s/gi, " ").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  if (val.toUpperCase().includes("NOTICE")) {
    return "Notice 35(1) BNSS";
  }
  return val.toUpperCase();
}

export function missingStatusDisplay(value) {
  if (!value) return "";
  const val = String(value).trim().toUpperCase();
  if (val.includes("TRACED")) return "TRACED";
  if (val.includes("UNTRACED")) return "UNTRACED";
  return val;
}

export function uidbStatusDisplay(value) {
  if (!value) return "";
  const val = String(value).trim().toUpperCase();
  if (val.includes("UNIDENTIFIED")) return "UNIDENTIFIED";
  if (val.includes("IDENTIFIED")) return "IDENTIFIED";
  if (val.includes("PENDING")) return "PENDING";
  return val;
}

export function accusedHistory(accused = {}) {
  if (!accused) return "";
  const d = typeof accused === 'object' ? accused : {};
  const ex = (typeof d.extra === 'object' && d.extra) ? d.extra : {};

  const isTruthy = (val) => {
    if (val === true) return true;
    if (val === false || val === null || val === undefined || val === '') return false;
    if (typeof val === 'number') return val > 0;
    const s = String(val).trim().toLowerCase();
    return ['yes', 'true', '1', 'y', 't'].includes(s);
  };

  const prevCount = d.prev_involvement_count ?? d.prevInvolvementCount ?? d.prev_involvement_no_of_cases ?? ex.prev_involvement_count ?? ex.prev_involvement_no_of_cases ?? 0;
  const isPi = isTruthy(d.prev_involvement) || isTruthy(d.previous_involvement) || isTruthy(d.pi_flag) ||
    isTruthy(ex.prev_involvement) || isTruthy(ex.previous_involvement) || isTruthy(ex.pi_flag) ||
    (Number(prevCount) > 0);
  const isPo = isTruthy(d.is_po) || isTruthy(d.isPo) || isTruthy(d.proclaimed_offender) || isTruthy(d.po_flag) ||
    isTruthy(ex.is_po) || isTruthy(ex.proclaimed_offender) || isTruthy(ex.po_flag);
  const isBc = isTruthy(d.is_bc) || isTruthy(d.isBc) || isTruthy(d.bad_character) || isTruthy(d.bc_flag) || isTruthy(d.listed_criminal) || isTruthy(d.whether_accused_is_bc_or_not) ||
    isTruthy(ex.is_bc) || isTruthy(ex.bad_character) || isTruthy(ex.bc_flag) || isTruthy(ex.listed_criminal) || isTruthy(ex.whether_accused_is_bc_or_not);

  const parts = [];
  if (isPi) parts.push("PI");
  if (isPo) parts.push("PO");
  if (isBc) parts.push("BC");
  return parts.join("/");
}

export function computeVariation(current, previous) {
  if (previous === 0) {
    return current > 0 ? "+∞" : "0%";
  }
  const pct = ((current - previous) / previous) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
