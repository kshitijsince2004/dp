import db from '../../../config/db.js';

/**
 * Measure Engine for Pharos Reporting Engine.
 * Computes base metrics (REGISTERED, WORKED_OUT, PENDING) using set-based SQL joins
 * and status audit ledger, supporting safe-math derived column expressions.
 */

export async function fetchRecordsFull(trx, recordIds) {
  if (!recordIds || recordIds.length === 0) return [];

  const records = await trx('records').whereIn('records.id', recordIds).select('records.*');
  const details = await trx('fir_details').whereIn('record_id', recordIds);
  const offences = await trx('record_offences').whereIn('record_id', recordIds);
  const statusEvents = await trx('record_status_events').whereIn('record_id', recordIds).orderBy('effective_date', 'asc');

  const detailMap = new Map();
  for (const d of details) detailMap.set(d.record_id, d);

  const offenceMap = new Map();
  for (const o of offences) {
    if (!offenceMap.has(o.record_id)) offenceMap.set(o.record_id, []);
    offenceMap.get(o.record_id).push(o);
  }

  const statusMap = new Map();
  for (const s of statusEvents) {
    if (!statusMap.has(s.record_id)) statusMap.set(s.record_id, []);
    statusMap.get(s.record_id).push(s);
  }

  return records.map(r => ({
    ...r,
    detail: detailMap.get(r.id) || null,
    offences: offenceMap.get(r.id) || [],
    status_events: statusMap.get(r.id) || []
  }));
}

export function isWorkedOutAsOf(record, targetDateStr) {
  const events = record.status_events || [];
  const targetDate = new Date(targetDateStr + 'T23:59:59Z');

  const validEvents = events.filter(e => new Date(e.effective_date || e.created_at) <= targetDate);
  if (validEvents.length === 0) return false;

  const latestEvent = validEvents[validEvents.length - 1];
  const status = (latestEvent.new_status || '').toUpperCase();
  return status === 'CHARGESHEETED' || status === 'WORKED_OUT' || status === 'SOLVED' || status === 'CANCELLED';
}

export function safePercentDiff(curr, prev) {
  if (curr === null || prev === null || prev === undefined || curr === undefined) return '-';
  const c = Number(curr);
  const p = Number(prev);
  if (isNaN(c) || isNaN(p) || p === 0) return '-';
  const diff = ((c - p) / p) * 100;
  return diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
}

export function safeRatio(numerator, denominator) {
  if (numerator === null || denominator === null || numerator === undefined || denominator === undefined) return '-';
  const n = Number(numerator);
  const d = Number(denominator);
  if (isNaN(n) || isNaN(d) || d === 0) return '-';
  return `${((n / d) * 100).toFixed(1)}%`;
}

export function safeSub(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return '-';
  const nA = Number(a);
  const nB = Number(b);
  if (isNaN(nA) || isNaN(nB)) return '-';
  return nA - nB;
}
