/**
 * Formats a record reference string based on its type and year/identifiers.
 */
export function formatRecordRef(record) {
  if (!record) return '—';

  const type = record.record_type || 'CASE';

  // 1. CASE (FIR)
  if (type === 'CASE') {
    const rawFirNo = record.fir_no || record.data?.fir_no || record.original_fir_no;
    if (rawFirNo) {
      const clean = String(rawFirNo).trim();
      if (/^\d{14}$/.test(clean)) {
        return clean; // Exact 14-digit statutory FIR number
      }
      return clean;
    }
    return `CASE/${record.record_date?.slice(0, 7) ?? '—'}`;
  }

  // 2. ARREST
  if (type === 'ARREST') {
    const isDdBased = record.is_dd_based === true || record.data?.is_dd_based === true || record.arrest_kind === 'KALANDRA';
    const firNo = record.arrest_fir_no || record.fir_no || record.data?.arrest_fir_no || record.data?.fir_no;

    if (!isDdBased && firNo) {
      const clean = String(firNo).trim();
      return `FIR ${clean}`; // 14-digit FIR number for Arrest against FIR
    }

    // Kalandra / Non-FIR arrest
    const kalNo = record.gd_no || record.data?.gd_no || record.data?.kalandra_no || record.data?.linked_fir_dd_no || record.data?.dd_fir_no;
    const year = record.record_date?.slice(0, 4) ?? new Date().getFullYear();
    if (kalNo) {
      const cleanKal = String(kalNo).trim();
      return cleanKal.toUpperCase().startsWith('KAL/') ? cleanKal : `KAL/${cleanKal}/${year}`;
    }
    const shortId = record.id?.slice(-6).toUpperCase() ?? '——';
    return `KAL/${shortId}/${year}`;
  }

  // 3. MISSING
  if (type === 'MISSING') {
    const misNo = record.data?.missing_reg_no || record.missing_fir_no || record.data?.missing_fir_no || record.gd_no || record.data?.gd_no || record.zipnet_no || record.data?.zipnet_no;
    const year = record.record_date?.slice(0, 4) ?? new Date().getFullYear();
    if (misNo) {
      const cleanMis = String(misNo).trim();
      return cleanMis.toUpperCase().startsWith('MIS/') ? cleanMis : `MIS/${cleanMis}/${year}`;
    }
    const shortId = record.id?.slice(-6).toUpperCase() ?? '——';
    return `MIS/${shortId}/${year}`;
  }

  // 4. UIDB
  if (type === 'UIDB') {
    const uidbNo = record.uidb_no || record.data?.uidb_no || record.data?.uidbNumber || record.gd_no || record.data?.gd_no;
    const year = record.record_date?.slice(0, 4) ?? new Date().getFullYear();
    if (uidbNo) {
      const cleanUidb = String(uidbNo).trim();
      return cleanUidb.toUpperCase().startsWith('UIDB/') ? cleanUidb : `UIDB/${cleanUidb}/${year}`;
    }
    const shortId = record.id?.slice(-6).toUpperCase() ?? '——';
    return `UIDB/${shortId}/${year}`;
  }

  // 5. PCR_CALL
  if (type === 'PCR_CALL') {
    const pcrNo = record.pcr_no || record.data?.pcr_no || record.gd_no || record.data?.gd_no;
    const year = record.record_date?.slice(0, 4) ?? new Date().getFullYear();
    if (pcrNo) {
      const cleanPcr = String(pcrNo).trim();
      return cleanPcr.toUpperCase().startsWith('PCR/') ? cleanPcr : `PCR/${cleanPcr}/${year}`;
    }
    const shortId = record.id?.slice(-6).toUpperCase() ?? '——';
    return `PCR/${shortId}/${year}`;
  }

  const prefix = {
    ARREST: 'ARR',
    PCR_CALL: 'PCR',
    MISSING: 'MIS',
    UIDB: 'UIDB',
  }[type] ?? 'REF';

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
