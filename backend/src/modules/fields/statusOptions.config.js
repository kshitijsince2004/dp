// The per-type option vocabulary for the shared `field_registry` "status" field
// (config/fields/common.json — `record_types: [ARREST, PCR_CALL, MISSING, UIDB]`, `storage.per_type`).
// That registry row carries NO `options` array (field_registry can't express "this one field_key
// has different option lists depending on record_type AND, for ARREST, on-a-case-vs-standalone" —
// a genuine registry limitation, not an oversight), so the vocabulary has lived as code here.
//
// Two consumers, both reading this SAME source (never a second hardcoded copy — baseline P4):
//   - fields.controller.js's getFieldsForForm (GET /fields/form/:record_type) — what the intake
//     form offers when a record is first created.
//   - records.service.js's getStatusOptions (GET /records/:id/status-options, WS8) — what an
//     already-created record may be changed TO afterward. Must offer the identical vocabulary the
//     intake form used, or an officer could set a status on edit that they could never have
//     entered at creation.
//
// CASE's `case_status` and `is_worked_out` are NOT here — those two are genuinely registry-sourced
// (config/fields/case.json carries real `options` arrays for both), so both consumers read
// field_registry directly for CASE and never call into this file for it.
import { getLogger } from '../../utils/logger.js';

// Style anchor: records.service.js (HANDOFF.md §7). This file is mostly static taxonomy data;
// getStatusOptionsForType is the one real dispatch function — logged once at resolution since
// "which status options a form/record shows" is a known bug surface, not per-line noise.
const log = getLogger('fields.statusOptions.config');

export const STATUS_OPTIONS_BY_TYPE = {
  CASE: null, // registry-sourced (case.json `case_status`) — never resolved from here
  ARREST: {
    // ARREST's custody-status vocabulary depends on the arrest's own basis (ruling 18:
    // `arrest_details.is_dd_based` — false = under a case/FIR, true = standalone Kalandra).
    // `isAgainstFir` mirrors getFieldsForForm's `caseType === 'against_fir'` query param at
    // creation time; getStatusOptions derives the same boolean from the already-created
    // record's own `is_dd_based` (false -> against_fir list, true/null -> kalandra list).
    against_fir: [
      { value: 'JC', label_en: 'Judicial Custody', label_hi: 'न्यायिक हिरासत' },
      { value: 'PC', label_en: 'Police Custody', label_hi: 'पुलिस हिरासत' },
      { value: 'Bail', label_en: 'Bail', label_hi: 'जमानत' },
      { value: 'Bound Down', label_en: 'Bound Down', label_hi: 'Bound Down' },
      { value: 'Release', label_en: 'Release', label_hi: 'रिहा' },
      { value: 'Lockup', label_en: 'Lockup', label_hi: 'जेल' },
      { value: '35(3) BNS Notice', label_en: '35(3) BNS Notice', label_hi: '35(3) BNS Notice' },
      { value: 'Apprehension', label_en: 'Apprehension', label_hi: 'Apprehension' },
    ],
    kalandra: [
      { value: 'JC', label_en: 'Judicial Custody', label_hi: 'न्यायिक हिरासत' },
      { value: 'Bound Down', label_en: 'Bound Down', label_hi: 'Bound Down' },
      { value: 'Lockup', label_en: 'Lockup', label_hi: 'जेल' },
      { value: 'Fine', label_en: 'Fine', label_hi: 'Fine' },
      { value: 'Apprehension', label_en: 'Apprehension', label_hi: 'Apprehension' },
    ],
  },
  PCR_CALL: [
    { value: 'Action Taken', label_en: 'Action Taken', label_hi: 'कार्रवाई की गई' },
    { value: 'Pending', label_en: 'Pending', label_hi: 'लंबित' },
    { value: 'Referred', label_en: 'Referred', label_hi: 'स संदर्भित' },
    { value: 'Closed', label_en: 'Closed', label_hi: 'बंद' },
  ],
  MISSING: [
    { value: 'Un-traced', label_en: 'Un-traced', label_hi: 'लापता/सुराग नहीं' },
    { value: 'Traced', label_en: 'Traced', label_hi: 'पता लगाया गया' },
    { value: 'Referred', label_en: 'Referred', label_hi: 'स संदर्भित' },
    { value: 'Closed', label_en: 'Closed', label_hi: 'बंद' },
  ],
  UIDB: [
    { value: 'Referred to district hospital', label_en: 'Referred to district hospital', label_hi: 'जिला अस्पताल को संदर्भित' },
    { value: 'Identified', label_en: 'Identified', label_hi: 'पहचाना गया' },
    { value: 'body claimed', label_en: 'Body Claimed', label_hi: 'शव पर दावा किया गया' },
    { value: 'Unidentified', label_en: 'Unidentified', label_hi: 'अज्ञात' },
    { value: 'held in mortuary', label_en: 'Held in Mortuary', label_hi: 'मुर्दाघर में रखा गया' },
  ],
};

/**
 * Resolve the "status" field's option list for a record type, matching getFieldsForForm's
 * dispatch exactly. Returns `null` for CASE (registry-sourced elsewhere) and for any type with
 * no dispatch entry. `isAgainstFir` only matters for ARREST.
 */
export function getStatusOptionsForType(recordType, { isAgainstFir = false } = {}) {
  const entry = STATUS_OPTIONS_BY_TYPE[recordType];
  let resolved;
  if (!entry) resolved = null;
  else if (recordType === 'ARREST') resolved = isAgainstFir ? entry.against_fir : entry.kalandra;
  else resolved = entry;
  log.debug('getStatusOptionsForType: resolved', {
    recordType, isAgainstFir, resolvedCount: Array.isArray(resolved) ? resolved.length : null,
  });
  return resolved;
}
