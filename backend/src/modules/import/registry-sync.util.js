// Registry-driven template inclusion. Decides which field_registry rows must be
// auto-added to an import template on top of the hand-curated lists in
// import-fields.config.js. Shared by template-builder.service.js (CASE/ARREST)
// and import.controller.js's downloadImportTemplate (UIDB/MISSING) so the
// inclusion rule can never diverge between record types.
import {
  CONDITIONAL_FORM_FIELD_KEYS,
  TEMPLATE_EXCLUDE_KEYS,
  IMPORT_OPTIONAL_REQUIRED_KEYS,
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

// Tolerant jsonb parse — pg returns jsonb columns pre-parsed, but admin-inserted rows can
// carry a literal JSON string or (for older array-typed columns) a PG array literal.
const parseJsonField = (val) => {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val) || typeof val === 'object') return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (_) {}
    if (val.startsWith('{') && val.endsWith('}')) {
      const inner = val.slice(1, -1);
      if (!inner.trim()) return [];
      return inner.split(',').map((s) => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
    }
  }
  return val;
};

// field_registry's real columns are `record_types` (not `applicable_record_types`),
// `labels`/`section_labels` jsonb `{en,hi}` (not flat `label_en`/`label_hi`/
// `section_label_en`/`section_label_hi` columns), and `required` lives inside
// `validation_rules` jsonb (not a top-level column). This module's parsing, sorting, and
// template-generation code was all written against the pre-restructure flat shape — rather
// than touch every read site, normalize once at load time so the rest of the module (and
// its curated import-fields.config.js entries, which already use the flat shape) stays
// byte-compatible. Mirrors the equivalent shim in fields.controller.js:124-140.
export const normalizeRegistryRow = (f) => {
  if (!f) return f;
  const labels = parseJsonField(f.labels) || {};
  const sectionLabels = parseJsonField(f.section_labels) || {};
  const validationRules = parseJsonField(f.validation_rules) || {};
  return {
    ...f,
    applicable_record_types: f.record_types,
    label_en: labels.en || f.field_key,
    label_hi: labels.hi || labels.en || f.field_key,
    section_label_en: sectionLabels.en || null,
    section_label_hi: sectionLabels.hi || null,
    // IMPORT_OPTIONAL_REQUIRED_KEYS overrides the DB's required flag for bulk import only
    // (the interactive form still enforces it) — see that constant's doc comment.
    required: validationRules.required === true && !IMPORT_OPTIONAL_REQUIRED_KEYS.has(f.field_key),
  };
};

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
