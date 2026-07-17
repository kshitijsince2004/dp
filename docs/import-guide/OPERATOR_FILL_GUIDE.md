# PHAROS Bulk Import — How to Fill the Template

**Who this is for:** Station operators (HC) and District Officers filling the Excel import
templates for CASE, ARREST, KALANDRA, UIDB, MISSING or PCR_CALL records.

**Read this before you fill the sheet.** It explains the habits that cause most import
failures, and exactly which boxes you must never leave empty.

---

## 1. Before you start

1. **Always download a fresh template** from the import page's "Download Excel Template"
   button before starting a new batch. Old copies of the file may be missing columns the
   system now expects, or may be rejected outright if they don't look like any template the
   system recognises.
   - If you do upload an older file that the system still recognises, it will be accepted
     and imported, but you will see one message at the top of your results: *"This file uses
     an older template version — please download the current template for future imports."*
     This is a reminder, not an error — your data still imports.
   - If the file doesn't look like a PHAROS template at all (wrong columns, wrong sheet
     names, or a file that was never a PHAROS template), the whole upload is rejected with:
     *"This file doesn't match any known PHAROS import template. Download the current
     template from this page and copy your data into it."* Nothing is saved when you see
     this — download a fresh template and re-copy your data into it.
2. **Do not rename, reorder, delete, or add columns.** The column headers are read by the
   system to know what each column means. Only fill in the cells below the headers.
3. **One record type per file.** Do not mix CASE and ARREST rows in the same workbook.
4. **Save as .xlsx.** Older `.xls` files or CSV files are rejected at upload.

---

## 2. The three habits that cause most rejected rows

### 2.1 Repeat the FIR Number (or GD Number) on every sheet

Every record type has one **General Information** sheet (the "parent") and one or more
**child sheets** (Victim, Accused, Property, Act & Sections, Person Arrested, etc). Every
row on a child sheet must repeat the same FIR Number / GD Number / Linked FIR-DD No. that
appears on its General Information row.

**This is the single biggest cause of rejected rows.** Operators fill in the FIR number once
on the General Information sheet and then leave it blank on the Victim/Act/Property sheets,
assuming the system will "know" which case a row belongs to. It cannot — a blank or
mismatched key on a child sheet means that row cannot be linked back to its case.

- If you leave the box **blank**, and your file has **more than one** case/arrest/GD in it,
  that row is **rejected** with an error telling you to fill in the column.
- If you leave the box **blank** and your file has **only one** case/arrest/GD in the whole
  file (one parent row), the system will safely link the child row to that one case for you
  — but it will still warn you to double-check this was correct. Do not rely on this; always
  fill in the key.
- If you **type it in wrong** (a typo, extra space, or a number that doesn't match any row on
  the General Information sheet), that row is rejected too, with a different message telling
  you to check for a typo or a missing parent row.

**Simplest safe habit: keep one FIR (or one GD/arrest) per file**, or always retype the
number exactly on every child-sheet row.

### 2.2 Don't leave stray, half-filled rows

If a row has only one or two cells filled in — a leftover date, a stray character from
copy-pasting — and none of those filled cells is one of the record's key fields (see the
keystone tables below), the system quietly skips that row for you and tells you it did so
(*"row(s) X–Y appear empty/stray... and were skipped"*). This is informational, not an
error — you do not need to do anything.

But if a stray row happens to contain one of the keystone fields (for example, someone typed
a date into the FIR Date column of an otherwise blank row), the system treats it as a real,
incomplete record and rejects it as such. **Before uploading, scroll to the bottom of each
sheet and delete any leftover rows below your real data.**

### 2.3 Fill in every box the template marks as mandatory — especially the "keystone" fields

Every record type has a short list of fields that can **never** be skipped, in **either**
import mode (new-data or legacy/historical) — see the tables in Section 4. Everything else on
the template should still be filled in whenever you have the information, but the keystone
fields are the ones that will always block the row if left blank.

---

## 3. New-data import vs legacy (historical) import

The system has two import modes. **You do not choose the mode yourself** — it is fixed by
your role:

| Your role | Mode | Target station | Data standard |
|---|---|---|---|
| **HC (station operator)** | New-data (non-legacy) | Always your own station — you cannot pick another PS | **Same standard as filling the form on screen.** Every field the system normally requires, it requires here too. |
| **District Officer** | Legacy (historical) | Any station inside your own district | **Lenient — built for old paper/register backlogs.** Most normally-required fields are only a warning if left blank, so old records with gaps can still be captured. The keystone fields (Section 4) are still hard requirements even here. |

Practically, this means:

- If you are an **HC**, treat the template exactly like the on-screen form: fill in
  everything it marks as required, or the row will be rejected.
- If you are a **District Officer** doing a **legacy** import, you can leave non-keystone
  fields blank (complainant name, victim name, classification heads, etc.) and the row will
  still import — you will just get a warning listing what's missing, which someone can fill
  in later through the normal record screen. The keystone fields in Section 4 must still be
  filled in — they cannot be recovered later without them.

---

## 4. Mandatory ("keystone") fields per record type

These fields are rejected as errors **in both import modes** if left blank. Fill these in
before anything else.

**Every record type, regardless of type:**

| Requirement | What it means |
|---|---|
| A usable record date | At least one of the record's date fields must be filled in |
| A resolvable Police Station and District | Type your actual station/district name, matching (closely) what's used in the system |
| Every child-sheet row's FIR/GD Number matches a real parent row | See Section 2.1 |

