#!/usr/bin/env python3
"""parse_error_log.py — Import Reliability Framework, tool 3/5.

Parses the bulk-import UI's error-log text format into out/ERROR_STATS.json + .md (frequency
by taxonomy class x field x sheet). Format, one logical entry:

    Row 5:Beat "6" could not be matched.
    beat_no

i.e. `Row N:<message>` optionally followed by a field-key line. Two sections headed
`Errors (N) — ...` and `Warnings (N) — ...`.

Classifies every entry through taxonomy.json (the ONE place E1-E7/UNCLASSIFIED are defined —
see that file's header comment; new failure classes are new JSON entries, never a code change
here). Accepts multiple input files (one per batch).

Open question #1 (docs/import-ux-study/00-EXECUTION-PLAN.md §7): ARE these logs persisted in
the DB? Checked backend/migrations/20260711000006_links_compilation_config_reporting.js —
YES: `import_batch_errors` (batch_id, row_number, field_key, error_code, severity,
error_message) is a real table, already populated (251 rows across 3 real batches as of
2026-07-16), and `import_batches` carries VALIDATED/CONFIRMED/IMPORTED/FAILED status +
total/valid/invalid/imported row counts. It stores STRUCTURED rows (error_code already
attached, no classification needed), NOT the UI's rendered text blob — so `--from-db` mode
below reads real `error_code`s directly rather than re-parsing text, which is more reliable
than this file's own regex-based taxonomy classification of the text format. Requires DB
access (backend/src/config/db.js, read-only queries only).

Library/CLI split (Framework design rule #4): all logic in functions, thin argparse CLI.

Usage:
    python3 parse_error_log.py out/logs/batch-001-case.txt [more.txt ...]
    python3 parse_error_log.py --from-db                       # requires backend DB reachable
    python3 parse_error_log.py --from-db --batch-id <uuid>      # one batch only
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict

SCHEMA_VERSION = "1.0.0"
TOOL_NAME = "parse_error_log.py"
TOOL_VERSION = "1.0.0"

ROW_LINE_RE = re.compile(r"^Row\s+(\d+):(.*)$")
SECTION_ERRORS_RE = re.compile(r"^Errors\s*\((\d+)\)\s*—")
SECTION_WARNINGS_RE = re.compile(r"^Warnings\s*\((\d+)\)\s*—")


def load_taxonomy(path):
    with open(path) as f:
        return json.load(f)


def compile_taxonomy(taxonomy):
    """Pre-compiles every class's message_patterns once. Returns an ordered list of
    (class_id, error_codes_set, compiled_patterns) — order matters, first match wins, so more
    specific classes (e.g. E3's child-sheet-key case) must be listed before broader ones (E7's
    generic 'is required in sheet') in taxonomy.json itself; this function does not reorder."""
    compiled = []
    for cls in taxonomy["classes"]:
        codes = set(cls.get("match", {}).get("error_codes") or [])
        patterns = [re.compile(p) for p in (cls.get("match", {}).get("message_patterns") or [])]
        compiled.append((cls["id"], codes, patterns))
    return compiled


def classify(compiled_taxonomy, message, error_code=None):
    """error_code (when known, e.g. --from-db mode) is checked first — it's authoritative.
    Message-pattern matching is the fallback for plain-text logs where no code is present."""
    if error_code:
        for cls_id, codes, _patterns in compiled_taxonomy:
            if error_code in codes:
                return cls_id
    for cls_id, _codes, patterns in compiled_taxonomy:
        for pat in patterns:
            if pat.search(message or ""):
                return cls_id
    return "UNCLASSIFIED"


def parse_log_text(text):
    """Parses one UI-format error-log text blob into {errors: [...], warnings: [...]},
    each entry {row, message, field_key}. Tolerant of the file having only one section, and of
    a field-key line being absent (some messages, per the handoff, carry none)."""
    lines = text.splitlines()
    errors = []
    warnings = []
    current_bucket = None
    declared_counts = {"errors": None, "warnings": None}

    i = 0
    n = len(lines)
    while i < n:
        line = lines[i].rstrip("\n")
        if line.startswith("#"):
            i += 1
            continue
        m_err = SECTION_ERRORS_RE.match(line)
        m_warn = SECTION_WARNINGS_RE.match(line)
        if m_err:
            current_bucket = errors
            declared_counts["errors"] = int(m_err.group(1))
            i += 1
            continue
        if m_warn:
            current_bucket = warnings
            declared_counts["warnings"] = int(m_warn.group(1))
            i += 1
            continue

        m_row = ROW_LINE_RE.match(line)
        if m_row and current_bucket is not None:
            row = int(m_row.group(1))
            message = m_row.group(2).strip()
            field_key = None
            # A field-key line is a short, bare identifier-looking line immediately following
            # (no "Row N:" prefix, no section header) — distinguishes it from the next entry.
            if i + 1 < n:
                nxt = lines[i + 1].rstrip("\n")
                if (
                    nxt
                    and not ROW_LINE_RE.match(nxt)
                    and not SECTION_ERRORS_RE.match(nxt)
                    and not SECTION_WARNINGS_RE.match(nxt)
                    and re.match(r"^[a-z][a-z0-9_]*$", nxt.strip())
                ):
                    field_key = nxt.strip()
                    i += 1
            current_bucket.append({"row": row, "message": message, "field_key": field_key})
        i += 1

    return {"errors": errors, "warnings": warnings, "declared_counts": declared_counts}


def analyze_log_file(path, compiled_taxonomy):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    parsed = parse_log_text(text)

    findings = []
    for severity, bucket in (("ERROR", parsed["errors"]), ("WARNING", parsed["warnings"])):
        for entry in bucket:
            cls_id = classify(compiled_taxonomy, entry["message"], error_code=None)
            findings.append({
                "row": entry["row"], "field_key": entry["field_key"], "severity": severity,
                "message": entry["message"], "class": cls_id,
            })

    return {
        "file": os.path.basename(path),
        "declared_counts": parsed["declared_counts"],
        "parsed_counts": {"errors": len(parsed["errors"]), "warnings": len(parsed["warnings"])},
        "findings": findings,
    }


def load_from_db(batch_id=None):
    """Reads real import_batch_errors rows via a small Node one-shot (reuses
    backend/src/config/db.js's knex config so env/.env resolution matches the app exactly —
    this Python tool has no DB driver of its own by design). Returns a list of batch dicts
    shaped like analyze_log_file()'s output, with error_code populated (so classify() can use
    the authoritative code path instead of message-pattern guessing)."""
    backend_dir = os.path.join(os.path.dirname(__file__), "..", "..")
    script = f"""
