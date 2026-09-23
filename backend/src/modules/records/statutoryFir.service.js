import db from '../../config/db.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('statutoryFir.service');

export const TYPE_PREFIXES = {
  E_THEFT: '08158',
  E_MVT: '08159',
  NCRP: '01816',
  ZERO_FIR: '08156',
};

export const REGISTRATION_TYPES = ['MANUAL_CCTNS', 'E_THEFT', 'E_MVT', 'NCRP', 'ZERO_FIR'];

export function normalizeRegistrationType(raw) {
  if (!raw) return 'MANUAL_CCTNS';
  const s = String(raw).trim().toLowerCase();
  if (s.includes('cctns') || s.includes('manual')) return 'MANUAL_CCTNS';
  if (s.includes('theft')) return 'E_THEFT';
  if (s.includes('mvt') || s.includes('vehicle')) return 'E_MVT';
  if (s.includes('ncrp') || s.includes('cyber')) return 'NCRP';
  if (s.includes('zero')) return 'ZERO_FIR';
  const u = String(raw).trim().toUpperCase();
  if (REGISTRATION_TYPES.includes(u)) return u;
  return 'MANUAL_CCTNS';
}

/**
 * Resolves jurisdiction and type prefix components for a given PS and registration type.
 * Returns { prefix8, typePrefix, districtCode, psCode, isAllowed, error }
 */
export async function resolveJurisdictionPrefix(db, { psId, registrationType }) {
  if (!psId) {
    return { isAllowed: false, error: 'Police Station (ps_id) is required.' };
  }
  const normType = normalizeRegistrationType(registrationType);
  if (!normType || !REGISTRATION_TYPES.includes(normType)) {
    return { isAllowed: false, error: `Invalid registration_type "${registrationType}". Allowed: ${REGISTRATION_TYPES.join(', ')}` };
  }
  registrationType = normType;

  if (registrationType === 'MANUAL_CCTNS') {
    const manualRow = await db('ref.ps_manual_fir_codes')
      .where({ hierarchy_node_id: psId, is_active: true })
      .first();

    if (!manualRow) {
      log.warn('resolveJurisdictionPrefix: PS has no Manual CCTNS code', { psId, registrationType });
      return {
        isAllowed: false,
        error: 'This Police Station is not registered for Manual CCTNS FIR generation (e.g. Metro / Specialized unit).',
      };
    }

    const distCode = String(manualRow.district_code).padStart(3, '0');
    const psCode = String(manualRow.ps_code).padStart(3, '0');
    const typePrefix = `08${distCode}`; // 5 digits (08 + 3-digit district code)
    const prefix8 = `08${distCode}${psCode}`; // 8 digits

    return {
      isAllowed: true,
      prefix8,
      typePrefix,
      districtCode: distCode,
      psCode,
      error: null,
    };
  } else {
    // E_THEFT, E_MVT, NCRP, ZERO_FIR use ref.ps_unified_codes
    const unifiedRow = await db('ref.ps_unified_codes')
      .where({ hierarchy_node_id: psId, is_active: true })
      .first();

    if (!unifiedRow) {
      log.warn('resolveJurisdictionPrefix: PS has no Unified code', { psId, registrationType });
      return {
        isAllowed: false,
        error: 'This Police Station is not registered in the Unified e-FIR code registry.',
      };
    }

    const psCode = String(unifiedRow.ps_code).padStart(3, '0');
    const typePrefix = TYPE_PREFIXES[registrationType];
    const prefix8 = `${typePrefix}${psCode}`; // 5 + 3 = 8 digits

    return {
      isAllowed: true,
      prefix8,
      typePrefix,
      districtCode: null,
      psCode,
      error: null,
    };
  }
}

/**
 * Returns available registration types for a given PS (e.g., Pragati Maidan excludes MANUAL_CCTNS).
 */
export async function getAllowedRegistrationTypes(db, psId) {
  if (!psId) return REGISTRATION_TYPES;

  const [hasManual, hasUnified] = await Promise.all([
    db('ref.ps_manual_fir_codes').where({ hierarchy_node_id: psId, is_active: true }).first(),
    db('ref.ps_unified_codes').where({ hierarchy_node_id: psId, is_active: true }).first(),
  ]);

  const types = [];
  if (hasManual) types.push('MANUAL_CCTNS');
  if (hasUnified) {
    types.push('E_THEFT', 'E_MVT', 'NCRP', 'ZERO_FIR');
  }
  return types;
}

/**
 * Computes next atomic gapless serial number for (registration_type, ps_id, year).
 * Uses row-locking inside transaction.
 */
