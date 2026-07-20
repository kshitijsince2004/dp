#!/usr/bin/env python3
"""analyze_behaviour.py — Import Reliability Framework, tool 2/5.

Consumes out/extracted/*.json (extract_samples.py's output) + corpus.manifest.json (the
growable file list — NOT a hardcoded glob, so future operator batches just get picked up) +
backend/scripts/template-baseline.manifest.json (the frozen template's own column layout).

Emits out/OPERATOR_BEHAVIOUR.json (machine) + out/OPERATOR_BEHAVIOUR.md (human, rendered FROM
the JSON — never hand-assembled), per record type x sheet x column:
  - fill rate (non-blank / total rows)
  - value-shape histogram (date-like patterns, integer/text, FIR-no shape, phone-like,
    enum-membership against the template's own dropdown list + top offending values)
  - header drift vs template-baseline.manifest.json (missing / extra columns)
  - ghost-row census (rows with <=2 non-blank cells — measures E4)
  - child-sheet parent-key omission rate (measures E3)

Library/CLI split (Framework design rule #4): all logic in functions, thin argparse CLI at the
bottom.

Usage:
    python3 analyze_behaviour.py [--out-dir out] [--baseline ../template-baseline.manifest.json]
"""
import argparse
import datetime
import json
import os
import re
import sys
from collections import Counter, defaultdict

SCHEMA_VERSION = "1.0.0"
TOOL_NAME = "analyze_behaviour.py"
TOOL_VERSION = "1.0.0"

# Mirrors backend/src/modules/import/import.parse.js's SHEET_ALIASES + PARENT_KEY_FIELD — the
# parent/child sheet-role structure the real pipeline uses to link child rows back to their
# parent (see readWorkbook()/buildParentKeyIndex()). Kept here as a small hand-synced constant
# (not imported from the JS — this is Python analysis tooling) rather than re-deriving it from
# import-key-bridge.config.js, which bridges FIELD KEYS, not sheet roles. If the real pipeline's
# SHEET_ALIASES changes, update this table to match.
SHEET_ALIASES = {
    "CASE": {
        "parent": ["General Information", "General Info", "General"],
        "victim": ["Victim Information", "Victim Detail", "Victim Details"],
        "act": ["Act and Sections", "Acts and Sections", "Act & Sections"],
        "accused": ["Accused Detail", "Accused Details", "Accused Information"],
        "property": ["Property Details", "Property Detail"],
    },
    "ARREST": {
        "parent": ["General Info", "General Information", "General", "Arrest Details", "Arrest Detail"],
        "act": ["Act and Sections", "Acts and Sections", "Act & Sections"],
        "person": ["Person Arrested Detail", "Arrested Person Detail", "Arrested Person", "Person Detail", "Person Arrested Details"],
        "property": ["Property Details", "Property Detail"],
    },
    "UIDB": {
        "parent": ["General Info", "General Information", "Import Template", "General"],
        "act": ["Act and Sections", "Acts and Sections", "Act & Sections"],
    },
    "MISSING": {
        "parent": ["Import Template", "General Info", "General Information", "General"],
    },
}

PARENT_KEY_FIELD = {"CASE": "fir_no", "ARREST": "linked_fir_dd_no", "KALANDRA": "linked_fir_dd_no", "UIDB": "gd_no"}

# Columns whose values are FIR/GD/DD reference numbers get the finer fir-no shape breakdown
# (e.g. "123/2025" vs "0123" vs bare "123") called out explicitly in the handoff spec.
FIR_LIKE_KEYS = {"fir_no", "linked_fir_dd_no", "gd_no", "complainant_no"}

PHONE_LIKE_KEYS_HINT = re.compile(r"mobile|phone|contact", re.IGNORECASE)

GHOST_ROW_MAX_NONBLANK = 2

# Columns backed by a ref.* lookup (or investigating_officers) at write/validate time — probe-
# ref-match.mjs's whole input contract is "distinct operator-typed values for these columns",
# read from THIS report rather than re-reading out/extracted/*.json itself (one source of
# truth per pipeline stage). Every distinct value (not just dropdown deviations) is captured
# for these keys specifically, since a probe needs the FULL set to test recoverability, not
# just the ones that already look wrong.
REF_BACKED_KEYS = {
    "beat_number", "beat_no", "io_pis", "district", "police_station",
    "local_head", "crime_head", "major_head", "minor_head", "sections", "act",
    "arrested_district", "arrested_perm_district", "arrested_police_station",
    "arrested_perm_police_station", "accused_district", "accused_perm_district",
    "accused_police_station", "accused_perm_police_station", "victim_district",
    "complainant_district", "complainant_perm_district", "occurrence_district",
    "occurrence_police_station",
}


