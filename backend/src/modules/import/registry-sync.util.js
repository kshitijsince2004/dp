// Registry-driven template inclusion. Decides which field_registry rows must be
// auto-added to an import template on top of the hand-curated lists in
// import-fields.config.js. Shared by template-builder.service.js (CASE/ARREST)
// and import.controller.js's downloadImportTemplate (UIDB/MISSING) so the
// inclusion rule can never diverge between record types.
import {
  CONDITIONAL_FORM_FIELD_KEYS,
  TEMPLATE_EXCLUDE_KEYS,
} from './import-fields.config.js';

// Record-type aliases the interactive form accepts (fields.controller.js normalizeRecordType).
const normalizeType = (t) => {
  const up = String(t).toUpperCase().replace(/[\s-]+/g, '_');
  if (up === 'MISSING_PERSON' || up === 'MISSINGPERSON') return 'MISSING';
  return up;
};

// Tolerant parse, mirroring fields.controller.js parseJsonField: admin-created fields can
// arrive with applicable_record_types stored as a PostgreSQL array literal ('{"MISSING"}')
// instead of JSON ('["MISSING"]'). The form renders those fields, so the template must
// recognise them too — a field visible on the form but absent from Excel is a sync bug.
export const parseApplicableTypes = (value) => {
  if (value === null || value === undefined) return [];
  let types = value;
  if (typeof value === 'string') {
    try {
      types = JSON.parse(value);
    } catch (_) {
      const s = value.trim();
      if (s.startsWith('{') && s.endsWith('}')) {
        types = s.slice(1, -1).split(',').map((x) => x.replace(/^"|"$/g, '').trim()).filter(Boolean);
      } else {
        types = [s];
      }
    }
  }
  return Array.isArray(types) ? types.map(normalizeType) : [];
};

export const isTemplateExcluded = (recordType, fieldKey) =>
  CONDITIONAL_FORM_FIELD_KEYS.has(fieldKey) ||
  (TEMPLATE_EXCLUDE_KEYS[recordType] || new Set()).has(fieldKey);

// Returns the registry rows to auto-add to recordType's template: active, applicable
// to the type, not already covered by the curated config lists (configKeys), and not
// excluded. De-duplicated by field_key, in registry order (caller passes rows sorted
// by sort_order). These fields are always APPENDED after the curated columns so that
// existing column positions never shift.
export const autoIncludedRegistryFields = (recordType, registryRows, configKeys) => {
  const seen = new Set();
  const out = [];
  for (const row of registryRows) {
    const key = row.field_key;
    if (!key || seen.has(key)) continue;
    if (row.is_active === false) continue;
    if (configKeys.has(key)) continue;
    if (isTemplateExcluded(recordType, key)) continue;
    if (!parseApplicableTypes(row.applicable_record_types).includes(recordType)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
};
