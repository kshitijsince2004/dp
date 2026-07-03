/**
 * Normalization Helpers for Data Warehouse ETL
 * ===========================================
 * Consolidates casing, spacing, and punctuation variants to ensure
 * referential integrity and clean grouping in reports.
 */

import { toISO } from '../../../utils/dateFormat.js';

export function normalizeOfficerName(name) {
  if (!name || typeof name !== 'string') return 'UNKNOWN';
  let clean = name.trim().replace(/\s+/g, ' ').replace(/[.,]/g, '');
  // Normalize common rank prefixes if needed, but keeping it simple/robust:
  clean = clean.replace(/^(SI|INSP|CONST|HC|ASI|DSP|ASP|ACP|DCP)\s+/i, '');
  return clean.toUpperCase() || 'UNKNOWN';
}

export function normalizeCrimeHead(value) {
  if (!value || typeof value !== 'string') return 'UNKNOWN';
  return value.trim().replace(/\s+/g, ' ').toUpperCase() || 'UNKNOWN';
}

export function normalizeStatus(value) {
  if (!value || typeof value !== 'string') return 'UNKNOWN';
  return value.trim().replace(/\s+/g, ' ').toUpperCase() || 'UNKNOWN';
}

export function normalizeActLaw(value) {
  if (!value || typeof value !== 'string') return 'UNKNOWN';
  return value.trim().replace(/\s+/g, ' ').toUpperCase() || 'UNKNOWN';
}

export function safeParseInt(val) {
  if (val === undefined || val === null) return null;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? null : parsed;
}

export function safeParseDate(val) {
  if (!val) return null;
  // records.data stores date fields as dd/mm/yyyy text; record_date itself
  // comes back from Postgres as yyyy-mm-dd. toISO() handles both explicitly
  // rather than relying on native Date parsing, which misreads dd/mm/yyyy.
  const iso = toISO(val);
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