def _norm_label(s):
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def find_sheet_role(sheet_names_in_file, record_type):
    """Maps each sheet actually present in a file to its role (parent/victim/act/...) using the
    same tolerant match SHEET_ALIASES logic import.parse.js's findWorksheet uses: exact
    case-insensitive match first, then substring either direction."""
    aliases = SHEET_ALIASES.get(record_type, {})
    role_by_sheet = {}
    for sheet_name in sheet_names_in_file:
        n = _norm_label(sheet_name)
        matched_role = None
        for role, candidates in aliases.items():
            normed = [_norm_label(c) for c in candidates]
            if n in normed:
                matched_role = role
                break
        if not matched_role:
            for role, candidates in aliases.items():
                normed = [_norm_label(c) for c in candidates]
                if any(n and c and (n in c or c in n) for c in normed):
                    matched_role = role
                    break
        role_by_sheet[sheet_name] = matched_role or "unknown"
    return role_by_sheet


def is_blank(cell):
    if cell is None:
        return True
    v = cell.get("value")
    return v is None or (isinstance(v, str) and v.strip() == "")


_RE_BARE_INT = re.compile(r"^\d+$")
_RE_ZERO_PADDED = re.compile(r"^0\d+$")
_RE_SEQ_YEAR = re.compile(r"^\d{1,6}\s*/\s*\d{2,4}$")
_RE_PHONE10 = re.compile(r"^\d{10}$")
_RE_PHONE_CC = re.compile(r"^\+?\d{1,3}[\s-]?\d{10}$")
_RE_DATE_DMY = re.compile(r"^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}$")
_RE_TIME = re.compile(r"^\d{1,2}:\d{2}(:\d{2})?$")


def classify_value_shape(cell, field_key):
    """One shape bucket per value — mirrors the handoff's requested categories: date-like
    patterns actually typed (dd/mm/yyyy vs dd.mm.yy vs real Excel date), integer, text, FIR-no
    patterns, phone-like, generic numeric."""
    if is_blank(cell):
        return "blank"
    if cell.get("is_date_typed"):
        return "date_excel_typed"

    v = cell.get("value")
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, (int, float)):
        if PHONE_LIKE_KEYS_HINT.search(field_key or "") and _RE_PHONE10.match(str(int(v)) if float(v).is_integer() else str(v)):
            return "numeric_phone_like"
        if isinstance(v, float) and not float(v).is_integer():
            return "float"
        return "integer_typed"

    s = str(v).strip()
    if _RE_PHONE_CC.match(s):
        return "phone_like_with_country_code"
    if _RE_PHONE10.match(s):
        return "phone_like_bare10"
    if _RE_TIME.match(s):
        return "time_like_string"
    if _RE_DATE_DMY.match(s):
        return "date_like_string"
    if _RE_SEQ_YEAR.match(s):
        return "seq_slash_year_string"
    if _RE_ZERO_PADDED.match(s):
        return "zero_padded_number_string"
    if _RE_BARE_INT.match(s):
        return "bare_integer_string"
    return "text"


def classify_fir_shape(raw_value):
    """Finer breakdown for FIR/GD/DD-reference columns specifically (E3/E2 diagnostic)."""
    if raw_value is None:
        return "blank"
    s = str(raw_value).strip()
    if not s:
        return "blank"
    if _RE_SEQ_YEAR.match(s):
        return "seq_slash_year"  # e.g. 123/2025 — canonical shape
    if _RE_ZERO_PADDED.match(s):
        return "zero_padded"  # e.g. 0123
    if _RE_BARE_INT.match(s):
        return "bare_number"  # e.g. 123, no year
    return "other_free_text"  # e.g. "E-80055331/26, Dt. 08/07/26"


