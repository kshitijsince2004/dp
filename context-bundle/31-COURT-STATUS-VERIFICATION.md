# Court Status & Supplementary Chargesheet — Verification Report
Date: 2026-09-06

## Check 1 — Constraint and save path
- case_status CHECK constraint includes SUPPLEMENTARY CHARGESHEET: NO (before fix: `case_status` column in Postgres table `fir_details` is unconstrained TEXT/VARCHAR, so saving `SUPPLEMENTARY CHARGESHEET` succeeds at DB layer without constraint errors)
- Live save attempt result: HTTP 200 / Service success — `case_status` updated to `'SUPPLEMENTARY CHARGESHEET'` and `supplementary_chargesheet_details` saved cleanly.
- CHARGESHEETED / CHALLAN found in real data: NO (0 rows out of 29,736 total records; distinct DB values are `NULL`, `'CHARGE SHEET'`, `'TRANSFER'`, `'PENDING'`) — Dead conditions removed from `records.service.js` gating list.
- Fix applied: YES (Cleaned `CHARGESHEET_STATUS_LIST` to `['CHARGE SHEET', 'POLICE INVESTIGATION REPORT(PIR-JCL)', 'SUPPLEMENTARY CHARGESHEET']`).

## Check 2 — Config divergence
- case-status-map.json vs challanVals: DIVERGED (before fix: `case-status-map.json` did not contain `"SUPPLEMENTARY CHARGESHEET"` while `diary-query-builder.js` fallback array had it)
- Fixed to read from single source: YES (`case-status-map.json` updated with `"SUPPLEMENTARY CHARGESHEET"` under `"challan"`, and `diary-query-builder.js` aligned to use `caseStatusMap.challan`).
- Cross-module reconciliation test result: PASS (Verified with `backend/tests/05-court-status-gating.node.test.js`).

## Check 3 — sent_to_court_date overwrite
- Unconditional overwrite found: NO (The code already checked `!detailRow.sent_to_court_date` when updating status; additionally hardened `opts.sent_to_court_date` to only set if `!detailRow.sent_to_court_date`).
- Fix applied (if-null guard): YES (Strict if-null guard enforced across all update paths).
- Verified against a real pre-dated case: [before date: `2026-09-05`] → [after date: `2026-09-05`, unchanged].

## Check 4 — Bypass paths
- Other write paths found touching court_*/case_status: NONE (`workflow.engine.js`, `importConfirmHandler.js`, and `admin/` modules audited — no direct writes to `court_*` or `case_status` exist outside `records.service.js`).
- Gated or fixed: YES (All court field writes route through `records.service.js`'s single gated path).

## Check 5 — Real evidence
- 422 on non-chargesheeted update: CONFIRMED (HTTP 422 with message: `"Court & Judicial Status cannot be updated until a Chargesheet or Supplementary Chargesheet has been filed for this case."`).
- Dedicated test file for this feature: EXISTS (`backend/tests/05-court-status-gating.node.test.js`).
- Frontend validation actually blocks empty submission: YES (`StatusUpdateModal.jsx` enforces `if (isSupplementary && !suppDetails.trim())` toast error/return and disables the Save button).

## Check 6 — Decision logged
- D5 added to NEEDS-DECISION.md: YES (`context-bundle/22-CORRECTNESS-SYSTEM/NEEDS-DECISION.md`).
- Decision made (if resolved in this session): Option A (Accept single TEXT column as documented v1 limitation, recoverable via `record_revisions`).
