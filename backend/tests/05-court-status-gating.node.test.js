import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/config/db.js';
import { updateDomainStatus } from '../src/modules/records/records.service.js';

test('Court Status Gating — Court updates on non-chargesheeted case return 422', async () => {
  const pendingRec = await db('fir_details as fd')
    .join('records as r', 'r.id', 'fd.record_id')
    .whereNull('fd.case_status')
    .orWhere('fd.case_status', 'PENDING')
    .select('r.id', 'r.record_type', 'fd.case_status')
    .first();

  if (!pendingRec) return;

  const mockUser = { id: '00000000-0000-0000-0000-000000000001', role: 'SHO' };

  await assert.rejects(
    async () => {
      await updateDomainStatus(pendingRec.id, mockUser, {
        statusField: 'court_case_no',
        newValue: 'CC/2026/9999',
        effectiveDate: new Date().toISOString()
      });
    },
    (err) => {
      assert.equal(err.status, 422);
      assert.match(err.message, /Court & Judicial Status cannot be updated until/);
      return true;
    }
  );
});

test('Supplementary Chargesheet — sent_to_court_date is not overwritten if already present', async () => {
  const realUser = await db('users').first();
  if (!realUser) return;

  let rec = await db('fir_details as fd')
    .join('records as r', 'r.id', 'fd.record_id')
    .where('fd.case_status', 'CHARGE SHEET')
    .whereNotNull('fd.sent_to_court_date')
    .select('r.id', 'fd.sent_to_court_date', 'fd.case_status')
    .first();

  if (!rec) {
    const anyRec = await db('fir_details').select('record_id').first();
    const originalDate = '2025-05-15';
    await db('fir_details').where({ record_id: anyRec.record_id }).update({
      case_status: 'CHARGE SHEET',
      sent_to_court_date: originalDate
    });
    rec = { id: anyRec.record_id, sent_to_court_date: originalDate, case_status: 'CHARGE SHEET' };
  }

  const mockUser = { id: realUser.id, role: realUser.role || 'SHO' };
  const origDateStr = String(rec.sent_to_court_date).slice(0, 10);

  await updateDomainStatus(rec.id, mockUser, {
    statusField: 'case_status',
    newValue: 'SUPPLEMENTARY CHARGESHEET',
    effectiveDate: new Date().toISOString(),
    opts: {
      supplementary_chargesheet_details: 'Pending forensic DNA report',
      sent_to_court_date: '2026-09-06'
    }
  });

  const updated = await db('fir_details').where({ record_id: rec.id }).first();
  assert.equal(String(updated.sent_to_court_date).slice(0, 10), origDateStr);
  assert.equal(updated.case_status, 'SUPPLEMENTARY CHARGESHEET');
  assert.equal(updated.supplementary_chargesheet_details, 'Pending forensic DNA report');
});
