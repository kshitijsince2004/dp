# Bulk Import — Bug Fixes & Behaviour

**Last updated:** June 2026
**Scope:** CASE / ARREST / PCR_CALL Excel bulk import (`/api/import/*`) + auto-linkage.

This documents the fixes made to get large (30k+ row) legacy spreadsheets importing cleanly, why each was needed, and how imported data behaves in the app.

---

## 1. Will I see imported data in the web app?

**Yes.** Imported records are normal rows in the `records` table and appear in:

| Page | Endpoint | Filter |
|------|----------|--------|
| Cases (FIR) Master | `GET /api/records?type=CASE` | scoped by PS/District |
| Arrest Person Master | `GET /api/records?type=ARREST` | scoped by PS/District |
| My Records (HC) | `GET /api/records?type=...` | scoped by PS |

Key points:
- The list endpoint maps `status=ALL` → **no status filter** (`records.controller.js`, `status !== 'ALL' ? status : null`), so records show regardless of status.
- Visibility is by **jurisdiction** (`ps_id` / `district_id`), not by who created them — anyone scoped to the import's PS sees them.
- **HC imports** are non-legacy → status `DRAFT`, level `PS` (HC cannot import legacy data — blocked with 403).
- **DISTRICT_OFFICER / HQ_ADMIN / SYSTEM_ADMIN legacy imports** → status `LEGACY_IMPORTED`, level `HQ` (bypass workflow; they will **not** appear in approval queues by design).

---

## 2. Files changed

### `backend/src/modules/records/records.service.js`
- **Exported `TYPE_CODES`** (`CSE/ARR/PCR/...`).
  **Why:** the import module needs the same UID prefixes used by manual creation so imported and manual records share one UID format (`CSE/2026/PS_CODE/000123`).

### `backend/src/modules/import/import.controller.js`
The bulk of the work. Changes:

1. **Robust date/time coercion (`coerceDate`, `coerceTime`)**
   **Why:** legacy sheets store dates as text in many shapes — `04/01/2025 TO 04/01/2025` (range), `15-06-2026`, `7/1/25`, ISO datetimes. The old strict `YYYY-MM-DD`-only check failed ~14,500 of 31,000 rows. Indian police data is day-first (`DD/MM/YYYY`); ranges take the start date. Output is normalised `YYYY-MM-DD`.

2. **Shared `extractRowData` helper** used by both validate and confirm.
   **Why:** the cell-reading logic was duplicated. Sharing it guarantees *what you validate is exactly what gets stored*, and adds rich-text cell handling. Also splits the combined `Name & Address Of Accused` column into `arrested_name` / `arrested_address`.

3. **Lenient validation** — only genuinely required fields block a row; type/enum/length mismatches are coerced and imported as-is.
   **Why:** legacy crime heads/statuses (`Other BNS`, `IPC`, free text) are not in the SELECT enums. For bulk legacy data the correct behaviour is to store as-is, not reject. Strict validation belongs to manual entry (`records.service.js`), which is untouched.

4. **Fixed `parseFirAndYear`** (auto-linkage).
   **Why:** the old regex misread `FIR/2026/1013` as year `1013` (the "year mismatch" failures) and didn't normalise leading zeros (`0001` vs `1`). Now it finds the 4-digit year token anywhere and normalises the sequence number, so `00001/2025`, `0001/2025`, `2/2025`, `FIR/2026/1013` all match correctly.

5. **Batched inserts + in-memory UID generator** in confirm.
   **Why:** confirm previously ran one `COUNT(*)` query **per row** (30k counts) plus 3 inserts per row. UID sequences are now pre-counted once per year and incremented in memory; rows insert in 500-row array batches (1 query per table per chunk). This is what keeps a 30k import within request time instead of hanging.

6. **Atomic `PROCESSING` lock** on confirm.
   **Why:** a big import can outlast the browser's HTTP timeout; the user then re-clicks Confirm. The lock (`UPDATE ... WHERE status='VALIDATION_DONE'`) ensures only one request imports a batch — retries get a clear `409 "already imported" / "already being imported"` instead of inserting duplicates. On error the lock is released so the batch stays retryable.

7. **Capped inline errors** in the validate response (full set still saved to `import_batch_errors`, fetchable via `GET /batches/:id`).
   **Why:** a sheet with tens of thousands of errors produced a multi-MB response that stalled the client.

8. **Whitespace-tolerant header matching** (`normHeader` in `buildColumnMap`).
   **Why:** real sheets have stray double spaces (`Name Of IO  Name`, `Name  Of Complainant`). The matcher compared single-space labels, so those columns silently failed to map and were dropped. Headers are now lowercased with whitespace collapsed before matching.

9. **ARREST mapping accepts plain FIR headers** (`FIR No.` / `FIR No` / `FIR Number` → `linked_fir_dd_no`).
   **Why:** on an arrest sheet the FIR number *is* the linked case. Sheets that reuse the case-style `FIR No.` header now feed auto-linkage instead of leaving `linked_fir_dd_no` empty.

