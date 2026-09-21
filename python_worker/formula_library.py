"""
PHAROS Shared Formula Library (Layer 2)
Centralized, pure, unit-tested functions for mathematical calculations,
string formatting, taxonomy normalization, and multi-value cell rendering.
"""

import json
import math
import re
from datetime import date, datetime


# ── 3a. Variation % Calculation ─────────────────────────────────────────────
def compute_variation(current, previous, raw_float=False):
    """
    Compute percentage variation between current and previous values per spec §2.4:
    - current=0, previous=0 -> '-' (or None if raw_float)
    - current>0, previous=0 -> '+∞' (or float('inf') if raw_float)
    - otherwise -> ((current - previous) / previous) * 100
    """
    c = float(current) if current is not None else 0.0
    p = float(previous) if previous is not None else 0.0

    if p == 0.0:
        if c == 0.0:
            return None if raw_float else "-"
        return float("inf") if raw_float else "+∞"

    val = ((c - p) / p) * 100.0

    if raw_float:
        return val

    sign = "+" if val >= 0 else ""
    return f"{sign}{val:.1f}%"


# ── 3b. Detection / Solved % Calculation ────────────────────────────────────
def compute_detection(solved, reported, raw_float=False):
    """
    Compute detection percentage per spec §2.4:
    - reported=0 -> '-' (or None if raw_float)
    - otherwise -> (solved / reported) * 100
    """
    s = float(solved) if solved is not None else 0.0
    r = float(reported) if reported is not None else 0.0

    if r == 0.0:
        return None if raw_float else "-"

    val = (s / r) * 100.0

    if raw_float:
        return val

    return f"{val:.1f}%"


# ── 3c. Person Display ──────────────────────────────────────────────────────
def person_display(person, options=None):
    """
    Format person details:
    {Name} "@" {Alias1 / Alias2}, [{Age},] {S/O|W/O|D/O|C/O} {Parent/Relative} R/O {Address}
    - Uses " / " as the explicit standard separator for multiple aliases.
    - Type-safe nick_names parsing: supports native Python list, JSON string, or comma-separated string.
    """
    if not person:
        return ""

    opts = options or {}
    include_age = opts.get("include_age", False)

    # Name
    name = (person.get("name") or "").strip()

    # Alias / Nicknames handling (2a & 2b)
    raw_aliases = person.get("nick_names") or person.get("alias") or person.get("nickname") or []
    aliases = []

    if isinstance(raw_aliases, list):
        aliases = [str(a).strip() for a in raw_aliases if a and str(a).strip()]
    elif isinstance(raw_aliases, str):
        s = raw_aliases.strip()
        if s.startswith("[") and s.endswith("]"):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    aliases = [str(a).strip() for a in parsed if a and str(a).strip()]
                else:
                    aliases = [str(parsed).strip()]
            except Exception:
                aliases = [a.strip() for a in s.split(",") if a.strip()]
        else:
            aliases = [a.strip() for a in s.split(",") if a.strip()]

    alias_str = ""
    if aliases:
        clean_aliases = [a for a in aliases if a and a.lower() not in name.lower()]
        if clean_aliases:
            alias_str = " @" + " / ".join(clean_aliases)

    name_segment = name + alias_str

    # Age
    age = person.get("age")
    head_parts = [name_segment] if name_segment else []
    if include_age and age:
        head_parts.append(str(age).strip())
    head_str = ", ".join(head_parts)

    # Relation & Parent
    parent = (person.get("relative_name") or person.get("father_husband_name") or person.get("parent_name") or "").strip()
    rel_type = person.get("relation_type") or person.get("relationship") or ""
    gender = (person.get("gender") or "").strip().lower()

    rel_label = "S/O"
    if rel_type:
        rt_lower = str(rel_type).strip().lower()
        if rt_lower in ("husband", "w/o", "wife"):
            rel_label = "W/O"
        elif rt_lower in ("father", "mother", "d/o", "daughter"):
            rel_label = "D/O" if gender == "female" else "S/O"
        elif rt_lower in ("c/o", "guardian"):
            rel_label = "C/O"
    else:
        if gender == "female":
            rel_label = "D/O"

    rel_str = f"{rel_label} {parent}" if parent else ""

    # Address
    loc = person.get("location") or person.get("address")
    addr_mode = opts.get("address_mode", "full")
    addr_str = address_compile(loc, mode=addr_mode)
    ro_str = f"R/O {addr_str}" if addr_str else ""

    body_str = " ".join([p for p in [rel_str, ro_str] if p])

    if head_str and body_str:
        return f"{head_str}, {body_str}"
    return head_str or body_str