def parse_dropdown_options(validation):
    """Extracts the flat option list from a template-baseline.manifest.json column's
    `validation: {type: 'list', formulae: ['"A,B,C"']}` entry, or None if not a dropdown."""
    if not validation or validation.get("type") != "list":
        return None
    formulae = validation.get("formulae") or []
    options = []
    for f in formulae:
        s = str(f).strip()
        if s.startswith('"') and s.endswith('"'):
            s = s[1:-1]
        # Named-range formulae (e.g. "OPT_ACTS_LIST") aren't inline lists — skip, can't validate.
        if "," not in s and not s:
            continue
        if "," in s:
            options.extend(p.strip() for p in s.split(",") if p.strip())
    return options or None


def load_extracted(extracted_dir, corpus_manifest):
    """Loads every extraction JSON referenced by the corpus manifest (not a raw directory glob
    — the manifest is the one growable input list every downstream tool shares, Framework
    design rule #3). Falls back to a directory glob with a warning if an entry's file is
    missing from out/extracted (e.g. extract_samples.py hasn't been (re-)run yet)."""
    by_sha = {}
    for f in os.listdir(extracted_dir):
        if not f.endswith(".json"):
            continue
        with open(os.path.join(extracted_dir, f)) as fh:
            data = json.load(fh)
        by_sha[data.get("sha256")] = data

    ordered = []
    missing = []
    for entry in corpus_manifest.get("entries", []):
        data = by_sha.get(entry["sha256"])
        if data is None:
            missing.append(os.path.basename(entry.get("path", entry["sha256"])))
            continue
        ordered.append(data)
    return ordered, missing