### `backend/migrations/20260622000000_add_io_rank_and_arrest_stolen_property.js` (new)
Adds field_registry coverage so more spreadsheet columns are captured:
- **`io_rank`** — new field (CASE + ARREST) for the `Name Of IO Rank` column.
- **`stolen_property`** — extended to ARREST for `Property (Stolen)`.
- **`fir_date`** — extended to ARREST for `FIR Date` (completeness only; linkage keys on FIR No., not FIR Date).

Apply with `npm run db:migrate`. NOTE: this repo has a dual-migration setup (custom `scripts/migrations.js` + knex). Several knex migrations show "pending" because their tables were already created by the custom script, so `migrate:latest` may try to re-run them. This migration's `up()` is idempotent and can be applied on its own.

Matching header mappings were added in `import.controller.js`: `Name Of IO Rank → io_rank` (CASE + ARREST), `Property (Stolen) → stolen_property` and `FIR Date → fir_date` (ARREST).

### `frontend/src/pages/admin/LegacyDataPage.jsx`
- **`timeout: 0`** on the validate and confirm requests.
  **Why:** the global axios timeout is 15s (`frontend/src/utils/api.js`), but parsing/importing 30k rows takes longer. At 15s axios aborted the request (logged as `- - ms`) even though the server finished — leaving the user to retry into errors. These two bulk calls now wait for completion; the global 15s default is unchanged for everything else.
- **Confirm body is `{}`** (was `null`).
  **Why:** Express's JSON body parser runs in `strict` mode and rejects a bare `null` body with *"null is not valid JSON"* → 400 before the handler runs. `{}` is valid; the handler ignores the body anyway (uses `req.params.batchId`).

### `backend/scratch/cleanup_test_data.mjs` (helper, not product code)
One-off script to remove test rows inserted during debugging (`PS_ASHOK_VIHAR` / `U_HQ002` + `LOCKTEST`). Safe to delete.

---

## 3. Which fields connect CASE ↔ ARREST (auto-linkage)

| Purpose | ARREST field (header) | CASE field (header) | Rule |
|---|---|---|---|
| Primary key | `linked_fir_dd_no` (`FIR No.`) | `fir_no` (`FIR No.`) | Same FIR **number + year** |
| Scope | `ps_id` | `ps_id` | Same police station |
| Tie-breaker* | `crime_head` (`Local Head`) | `local_head` (`Local Head`) | Only if >1 case shares the FIR number |
| Tie-breaker* | `sections` (`Under Section`) | `sections` (`Under Section`) | Same |

*Tie-breakers only matter when multiple cases share a FIR number; otherwise the single match wins.
`FIR Date` is **not** used by linkage (the year is parsed out of `FIR No.`).

**Many-to-many reliability** (`record_links` is a junction table — fully many-to-many):
- One case → many arrests: each arrest row with that FIR links to the case. ✅
- One person → many cases: represented as one arrest row per FIR; each links to its case; person-search ties them by name. ✅
- One arrest row listing *several* FIRs in a single cell: only the first links automatically — add the rest manually via the UI/API. ⚠️ (Not an issue if there is one FIR per arrest row.)

## 4. Troubleshooting: "no linking happened"

Auto-linkage (Case ↔ Arrest) only fires when, **at ARREST confirm time**, an arrest's
`linked_fir_dd_no` matches an existing CASE's `fir_no` in the same PS. It fails silently when:

1. **The arrest file has no FIR-link column** (or its header isn't recognised) → `linked_fir_dd_no`
   is null for every row → nothing to match. Recognised headers: `FIR No. (legacy only)`,
   `Linked FIR / DD No.`, `FIR No.`, `FIR Number`.
2. **The wrong file was uploaded under Record Type = ARREST.** A CASE-structured sheet
   (`Local Head | FIR No. | FIR Date | Date of Occurance | ...`) imported as ARREST only maps
   `Local Head→crime_head` and `Under Section→sections`; it has no accused name/address/arrest
   date, so the arrest records are nearly empty. **Check the arrest records actually contain
   `arrested_name` before expecting links.**
3. **The cases weren't imported first**, or the FIR numbers genuinely don't exist as cases.

Quick check (data is TEXT, parse in JS):
```js
// how many arrests actually carry a linked FIR?
const arr = await db('records').where({ps_id, record_type:'ARREST'}).select('data');
console.log(arr.filter(r => JSON.parse(r.data).linked_fir_dd_no).length, '/', arr.length);
```

## 5. Known follow-ups (not yet done)

- **Duplicate-file imports are not prevented.** The `PROCESSING` lock stops the *same batch* importing twice, but validating the same file into a *new batch* and confirming it imports another full copy. A `GET /records/check-duplicate` style guard is Phase 2.
- **Confirm is synchronous (~40s for 31k rows).** Works with the timeout fix, but the proper UX is an async job: return immediately, persist the report, and poll `GET /import/batches/:id` for status.