# ── 3d. Address Compilation ─────────────────────────────────────────────────
def address_compile(location, mode="full"):
    """
    Compile address from location dict or string.
    - mode='full': Prefers present_* address fields over plain fields when both exist, appending tehsil and landmark.
    - mode='present_only': Strictly presents present_* fields.
    """
    if not location:
        return ""
    if isinstance(location, str):
        return location.strip()

    parts = []
    if mode == "present_only":
        keys = [
            "present_house_no", "present_street", "present_colony", "present_village_city",
            "present_state", "present_district", "present_pin_code"
        ]
        for k in keys:
            val = location.get(k)
            if val and str(val).strip() and str(val).strip() not in parts:
                parts.append(str(val).strip())
        if not parts and location.get("present_address"):
            return str(location.get("present_address")).strip()
    else:
        # Full mode preference rule (2c):
        # Prefers present_* when set to avoid duplicating/conflicting house/street values, fallback to plain
        field_pairs = [
            ("present_house_no", "house_no"),
            ("present_street", "street"),
            ("present_colony", "colony"),
            ("present_village_city", "village_city"),
            ("tehsil", None),
            ("landmark", None),
            ("present_district", "district"),
            ("present_state", "state"),
            ("present_pin_code", "pin_code"),
        ]
        for pref_key, alt_key in field_pairs:
            val = location.get(pref_key)
            if not (val and str(val).strip()) and alt_key:
                val = location.get(alt_key)
            if val and str(val).strip() and str(val).strip() not in parts:
                parts.append(str(val).strip())

        if not parts and location.get("full_address"):
            return str(location.get("full_address")).strip()

    return ", ".join(parts)


# ── 3e. IO Display ──────────────────────────────────────────────────────────
def io_display(officer):
    """
    Format IO details: 'Rank, Name, PIS No.'
    Accepts officer dict or string.
    """
    if not officer:
        return ""
    if isinstance(officer, str):
        return officer.strip()

    name = officer.get("name") or officer.get("io_name") or ""
    rank = officer.get("rank") or officer.get("io_rank") or ""
    pis = officer.get("pis_no") or officer.get("io_pis") or officer.get("duty_officer") or ""

    parts = [str(p).strip() for p in [rank, name, pis] if p and str(p).strip()]
    return ", ".join(parts)


# ── 3f. Custody Status Display (Normalized) ─────────────────────────────────
def custody_status_display(value):
    """
    Normalized display for arrest_details.custody_status per TAXONOMY_LOCK.md:
    Collapses 'Notice u/s 35(1) BNSS' to 'Notice 35(1) BNSS'.
    """
    if not value:
        return ""

    val = str(value).strip()
    val_clean = re.sub(r"\s+", " ", val)

    if re.search(r"notice\s+(u/s\s+)?35\(1\)\s*bnss", val_clean, re.IGNORECASE):
        return "Notice 35(1) BNSS"
    if val_clean.upper() in ("J/C", "JC"):
        return "J/C"
    if val_clean.upper() in ("P/C", "PC"):
        return "P/C"
    if val_clean.lower() == "bail":
        return "Bail"

    return val_clean


# ── 3g. Missing & UIDB Status Display (Normalized) ───────────────────────────
def missing_status_display(value):
    """Normalized missing_status: upper-case fold ('Traced' -> 'TRACED')."""
    if not value:
        return ""
    s = str(value).strip().upper()
    return s


def uidb_status_display(value):
    """Normalized uidb_status: upper-case fold ('Unidentified' -> 'UNIDENTIFIED')."""
    if not value:
        return ""
    s = str(value).strip().upper()
    return s


# ── 3h. Accused History (PI/PO/BC) ──────────────────────────────────────────
def accused_history(arrestee):
    """
    Derive accused criminal history (PI / PO / BC) in fixed order, '/'-joined:
    - PI: prev_involvement is truthy or prev_involvement_count > 0
    - PO: is_po or proclaimed_offender is truthy
    - BC: is_bc or bad_character is truthy
    """
    if not arrestee:
        return ""

    if isinstance(arrestee, (bool, int, str)):
        return "PI" if arrestee else ""

    d = arrestee
    extra = d.get("extra") if isinstance(d.get("extra"), dict) else {}
    pi_count = d.get("prev_involvement_count") or d.get("prev_involvement_no_of_cases") or extra.get("prev_involvement_count") or extra.get("prev_involvement_no_of_cases") or 0
    pi_flag = bool(
        d.get("prev_involvement") or d.get("previous_involvement") or d.get("pi_flag") or
        extra.get("prev_involvement") or extra.get("previous_involvement") or extra.get("pi_flag") or
        (int(pi_count) > 0 if str(pi_count).isdigit() else False)
    )
    po_flag = bool(
        d.get("is_po") or d.get("proclaimed_offender") or d.get("po_flag") or
        extra.get("is_po") or extra.get("proclaimed_offender") or extra.get("po_flag")
    )
    bc_flag = bool(
        d.get("is_bc") or d.get("bad_character") or d.get("bc_flag") or d.get("listed_criminal") or d.get("whether_accused_is_bc_or_not") or
        extra.get("is_bc") or extra.get("bad_character") or extra.get("bc_flag") or extra.get("listed_criminal") or extra.get("whether_accused_is_bc_or_not")
    )

    parts = []
    if pi_flag:
        parts.append("PI")
    if po_flag:
        parts.append("PO")
    if bc_flag:
        parts.append("BC")

    return "/".join(parts)


