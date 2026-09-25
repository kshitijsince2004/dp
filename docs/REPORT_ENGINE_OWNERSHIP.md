# Report engine ownership

**Decision date:** 2026-09-25  
**Status:** Canonical (P1 / R2)

PHAROS keeps **two** Excel engines. They are not interchangeable; dispatch is by template code / type.

| Family / templates | Engine | Location |
| :--- | :--- | :--- |
| `PHQ_DIARY`, `DISTRICT_DIARY`, `FN_DIARY` (statutory) | Node.js + ExcelJS | `backend/src/modules/report-engine/`, `backend/src/modules/phq-diary/` |
| `daily-diary`, `dd-*` (daily diary / single-sheet) | Python (pandas/openpyxl) | `python_worker/` |
| Metadata-driven templates | Node `reports/engine/templateRuntime.js` | `backend/src/modules/reports/engine/` |
| Ad-hoc / saved builder queries | Node report-builder | `backend/src/modules/report-builder/` |

## Retired (do not restore without normalised recompose)

These inline templates read the removed `records.data` JSONB column and return **410 TEMPLATE_RETIRED**:

- `arrest-summary`
- `pcr-call-log`
- `cases-register`

Use statutory diaries or daily-diary templates instead. Rebuilding them against the normalised spine + detail tables is deferred (P3+).

## Deferred

Folding `reports`, `report-engine`, `phq-diary`, `daily-diary`, and `report-builder` under a single `modules/reporting/` umbrella is deferred to keep import blast radius low.