export async function getNextFirSerial(trx, { psId, registrationType, year4 }) {
  const maxRow = await trx('fir_details')
    .where({ ps_id: psId, registration_type: registrationType, fir_year: year4 })
    .max('fir_seq as max_seq')
    .first();

  const currentMax = maxRow?.max_seq ? parseInt(maxRow.max_seq, 10) : 0;
  return currentMax + 1;
}

/**
 * Generates and validates the full 14-digit Statutory FIR Number.
 * Returns { firNo, registrationType, firYear, firSeq, firTypePrefix, firPsCode, isLegacyFormat }
 */
export async function generateAndValidateStatutoryFir(trx, {
  psId,
  registrationType,
  recordDate,
  firDate,
  requestedFirNo,
  requestedSerial,
  userOverride = false,
  isLegacy = false,
  currentRecordId = null,
}) {
  log.debug('generateAndValidateStatutoryFir: enter', {
    psId, registrationType, recordDate, firDate, requestedFirNo, requestedSerial, isLegacy, currentRecordId,
  });

  const reqStr = requestedFirNo ? String(requestedFirNo).trim() : '';

  // Explicit legacy bulk import pass-through
  if (isLegacy && reqStr && !/^\d{14}$/.test(reqStr)) {
    let legacyDupQuery = trx('fir_details').whereRaw('LOWER(TRIM(fir_no)) = LOWER(TRIM(?))', [reqStr]);
    if (currentRecordId) {
      legacyDupQuery = legacyDupQuery.whereNot({ record_id: currentRecordId });
    }
    const existingDuplicateLegacy = await legacyDupQuery.first();

    if (existingDuplicateLegacy) {
      log.warn('generateAndValidateStatutoryFir: rejected — duplicate legacy fir_no', { requestedFirNo: reqStr });
      const err = new Error(`Duplicate FIR Number detected: "${reqStr}" is already registered as an FIR record.`);
      err.status = 409;
      throw err;
    }

    const safeYear = firDate ? new Date(firDate).getFullYear() : (recordDate ? new Date(recordDate).getFullYear() : new Date().getFullYear());
    return {
      firNo: reqStr,
      registrationType: registrationType || 'MANUAL_CCTNS',
      firYear: isNaN(safeYear) ? new Date().getFullYear() : safeYear,
      firSeq: null,
      firTypePrefix: null,
      firPsCode: null,
      isLegacyFormat: true,
    };
  }

  // Determine date and year
  const effectiveDate = firDate || recordDate || new Date().toISOString();
  const dateObj = new Date(effectiveDate);
  const year4 = isNaN(dateObj.getFullYear()) ? new Date().getFullYear() : dateObj.getFullYear();
  const year2 = String(year4).slice(-2);

  // 1. Resolve Jurisdiction Prefix
  const jur = await resolveJurisdictionPrefix(trx, { psId, registrationType });
  if (!jur.isAllowed) {
    const err = new Error(jur.error);
    err.status = 422;
    throw err;
  }

  // 2. Handle requested full 14-digit fir_no or generate via serial
  let serial;
  let finalFirNo;

  if (requestedFirNo && /^\d{14}$/.test(String(requestedFirNo).trim())) {
    finalFirNo = String(requestedFirNo).trim();
    const prefixSegment = finalFirNo.slice(0, 8);
    const yearSegment = finalFirNo.slice(8, 10);
    const serialSegment = finalFirNo.slice(10, 14);

    if (prefixSegment !== jur.prefix8) {
      const err = new Error(`FIR Number prefix mismatch: expected "${jur.prefix8}" for this station/type, got "${prefixSegment}".`);
      err.status = 422;
      throw err;
    }

    if (yearSegment !== year2 && !userOverride) {
      const err = new Error(`FIR Number year mismatch: date year is "${year2}" but FIR number specifies "${yearSegment}".`);
      err.status = 422;
      throw err;
    }

    serial = parseInt(serialSegment, 10);
    if (isNaN(serial) || serial < 1 || serial > 9999) {
      const err = new Error(`Invalid FIR serial segment "${serialSegment}". Must be between 0001 and 9999 (0000 is not allowed).`);
      err.status = 422;
      throw err;
    }
  } else {
    // Generate serial or parse sequence from requestedFirNo if provided as short/slash format
    if (requestedFirNo && !/^\d{14}$/.test(String(requestedFirNo).trim())) {
      const nums = String(requestedFirNo).match(/\d+/g);
      if (nums && nums.length > 0) {
        const parsedSeq = parseInt(nums[0], 10);
        if (!isNaN(parsedSeq) && parsedSeq > 0 && parsedSeq <= 9999) {
          serial = parsedSeq;
        }
      }
    }
    if (!serial && requestedSerial != null && requestedSerial !== '') {
      const parsedReq = parseInt(requestedSerial, 10);
      if (!isNaN(parsedReq) && parsedReq > 0 && parsedReq <= 9999) {
        serial = parsedReq;
      }
    }
    if (!serial) {
      serial = await getNextFirSerial(trx, { psId, registrationType, year4 });
    }

    const serial4 = String(serial).padStart(4, '0');
    finalFirNo = `${jur.prefix8}${year2}${serial4}`;
  }

  // 3. Global Uniqueness Check
  let dupQuery = trx('fir_details').whereRaw('LOWER(TRIM(fir_no)) = LOWER(TRIM(?))', [finalFirNo]);
  if (currentRecordId) {
    dupQuery = dupQuery.whereNot({ record_id: currentRecordId });
  }
  const existingDuplicate = await dupQuery.first();

  if (existingDuplicate) {
    const serialStr = serial ? String(serial).padStart(4, '0') : finalFirNo.slice(10, 14);
    const err = new Error(`FIR Number "${finalFirNo}" (Serial ${serialStr}) already exists for this Police Station and Year.`);
    err.status = 409;
    throw err;
  }

  log.info('generateAndValidateStatutoryFir: generated statutory FIR', {
    firNo: finalFirNo, registrationType, firYear: year4, firSeq: serial, psId,
  });

  return {
    firNo: finalFirNo,
    registrationType,
    firYear: year4,
    firSeq: serial,
    firTypePrefix: jur.typePrefix,
    firPsCode: jur.psCode,
    isLegacyFormat: false,
  };
}

