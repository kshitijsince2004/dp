# PHAROS Bulk Import — Error & Warning Glossary

Every message the bulk-import validator can show you has a **code**. This page has one
section per code: the message you'll see, what it actually means, and exactly what to do
about it. English only for now — each heading is a fixed anchor so a Hindi column/section can
be added later without moving anything around.

Severity meaning:
- **ERROR** — this row (and everything linked to it) is **not imported** until fixed.
- **WARNING** — the row **is imported**, with the warning kept as a permanent note on the
  batch so it can be reviewed and completed later.

Source of truth for every entry below: the current working code in
`backend/src/modules/import/import.validate.js`, `import.service.js`, and `import.parse.js`.
The machine-readable version of this same information is `MESSAGE_CATALOG.json` in this
folder.

---

## Table of contents

**Sheet structure / linking**
- [PARENT_KEY_BLANK](#parent_key_blank)
- [PARENT_KEY_UNMATCHED](#parent_key_unmatched)
- [PARENT_KEY_RECOVERED](#parent_key_recovered)
- [DUPLICATE_IN_SHEET](#duplicate_in_sheet)

**Required fields**
- [REQUIRED_MISSING](#required_missing)

**Record identity / dates / jurisdiction**
- [RECORD_DATE_MISSING](#record_date_missing)
- [PS_MISMATCH](#ps_mismatch)
- [DUPLICATE_IN_DB](#duplicate_in_db)

**Investigating Officer**
- [IO_NOT_REGISTERED](#io_not_registered)
- [IO_AUTO_PROVISIONED](#io_auto_provisioned)
- [IO_MISSING](#io_missing)

**Classification / reference lookups (Act, Section, Local/Major/Minor Head, Beat)**
- [ACT_UNKNOWN](#act_unknown)
- [REF_UNRESOLVED_SECTION](#ref_unresolved_section)
- [SECTION_RECOVERED](#section_recovered)
- [REF_UNRESOLVED_MAJOR_HEAD](#ref_unresolved_major_head)
- [MAJOR_HEAD_RECOVERED](#major_head_recovered)
- [REF_UNRESOLVED_MINOR_HEAD](#ref_unresolved_minor_head)
- [MINOR_HEAD_RECOVERED](#minor_head_recovered)
- [REF_UNRESOLVED_LOCAL_HEAD](#ref_unresolved_local_head)
- [LOCAL_HEAD_RECOVERED](#local_head_recovered)
- [REF_UNRESOLVED_BEAT](#ref_unresolved_beat)
- [BEAT_RECOVERED](#beat_recovered)

**Advisory (before-submit reminder)**
- [SUBMIT_REQUIREMENTS_PENDING](#submit_requirements_pending)

**Batch-level notices (row 0 — about the whole file, not one row)**
- [GHOST_ROWS_SKIPPED](#ghost_rows_skipped)
- [LEGACY_TEMPLATE_LAYOUT](#legacy_template_layout)
- [COLUMN_DROPPED_INFORMATIONAL](#column_dropped_informational)

**System**
- [WRITE_FAILED](#write_failed)

**Appendix:** [Messages with no error code](#appendix-messages-with-no-error-code)

---

## Sheet structure / linking

### `PARENT_KEY_BLANK`

- **Stage:** validate (row-level, child sheet)
- **Message you see:** `Fill the "<column>" column on sheet '<sheet>' — it must repeat the parent row's <column> so this row can be linked.`
- **Severity — new-data mode:** ERROR
- **Severity — legacy mode:** ERROR (unless the file has only one General Information row — see PARENT_KEY_RECOVERED)
- **What it means:** This row is on a child sheet (Victim, Accused, Property, Act & Sections,
  Person Arrested…) and its FIR Number / GD Number / Linked FIR-DD No. box is empty, so the
  system has no way to know which case this row belongs to.
- **What to do:** Type the same FIR Number / GD Number into this row that appears on its
  General Information row, exactly as it's spelled there.

### `PARENT_KEY_UNMATCHED`

- **Stage:** validate (row-level, child sheet)
- **Message you see:** `Reference '<value>' in sheet '<sheet>' does not match any row in the parent sheet — check for a typo, or a missing parent row.`
- **Severity — new-data mode:** ERROR
- **Severity — legacy mode:** ERROR
- **What it means:** This row's FIR/GD Number box has something typed in it, but it doesn't
  match any FIR/GD Number on the General Information sheet — usually a typo, extra space, or
  the wrong case's number.
- **What to do:** Check the value against the General Information sheet for a typo, or
  confirm the case it belongs to is actually present on the General Information sheet at all.

### `PARENT_KEY_RECOVERED`

- **Stage:** validate (row-level, child sheet)
- **Message you see:** `Blank "<column>" in sheet '<sheet>' was auto-linked to this file's only parent row — verify this is correct.`
- **Severity — new-data mode:** WARNING
- **Severity — legacy mode:** WARNING
- **What it means:** This is an automatic fix, not a problem: your file has **only one** row
  on the General Information sheet, so a blank FIR/GD Number on a child row was safely linked
  to that one case for you. The row will import.
- **What to do:** Nothing is required, but double-check that this child row really does
  belong to the one case in your file. This auto-link only ever happens when there is exactly
  one possible case it could belong to — never a guess between two or more.

### `DUPLICATE_IN_SHEET`

- **Stage:** validate (row-level, parent sheet)
- **Message you see:** `Duplicate <FIR Number/GD Number> "<value>" found in sheet "parent".`
- **Severity — new-data mode:** ERROR
- **Severity — legacy mode:** ERROR
- **What it means:** Two rows on your General Information sheet have the exact same FIR
  Number / GD Number. Each case/arrest/GD must appear only once on that sheet.
- **What to do:** Check the two rows — either one is a duplicate that should be deleted, or
  one of them has the wrong number typed in and needs correcting.

---

## Required fields

### `REQUIRED_MISSING`

- **Stage:** validate (row-level and composed-level)
- **Message you see:** most commonly `"<field name>" is required in sheet "<sheet>".` — two
  record types have their own wording for a special case:
  - MISSING: `Either "Date Missing Since" or "GD Date" is required for a Missing Person record.`
  - ARREST / KALANDRA: `At least one Arrested Person (with First Name filled in) is required on the Person Arrested sheet.`
- **Severity — new-data mode:** always ERROR.
- **Severity — legacy mode:** WARNING for most fields — **except** the keystone fields listed
  in `OPERATOR_FILL_GUIDE.md` §4 (FIR/GD Number, FIR/Arrest/Found/Missing dates, arrestee
  first name, missing person's name, UIDB found place), which stay ERROR even in legacy mode.
- **What it means:** A field the system requires was left blank on this row. Which fields
  count as "required" — and whether that's an ERROR or just a WARNING for you — depends on
  your import mode; see `OPERATOR_FILL_GUIDE.md` §3–4.
- **What to do:**
  - If it's an ERROR: fill in the named field before this row can import.
  - If it's a WARNING (legacy mode, non-keystone field): the row already imported — fill in
    the field later through the normal record screen if the information becomes available.

---

## Record identity / dates / jurisdiction

### `RECORD_DATE_MISSING`

- **Stage:** validate (composed-level)
- **Message you see:** `No usable date found for this record (checked FIR/arrest/occurrence date fields).`
- **Severity — new-data mode:** ERROR
- **Severity — legacy mode:** ERROR
- **What it means:** None of the date fields the system checks for this record type had a
  usable date in them. Every record needs at least one real date.
- **What to do:** Fill in at least one of the record's date columns (e.g. FIR Date, Date Of
  Arrest, Date Missing Since / GD Date, Date Body Found) with a valid `dd-mm-yyyy` date.

### `PS_MISMATCH`

- **Stage:** validate (composed-level)
- **Message you see:** `District "<value>" does not match this batch's target district ("<target>").` or `Police Station "<value>" does not match this batch's target station ("<target>").`
- **Severity — new-data mode:** ERROR
- **Severity — legacy mode:** ERROR
- **What it means:** The District or Police Station you typed on this row doesn't match the
  station/district you selected for this import batch (shown at the top of the import page).
  The system is deliberately forgiving about spelling/formatting differences here — this only
  fires when the station or district is genuinely a different one.
- **What to do:** Either correct the District/Police Station cell on this row, or check that
  you selected the correct target station for this whole batch before uploading.

### `DUPLICATE_IN_DB`

- **Stage:** validate (composed-level, CASE only) and, rarely, confirm
- **Message you see:**
  - At validate time: `FIR number "<fir_no>" already exists in the database for this Police Station.`
  - At confirm time (rare): `This FIR was imported by a concurrent process between validation and confirmation.`
- **Severity — new-data mode:** ERROR (validate-time) / WARNING (the rare confirm-time race)
- **Severity — legacy mode:** ERROR (validate-time) / WARNING (the rare confirm-time race)
- **What it means:** This FIR Number is already in the system for this Police Station. This
  check only runs for CASE records (an ARREST legitimately shares its FIR Number across
  several arrestees, so it is never checked for duplicates). The rare confirm-time version
  means someone else imported or created the same FIR in the few seconds between you
  validating and confirming this batch.
- **What to do:** Check whether this FIR was already entered (by you or a colleague) through
  the normal record screen or an earlier import. If it's a genuine duplicate, remove the row
  from your file. If the confirm-time version appears, the row was **not** saved — re-check
  and re-import it separately if it's still needed.

---

## Investigating Officer

### `IO_NOT_REGISTERED`

- **Stage:** validate (composed-level)
- **Message you see:** `IO with PIS number "<pis>" is not registered for this police station. Register the IO first, then re-validate — or import now and this row will be skipped.`
- **Severity — new-data mode:** ERROR
- **Severity — legacy mode:** ERROR — **this is one of the very few checks that is an ERROR
  in both modes**; there is no legacy leniency here (unlike most other fields).
- **What it means:** The PIS number you typed in the IO column doesn't match any
  Investigating Officer already registered at your station.
- **What to do:** Get the IO registered at your station first (through the normal IO
  management screen), then re-validate — or leave the IO column blank/leave this row out of
  the import for now and add the IO later through the interactive form.

### `IO_AUTO_PROVISIONED`

- **Stage:** validate (composed-level, legacy imports only)
- **Message you see:** `IO with PIS number "<pis>" is not yet registered for this police station — it will be auto-registered from the sheet and needs SHO verification.`
- **Severity — legacy mode:** WARNING
- **Severity — new-data mode:** does not occur (new-data imports use `IO_NOT_REGISTERED` instead)
- **What it means:** Because this is a legacy (historical) import, the system will
  automatically create a placeholder IO record using the PIS number you typed, so the
  historical record isn't lost. The placeholder needs to be checked and verified by the SHO
  afterwards.
- **What to do:** Nothing required to complete this import. Flag the auto-registered IO for
  SHO review afterwards (it's clearly named as auto-registered/pending verification in the IO
  list).

### `IO_MISSING`

- **Stage:** validate (composed-level, legacy imports only)
- **Message you see:** `No Investigating Officer information provided — the record will be saved without a linked IO; add one later via the interactive form.`
- **Severity — legacy mode:** WARNING
- **Severity — new-data mode:** does not occur
- **What it means:** The IO column was left completely blank on this row. In legacy mode
  that's allowed — the record still imports, just without an IO attached.
- **What to do:** Nothing required now. Add an IO to the record later through the normal
  record screen if that information becomes available.

---

## Classification / reference lookups

For Local Head, Major Head, Minor Head, Beat and Section, the system first tries an exact
match, then a tolerant "cleaned-up" match (ignoring extra spaces/punctuation, or for beats,
matching a bare number to a beat at your own station). A tolerant match always produces a
`_RECOVERED` warning so you can verify it picked the right one — it never silently guesses.

### `ACT_UNKNOWN`

- **Stage:** validate (composed-level)
- **Message you see:** `Act "<value>" is not in the acts list — will be stored as free text.`
- **Severity:** WARNING in both modes
- **What it means:** The Act you typed isn't one the system recognises by name, but this is
  allowed — the text you typed is kept and stored exactly as-is (the same as the on-screen
  form allows).
- **What to do:** Nothing required. Double-check the spelling if you intended to use a known
  Act (e.g. "IPC", "BNS", "NDPS Act") and it should have matched.

### `REF_UNRESOLVED_SECTION`

- **Stage:** validate (composed-level)
- **Message you see:** `Section "<section>" (act "<act>") could not be matched to a known section.` or, when there's no Act to check it against at all: `Section "<section>" has no associated act to resolve against.`
- **Severity — new-data mode:** ERROR
- **Severity — legacy mode:** WARNING
- **What it means:** The Section you typed couldn't be matched against the reference list of
  sections for the Act you gave (or, in the second message, no Act was given for the system
  to check the section against at all).
- **What to do:** Check the Section number and the Act it belongs to for typos. Make sure the
  Act cell on the same row is filled in correctly.

### `SECTION_RECOVERED`

- **Stage:** validate (composed-level)
- **Message you see:** `Section "<section>" matched after normalizing zero-padding/spacing — verify this is correct.`
- **Severity:** WARNING in both modes
- **What it means:** The Section matched successfully, but only after the system ignored
  differences like leading zeros or extra spaces (e.g. "079" vs "79").
- **What to do:** Nothing required — just glance at the matched section to confirm it's the
  one you meant.

### `REF_UNRESOLVED_MAJOR_HEAD`

- **Stage:** validate (composed-level)
- **Message you see:** `Major head "<value>" could not be matched.`
- **Severity — new-data mode:** ERROR
- **Severity — legacy mode:** WARNING
- **What it means:** The Major Head classification you typed doesn't match anything in the
  system's reference list, even after tolerant cleanup.
- **What to do:** Check the spelling against the standard Major Head list, or ask your
  records unit for the correct term.

### `MAJOR_HEAD_RECOVERED`

- **Stage:** validate (composed-level)
- **Message you see:** `Major head "<value>" matched after normalizing punctuation/spacing — verify this is correct.`
- **Severity:** WARNING in both modes
- **What it means:** Matched, but only after cleanup of spacing/punctuation.
- **What to do:** Nothing required — confirm it matched the head you intended.

### `REF_UNRESOLVED_MINOR_HEAD`

- **Stage:** validate (composed-level)
- **Message you see:** `Minor head "<value>" could not be matched.`
- **Severity — new-data mode:** ERROR
- **Severity — legacy mode:** WARNING
- **What it means:** Same as Major Head, for the Minor Head classification.
- **What to do:** Check the spelling, and check it's a Minor Head that actually belongs under
  the Major Head given on the same row.

### `MINOR_HEAD_RECOVERED`

- **Stage:** validate (composed-level)
- **Message you see:** `Minor head "<value>" matched after normalizing punctuation/spacing — verify this is correct.`
- **Severity:** WARNING in both modes
- **What it means:** Matched after cleanup — verify it's correct.
- **What to do:** Nothing required.

### `REF_UNRESOLVED_LOCAL_HEAD`

- **Stage:** validate (composed-level)
- **Message you see:** `Local head "<value>" could not be matched.`
- **Severity — new-data mode:** ERROR
- **Severity — legacy mode:** WARNING (the original text you typed is still kept on the
  record for reference, even though it couldn't be linked to a formal Local Head)
- **What it means:** The Local Head (crime classification) you typed doesn't match the
  system's reference list.
- **What to do:** Check the spelling against the standard Local Head list.

### `LOCAL_HEAD_RECOVERED`

- **Stage:** validate (composed-level)
- **Message you see:** `Local head "<value>" matched after normalizing punctuation/spacing — verify this is correct.`
- **Severity:** WARNING in both modes
- **What it means:** Matched after cleanup.
- **What to do:** Nothing required.

### `REF_UNRESOLVED_BEAT`

- **Stage:** validate (composed-level)
- **Message you see:** `Beat "<value>" could not be matched.`
- **Severity — new-data mode:** ERROR
- **Severity — legacy mode:** WARNING (the original text is kept on the record for reference)
- **What it means:** The Beat number you typed doesn't match a beat recorded for your police
  station, even as a bare number.
- **What to do:** Check the beat number with your station's records unit — this can happen
  when a beat genuinely isn't in the reference data yet for your station.

### `BEAT_RECOVERED`

- **Stage:** validate (composed-level)
- **Message you see:** `Beat "<value>" matched to a beat number in this station after normalizing — verify this is correct.`
- **Severity:** WARNING in both modes
- **What it means:** You typed a bare number (e.g. "6") and the system matched it to a beat
  recorded for your own station whose name starts with that number (e.g. "06-MRS Yamuna
  Bank"). This is the normal, expected way to fill in the beat column (see
  `OPERATOR_FILL_GUIDE.md` §6).
- **What to do:** Nothing required — just confirm it's the beat you meant.

---

## Advisory (before-submit reminder)

### `SUBMIT_REQUIREMENTS_PENDING`

- **Stage:** validate (composed-level, new-data imports only)
- **Message you see:** `Missing required fields before submit: <field name>, <field name>, ...`
- **Severity:** WARNING (new-data mode only — never shown for legacy imports)
- **What it means:** The record will import successfully as a draft, but it is missing one or
  more fields that will eventually be required before anyone can **submit** it up the review
  chain. This is a heads-up, not a block on the import itself.
- **What to do:** Nothing required to complete the import. Before the record is submitted for
  review, open it in the normal record screen and fill in the listed fields.

---

## Batch-level notices (row 0)

These three notices are about the **whole file**, not any one row — they appear once, listed
against row `0`.

### `GHOST_ROWS_SKIPPED`

- **Stage:** validate (batch-level, sourced from parse-time)
- **Message you see:** `Sheet "<sheet>": row(s) <numbers> appear empty/stray (1-2 filled cells, no key data) and were skipped.`
- **Severity:** WARNING in both modes
- **What it means:** The system found one or more rows with only one or two cells filled in
  and none of them a key field — almost always a stray copy-paste artifact — and skipped them
  automatically rather than treating them as broken records.
- **What to do:** Nothing required. If a listed row was actually meant to be real data,
  re-check it and make sure its key fields are filled in, then re-upload.

### `LEGACY_TEMPLATE_LAYOUT`

- **Stage:** validate (batch-level, sourced from parse-time)
- **Message you see:** `This file uses an older template version — please download the current template for future imports.`
- **Severity:** WARNING in both modes
- **What it means:** Your file's column layout matches an older version of the PHAROS
  template closely enough that the system parsed it correctly anyway. Your data still
  imports.
- **What to do:** Nothing required for this batch. Download the current template for your
  next import so you have the latest columns and validations.

### `COLUMN_DROPPED_INFORMATIONAL`

- **Stage:** validate (batch-level)
- **Message you see:** `Column "<column name>" is informational and is not imported.`
- **Severity:** WARNING in both modes
- **What it means:** One of the template's columns is not actually stored anywhere in the
  system (it exists for reference/compatibility only) — you filled it in somewhere in the
  file, so the system is letting you know that data will not be saved.
- **What to do:** Nothing can be done to import this column's data — it is not a stored
  field. If this information is important, record it elsewhere (e.g. general remarks) or ask
  your administrator whether it should be a proper field.

---

## System

### `WRITE_FAILED`

- **Stage:** confirm
- **Message you see:** `This row could not be saved due to a system error (ref: <batch id>/<row number>). Report this to your administrator.`
- **Severity:** ERROR
- **What it means:** Every validation check passed for this row, but saving it to the
  database still failed for a technical reason. This should be rare — it means something the
  validator doesn't already check went wrong (for example, an option value that isn't
  actually accepted by the database yet). The real technical detail is written to the
  system's server log for an administrator to look up using the batch/row reference number
  shown — it is deliberately not shown to you, since it isn't something you can act on
  directly.
- **What to do:** Note the reference number shown in the message and report it to your
  system administrator. The rest of the batch's other rows are not affected by this one row
  failing.

---

## Appendix: messages with no error code

These messages can appear when using the import feature, but they are **not** row-level
findings stored against a batch — they stop the upload or confirm action outright (an
HTTP-level rejection), so they have no error code and are not listed in a batch's error
table. They're listed here for completeness since operators can still see them on screen.

| When it happens | Message |
|---|---|
| No file selected | `No file uploaded` |
| Wrong file type | `Invalid file format. Only modern Excel spreadsheets (.xlsx) are supported. Please convert your file to .xlsx and try again.` |
| Wrong/missing record type | `Invalid or missing record_type. Must be CASE, ARREST, KALANDRA, PCR_CALL, UIDB or MISSING.` |
| HC tries a legacy import | `Operators (HC) cannot import legacy data` |
| HC targets a station that isn't their own | `Operators are restricted to importing for their assigned Station only` |
| District Officer tries a non-legacy import | `District officers may only import legacy (historical) data` |
| District Officer doesn't pick a target station | `ps_id (the target police station) is required for a legacy import` |
| District Officer targets a station outside their district | `You can only import legacy data for a police station within your own district` |
| File doesn't resemble any known template at all | `This file doesn't match any known PHAROS import template. Download the current template from this page and copy your data into it.` |
| File's main sheet can't be found at all | `Invalid template: main worksheet not found` |
| File too large (over 10 MB) | (standard upload-size error from the browser/server) |
| Confirming a batch that's already finished | `This batch has already been imported.` |
| Confirming a batch someone else already confirmed | `This batch is already being imported. Please wait for it to finish.` |
| Confirming/cancelling a batch you didn't upload | `Only the user who uploaded the batch can confirm it` / `...cancel it` |
| Confirming a batch whose uploaded file has expired (kept only for a limited time) | `Physical temp file has expired or was removed` |
| Cancelling a batch that already started importing | `Batch cannot be cancelled once <status> — records may already be written.` |
