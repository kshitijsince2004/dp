import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/config/db.js';
import * as statutoryFirService from '../src/modules/records/statutoryFir.service.js';
import * as recordsService from '../src/modules/records/records.service.js';

test('08. Statutory FIR Number Generation & Validation Test Suite', async (t) => {
  // Setup: Find key nodes
  const parliamentStNode = await db('hierarchy_nodes')
    .where('name', 'ilike', '%Parliament Street%')
    .first();
  assert.ok(parliamentStNode, 'Parliament Street PS node must exist');

  const pragatiMaidanNode = await db('hierarchy_nodes')
    .where('name', 'ilike', '%Pragati Maidan%')
    .first();
  assert.ok(pragatiMaidanNode, 'Pragati Maidan Metro PS node must exist');

  const userRow = await db('users').first();
  assert.ok(userRow, 'User must exist');

  await t.test('1. Reference Table Counts & Pragati Maidan Gating', async () => {
    const manualCount = await db('ref.ps_manual_fir_codes').count('* as count').first();
    const unifiedCount = await db('ref.ps_unified_codes').count('* as count').first();

    assert.equal(parseInt(manualCount.count, 10), 225, 'Must have 225 manual CCTNS station codes');
    assert.equal(parseInt(unifiedCount.count, 10), 226, 'Must have 226 unified station codes');

    // Pragati Maidan Metro PS must have unified code '014' and NO manual code
    const pmManual = await db('ref.ps_manual_fir_codes')
      .where('hierarchy_node_id', pragatiMaidanNode.id)
      .first();
    assert.equal(pmManual, undefined, 'Pragati Maidan Metro must have no manual code');

    const pmUnified = await db('ref.ps_unified_codes')
      .where('hierarchy_node_id', pragatiMaidanNode.id)
      .first();
    assert.ok(pmUnified, 'Pragati Maidan Metro must have a unified code');
    assert.equal(pmUnified.ps_code, '014', 'Pragati Maidan Metro unified code must be 014');

    // Allowed types check
    const allowedTypes = await statutoryFirService.getAllowedStatutoryTypes(pragatiMaidanNode.id);
    assert.equal(allowedTypes.isManualSupported, false, 'Manual CCTNS must not be supported for Pragati Maidan Metro');
    assert.deepEqual(allowedTypes.allowedTypes, ['E_THEFT', 'E_MVT', 'NCRP', 'ZERO_FIR']);

    // Attempting manual prefix for Pragati Maidan must fail
    await assert.rejects(
      async () => {
        await statutoryFirService.resolveStatutoryPrefix('MANUAL_CCTNS', pragatiMaidanNode.id);
      },
      /This Police Station is not registered for Manual CCTNS FIR generation/
    );
  });

  await t.test('2. Statutory Prefix Derivation Across All 5 Registration Types', async () => {
    // Parliament Street PS: District New Delhi (165), Manual PS (022), Unified PS (047)
    const manualPfx = await statutoryFirService.resolveStatutoryPrefix('MANUAL_CCTNS', parliamentStNode.id);
    assert.equal(manualPfx.prefix, '08165022', 'Manual CCTNS prefix must be 08 + 165 + 022');
    assert.equal(manualPfx.districtCode, '165');
    assert.equal(manualPfx.psCode, '022');
    assert.equal(manualPfx.isManual, true);

    const eTheftPfx = await statutoryFirService.resolveStatutoryPrefix('E_THEFT', parliamentStNode.id);
    assert.equal(eTheftPfx.prefix, '08158047', 'e-Theft prefix must be 08158 + 047');

    const eMvtPfx = await statutoryFirService.resolveStatutoryPrefix('E_MVT', parliamentStNode.id);
    assert.equal(eMvtPfx.prefix, '08159047', 'e-MVT prefix must be 08159 + 047');

    const ncrpPfx = await statutoryFirService.resolveStatutoryPrefix('NCRP', parliamentStNode.id);
    assert.equal(ncrpPfx.prefix, '01816047', 'NCRP prefix must be 01816 + 047');

    const zeroFirPfx = await statutoryFirService.resolveStatutoryPrefix('ZERO_FIR', parliamentStNode.id);
    assert.equal(zeroFirPfx.prefix, '08156047', 'Zero FIR prefix must be 08156 + 047');
  });

  await t.test('3. Statutory FIR Number Validation Rules', async () => {
    // 14-digit validation
    const valid14 = '08165022260001';
    const validationRes = await statutoryFirService.validateStatutoryFirNumber(valid14, 'MANUAL_CCTNS', parliamentStNode.id);
    assert.equal(validationRes.isValid, true);
    assert.equal(validationRes.isLegacy, false);
    assert.equal(validationRes.parsed.prefix, '08165022');
    assert.equal(validationRes.parsed.year, '26');
    assert.equal(validationRes.parsed.serial, '0001');

    // Invalid length
    const invalidShort = '081650222601';
    await assert.rejects(
      async () => {
        await statutoryFirService.validateStatutoryFirNumber(invalidShort, 'MANUAL_CCTNS', parliamentStNode.id);
      },
      /FIR number must be exactly 14 numeric digits/
    );

    // Mismatched prefix
    const wrongPrefix = '08999999260001';
    await assert.rejects(
      async () => {
        await statutoryFirService.validateStatutoryFirNumber(wrongPrefix, 'MANUAL_CCTNS', parliamentStNode.id);
      },
      /FIR prefix 08999999 does not match derived jurisdiction code/
    );

    // Zero serial
    const zeroSerial = '08165022260000';
    await assert.rejects(
      async () => {
        await statutoryFirService.validateStatutoryFirNumber(zeroSerial, 'MANUAL_CCTNS', parliamentStNode.id);
      },
      /FIR sequence number must be between 0001 and 9999/
    );

    // Legacy format acceptance
    const legacyVal = '104/2026';
    const legacyRes = await statutoryFirService.validateStatutoryFirNumber(legacyVal, 'MANUAL_CCTNS', parliamentStNode.id);
    assert.equal(legacyRes.isValid, true);
    assert.equal(legacyRes.isLegacy, true);
  });

  await t.test('4. Gapless Atomic Sequence Generation & Concurrency Test', async () => {
    const testUser = {
      id: userRow.id,
      role: 'HC',
      ps_id: parliamentStNode.id,
      district_id: parliamentStNode.parent_id,
    };

    const results = [];
    for (let i = 0; i < 5; i++) {
      const rec = await recordsService.createRecord(
        testUser,
        'CASE',
        '2026-09-19',
        {
          registration_type: 'NCRP',
          police_station: parliamentStNode.name,
          crime_head: 'House Theft',
          incident_details: `Concurrent test case ${i}`,
        },
        '127.0.0.1'
      );
      results.push(rec);
    }

    const firRows = await Promise.all(
      results.map(r => db('fir_details').where({ record_id: r.id }).first())
    );

    // Verify all 5 are 14 digits and start with '0181604726'
    const prefixes = firRows.map(d => d.fir_no.slice(0, 10));
    assert.ok(prefixes.every(p => p === '0181604726'));

    // Extract sequences
    const seqs = firRows.map(d => d.fir_seq).sort((a, b) => a - b);
    
    // Verify gapless progression
    for (let i = 0; i < seqs.length; i++) {
      assert.equal(seqs[i], seqs[0] + i, `Sequence at index ${i} must be gapless`);
    }

    // Verify all 5 fir_no are distinct
    const uniqueNos = new Set(firRows.map(d => d.fir_no));
    assert.equal(uniqueNos.size, 5, 'All concurrent generated FIR numbers must be unique');
  });

  await t.test('5. End-to-End Case Record Creation with Auto-Generated Statutory FIR', async () => {
    const testUser = {
      id: userRow.id,
      role: 'HC',
      ps_id: parliamentStNode.id,
      district_id: parliamentStNode.parent_id,
    };

    const caseData = {
      registration_type: 'E_THEFT',
      police_station: parliamentStNode.name,
      crime_head: 'House Theft',
      incident_details: 'Statutory 14-digit FIR generation test case',
    };

    const casePersons = [
      {
        person_type: 'COMPLAINANT',
        name: 'Rajesh Verma',
        complainant_first_name: 'Rajesh',
        complainant_surname: 'Verma',
        mobile_phone: '9876543210',
      },
    ];

    const created = await recordsService.createRecord(testUser, 'CASE', '2026-09-19', caseData, '127.0.0.1', { persons: casePersons });
    assert.ok(created, 'Record creation must succeed');

    const details = await recordsService.getRecordDetails(created.id);
    assert.ok(details, 'Must fetch created record details');
    assert.equal(details.record?.data?.registration_type, 'E_THEFT');

    const firRow = await db('fir_details').where({ record_id: created.id }).first();
    assert.ok(firRow, 'fir_details row must exist');
    assert.equal(firRow.registration_type, 'E_THEFT');
    assert.equal(firRow.is_legacy_format, false);
    assert.equal(firRow.fir_no.length, 14);
    assert.ok(firRow.fir_no.startsWith('0815804726'), 'FIR No must start with 0815804726');
    assert.ok(firRow.fir_seq > 0, 'fir_seq must be positive integer');
    assert.equal(firRow.fir_type_prefix, '08158');
    assert.equal(firRow.fir_ps_code, '047');
  });

  await t.test('6. Backwards Compatibility: Creating Record with Legacy FIR Number', async () => {
    const testUser = {
      id: userRow.id,
      role: 'HC',
      ps_id: parliamentStNode.id,
      district_id: parliamentStNode.parent_id,
    };

    const legacyFirNo = `${Math.floor(10000 + Math.random() * 80000)}/2026`;
    const caseData = {
      fir_no: legacyFirNo,
      registration_type: 'MANUAL_CCTNS',
      police_station: parliamentStNode.name,
      crime_head: 'Robbery',
      incident_details: 'Legacy format test case',
    };

    const created = await recordsService.createRecord(testUser, 'CASE', '2026-09-19', caseData, '127.0.0.1');
    assert.ok(created, 'Legacy record creation must succeed');

    const firRow = await db('fir_details').where({ record_id: created.id }).first();
    assert.ok(firRow);
    assert.equal(firRow.fir_no, legacyFirNo);
    assert.equal(firRow.is_legacy_format, true);
  });
});