export async function resolveStatutoryPrefix(registrationType, hierarchyNodeId, dbOrTrx) {
  const conn = dbOrTrx || db;
  const jur = await resolveJurisdictionPrefix(conn, { psId: hierarchyNodeId, registrationType });
  if (!jur.isAllowed) {
    const err = new Error(jur.error);
    err.status = 422;
    throw err;
  }
  return {
    prefix: jur.prefix8,
    isManual: registrationType === 'MANUAL_CCTNS',
    districtCode: jur.districtCode,
    psCode: jur.psCode,
    unifiedTypePrefix: jur.typePrefix,
    psUnifiedCode: jur.psCode,
  };
}

export async function getAllowedStatutoryTypes(hierarchyNodeId, dbOrTrx) {
  const conn = dbOrTrx || db;
  const types = await getAllowedRegistrationTypes(conn, hierarchyNodeId);
  return {
    isManualSupported: types.includes('MANUAL_CCTNS'),
    allowedTypes: types,
  };
}

export async function validateStatutoryFirNumber(firNo, registrationType = 'MANUAL_CCTNS', hierarchyNodeId, dbOrTrx) {
  const conn = dbOrTrx || db;
  if (!firNo) {
    throw new Error('FIR number is required.');
  }
  const clean = String(firNo).trim();
  if (clean.includes('/')) {
    return {
      isValid: true,
      isLegacy: true,
      raw: clean,
    };
  }

  if (!/^\d{14}$/.test(clean)) {
    throw new Error(`FIR number must be exactly 14 numeric digits (got ${clean.length} digits).`);
  }

  const prefixSegment = clean.slice(0, 8);
  const yearSegment = clean.slice(8, 10);
  const serialSegment = clean.slice(10, 14);

  if (hierarchyNodeId) {
    const pfx = await resolveStatutoryPrefix(registrationType, hierarchyNodeId, conn);
    if (prefixSegment !== pfx.prefix) {
      throw new Error(`FIR prefix ${prefixSegment} does not match derived jurisdiction code ${pfx.prefix}.`);
    }
  }

  const serial = parseInt(serialSegment, 10);
  if (isNaN(serial) || serial <= 0 || serial > 9999) {
    throw new Error('FIR sequence number must be between 0001 and 9999.');
  }

  return {
    isValid: true,
    isLegacy: false,
    parsed: {
      prefix: prefixSegment,
      year: yearSegment,
      serial: serialSegment,
    },
  };
}

export async function generateNextStatutoryFirNumber(registrationType, hierarchyNodeId, year, trx) {
  const pfx = await resolveStatutoryPrefix(registrationType, hierarchyNodeId, trx);
  const year4 = year ? (String(year).length === 2 ? parseInt(`20${year}`, 10) : parseInt(year, 10)) : new Date().getFullYear();
  const year2 = String(year4).slice(-2);
  const serial = await getNextFirSerial(trx, { psId: hierarchyNodeId, registrationType, year4 });
  const serial4 = String(serial).padStart(4, '0');
  const firNo = `${pfx.prefix}${year2}${serial4}`;

  return {
    firNo,
    firSeq: serial,
    prefix: pfx.prefix,
    year: year2,
  };
}