### CASE

| Sheet | Field | Column label |
|---|---|---|
| General Information | `fir_no` | **FIR Number** |
| General Information | `fir_date` | **FIR Date** |

### ARREST

| Sheet | Field | Column label |
|---|---|---|
| General Info | `linked_fir_dd_no` | **Linked FIR / DD No.** |
| General Info | `date_of_arrest` | **Date Of Arrest** |
| Person Arrested Detail | `arrested_first_name` | **Arrested Person First Name** — at least **one** row on this sheet must have a first name filled in |

### KALANDRA

Same as ARREST, except the parent-sheet keystone field is labelled **GD Number** instead of
FIR Number (Kalandra cases have no FIR — they are GD/standalone cases):

| Sheet | Field | Column label |
|---|---|---|
| General Info | `linked_fir_dd_no` | **GD Number** |
| General Info | `date_of_arrest` | **Date Of Arrest** |
| Arrested Person | `arrested_first_name` | **Arrested Person First Name** — at least one row |

### MISSING

| Sheet | Field | Column label |
|---|---|---|
| Import Template (single sheet) | `missing_name` | **Name of Missing Person** |
| Import Template | `missing_date` **or** `gd_date` | **Date Missing Since** OR **GD Date** — you only need **one** of these two, not both |

### UIDB (Unidentified Dead Body)

| Sheet | Field | Column label |
|---|---|---|
| General Info | `found_date` | **Date Body Found** |
| General Info | `found_place` | **Place Body Found** |

### PCR_CALL

PCR_CALL has no separate keystone list beyond the "every record type" rule above — a usable
call date/time and a resolvable PS/district are what's required. Fill in the rest of the
sheet as completely as you can; in new-data mode the same requiredness the on-screen form
uses still applies.

---

## 5. Investigating Officer (IO) — the "IO ID (PIS No.)" column

The IO column asks for the **PIS number** of the Investigating Officer, not their name.

- **New-data (HC) imports:** the PIS number must already belong to an IO registered at your
  station. If it doesn't, the row is rejected — either get the IO registered first and
  re-validate, or leave the row out of this import and add it later through the normal
  record screen.
- **Legacy (District Officer) imports:** if you type in a PIS number that isn't registered
  yet, the system will **automatically register** a placeholder IO record for that PIS number
  at the target station and link it to the row — you'll see a warning that it needs SHO
  verification later. You do not need to pre-register IOs for a legacy import.
- **If you leave the IO column blank in a legacy import**, the record still imports — with no
  IO attached — and you get a warning saying so. An IO can be linked later through the normal
  record screen.
- The IO column in new-data mode cannot be left blank if the field is marked required on the
  on-screen form for that record type — check the current form before assuming it's optional.

---

## 6. Beat numbers

Write **just the beat number** — for example `6`, not the full beat name or code. The system
looks for a matching beat within **your own police station** automatically. You do not need
to know or type the full beat description.

If the plain number doesn't uniquely identify a beat at your station, or your station's beat
list doesn't have that number recorded, the field is left unresolved (a warning in legacy
mode, an error in new-data mode) — in that case, check with your station's records unit for
the correct beat number.

---

## 7. Classification fields (Local Head, Major/Minor Head, Sections, Acts)

Type these largely as they normally read (e.g. "Theft", "IPC", "Sec 379"). The system will
tolerate minor differences — extra spaces, punctuation, capitalisation — and match them
automatically; when it does, you'll see a warning telling you it matched after cleaning up
the text, so you can double-check it matched the right one. Genuine free-text acts not in the
system's list are kept as typed and stored as-is (an informational note, not an error).

What the system will **never** do is guess a close-but-not-exact match (no "did you mean…"
auto-correction) — a genuinely wrong or unrecognisable value is always reported so it can be
fixed by hand, never silently substituted.

---

## 8. After you upload

1. **Validate first.** The system parses and checks your whole file without saving anything,
   and shows you every problem it found, row by row.
   - **Errors** (red) block that row (and, for CASE/ARREST/KALANDRA/UIDB, its whole family of
     child rows) from being imported until fixed.
   - **Warnings** (amber) do not block the row — it will still be imported, just with a note
     of what's missing or was auto-corrected.
2. Fix what you can in the spreadsheet and re-upload/re-validate as many times as you need —
   nothing is saved to the database at this stage.
3. **Confirm** only when you're satisfied. Confirmed imports run in the background; you can
   watch progress on the batch's page. Rows with unresolved errors at confirm time are
   skipped (not written) and still show up in the batch's error list — they never silently
   disappear.
4. See `ERROR_GLOSSARY.md` in this same folder for what every specific message means and
   exactly how to fix it.

---

## 9. Quick checklist before you upload

- [ ] Downloaded the current template (not an old saved copy)
- [ ] Only one record type in this file
- [ ] FIR/GD Number filled in on every child-sheet row, not just the General Information sheet
- [ ] No stray half-filled rows at the bottom of any sheet
- [ ] Every keystone field for this record type (Section 4) is filled in on every row
- [ ] Dates are in `dd-mm-yyyy` format
- [ ] Beat number is just the number (e.g. `6`)
- [ ] IO PIS number filled in if known (see Section 5 for what happens if it isn't)
