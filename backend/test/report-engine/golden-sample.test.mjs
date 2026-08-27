import db from '../../src/config/db.js';
import { reconcileSubtotals, checkCrossSheetInvariants } from '../../src/modules/report-engine/shared/reconciliation.js';

async function runGoldenSampleTests() {
  console.log('=== 🧪 GOLDEN SAMPLE & INVARIANT REGRESSION TESTS ===');

  // 1. Test Subtotal Reconciliation on STAT_1 sample
  const stat1Sample = {
    7: 3,  // DACOITY
    8: 1,  // MURDER
    9: 0,  // ATT_TO_MURDER
    10: 2, // ROBBERY
    11: 4, // RIOT
    12: 0, // KID_FOR_RANSOM
    13: 5, // RAPE
    14: 15 // Total Heinous (3+1+0+2+4+0+5 = 15)
  };

  const stat1Assertions = [
    {
      rule: "row_14_equals_sum_7_to_13",
      description: "Total Heinous (row 14) must equal sum of rows 7-13",
      type: "SUBTOTAL",
      member_rows: [7, 8, 9, 10, 11, 12, 13],
      total_row: 14
    }
  ];

  const subtotalFailures = reconcileSubtotals(stat1Sample, stat1Assertions);
  console.log('STAT_1 Subtotal Reconciliation Test:', subtotalFailures.length === 0 ? 'PASSED ✅' : 'FAILED ❌');
  if (subtotalFailures.length > 0) {
    console.error('Subtotal Failures:', subtotalFailures);
  }

  // 2. Test Cross-Sheet Invariants
  const sampleReportOutput = {
    PHQ_DIARY: {
      Upto_Date: {
        grand_total: 1000,
        specialised_units_sum: 200
      },
      L_AND_O_SOUTH: { total: 400 },
      L_AND_O_NORTH: { total: 400 }
    },
    DISTRICT_DIARY: {
      COMPILATION_MATRIX: {
        sum_ps_columns: 450,
        district_total_column: 450
      }
    },
    FN_DIARY: {
      STAT_1: { row_53: 150 },
      STAT_36: { sum_registered_column: 150 },
      STAT_20: { row_19: 50, total_arrestees: 50 },
      STAT_25: { row_7: 12 },
      STAT_26: { row_7: 20 }
    }
  };

  const invariants = [
    {
      id: "lo_ranges_equal_grand_total_minus_specialised",
      description: "PHQ Upto_Date grand total minus specialised units must equal L&O South + L&O North",
      left: "PHQ_DIARY.Upto_Date.grand_total - PHQ_DIARY.Upto_Date.specialised_units_sum",
      right: "PHQ_DIARY.L_AND_O_SOUTH.total + PHQ_DIARY.L_AND_O_NORTH.total"
    },
    {
      id: "district_diary_ps_sum_equals_district_total",
      description: "Sum of all PS columns in District Diary must equal the District Total column",
      left: "DISTRICT_DIARY.COMPILATION_MATRIX.sum_ps_columns",
      right: "DISTRICT_DIARY.COMPILATION_MATRIX.district_total_column"
    },
    {
      id: "fn_stat1_bns_total_equals_stat36_registered",
      description: "STAT_1 Total BNS (row 53) must equal STAT_36 Registered sum",
      left: "FN_DIARY.STAT_1.row_53",
      right: "FN_DIARY.STAT_36.sum_registered_column"
    }
  ];

  const invariantFailures = checkCrossSheetInvariants(sampleReportOutput, invariants);
  console.log('Cross-Sheet Invariants Test:', invariantFailures.length === 0 ? 'PASSED ✅' : 'FAILED ❌');
  if (invariantFailures.length > 0) {
    console.error('Invariant Failures:', invariantFailures);
  }

  process.exit(invariantFailures.length === 0 && subtotalFailures.length === 0 ? 0 : 1);
}

runGoldenSampleTests().catch(err => { console.error('Golden Sample Test Error:', err); process.exit(1); });
