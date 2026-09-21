import db from '../src/config/db.js';
import { resolveJurisdictionPrefix, normalizeRegistrationType } from '../src/modules/records/statutoryFir.service.js';

export async function formatStatutoryFirNumber(rawFirNo, psId, regType, firDate) {
  if (rawFirNo && /^\d{14}$/.test(String(rawFirNo).trim())) {
    return String(rawFirNo).trim();
  }

  const normType = normalizeRegistrationType(regType);
  const jur = await resolveJurisdictionPrefix(db, { psId, registrationType: normType });
  if (!jur.isAllowed) {
    return rawFirNo || '';
  }

  const d = firDate ? new Date(firDate) : new Date();
  const yr = isNaN(d.getFullYear()) ? '26' : String(d.getFullYear()).slice(-2);

  // Extract serial from rawFirNo (e.g. 0001/0101/2026 -> 101 or 1, or 101 -> 0101)
  let serialNum = 1;
  if (rawFirNo) {
    const parts = String(rawFirNo).split('/');
    if (parts.length >= 2) {
      // e.g. 0001/0101/2026 -> parts[1] is 0101
      const p2 = parseInt(parts[1], 10);
      const p1 = parseInt(parts[0], 10);
      serialNum = !isNaN(p2) && p2 > 0 ? p2 : (!isNaN(p1) && p1 > 0 ? p1 : 1);
    } else {
      const parsed = parseInt(String(rawFirNo).replace(/\D/g, ''), 10);
      if (!isNaN(parsed) && parsed > 0) serialNum = parsed % 10000;
    }
  }

  const serial4 = String(serialNum).padStart(4, '0');
  return `${jur.prefix8}${yr}${serial4}`;
}

async function fixAllFirNumbersAndSections() {
  console.log('=== FIXING ALL FIR NUMBERS TO 14-DIGIT STATUTORY FORMAT & NORMALIZING SECTIONS ===');

  // 1. Get all FIR details
  const firRows = await db('fir_details as fd')
    .join('records as r', 'r.id', 'fd.record_id')
    .select('fd.record_id', 'fd.fir_no', 'fd.registration_type', 'fd.case_type', 'fd.fir_date', 'r.ps_id');

  console.log(`Found ${firRows.length} FIR records in database.`);

  const oldToNewFirMap = new Map();

  for (const f of firRows) {
    const regType = f.registration_type || (
      (f.case_type || '').toLowerCase().includes('theft') ? 'E_THEFT' :
      (f.case_type || '').toLowerCase().includes('mvt') ? 'E_MVT' : 'MANUAL_CCTNS'
    );

    const statutory14 = await formatStatutoryFirNumber(f.fir_no, f.ps_id, regType, f.fir_date);
    console.log(`  Updating FIR: [${f.fir_no}] (${regType}) -> [${statutory14}] (14 digits)`);

    oldToNewFirMap.set(f.fir_no, statutory14);

    const year4 = f.fir_date ? new Date(f.fir_date).getFullYear() : 2026;
    const seq = parseInt(statutory14.slice(10, 14), 10);
    const prefix8 = statutory14.slice(0, 8);

    await db('fir_details')
      .where({ record_id: f.record_id })
      .update({
        fir_no: statutory14,
        registration_type: regType,
        fir_year: year4,
        fir_seq: seq,
        fir_type_prefix: prefix8.slice(0, 5),
        fir_ps_code: prefix8.slice(5, 8),
        is_legacy_format: false
      });
  }

  // 2. Update arrest_details that referenced old FIR numbers
  const arrestRows = await db('arrest_details').whereNotNull('fir_no');
  for (const a of arrestRows) {
    if (oldToNewFirMap.has(a.fir_no)) {
      const newFir = oldToNewFirMap.get(a.fir_no);
      console.log(`  Updating Arrest Detail linked FIR: [${a.fir_no}] -> [${newFir}]`);
      await db('arrest_details').where({ record_id: a.record_id }).update({ fir_no: newFir });
    }
  }

  // 3. Update missing_details that referenced old FIR numbers
  const missingRows = await db('missing_details').whereNotNull('fir_no');
  for (const m of missingRows) {
    if (oldToNewFirMap.has(m.fir_no)) {
      const newFir = oldToNewFirMap.get(m.fir_no);
      console.log(`  Updating Missing Detail linked FIR: [${m.fir_no}] -> [${newFir}]`);
      await db('missing_details').where({ record_id: m.record_id }).update({ fir_no: newFir });
    }
  }

  console.log('\n=== Database FIR Numbers successfully updated to 14-digit Statutory Format! ===\n');
  process.exit(0);
}

fixAllFirNumbersAndSections().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
