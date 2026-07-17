#!/usr/bin/env python3
"""extract_samples.py — Import Reliability Framework, tool 1/5.

For every .xlsx in the corpus directory (operator-filled bulk-import templates), emits one
JSON file per sheet under out/extracted/<slug>.json, capturing every cell AS TYPED (raw excel
type + number format + ISO/serial for dates), and appends an entry to corpus.manifest.json
(sha256-deduped, so re-running over a growing directory of files is idempotent and additive).

Mirrors how the real pipeline (backend/src/modules/import/import.parse.js) locates headers:
row 1 = hidden field_key row, row 2 = section, row 3 = label, row 4 = hint/instruction row,
data starts at row 5 — OR a flattened export (row 1 = section, row 2 = label, data at row 3).
We don't need to resolve field_registry keys here (that's the real pipeline's job) — we only
need to reproduce ENOUGH of its header-detection heuristic that analyze_behaviour.py can align
columns across files whose header layout differs. See buildColumnMap()/HINT_ROW_PATTERNS in
import.parse.js for the authoritative version this mirrors.

Library/CLI split (Framework design rule #4): all logic in functions, thin argparse CLI at the
bottom, so a future backend "recoverability advisor" endpoint can import extract_one_file()
directly.

Usage:
    python3 extract_samples.py [--input-dir "../../sample files"] [--out-dir out]
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import sys

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl is required (pip install openpyxl)", file=sys.stderr)
    sys.exit(1)

SCHEMA_VERSION = "1.0.0"
TOOL_NAME = "extract_samples.py"
TOOL_VERSION = "1.0.0"

SCAN_ROWS = 6  # how many leading rows we scan when guessing header layout (matches import.parse.js)

# Same instruction/hint-row detector as import.parse.js's HINT_ROW_PATTERNS, so a hint row
# (template row 4) is never mistaken for a data row.
HINT_ROW_PATTERNS = re.compile(
    r"^(\[required\]|select:|date \(|time \(|number$|boolean$|text$|textarea$|file$|checkbox$"
    r"|e\.g\.|must match|yyyy|hh:mm|\d+-digit|first name$|middle name$|last name$|nickname"
    r"|age in years|min age$|max age$|full residential|house number$|street name$|colony name$"
    r"|village\/city$|tehsil$|police station$|incident narrative|npr number$|father's or)",
    re.IGNORECASE,
)

RECORD_TYPE_PREFIXES = ["ARREST", "CASE", "MISSING", "UIDB", "PCR_CALL", "KALANDRA"]

# PS-hint extraction: filenames look like
#   "ARREST_Import_Template with validation PS BK Road.xlsx"
#   "CASE_Import_Template with validation T.Road.xlsx"
#   "UIDB_Import_Template PS North Avenue..xlsx"
# after stripping the record-type prefix, the generic "_Import_Template"/"with validation"
# boilerplate, and any "(n)"/trailing-dots disambiguator, whatever text remains is the PS hint.
_STRIP_PATTERNS = [
    re.compile(r"_Import_Template", re.IGNORECASE),
    re.compile(r"\bwith\s+validation\b", re.IGNORECASE),
    re.compile(r"\(\d+\)"),
    re.compile(r"\.xlsx$", re.IGNORECASE),
]


def infer_record_type(filename):
    upper = filename.upper()
    for prefix in RECORD_TYPE_PREFIXES:
        if upper.startswith(prefix):
            return prefix
    return None


def infer_ps_hint(filename, record_type):
    s = filename
    if record_type and s.upper().startswith(record_type):
        s = s[len(record_type):]
    for pat in _STRIP_PATTERNS:
        s = pat.sub("", s)
    s = s.strip(" ._-")
    # A lone "PS" with nothing after it, or empty, is not a hint.
    if not s or s.upper() == "PS":
        return None
    return s


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _norm_label(s):
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def cell_repr(cell):
    """Capture a cell AS TYPED: raw value, excel data_type, number_format, and (for dates)
    both the raw serial-ish repr and an ISO string — so analyze_behaviour.py can tell a real
    Excel date apart from a typed string that merely looks like one."""
    v = cell.value
    excel_type = cell.data_type  # openpyxl: 'n','s','d','b','f', etc.
    number_format = cell.number_format

    out = {"value": None, "excel_type": excel_type, "number_format": number_format}

    if v is None:
        return out

    if isinstance(v, (datetime.datetime, datetime.date)):
        out["value"] = v.isoformat()
        out["is_date_typed"] = True
        out["iso"] = v.isoformat()
    elif isinstance(v, bool):
        out["value"] = v
    elif isinstance(v, (int, float)):
        out["value"] = v
    else:
        out["value"] = str(v)

    return out


def read_row_display(grid, row_idx, max_col):
    """String-ish display values for header-row scoring (mirrors import.parse.js's readRow:
    richText/text objects collapsed to plain strings, everything trimmed). `grid` is a list of
    row-tuples of Cell objects already read sequentially via ws.iter_rows() — NEVER random
    .cell(row=, column=) access, which is O(n) per call on a read_only worksheet and turns a
    500-row sheet into an O(n^2) crawl (measured: >30s on a single sheet before this fix)."""
    if row_idx is None or row_idx < 1 or row_idx > len(grid):
        return [""] * max_col
    row = grid[row_idx - 1]
    vals = []
    for c in range(max_col):
        v = row[c].value if c < len(row) else None
        vals.append("" if v is None else str(v).strip())
    return vals


def looks_like_hint_row(values):
    non_empty = [v for v in values if v and str(v).strip()]
    if not non_empty:
        return False
    hint_count = sum(1 for v in non_empty if HINT_ROW_PATTERNS.search(str(v).strip()))
    return hint_count >= max(2, -(-len(non_empty) * 4 // 10))  # ceil(len*0.4)


def detect_header_layout(grid, max_col):
    """Best-effort header-row detection without field_registry access (extract_samples.py has
    no DB dependency — it only mirrors the SHAPE of import.parse.js's buildColumnMap, not its
    registry-key matching, since we don't have field_registry rows to match against here).
    Heuristic: the row with the most short, code-like, no-space tokens is the key row; the row
    below/near it with the most Title-Case multi-word tokens is the label row. Falls back to the
    frozen template's known layout (key=1, section=2, label=3, hint=4, data=5) when scoring is
    inconclusive, since that's the layout every sample file in this corpus actually uses.
    """
    rows_vals = {r: read_row_display(grid, r, max_col) for r in range(1, SCAN_ROWS + 1)}

    def is_key_like(v):
        return bool(v) and re.match(r"^[a-z][a-z0-9_]*$", v) is not None

    def is_label_like(v):
        return bool(v) and bool(re.search(r"[A-Z]", v)) and " " in v

    key_row, key_hits = None, 0
    label_row, label_hits = None, 0
    for r in range(1, SCAN_ROWS + 1):
        vals = rows_vals[r]
        kh = sum(1 for v in vals if is_key_like(v))
        lh = sum(1 for v in vals if is_label_like(v))
        if kh > key_hits:
            key_hits, key_row = kh, r
        if lh > label_hits:
            label_hits, label_row = lh, r

    if key_hits < 2:
        key_row = None
    if label_hits < 2:
        label_row = None
    if key_row and label_row == key_row:
        label_row = None

    # Fallback to the known frozen layout when scoring is inconclusive.
    if key_row is None and label_row is None:
        key_row, label_row = 1, 3

    header_bottom = max(key_row or 0, label_row or 0, 1)
    data_start_row = header_bottom + 1
    candidate = rows_vals.get(data_start_row) or read_row_display(grid, data_start_row, max_col)
    if looks_like_hint_row(candidate):
        data_start_row += 1

    return {
        "key_row": key_row,
        "label_row": label_row,
        "data_start_row": data_start_row,
    }


def extract_sheet(ws):
    max_col = ws.max_column or 0
    max_row = ws.max_row or 0

    # Single sequential read of the whole sheet (fast, even in read_only mode) — everything
    # below indexes into this in-memory grid, never back into the worksheet.
    grid = list(ws.iter_rows(min_row=1, max_row=max_row, max_col=max_col))

    layout = detect_header_layout(grid, max_col)

    key_vals = read_row_display(grid, layout["key_row"], max_col) if layout["key_row"] else [""] * max_col
    label_vals = read_row_display(grid, layout["label_row"], max_col) if layout["label_row"] else [""] * max_col

    headers = []
    for c in range(max_col):
        key = key_vals[c] if c < len(key_vals) else ""
        label = label_vals[c] if c < len(label_vals) else ""
        headers.append({"col": c + 1, "field_key": key or None, "label": label or None})

    def col_label(c_idx):
        """Best header label to key cells by: prefer the field_key (row 1), else the visible
        label — matches how analyze_behaviour.py will want to align columns across files."""
        h = headers[c_idx - 1]
        return h["field_key"] or h["label"] or f"col_{c_idx}"

    rows = []
    for r in range(layout["data_start_row"], max_row + 1):
        row_tuple = grid[r - 1] if r - 1 < len(grid) else ()
        row_is_empty = True
        cells = {}
        for c in range(1, max_col + 1):
            cell = row_tuple[c - 1] if c - 1 < len(row_tuple) else None
            if cell is not None and cell.value not in (None, ""):
                row_is_empty = False
            rep = cell_repr(cell) if cell is not None else {"value": None, "excel_type": None, "number_format": None}
            cells[col_label(c)] = rep
        if row_is_empty:
            continue
        rows.append({"row_number": r, "cells": cells})

    return {
        "name": ws.title,
        "max_row": max_row,
        "max_col": max_col,
        "header_layout": layout,
        "headers": headers,
        "data_row_count": len(rows),
        "rows": rows,
    }


# Sheets matching this are the template's dropdown SOURCE lists (e.g. "_Lookups"), not operator
# data — they hold every ref.* option value (often 10,000+ rows) and are identical noise across
# every file of a record type. Skipping them is a correctness call, not just a perf one: nothing
# in analyze_behaviour.py's spec (fill rates, value shapes, header drift, ghost rows, child-key
# omission) is about the dropdown source lists themselves.
LOOKUP_SHEET_PATTERN = re.compile(r"^_?lookups?$", re.IGNORECASE)


def extract_one_file(path):
    """Extracts one workbook. Returns (extraction_dict, manifest_entry_dict) or raises."""
    wb = openpyxl.load_workbook(path, data_only=False, read_only=True)
    sheets = []
    skipped_sheets = []
    for ws in wb.worksheets:
        if LOOKUP_SHEET_PATTERN.match((ws.title or "").strip()):
            skipped_sheets.append(ws.title)
            continue
        sheets.append(extract_sheet(ws))

    filename = os.path.basename(path)
    record_type = infer_record_type(filename)
    ps_hint = infer_ps_hint(filename, record_type)
    digest = sha256_of(path)

    extraction = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": None,  # filled by caller so every file in one run shares one timestamp
        "tool": TOOL_NAME,
        "tool_version": TOOL_VERSION,
        "inputs": {"file": filename},
        "filename": filename,
        "record_type": record_type,
        "ps_hint": ps_hint,
        "sha256": digest,
        "sheets": sheets,
    }

    manifest_entry = {
        "id": digest[:16],
        "path": path,
        "filename": filename,
        "sha256": digest,
        "record_type": record_type,
        "ps_hint": ps_hint,
        "sheets": [s["name"] for s in sheets],
        "data_row_counts": {s["name"]: s["data_row_count"] for s in sheets},
    }

    return extraction, manifest_entry


def slugify(filename):
    base = re.sub(r"\.xlsx$", "", filename, flags=re.IGNORECASE)
    slug = re.sub(r"[^A-Za-z0-9]+", "_", base).strip("_").lower()
    return slug or "file"


def load_manifest(path):
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": None,
        "tool": TOOL_NAME,
        "tool_version": TOOL_VERSION,
        "inputs": {},
        "source": "operator-pilot-2026-07",
        "files": [],
    }


def load_corpus_manifest(path):
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": None,
        "tool": TOOL_NAME,
        "tool_version": TOOL_VERSION,
        "inputs": {},
        "corpus_version": 1,
        "entries": [],
    }


def run(input_dir, out_dir, corpus_manifest_path):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    extracted_dir = os.path.join(out_dir, "extracted")
    os.makedirs(extracted_dir, exist_ok=True)

    manifest_path = os.path.join(out_dir, "samples_manifest.json")
    manifest = load_manifest(manifest_path)
    existing_by_sha = {e["sha256"]: e for e in manifest["files"]}

    corpus_manifest = load_corpus_manifest(corpus_manifest_path)
    corpus_by_sha = {e["sha256"]: e for e in corpus_manifest["entries"]}

    if not os.path.isdir(input_dir):
        print(f"ERROR: input dir not found: {input_dir}", file=sys.stderr)
        return 1

    xlsx_files = sorted(
        f for f in os.listdir(input_dir)
        if f.lower().endswith(".xlsx") and not f.startswith("~$")
    )

    processed, skipped = 0, []
    for filename in xlsx_files:
        path = os.path.join(input_dir, filename)
        try:
            extraction, manifest_entry = extract_one_file(path)
        except Exception as e:  # noqa: BLE001 - never crash the batch on one bad file
            print(f"WARNING: skipping unreadable file '{filename}': {e}", file=sys.stderr)
            skipped.append({"filename": filename, "reason": str(e)})
            continue

        extraction["generated_at"] = now
        manifest_entry["added_at"] = existing_by_sha.get(manifest_entry["sha256"], {}).get(
            "added_at", now
        )
        manifest_entry["source"] = "operator-pilot-2026-07"

        # sha256[:10] suffix guarantees uniqueness even when two distinct filenames collapse to
        # the same slug (observed live in this corpus: "... (2).xlsx" and "...(2).xlsx" both
        # slugify to "..._2" — without the suffix the second file's extraction silently
        # overwrote the first's on disk).
        slug = slugify(filename)
        out_path = os.path.join(extracted_dir, f"{slug}__{extraction['sha256'][:10]}.json")
        with open(out_path, "w") as f:
            json.dump(extraction, f, indent=2, sort_keys=False, ensure_ascii=False)

        existing_by_sha[manifest_entry["sha256"]] = manifest_entry
        processed += 1

        # Growable corpus registry entry (Framework design rule #3) — the thin, permanent
        # {id, path, sha256, record_type, ps_hint, added_at, source} record every downstream
        # tool (analyze_behaviour.py, probe-ref-match.mjs, replay-corpus.mjs) takes as its input
        # list. sha256-keyed so re-running over a directory that already has files in it is a
        # no-op for those, and appending a NEW file (future operator batch) is additive only.
        prior = corpus_by_sha.get(manifest_entry["sha256"])
        corpus_by_sha[manifest_entry["sha256"]] = {
            "id": manifest_entry["id"],
            "path": os.path.abspath(path),
            "sha256": manifest_entry["sha256"],
            "record_type": manifest_entry["record_type"],
            "ps_hint": manifest_entry["ps_hint"],
            "added_at": prior["added_at"] if prior else now,
            "source": "operator-pilot-2026-07",
        }

    manifest["generated_at"] = now
    manifest["inputs"] = {"input_dir": os.path.abspath(input_dir)}
    # Deterministic ordering: sort by filename.
    manifest["files"] = sorted(existing_by_sha.values(), key=lambda e: e["filename"])
    manifest["skipped"] = skipped
    manifest["counts"] = {
        "total_seen": len(xlsx_files),
        "extracted": processed,
        "skipped": len(skipped),
        "registered_total": len(manifest["files"]),
    }

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, sort_keys=False, ensure_ascii=False)

    corpus_manifest["generated_at"] = now
    corpus_manifest["inputs"] = {"input_dir": os.path.abspath(input_dir)}
    corpus_manifest["entries"] = sorted(corpus_by_sha.values(), key=lambda e: e["path"])
    with open(corpus_manifest_path, "w") as f:
        json.dump(corpus_manifest, f, indent=2, sort_keys=False, ensure_ascii=False)

    print(f"Extracted {processed}/{len(xlsx_files)} files ({len(skipped)} skipped).")
    print(f"Manifest: {manifest_path} ({len(manifest['files'])} files registered total)")
    print(f"Corpus registry: {corpus_manifest_path} ({len(corpus_manifest['entries'])} entries total)")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    default_input = os.path.join(os.path.dirname(__file__), "..", "..", "..", "sample files")
    default_out = os.path.join(os.path.dirname(__file__), "out")
    default_corpus_manifest = os.path.join(os.path.dirname(__file__), "corpus.manifest.json")
    parser.add_argument("--input-dir", default=default_input, help="Directory of .xlsx files (default: repo-root 'sample files')")
    parser.add_argument("--out-dir", default=default_out, help="Output directory (default: ./out next to this script)")
    parser.add_argument("--corpus-manifest", default=default_corpus_manifest, help="Path to the permanent corpus registry (default: ./corpus.manifest.json next to this script)")
    args = parser.parse_args()
    sys.exit(run(args.input_dir, args.out_dir, args.corpus_manifest))


if __name__ == "__main__":
    main()