def analyze(extractions, baseline):
    by_type = defaultdict(list)
    for ext in extractions:
        rt = ext.get("record_type")
        if rt:
            by_type[rt].append(ext)

    result = {}
    for record_type, files in sorted(by_type.items()):
        sheet_agg = defaultdict(lambda: {
            "role": None,
            "files_seen": 0,
            "total_rows": 0,
            "columns": defaultdict(lambda: {
                "non_blank": 0, "total": 0, "shapes": Counter(), "fir_shapes": Counter(),
                "dropdown_options": None, "dropdown_deviations": Counter(), "ref_values": Counter(),
            }),
            "present_keys": set(),
        })
        ghost_rows = []
        ghost_total_rows = 0
        child_key_omission = defaultdict(lambda: {"parent_key_field": None, "rows_with_other_data": 0, "rows_with_blank_key": 0, "examples": []})

        for ext in files:
            sheet_names = [s["name"] for s in ext["sheets"]]
            role_map = find_sheet_role(sheet_names, record_type)

            for sheet in ext["sheets"]:
                sname = sheet["name"]
                role = role_map.get(sname, "unknown")
                agg = sheet_agg[sname]
                agg["role"] = role
                agg["files_seen"] += 1
                agg["total_rows"] += sheet["data_row_count"]
                for h in sheet["headers"]:
                    key = h["field_key"] or h["label"]
                    if key:
                        agg["present_keys"].add(key)

                baseline_cols = {}
                if baseline and record_type in baseline and sname in baseline[record_type]:
                    for c in baseline[record_type][sname]["columns"]:
                        if c["key"]:  # spacer/merged-address columns carry key: null — not a real field
                            baseline_cols[c["key"]] = c

                parent_key_field = PARENT_KEY_FIELD.get(record_type)
                is_child_sheet = role not in ("parent", "unknown") and parent_key_field

                for row in sheet["rows"]:
                    cells = row["cells"]
                    non_blank_keys = [k for k, c in cells.items() if not is_blank(c)]
                    ghost_total_rows += 1
                    if len(non_blank_keys) <= GHOST_ROW_MAX_NONBLANK:
                        ghost_rows.append({
                            "file": ext["filename"], "sheet": sname, "row_number": row["row_number"],
                            "non_blank_cells": non_blank_keys,
                        })

                    for key, cell in cells.items():
                        col = agg["columns"][key]
                        col["total"] += 1
                        if not is_blank(cell):
                            col["non_blank"] += 1
                        shape = classify_value_shape(cell, key)
                        col["shapes"][shape] += 1
                        if key in FIR_LIKE_KEYS:
                            col["fir_shapes"][classify_fir_shape(cell.get("value"))] += 1
                        if key in REF_BACKED_KEYS and not is_blank(cell):
                            col["ref_values"][str(cell.get("value")).strip()] += 1
                        if key in baseline_cols and col["dropdown_options"] is None:
                            opts = parse_dropdown_options(baseline_cols[key].get("validation"))
                            if opts:
                                col["dropdown_options"] = opts
                        if col["dropdown_options"] and not is_blank(cell):
                            v = str(cell.get("value")).strip()
                            if v.lower() not in {o.lower() for o in col["dropdown_options"]}:
                                col["dropdown_deviations"][v] += 1

                    # Child-sheet parent-key omission (E3): a row has OTHER data but the
                    # parent-key column itself is blank.
                    if is_child_sheet:
                        key_cell = cells.get(parent_key_field)
                        has_other_data = any(k != parent_key_field and not is_blank(c) for k, c in cells.items())
                        if has_other_data:
                            entry = child_key_omission[sname]
                            entry["parent_key_field"] = parent_key_field
                            entry["rows_with_other_data"] += 1
                            if is_blank(key_cell):
                                entry["rows_with_blank_key"] += 1
                                if len(entry["examples"]) < 5:
                                    entry["examples"].append({"file": ext["filename"], "row_number": row["row_number"]})

        # Header drift vs baseline (sheet-level, comparing key SETS).
        sheets_out = {}
        for sname, agg in sheet_agg.items():
            baseline_keys = set()
            if baseline and record_type in baseline and sname in baseline[record_type]:
                baseline_keys = {c["key"] for c in baseline[record_type][sname]["columns"] if c["key"]}
            present_keys = agg["present_keys"]
            missing_cols = sorted(baseline_keys - present_keys) if baseline_keys else []
            extra_cols = sorted(present_keys - baseline_keys) if baseline_keys else []

            columns_out = {}
            for key, col in agg["columns"].items():
                fill_rate = round(col["non_blank"] / col["total"], 4) if col["total"] else 0.0
                entry = {
                    "fill_rate": fill_rate,
                    "non_blank": col["non_blank"],
                    "total": col["total"],
                    "value_shapes": dict(col["shapes"].most_common()),
                }
                if col["fir_shapes"]:
                    entry["fir_no_shape_breakdown"] = dict(col["fir_shapes"].most_common())
                if col["dropdown_options"] is not None:
                    entry["dropdown"] = {
                        "options": col["dropdown_options"],
                        "deviation_count": sum(col["dropdown_deviations"].values()),
                        "top_offending_values": [
                            {"value": v, "count": c} for v, c in col["dropdown_deviations"].most_common(10)
                        ],
                    }
                if key in REF_BACKED_KEYS and col["ref_values"]:
                    entry["distinct_values"] = [
                        {"value": v, "count": c} for v, c in col["ref_values"].most_common()
                    ]
                columns_out[key] = entry

            sheets_out[sname] = {
                "role": agg["role"],
                "files_seen": agg["files_seen"],
                "total_rows": agg["total_rows"],
                "header_drift": {
                    "baseline_columns": sorted(baseline_keys),
                    "present_columns": sorted(present_keys),
                    "missing": missing_cols,
                    "extra": extra_cols,
                } if baseline_keys else {"baseline_columns": [], "present_columns": sorted(present_keys), "missing": [], "extra": [], "note": "no baseline entry for this sheet/record_type"},
                "columns": dict(sorted(columns_out.items())),
            }

        result[record_type] = {
            "file_count": len(files),
            "sheets": dict(sorted(sheets_out.items())),
            "ghost_row_census": {
                "total_rows_scanned": ghost_total_rows,
                "ghost_row_count": len(ghost_rows),
                "rate": round(len(ghost_rows) / ghost_total_rows, 4) if ghost_total_rows else 0.0,
                "examples": ghost_rows[:20],
            },
            "child_key_omission": {
                sname: {
                    "parent_key_field": v["parent_key_field"],
                    "rows_with_other_data": v["rows_with_other_data"],
                    "rows_with_blank_key": v["rows_with_blank_key"],
                    "omission_rate": round(v["rows_with_blank_key"] / v["rows_with_other_data"], 4) if v["rows_with_other_data"] else 0.0,
                    "examples": v["examples"],
                }
                for sname, v in sorted(child_key_omission.items())
            },
        }

    return result


