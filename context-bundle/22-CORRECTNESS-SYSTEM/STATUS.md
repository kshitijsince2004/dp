# Report Correctness Status
Generated: 2026-08-27T08:01:17.609Z

## Coverage Summary
| Report Engine | Total Cells Tracked | CONFIRMED | PROPOSED | NEEDS_DECISION | BLOCKED | Confirmation % |
|---|---|---|---|---|---|
| **FN_DIARY** | 57 | 3 | 54 | 0 | 0 | **5.3%** |
| **PHQ_DIARY** | 9 | 0 | 9 | 0 | 0 | **0.0%** |
| **DISTRICT_DIARY** | 1 | 0 | 1 | 0 | 0 | **0.0%** |

## Active Invariants Checked
- **Total Cross-Sheet Invariants Configured:** 5
- `lo_ranges_equal_grand_total_minus_specialised`: PHQ Upto_Date grand total minus specialised units must equal L&O South + L&O North
- `district_diary_ps_sum_equals_district_total`: Sum of all PS columns in District Diary must equal the District Total column
- `fn_stat1_bns_total_equals_stat36_registered`: STAT_1 Total BNS (row 53) must equal STAT_36 'Registered during FN' summed across all heads
- `fn_stat20_demographics_sum_equals_total_arrestees`: STAT_20 Social Category sum (SC+ST+OBC+General) must equal Total Arrestees
- `stat25_stat26_pocso_consistency`: STAT_25 POCSO Only count must be less than or equal to STAT_26 POCSO Total count

## Open Decisions (from NEEDS-DECISION.md)
- **Total Curated Ambiguities:** 4
- All decision points have been reviewed and applied.

## Automated Verification Status
- **Subtotal Reconciliation Gate:** Enabled & Active (`RECONCILIATION_FAILED` error gate on report generation)
- **Golden-Sample Regression Tests:** Executing cleanly (0 failures)
- **Record Trace Endpoint:** Exposed at `GET /api/v1/reports/trace/:recordId`
