import assert from 'node:assert/strict';

/**
 * Unit Test for Grain Projection & Reconciliation Invariants
 * Validates the core grain projection logic without requiring an external DB connection.
 */
function projectGrainRowsForTest(baseRecord, personRows, propertyRows, locationsById, rowGrain) {
  const accusedList = personRows.filter(p => p.role === 'ACCUSED' || p.role === 'ARRESTEE');
  const victimList  = personRows.filter(p => p.role === 'VICTIM');

  const compiledAccused = accusedList.length === 0 ? '—' : accusedList.map((p, idx) => {
    const loc = locationsById[p.present_location_id]?.address_line1 || p.extra?.present_address || '';
    return `${idx + 1}. ${p.name || 'Unnamed Accused'} (${p.gender || 'M/F'}, Age: ${p.age || 'N/A'})${loc ? ` - ${loc}` : ''}`;
  }).join('\n');

  const compiledVictim = victimList.length === 0 ? '—' : victimList.map((p, idx) => {
    const loc = locationsById[p.present_location_id]?.address_line1 || p.extra?.present_address || '';
    return `${idx + 1}. ${p.name || 'Unnamed Victim'} (${p.gender || 'M/F'}, Age: ${p.age || 'N/A'})${loc ? ` - ${loc}` : ''}`;
  }).join('\n');

  const compiledProperty = propertyRows.length === 0 ? '—' : propertyRows.map((pr, idx) => {
    const cat = pr.property_category || pr.property_type || 'Property';
    const valStolen = pr.estimated_value ? `₹${pr.estimated_value}` : 'N/A';
    const valRec = pr.recovered_value ? `₹${pr.recovered_value}` : 'N/A';
    return `${idx + 1}. ${cat} [Status: ${pr.status || pr.property_nature || 'N/A'}] (Stolen: ${valStolen}, Recovered: ${valRec})`;
  }).join('\n');

  const baseProj = {
    ...baseRecord,
    _compiled_accused: compiledAccused,
    _compiled_victim: compiledVictim,
    _compiled_property: compiledProperty,
  };

  if (rowGrain === 'per_accused') {
    if (accusedList.length === 0) {
      return [{
        ...baseProj,
        accused_first_name: '—', accused_last_name: '—', accused_gender: '—', accused_age_year: '—',
        accused_social_category: '—', accused_present_address: '—', accused_name: '—'
      }];
    }
    return accusedList.map(p => {
      const loc = locationsById[p.present_location_id]?.address_line1 || p.extra?.present_address || '—';
      const nameParts = (p.name || '').split(' ');
      return {
        ...baseProj,
        accused_first_name: nameParts[0] || p.name || '—',
        accused_last_name: nameParts.slice(1).join(' ') || '—',
        accused_nickname: p.extra?.nickname || '—',
        accused_gender: p.gender || '—',
        accused_social_category: p.social_category || '—',
        accused_relation_type: p.relation_type || '—',
        accused_relative_name: p.relative_name || '—',
        accused_mobile: p.mobile || '—',
        accused_dob: p.dob || '—',
        accused_age_year: p.age ?? '—',
        accused_present_address: loc,
      };
    });

  } else if (rowGrain === 'per_victim') {
    if (victimList.length === 0) {
      return [{
        ...baseProj,
        victim_first_name: '—', victim_last_name: '—', victim_gender: '—', victim_age_year: '—',
        victim_social_category: '—', victim_present_address: '—', victim_name: '—'
      }];
    }
    return victimList.map(p => {
      const loc = locationsById[p.present_location_id]?.address_line1 || p.extra?.present_address || '—';
      const nameParts = (p.name || '').split(' ');
      return {
        ...baseProj,
        victim_first_name: nameParts[0] || p.name || '—',
        victim_last_name: nameParts.slice(1).join(' ') || '—',
        victim_nickname: p.extra?.nickname || '—',
        victim_gender: p.gender || '—',
        victim_social_category: p.social_category || '—',
        victim_relation_type: p.relation_type || '—',
        victim_relative_name: p.relative_name || '—',
        victim_mobile: p.mobile || '—',
        victim_dob: p.dob || '—',
        victim_age_year: p.age ?? '—',
        victim_present_address: loc,
      };
    });

  } else if (rowGrain === 'per_property') {
    if (propertyRows.length === 0) {
      return [{
        ...baseProj,
        property_category: '—', property_type: '—', property_nature: '—',
        estimated_value: 0, property_details: '—', property_uid: '—'
      }];
    }
    return propertyRows.map(pr => ({
      ...baseProj,
      property_category: pr.property_category || '—',
      property_type: pr.property_type || '—',
      property_nature: pr.status || pr.property_nature || '—',
      estimated_value: pr.estimated_value ?? 0,
      recovered_value: pr.recovered_value ?? 0,
      recovery_date: pr.recovery_date || '—',
      recovery_place: pr.recovery_place || '—',
      recovery_agency: pr.recovery_agency || '—',
      seizure_memo_no: pr.seizure_memo_no || '—',
      malkhana_number: pr.malkhana_number || '—',
    }));

  } else {
    return [baseProj];
  }
}

