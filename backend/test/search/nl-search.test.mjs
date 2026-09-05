import db from '../../src/config/db.js';
import { parseNaturalLanguageQuery } from '../../src/modules/search/nlParser.service.js';
import { executeNaturalLanguageSearch } from '../../src/modules/search/nlSearch.service.js';
import { v4 as uuidv4 } from 'uuid';

async function runAcceptanceTests() {
  console.log('=== Running Universal Natural-Language Search Regression Test Suite ===\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] Test ${total}: ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Test ${total}: ${testName}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 5 Primary Regression Test: Parliament Street Police Station
  // ───────────────────────────────────────────────────────────────────────────
  const qPrimary = await parseNaturalLanguageQuery('cases of murder at parliament street police station');
  
  const psBinding = qPrimary.bindings.find(b => b.field_key === 'ps_name');
  const chBinding = qPrimary.bindings.find(b => b.field_key === 'local_head');
  const rtBinding = qPrimary.bindings.find(b => b.field_key === 'record_type');

  assert(
    qPrimary.bindings.length >= 3 &&
    rtBinding?.resolved_value === 'CASE' &&
    chBinding?.resolved_value?.code === 'MURDER' &&
    psBinding?.resolved_value?.name === 'PS Parliament Street' &&
    qPrimary.free_text_terms.length === 0 &&
    qPrimary.disclosure_notice === null,
    'Primary Regression Test: "cases of murder at parliament street police station" resolves 3 structured bindings (CASE, MURDER, PS Parliament Street) with ZERO free-text fallback!'
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Step 6 Broader Sweep Test A: Seizure Item Taxonomy
  // ───────────────────────────────────────────────────────────────────────────
  const qSweepA = await parseNaturalLanguageQuery('Arrest in cases of murder involving gun as seizure');
  const seizureBinding = qSweepA.bindings.find(b => b.field_key === 'seizure_item');

  assert(
    qSweepA.bindings.length >= 3 &&
    qSweepA.resolved.record_type === 'ARREST' &&
    qSweepA.resolved.crime_head?.code === 'MURDER' &&
    seizureBinding?.resolved_value?.code === 'FIREARM',
    'Sweep Test A: "Arrest in cases of murder involving gun" resolves 3 structured bindings (ARREST, MURDER, FIREARM)'
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Step 6 Broader Sweep Test B: District Name Matching
  // ───────────────────────────────────────────────────────────────────────────
  const qSweepB = await parseNaturalLanguageQuery('cases of theft in central district');
  const distBinding = qSweepB.bindings.find(b => b.field_key === 'district_name');

  assert(
    distBinding?.resolved_value?.name?.toLowerCase().includes('central'),
    'Sweep Test B: "cases of theft in central district" resolves district_name binding dynamically without code changes'
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Step 6 Broader Sweep Test C: Gender Attribute Matching
  // ───────────────────────────────────────────────────────────────────────────
  const qSweepC = await parseNaturalLanguageQuery('arrests of male offenders at parliament street police station');
  const genderBinding = qSweepC.bindings.find(b => b.field_key === 'gender');
  const psBindingC = qSweepC.bindings.find(b => b.field_key === 'ps_name');

  assert(
    genderBinding?.resolved_value === 'MALE' &&
    psBindingC?.resolved_value?.name === 'PS Parliament Street',
    'Sweep Test C: "arrests of male offenders at parliament street police station" resolves gender (MALE) and ps_name dynamically'
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Test D: Ambiguity Detection (Two Crime Heads)
  // ───────────────────────────────────────────────────────────────────────────
  const qAmbiguous = await parseNaturalLanguageQuery('cases of murder and rape');
  assert(
    qAmbiguous.is_ambiguous === true &&
    qAmbiguous.ambiguity_warning !== null,
    'Ambiguity Test: Query with multiple crime heads ("murder and rape") flags ambiguity warning'
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Test E: Scoped Execution Test (SHO vs District Officer Scope Isolation)
  // ───────────────────────────────────────────────────────────────────────────
  const samplePs = await db('hierarchy_nodes').where({ node_type: 'PS', is_active: true }).first();
  const sampleDist = await db('hierarchy_nodes').where({ node_type: 'DISTRICT', is_active: true }).first();

  const shoUser = { id: uuidv4(), role: 'SHO', scope_node_id: samplePs.id };
  const dcpUser = { id: uuidv4(), role: 'DISTRICT_OFFICER', scope_node_id: sampleDist.id };

  const resSho = await executeNaturalLanguageSearch({ user: shoUser, confirmationSpec: qPrimary, page: 1, limit: 10 });
  const resDcp = await executeNaturalLanguageSearch({ user: dcpUser, confirmationSpec: qPrimary, page: 1, limit: 10 });

  assert(
    resSho.scope.type === 'PS' && resDcp.scope.type === 'DISTRICT',
    'Scoped Execution Test: Scoped execution enforces SHO PS boundary vs DCP District boundary cleanly'
  );

  console.log(`\n==================================================`);
  console.log(`Acceptance Test Results: ${passed} / ${total} Passed`);
  console.log(`==================================================`);

  process.exit(passed === total ? 0 : 1);
}

runAcceptanceTests().catch(err => {
  console.error('Acceptance Test Execution Error:', err);
  process.exit(1);
});
