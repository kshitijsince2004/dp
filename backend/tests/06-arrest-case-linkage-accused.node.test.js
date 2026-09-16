import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePersons, createRecord, getRecordDetails } from '../src/modules/records/records.service.js';
import db from '../src/config/db.js';

test('Multi-Factor Person Comparison Engine', async (t) => {
  await t.test('matches same person with matching details', () => {
    const accused = { name: 'Anil Kumar', father_name: 'Ramesh Kumar', age: 25, gender: 'MALE' };
    const arrestee = { name: 'Anil Kumar', relative_name: 'Ramesh Kumar', age: 26, gender: 'MALE' };
    const res = comparePersons(accused, arrestee);
    assert.equal(res.isMatch, true);
    assert.equal(res.reason, null);
  });

  await t.test('detects father name hard conflict for same name', () => {
    const accused = { name: 'Anil Kumar', father_name: 'Ramesh Kumar', age: 25, gender: 'MALE' };
    const arrestee = { name: 'Anil Kumar', relative_name: 'Suresh Kumar', age: 25, gender: 'MALE' };
    const res = comparePersons(accused, arrestee);
    assert.equal(res.isMatch, false);
    assert.ok(res.reason.includes('Father/Relative name conflict'));
  });

  await t.test('detects age hard conflict (> 3 years difference) for same name', () => {
    const accused = { name: 'Anil Kumar', relative_name: 'Ramesh Kumar', age: 25, gender: 'MALE' };
    const arrestee = { name: 'Anil Kumar', relative_name: 'Ramesh Kumar', age: 45, gender: 'MALE' };
    const res = comparePersons(accused, arrestee);
    assert.equal(res.isMatch, false);
    assert.ok(res.reason.includes('Age conflict'));
  });

  await t.test('detects gender hard conflict', () => {
    const accused = { name: 'Anil Kumar', gender: 'MALE' };
    const arrestee = { name: 'Anil Kumar', gender: 'FEMALE' };
    const res = comparePersons(accused, arrestee);
    assert.equal(res.isMatch, false);
    assert.ok(res.reason.includes('Gender conflict'));
  });
});

test('Arrest Auto-Linkage & Multi-Factor Accused Appending Integration Test', async (t) => {
  // Query valid user and PS from database
  const psRow = await db('hierarchy_nodes').whereNotNull('parent_id').first();
  const userRow = await db('users').first();
  assert.ok(psRow, 'Database must have at least one PS hierarchy node');
  assert.ok(userRow, 'Database must have at least one user');

  const testUser = {
    id: userRow.id,
    role: 'SHO',
    ps_id: psRow.id,
    district_id: psRow.parent_id,
  };

  const testFirNo = `TEST-FIR-${Date.now()}`;

  let caseRecordId;
  let arrestRecordId;

  await t.test('1. Create CASE record with Accused 1 (Anil Kumar, Father Ramesh Kumar, Age 25)', async () => {
    const caseData = {
      fir_no: testFirNo,
      fir_date: '2026-09-01',
      case_status: 'UNDER INVESTIGATION',
      act_name: 'IPC',
      sections: '302',
    };

    const casePersons = [
      {
        person_type: 'ACCUSED',
        name: 'Anil Kumar',
        accused_first_name: 'Anil',
        accused_surname: 'Kumar',
        accused_relative_name: 'Ramesh Kumar',
        accused_relation_type: 'FATHER',
        accused_age: 25,
        accused_gender: 'MALE',
      },
    ];

    const result = await createRecord(testUser, 'CASE', '2026-09-01', caseData, '127.0.0.1', { persons: casePersons });
    caseRecordId = result.id;
    assert.ok(caseRecordId);

    const details = await getRecordDetails(caseRecordId);
    assert.ok(details);
  });

  await t.test('2. Create ARREST record for same FIR with Arrestee (Anil Kumar, Father Suresh Kumar, Age 45)', async () => {
    const arrestData = {
      fir_no: testFirNo,
      fir_date: '2026-09-01',
      arrest_date: '2026-09-05',
    };

    const arrestPersons = [
      {
        person_type: 'ARRESTED',
        name: 'Anil Kumar',
        arrested_first_name: 'Anil',
        arrested_surname: 'Kumar',
        arrested_relative_name: 'Suresh Kumar',
        arrested_relation_type: 'FATHER',
        arrested_age: 45,
        arrested_gender: 'MALE',
      },
    ];

    const result = await createRecord(testUser, 'ARREST', '2026-09-05', arrestData, '127.0.0.1', { persons: arrestPersons });
    arrestRecordId = result.id;
    assert.ok(arrestRecordId);
  });

  await t.test('3. Verify CASE_ARREST link and automatic 2nd accused appended to CASE record due to conflict', async () => {
    // Verify link in record_links
    const link = await db('record_links')
      .where({ source_record_id: caseRecordId, target_record_id: arrestRecordId })
      .first();
    assert.ok(link, 'CASE_ARREST link should be created automatically');

    // Verify CASE record now has 2 Accused entries:
    // Accused 1: Anil Kumar (Father Ramesh Kumar, Age 25)
    // Accused 2: Anil Kumar (Father Suresh Kumar, Age 45)
    const details = await getRecordDetails(caseRecordId);
    const accusedList = details.persons.filter(p => p.person_type === 'ACCUSED' || p.role === 'ACCUSED');
    assert.equal(accusedList.length, 2, 'CASE should automatically have 2 Accused appended');

    const getAccusedName = (p) => p.data?.accused_name || [p.data?.accused_first_name, p.data?.accused_middle_name, p.data?.accused_last_name, p.data?.accused_surname].filter(Boolean).join(' ') || p.name;
    const getAccusedFather = (p) => p.data?.accused_relative_name || p.relative_name;

    assert.equal(getAccusedName(accusedList[0]), 'Anil');
    assert.equal(getAccusedFather(accusedList[0]), 'Ramesh Kumar');

    assert.equal(getAccusedName(accusedList[1]), 'Anil');
    assert.equal(getAccusedFather(accusedList[1]), 'Suresh Kumar');
  });
});
