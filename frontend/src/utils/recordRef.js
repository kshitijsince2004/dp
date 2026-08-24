/**
 * Formats a record reference string based on its type and year/identifiers.
 */
export function formatRecordRef(record) {
  if (!record) return '—';
  if (record.record_type === 'CASE') {
    if (record.fir_no && record.fir_year) {
      return `${record.fir_no}/${record.fir_year}`;
    }
    return `CASE/${record.record_date?.slice(0, 7) ?? '—'}`;
  }
  const prefix = {
    ARREST: 'ARR',
    PCR_CALL: 'PCR',
    MISSING: 'MIS',
    UIDB: 'UIDB',
  }[record.record_type] ?? 'REF';

  const shortId = record.id?.slice(-6).toUpperCase() ?? '——';
  const year = record.record_date?.slice(0, 4) ?? '——';
  return `${prefix}/${shortId}/${year}`;
}

/**
 * Formats brief facts or gist cleanly for display in record tables and lists.
 */
export function formatGist(record) {
  if (!record) return '—';
  if (record.brief_facts?.trim()) return record.brief_facts.trim();
  if (record.gist?.trim()) return record.gist.trim();
  if (record.offences?.length) {
    const p = record.offences.find(o => o.is_primary) ?? record.offences[0];
    const s = [p.act_short, p.section].filter(Boolean).join(' § ');
    if (s) return s;
  }
  if (record.local_head) return record.local_head;
  return {
    CASE: 'FIR Case',
    ARREST: 'Arrest Record',
    PCR_CALL: 'PCR Call',
    MISSING: 'Missing Person',
    UIDB: 'UIDB Record'
  }[record.record_type] ?? record.record_type;
}

export default {
  formatRecordRef,
  formatGist
};