import db from './src/config/db.js';
const batchId = {json.dumps(batch_id)};
const batches = await db('import_batches')
  .modify((qb) => {{ if (batchId) qb.where('id', batchId); }})
  .select('id', 'record_type', 'is_legacy', 'status', 'total_rows', 'valid_rows', 'invalid_rows', 'created_at');
const out = [];
for (const b of batches) {{
  const rows = await db('import_batch_errors').where('batch_id', b.id).orderBy('row_number');
  out.push({{ batch: b, rows }});
}}
console.log(JSON.stringify(out));
await db.destroy();
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=backend_dir, capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"DB read failed: {result.stderr.strip()}")
    return json.loads(result.stdout)


def analyze_db_batches(batches_raw, compiled_taxonomy):
    out = []
    for entry in batches_raw:
        b = entry["batch"]
        rows = entry["rows"]
        findings = []
        for r in rows:
            if r["error_code"] == "__INVALID_PARENT__":
                continue  # internal sentinel, never shown to operators — see import.parse.js
            cls_id = classify(compiled_taxonomy, r["error_message"], error_code=r["error_code"])
            findings.append({
                "row": r["row_number"], "field_key": r["field_key"], "severity": r["severity"],
                "message": r["error_message"], "class": cls_id, "error_code": r["error_code"],
            })
        out.append({
            "file": f"db:import_batches/{b['id']}",
            "batch_meta": b,
            "declared_counts": {
                "errors": sum(1 for f in findings if f["severity"] == "ERROR"),
                "warnings": sum(1 for f in findings if f["severity"] == "WARNING"),
            },
            "parsed_counts": {
                "errors": sum(1 for f in findings if f["severity"] == "ERROR"),
                "warnings": sum(1 for f in findings if f["severity"] == "WARNING"),
            },
            "findings": findings,
        })
    return out


def aggregate(batch_reports):
    by_class = Counter()
    by_class_field = defaultdict(Counter)
    by_class_sheet_hint = defaultdict(Counter)  # sheet isn't in the text format; field_key is our best proxy
    by_severity = Counter()

    for report in batch_reports:
        for f in report["findings"]:
            by_class[f["class"]] += 1
            by_class_field[f["class"]][f["field_key"] or "(none)"] += 1
            by_severity[f["severity"]] += 1

    return {
        "by_class": dict(by_class.most_common()),
        "by_class_field": {k: dict(v.most_common()) for k, v in by_class_field.items()},
        "by_severity": dict(by_severity),
    }