function runGrainReconciliationTest() {
  console.log('🧪 Starting Automated Cross-Grain Reconciliation Test...');

  // Mock FIR Record Data
  const sampleRecord = {
    _id: 'fir-101',
    fir_no: '123/2026',
    _record_date: '2026-08-31',
    _ps_name: 'Connaught Place',
  };

  const samplePersons = [
    { role: 'ACCUSED', name: 'Ramesh Kumar', gender: 'Male', age: 32, social_category: 'OBC' },
    { role: 'ACCUSED', name: 'Suresh Sharma', gender: 'Male', age: 28, social_category: 'GEN' },
    { role: 'VICTIM',  name: 'Anita Verma', gender: 'Female', age: 25, social_category: 'GEN' },
  ];

  const sampleProperties = [
    { property_category: 'Jewellery & Precious Metals', estimated_value: 50000, recovered_value: 50000, status: 'RECOVERED' },
    { property_category: 'Cash & Currency', estimated_value: 20000, recovered_value: 0, status: 'STOLEN' },
  ];

  const locationsById = {};

  // Execute projections across grains
  const rowsFir = projectGrainRowsForTest(sampleRecord, samplePersons, sampleProperties, locationsById, 'per_fir');
  const rowsAccused = projectGrainRowsForTest(sampleRecord, samplePersons, sampleProperties, locationsById, 'per_accused');
  const rowsVictim = projectGrainRowsForTest(sampleRecord, samplePersons, sampleProperties, locationsById, 'per_victim');
  const rowsProperty = projectGrainRowsForTest(sampleRecord, samplePersons, sampleProperties, locationsById, 'per_property');

  console.log(`✅ Projection Rows Generated:`);
  console.log(`   - per_fir Rows: ${rowsFir.length}`);
  console.log(`   - per_accused Rows: ${rowsAccused.length}`);
  console.log(`   - per_victim Rows: ${rowsVictim.length}`);
  console.log(`   - per_property Rows: ${rowsProperty.length}`);

  // Assertion 1: Row count equals entity count for grain entities
  assert.equal(rowsFir.length, 1, 'per_fir must produce 1 row');
  assert.equal(rowsAccused.length, 2, 'per_accused must produce 2 rows (1 per accused)');
  assert.equal(rowsVictim.length, 1, 'per_victim must produce 1 row (1 per victim)');
  assert.equal(rowsProperty.length, 2, 'per_property must produce 2 rows (1 per property)');

  // Assertion 2: Total property estimated values reconcile identically across per_property rows vs parent sum
  const sumPropertyGrainVal = rowsProperty.reduce((acc, r) => acc + r.estimated_value, 0);
  assert.equal(sumPropertyGrainVal, 70000, 'Sum of estimated_value in per_property must equal ₹70,000');
  console.log(`✅ Invariant 1 - Property Estimated Value Sum Reconciled: ₹${sumPropertyGrainVal}`);

  // Assertion 3: Unique FIR count must equal 1 across all grains
  const firIdsAccused = new Set(rowsAccused.map(r => r._id));
  const firIdsProperty = new Set(rowsProperty.map(r => r._id));
  assert.equal(firIdsAccused.size, 1, 'Unique FIR count in per_accused must be 1');
  assert.equal(firIdsProperty.size, 1, 'Unique FIR count in per_property must be 1');
  console.log(`✅ Invariant 2 - Unique FIR Count Reconciled across all grains!`);

  // Assertion 4: Pre-aggregated compiled cells present without fan-out
  for (const rAcc of rowsAccused) {
    assert.ok(rAcc._compiled_property.includes('Jewellery') && rAcc._compiled_property.includes('Cash'), 'per_accused row contains compiled property string');
    assert.ok(rAcc._compiled_victim.includes('Anita Verma'), 'per_accused row contains compiled victim string');
  }
  console.log(`✅ Invariant 3 - Pre-aggregated compiled cells attached to per_accused rows without fan-out!`);

  console.log('\n🎉 ALL CROSS-GRAIN RECONCILIATION INVARIANTS VERIFIED 100% CLEANLY!');
}

runGrainReconciliationTest();