def render_markdown(report):
    lines = [f"# Operator Behaviour Report", "", f"Generated: {report['generated_at']}", ""]
    for record_type, rt_data in report["record_types"].items():
        lines.append(f"## {record_type} ({rt_data['file_count']} files)")
        lines.append("")
        ghost = rt_data["ghost_row_census"]
        lines.append(f"**Ghost-row census**: {ghost['ghost_row_count']} / {ghost['total_rows_scanned']} rows "
                      f"(<= {GHOST_ROW_MAX_NONBLANK} non-blank cells) — rate {ghost['rate']:.2%}")
        lines.append("")
        if rt_data["child_key_omission"]:
            lines.append("**Child-sheet parent-key omission**:")
            lines.append("")
            lines.append("| Sheet | Parent key | Rows w/ other data | Blank key | Omission rate |")
            lines.append("|---|---|---|---|---|")
            for sname, v in rt_data["child_key_omission"].items():
                lines.append(f"| {sname} | {v['parent_key_field']} | {v['rows_with_other_data']} | {v['rows_with_blank_key']} | {v['omission_rate']:.2%} |")
            lines.append("")
        for sname, sheet in rt_data["sheets"].items():
            lines.append(f"### {sname} (`{sheet['role']}`) — {sheet['total_rows']} rows across {sheet['files_seen']} files")
            drift = sheet["header_drift"]
            if drift.get("missing") or drift.get("extra"):
                lines.append(f"- Header drift: missing={drift['missing']}, extra={drift['extra']}")
            elif drift.get("note"):
                lines.append(f"- Header drift: {drift['note']}")
            else:
                lines.append("- Header drift: none")
            lines.append("")
            lines.append("| Column | Fill rate | Top value shapes | Dropdown deviations |")
            lines.append("|---|---|---|---|")
            for key, col in sheet["columns"].items():
                top_shapes = ", ".join(f"{k}:{v}" for k, v in list(col["value_shapes"].items())[:3])
                dd = ""
                if "dropdown" in col:
                    dd = f"{col['dropdown']['deviation_count']} off-list"
                lines.append(f"| {key} | {col['fill_rate']:.2%} | {top_shapes} | {dd} |")
            lines.append("")
    return "\n".join(lines) + "\n"


def run(out_dir, baseline_path, corpus_manifest_path):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    extracted_dir = os.path.join(out_dir, "extracted")

    with open(corpus_manifest_path) as f:
        corpus_manifest = json.load(f)

    extractions, missing = load_extracted(extracted_dir, corpus_manifest)
    if missing:
        print(f"WARNING: {len(missing)} corpus entries have no extraction on disk (run extract_samples.py first): {missing}", file=sys.stderr)

    baseline = None
    if os.path.exists(baseline_path):
        with open(baseline_path) as f:
            baseline = json.load(f)
    else:
        print(f"WARNING: baseline manifest not found at {baseline_path} — header-drift will be empty", file=sys.stderr)

    record_types = analyze(extractions, baseline)

    report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": now,
        "tool": TOOL_NAME,
        "tool_version": TOOL_VERSION,
        "inputs": {
            "extracted_dir": os.path.abspath(extracted_dir),
            "corpus_manifest": os.path.abspath(corpus_manifest_path),
            "baseline": os.path.abspath(baseline_path) if baseline else None,
            "file_count": len(extractions),
        },
        "record_types": record_types,
    }

    json_path = os.path.join(out_dir, "OPERATOR_BEHAVIOUR.json")
    with open(json_path, "w") as f:
        json.dump(report, f, indent=2, sort_keys=False, ensure_ascii=False)

    md_path = os.path.join(out_dir, "OPERATOR_BEHAVIOUR.md")
    with open(md_path, "w") as f:
        f.write(render_markdown(report))

    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    script_dir = os.path.dirname(__file__)
    parser.add_argument("--out-dir", default=os.path.join(script_dir, "out"))
    parser.add_argument("--baseline", default=os.path.join(script_dir, "..", "template-baseline.manifest.json"))
    parser.add_argument("--corpus-manifest", default=os.path.join(script_dir, "corpus.manifest.json"))
    args = parser.parse_args()
    sys.exit(run(args.out_dir, args.baseline, args.corpus_manifest))


if __name__ == "__main__":
    main()