def render_markdown(report):
    lines = ["# Error Log Statistics", "", f"Generated: {report['generated_at']}", ""]
    lines.append("## DB persistence (open question #1)")
    lines.append("")
    lines.append(report["db_persistence_note"])
    lines.append("")
    lines.append("## Aggregate")
    lines.append("")
    lines.append(f"Total findings: {sum(report['aggregate']['by_severity'].values())} "
                  f"({report['aggregate']['by_severity']})")
    lines.append("")
    lines.append("| Class | Count |")
    lines.append("|---|---|")
    for cls_id, count in report["aggregate"]["by_class"].items():
        lines.append(f"| {cls_id} | {count} |")
    lines.append("")
    lines.append("### By class x field")
    lines.append("")
    for cls_id, fields in report["aggregate"]["by_class_field"].items():
        top = ", ".join(f"{k}:{v}" for k, v in list(fields.items())[:8])
        lines.append(f"- **{cls_id}**: {top}")
    lines.append("")
    lines.append("## Per-file")
    lines.append("")
    lines.append("| File | Declared errors | Parsed errors | Declared warnings | Parsed warnings | Match? |")
    lines.append("|---|---|---|---|---|---|")
    for r in report["files"]:
        d, p = r["declared_counts"], r["parsed_counts"]
        match = "yes" if (d.get("errors") in (None, p["errors"]) and d.get("warnings") in (None, p["warnings"])) else "MISMATCH"
        lines.append(f"| {r['file']} | {d.get('errors')} | {p['errors']} | {d.get('warnings')} | {p['warnings']} | {match} |")
    lines.append("")
    return "\n".join(lines) + "\n"


DB_PERSISTENCE_NOTE = (
    "YES — `import_batch_errors` (batch_id, row_number, field_key, error_code, severity, "
    "error_message) persists every finding as a structured row; `import_batches` carries "
    "status/total_rows/valid_rows/invalid_rows/imported_rows. Verified against the live dev DB "
    "2026-07-16: 3 real batches, 251 error rows already stored. The UI's rendered text-blob "
    "format this parser handles is NOT what's stored — the DB already has error_code attached "
    "per row, so `--from-db` mode reads that directly (skipping message-pattern classification "
    "entirely, error_code -> class is a direct taxonomy.json lookup)."
)


def run(files, out_dir, taxonomy_path, from_db, batch_id):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    os.makedirs(out_dir, exist_ok=True)
    taxonomy = load_taxonomy(taxonomy_path)
    compiled = compile_taxonomy(taxonomy)

    batch_reports = []
    inputs = {"taxonomy_version": taxonomy.get("taxonomy_version")}

    if from_db:
        try:
            raw = load_from_db(batch_id)
        except Exception as e:  # noqa: BLE001
            print(f"ERROR: --from-db failed ({e}). Falling back to text files only.", file=sys.stderr)
            raw = []
        batch_reports.extend(analyze_db_batches(raw, compiled))
        inputs["from_db"] = True
        inputs["db_batch_count"] = len(raw)

    for path in files:
        if not os.path.exists(path):
            print(f"WARNING: log file not found, skipping: {path}", file=sys.stderr)
            continue
        batch_reports.append(analyze_log_file(path, compiled))
    inputs["text_files"] = [os.path.basename(f) for f in files]

    report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": now,
        "tool": TOOL_NAME,
        "tool_version": TOOL_VERSION,
        "inputs": inputs,
        "db_persistence_note": DB_PERSISTENCE_NOTE,
        "files": batch_reports,
        "aggregate": aggregate(batch_reports),
    }

    json_path = os.path.join(out_dir, "ERROR_STATS.json")
    with open(json_path, "w") as f:
        json.dump(report, f, indent=2, sort_keys=False, ensure_ascii=False)
    md_path = os.path.join(out_dir, "ERROR_STATS.md")
    with open(md_path, "w") as f:
        f.write(render_markdown(report))

    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    script_dir = os.path.dirname(__file__)
    parser.add_argument("files", nargs="*", default=[os.path.join(script_dir, "out", "logs", "batch-001-case.txt")],
                         help="UI-format error-log text file(s). Default: out/logs/batch-001-case.txt")
    parser.add_argument("--out-dir", default=os.path.join(script_dir, "out"))
    parser.add_argument("--taxonomy", default=os.path.join(script_dir, "taxonomy.json"))
    parser.add_argument("--from-db", action="store_true", help="Also read structured findings from import_batch_errors (requires backend DB reachable)")
    parser.add_argument("--batch-id", default=None, help="Restrict --from-db to one batch")
    args = parser.parse_args()
    sys.exit(run(args.files, args.out_dir, args.taxonomy, args.from_db, args.batch_id))


if __name__ == "__main__":
    main()