# ── 3i. Recovery Display ────────────────────────────────────────────────────
def recovery_display(arrest_or_props):
    """
    Format property recovery details:
    'Property category, property type, property description, property value' comma-joined per item.
    Supports list of property items or single free-text recovery string.
    """
    if not arrest_or_props:
        return ""

    props = arrest_or_props
    if isinstance(props, dict):
        if "recovery" in props and isinstance(props["recovery"], str):
            props = props["recovery"]
        elif "record_properties" in props:
            props = props["record_properties"]
        else:
            props = [props]

    if isinstance(props, str):
        return props.strip()

    if isinstance(props, list):
        items = []
        for p in props:
            if isinstance(p, dict):
                cat = p.get("major_category") or p.get("category") or ""
                ptype = p.get("minor_category") or p.get("type") or ""
                desc = p.get("description") or ""
                val = p.get("estimated_value") or p.get("value") or ""
                row_parts = [str(x).strip() for x in [cat, ptype, desc, val] if x and str(x).strip()]
                if row_parts:
                    items.append(", ".join(row_parts))
            elif isinstance(p, str) and p.strip():
                items.append(p.strip())

        return multi_value_cell(items)

    return ""


# ── 3j. Scheme of Arrest Display ────────────────────────────────────────────
def scheme_of_arrest_display(arrest):
    """Format Scheme of Arrest value."""
    if not arrest:
        return ""

    if isinstance(arrest, str):
        return arrest.strip()

    dropdown = arrest.get("scheme_of_arrest") or arrest.get("arrest_scheme")
    if dropdown and str(dropdown).strip():
        return str(dropdown).strip()

    # Legacy flags fallback
    flags = []
    if arrest.get("integrated_pi"):
        flags.append("Integrated Picket")
    if arrest.get("group_patrolling"):
        flags.append("Foot Patrolling")
    if arrest.get("cycle_patrolling"):
        flags.append("Cycle Patrolling")
    if arrest.get("by_antisnatching_team"):
        flags.append("Anti-Snatching Team")
    if arrest.get("by_prahari"):
        flags.append("Prahari")
    if arrest.get("by_eyes_ears_scheme_members"):
        flags.append("Eyes & Ears Informer")

    return ", ".join(flags)


# ── 3k. Record Date Resolution ──────────────────────────────────────────────
def record_date_for(record):
    """Return canonical date for report-period filtering."""
    if not record:
        return None

    if isinstance(record, (date, datetime)):
        return record

    reg_date = record.get("registration_date") or record.get("fir_date") or record.get("gd_date") or record.get("occurrence_date")
    if not reg_date:
        return None

    if isinstance(reg_date, datetime):
        return reg_date.date()
    if isinstance(reg_date, date):
        return reg_date

    # ISO parse
    s = str(reg_date).split("T")[0]
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))

    return None


# ── 3l. Body Description Display ────────────────────────────────────────────
def body_description(person_desc):
    """Comma-join non-empty physical description fields."""
    if not person_desc:
        return ""
    if isinstance(person_desc, str):
        return person_desc.strip()

    keys = [
        "height", "built", "complexion", "face", "hair", "moustache", "beard",
        "upper_dress", "upper_dress_color", "lower_dress", "lower_dress_color",
        "identification_marks"
    ]
    parts = []
    for k in keys:
        v = person_desc.get(k)
        if v and str(v).strip() and str(v).strip() not in parts:
            parts.append(str(v).strip())

    return ", ".join(parts)


# ── 3m. Multi-Value Cell Formatting ─────────────────────────────────────────
def multi_value_cell(items, render_fn=None):
    """
    Format list of items into numbered lines for multi-value Excel cells:
    1) Item 1
    2) Item 2
    """
    if not items:
        return ""

    if isinstance(items, str):
        return items.strip()

    rendered = []
    for item in items:
        if render_fn and callable(render_fn):
            val = render_fn(item)
        else:
            val = str(item)
        if val and str(val).strip():
            rendered.append(str(val).strip())

    if not rendered:
        return ""

    if len(rendered) == 1:
        return rendered[0]

    return "\n".join(f"{idx + 1}) {r}" for idx, r in enumerate(rendered))
