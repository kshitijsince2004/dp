#!/usr/bin/env python3
"""Stage 3 — transform the replayed old field_registry (git truth, 414 rows) into
config/fields/*.json with a storage mapping per field (DB_SCHEMA.md §6.1/§9.1).

Deterministic + re-runnable. Fails loudly on any field key it has no rule for.
Storage shapes (see config/README.md): {table,column} ($detail = the record's detail
table) · {per_type:{RT:shape}} · {entity:person|property|offence|location,...} ·
"extra" · "ui_only".
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "docs" / "db-audit" / "exports" / "field_registry_replay.json"
OUT = ROOT / "config" / "fields"
OUT.mkdir(parents=True, exist_ok=True)

rows = json.load(open(SRC))

J = lambda v: (json.loads(v) if isinstance(v, str) else v)

# ── 1. dropped fields (never get config rows) ────────────────────────────────
DROP = {
    # ruling 15 (fir_details column removals / derived)
    "complaint_no": "ruling 15: the complaint number IS the FIR number",
    "area_of_crime": "ruling 15: dropped as redundant",
    "modus_operandi": "ruling 15: dropped",
    "cheated_amount": "ruling 15: dropped",
    # ruling 16/19/20
    "heinous_offence": "ruling 16: derived from ref.local_heads.crime_category",
    "linked_fir_dd_no": "ruling 19: dropped — import routes into fir_no/gd_no by basis",
    "major_minor": "ruling 20: persons.is_minor is DB-generated from age",
    # superseded duplicates
    "scheme": "superseded by scheme_of_arrest (was already INACTIVE)",
    "nafis_dossier": "superseded by the split nafis_prepared + dossier_prepared",
    "arrested_age_month": "age is a single smallint; month-part dropped (was INACTIVE)",
    "accused_age_month": "same",
    "complainant_age_month": "same",
    "victim_age_month": "same",
    "occurrence_time": "replaced by occurrence_from/to_datetime (was INACTIVE)",
}

# ── 2. person-block pattern rules ────────────────────────────────────────────
PERSON_PREFIX = {
    "complainant_": ("COMPLAINANT", None),
    "accused_": ("ACCUSED", None),
    "victim_": ("VICTIM", None),
    "arrested_": ("ARRESTEE", None),
    "deceased_": ("DECEASED", None),
    "mp_": ("MISSING", None),
}
ADDR_COMPONENTS = {
    "house_no", "street", "colony", "city_town_village", "tehsil_block_mandal",
    "country", "state", "district", "police_station", "pincode", "landmark",
}
PERSON_SUFFIX = {  # suffix -> (kind, arg)
    "first_name": ("name_part", 1),
    "middle_name": ("name_part", 2),
    "last_name": ("name_part", 3),
    "nickname": ("col", "nick_names"),
    "gender": ("col", "gender"),
    "dob": ("col", "dob"),
    "age_year": ("col", "age"),
    "age": ("col", "age"),
    "mobile": ("col", "mobile"),
    "relative_name": ("col", "relative_name"),
    "relation_type": ("col", "relation_type"),
    "perm_same": ("col", "perm_same_as_present"),
    "present_address": ("loc_full", "present"),
    "perm_address": ("loc_full", "permanent"),
    "address": ("loc_full", "present"),
    "birth_year": ("extra", None),
    "npr": ("extra", None),
    "mobile_country_code": ("extra", None),
    "marital_status": ("extra", None),
    "qualification": ("extra", None),
}

def person_rule(key):
    for prefix, (role, _) in PERSON_PREFIX.items():
        if not key.startswith(prefix):
            continue
        rest = key[len(prefix):]
        perm = rest.startswith("perm_") and rest[5:] in ADDR_COMPONENTS
        comp = rest[5:] if perm else rest
        if comp in ADDR_COMPONENTS:
            return {"entity": "location", "slot": "permanent" if perm else "present",
                    "column": comp, "role": role}
        for suffix, (kind, arg) in PERSON_SUFFIX.items():
            if rest == suffix:
                if kind == "col":
                    return {"entity": "person", "role": role, "column": arg}
                if kind == "name_part":
                    return {"entity": "person", "role": role, "column": "name", "name_part": arg}
                if kind == "loc_full":
                    return {"entity": "location", "slot": arg, "column": "full_address", "role": role}
                if kind == "extra":
                    return {"entity": "person", "role": role, "extra": True}
        return None
    return None

# ── 3. explicit map ──────────────────────────────────────────────────────────
D = lambda c: {"table": "$detail", "column": c}
FIR = lambda c: {"table": "fir_details", "column": c}
ARR = lambda c: {"table": "arrest_details", "column": c}
PCR = lambda c: {"table": "pcr_call_details", "column": c}
MIS = lambda c: {"table": "missing_details", "column": c}
UID = lambda c: {"table": "uidb_details", "column": c}
IO = lambda c: {"table": "investigating_officers", "column": c}
P = lambda role, c: {"entity": "person", "role": role, "column": c}
PROP = lambda c, **kw: {"entity": "property", "column": c, **kw}
PROPX = {"entity": "property", "extra": True}
OFF = lambda c, **kw: {"entity": "offence", "column": c, **kw}
LOC = lambda slot, c, role=None: {"entity": "location", "slot": slot, "column": c, **({"role": role} if role else {})}
VEH = lambda c: {"entity": "property", "group": "vehicle", "column": c}

def desc_block(col, on_persons=False):
    """MISSING,UIDB shared description block — role differs by record type."""
    return {"per_type": {
        "MISSING": {"entity": "person", "role": "MISSING", "column": col},
        "UIDB": {"entity": "person", "role": "DECEASED", "column": col},
    }}

EXPLICIT = {
    # shared
    "gd_no": D("gd_no"),
    "status": {"per_type": {
        "CASE": {"table": "fir_details", "column": "case_status"},
        "ARREST": {"table": "arrest_details", "column": "case_status"},
        "PCR_CALL": {"table": "pcr_call_details", "column": "final_call_status"},
        "MISSING": {"table": "missing_details", "column": "missing_status"},
        "UIDB": {"table": "uidb_details", "column": "uidb_status"},
    }},
    "io_name": IO("name"), "io_rank": IO("rank"), "io_pis": IO("pis_no"), "io_mobile": IO("mobile"),
    # offence classification (CASE, ARREST, UIDB)
    "local_head": D("local_head_id"),
    "act_name": OFF("act_id"),
    "other_act_name": OFF("other_act_name", act_group="other"),
    "sections": OFF("section_id"),
    "ipc_sections": OFF("section_id", act_group="ipc"),
    "excise_sections": OFF("section_id", act_group="excise"),
    "arms_sections": OFF("section_id", act_group="arms"),
    "gambling_sections": OFF("section_id", act_group="gambling"),
    "other_sections": OFF("section_id", act_group="other"),
    "ipc_major_head": OFF("major_head_id", act_group="ipc"),
    "excise_major_head": OFF("major_head_id", act_group="excise"),
    "arms_major_head": OFF("major_head_id", act_group="arms"),
    "gambling_major_head": OFF("major_head_id", act_group="gambling"),
    "other_major_head": OFF("major_head_id", act_group="other"),
    "theft_minor_head": OFF("minor_head_id", act_group="ipc"),
    "murder_minor_head": OFF("minor_head_id", act_group="ipc"),
    "hurt_minor_head": OFF("minor_head_id", act_group="ipc"),
    "cheating_minor_head": OFF("minor_head_id", act_group="ipc"),
    "robbery_minor_head": OFF("minor_head_id", act_group="ipc"),
    "excise_minor_head": OFF("minor_head_id", act_group="excise"),
    "excise_possession_minor_head": OFF("minor_head_id", act_group="excise"),
    "excise_sale_minor_head": OFF("minor_head_id", act_group="excise"),
    "excise_smuggling_minor_head": OFF("minor_head_id", act_group="excise"),
    "arms_minor_head": OFF("minor_head_id", act_group="arms"),
    "arms_possession_minor_head": OFF("minor_head_id", act_group="arms"),
    "arms_use_minor_head": OFF("minor_head_id", act_group="arms"),
    "gambling_minor_head": OFF("minor_head_id", act_group="gambling"),
    "gambling_house_minor_head": OFF("minor_head_id", act_group="gambling"),
    "gambling_public_minor_head": OFF("minor_head_id", act_group="gambling"),
    "other_minor_head": OFF("minor_head_id", act_group="other"),
    "crime_head": OFF("major_head_id", primary=True),
    # CASE general/investigation
    "case_type": D("case_type"),
    "fir_no": D("fir_no"),
    "fir_date": D("fir_date"),
    "source_reference": FIR("source_reference"),
    "beat_no": FIR("beat_id"),
    "is_important": FIR("is_important"),
    "brief_facts": FIR("brief_facts"),
    "rc_no": FIR("rc_no"),
    "disposal_type": FIR("disposal_type"),
    "case_status": FIR("case_status"),
    "work_out": "extra",
    "transfer_to": "ui_only",
    "type_of_information": None,  # not in replay set; guard anyway
    # occurrence block
    "occurrence_time_type": "ui_only",
    "occurrence_from_date_time": FIR("occurrence_from_datetime"),
    "occurrence_to_date_time": FIR("occurrence_to_datetime"),
    "info_received_at_ps_date_time": FIR("info_received_at_ps"),
    "organised_crime": FIR("organised_crime"),
    "occurrence_place": LOC("occurrence", "full_address"),
    "occurrence_house_no": LOC("occurrence", "house_no"),
    "occurrence_street": LOC("occurrence", "street"),
    "occurrence_colony": LOC("occurrence", "colony"),
    "occurrence_landmark": LOC("occurrence", "landmark"),
    "occurrence_city_town_village": LOC("occurrence", "city_town_village"),
    "occurrence_tehsil_block_mandal": LOC("occurrence", "tehsil_block_mandal"),
    "occurrence_country": LOC("occurrence", "country"),
    "occurrence_state": LOC("occurrence", "state"),
    "occurrence_district": LOC("occurrence", "district"),
    "occurrence_police_station": LOC("occurrence", "police_station"),
    "occurrence_pincode": LOC("occurrence", "pincode"),
    "occurrence_latitude": LOC("occurrence", "latitude"),
    "occurrence_longitude": LOC("occurrence", "longitude"),
    "cd_uploaded_24h": FIR("cd_uploaded_24h"),
    "footage_collected": FIR("footage_collected"),
    # CASE flat vehicle block -> ONE property row (group vehicle)
    "vehicle_no": VEH("vehicle_no"),
    "vehicle_type": VEH("automobile_id"),
    "vehicle_make": VEH("vehicle_make"),
    "vehicle_model": VEH("vehicle_model"),
    "vehicle_color": VEH("vehicle_color"),
    "vehicle_chassis_no": VEH("vehicle_chassis_no"),
    "vehicle_engine_no": VEH("vehicle_engine_no"),
    # property repeater
    "property_major_category": PROP("major_category_id"),
    "property_minor_category": PROP("minor_category_id"),
    "property_details": PROP("details"),
    "property_stolen_recovered": PROP("status"),
    "property_phone_number": PROP("phone_number"),
    "phone_make": PROP("phone_make"),
    "phone_model": PROP("phone_model"),
    "phone_imei": PROP("phone_imei"),
    "phone_color": PROP("phone_color"),
    "phone_status": PROP("status"),
    "prop_vehicle_no": PROP("vehicle_no"),
    "prop_vehicle_type": PROP("automobile_id"),
    "prop_cctv": PROPX,
    "prop_cd_24h": PROPX,
    # the documented trap: prop_arms_made holds the SUBTYPE selection (NOT arms_made)
    "prop_arms_made": PROP("arms_subtype_id"),
    "prop_fire_arms_type": PROP("fire_arm_id"),
    "prop_arms_type": PROPX,   # redundant hardcoded pistol list; real FK is prop_fire_arms_type
    "prop_arms_make": PROPX,
    "prop_arms_serial": PROPX,
    "prop_arms_license": PROPX,
    "prop_arms_ammo_count": PROPX,
    "prop_cash_amount": PROP("estimated_value"),
    "prop_cash_currency": PROP("currency_type_id"),
    "prop_cash_denomination": PROPX,
    "prop_gold_item_type": PROP("jewelry_type_id"),
    "prop_gold_material": PROPX,
    "prop_gold_weight": PROPX,
    "prop_gold_value": PROP("estimated_value"),
    "prop_elec_device_type": PROP("electric_good_id"),
    "prop_elec_brand": PROPX,
    "prop_elec_model": PROPX,
    "prop_elec_serial": PROPX,
    "prop_elec_value": PROP("estimated_value"),
    "prop_doc_type": PROP("document_type_id"),
    "prop_doc_number": PROPX,
    "prop_doc_holder": PROPX,
    "prop_doc_issuing_auth": PROPX,
    "prop_drug_type": PROP("drug_type_id"),
    "prop_drug_quantity": PROPX,
    "prop_drug_unit": PROPX,
    "prop_drug_value": PROP("estimated_value"),
    "prop_other_desc": PROP("details"),
    "prop_other_subtype": PROP("minor_category_id"),
    "prop_other_value": PROP("estimated_value"),
    # ARREST
    "arrest_date": P("ARRESTEE", "arrest_date"),
    "arrest_place": LOC("arrest", "full_address", "ARRESTEE"),
    "arrest_street": LOC("arrest", "street", "ARRESTEE"),
    "arrest_colony": LOC("arrest", "colony", "ARRESTEE"),
    "arrest_landmark": LOC("arrest", "landmark", "ARRESTEE"),
    "arrest_district": LOC("arrest", "district", "ARRESTEE"),
    "nafis_prepared": ARR("nafis_prepared"),
    "dossier_prepared": ARR("dossier_prepared"),
    "prev_involvement": P("ARRESTEE", "prev_involvement"),
    "proclaimed_offender": P("ARRESTEE", "is_po"),
    "listed_criminal": P("ARRESTEE", "is_bc"),
    "arresting_officer": ARR("arresting_officer_name"),
    "arresting_officer_mobile": ARR("arresting_officer_mobile"),
    "other_status_reason": ARR("other_status_reason"),
    "recovery": ARR("recovery"),
    "scheme_of_arrest": ARR("scheme_of_arrest"),
    "integrated_pi": ARR("integrated_pi"),
    "group_patrolling": ARR("group_patrolling"),
    "cycle_patrolling": ARR("cycle_patrolling"),
    "by_antisnatching_team": ARR("by_antisnatching_team"),
    "by_prahari": ARR("by_prahari"),
    "by_eyes_ears_scheme_members": ARR("by_eyes_ears_scheme_members"),
    "nick_name": P("ARRESTEE", "nick_names"),
    # MISSING
    "source": MIS("source"),
    "missing_type": MIS("missing_type"),
    "operator_name": MIS("operator_name"),
    "mp_known": P("MISSING", "mp_known"),
    "missing_name": P("MISSING", "name"),
    "missing_address": LOC("present", "full_address", "MISSING"),
    "age": P("MISSING", "age"),
    "missing_date": P("MISSING", "missing_date"),
    "missing_place": LOC("missing", "full_address", "MISSING"),
    "Mental State": P("MISSING", "mental_state"),
    "physical_description": P("MISSING", "physical_description"),
    "missing_relation_type": P("MISSING", "relation_type"),
    "zipnet_no": D("zipnet_no"),
    # MISSING,UIDB shared description block (role differs by type)
    "gender": desc_block("gender"),
    "height": desc_block("height"),
    "built": desc_block("built"),
    "complexion": desc_block("complexion"),
    "face": desc_block("face"),
    "hair": desc_block("hair"),
    "beard": desc_block("beard"),
    "moustache": desc_block("moustache"),
    "upper_dress_color": desc_block("upper_dress_color"),
    "lower_dress_color": desc_block("lower_dress_color"),
    # informant / caller
    "informant_name": P("INFORMANT", "name"),
    "informant_relation": P("INFORMANT", "relation_to_subject"),
    "informant_mobile": P("INFORMANT", "mobile"),
    "caller_name": P("CALLER", "name"),
    "caller_mobile": P("CALLER", "mobile"),
    # PCR
    "call_head": PCR("call_head"),
    "call_gist": PCR("call_gist"),
    "latitude": LOC("incident", "latitude"),
    "longitude": LOC("incident", "longitude"),
    "arrival_time": PCR("arrival_time"),
    "pcr_no": PCR("pcr_no"),
    # UIDB
    "identified": UID("identified"),
    "deceased_name": P("DECEASED", "name"),
    "found_date": UID("found_date"),
    "found_time": UID("found_time"),
    "found_place": LOC("found", "full_address"),
    "found_latitude": LOC("found", "latitude"),
    "found_longitude": LOC("found", "longitude"),
    "approx_age": P("DECEASED", "age_range"),
    "description": P("DECEASED", "physical_description"),
    "identification_marks": P("DECEASED", "identification_marks"),
    "uidb_no": UID("uidb_no"),
    "cause_of_death": UID("cause_of_death"),
    # contact attributes of the record, NOT persons rows (§2.6) — override person pattern
    "deceased_relative_name": UID("deceased_relative_name"),
    "deceased_relation_type": UID("deceased_relation_type"),
    "filed_by_acp_sdm": UID("filed_by_acp_sdm"),
    "filed_by_acp_sdm_date": UID("filed_by_acp_sdm_date"),
    # UI-only helper
    "complainant_same_as_victim": "ui_only",
}

# ── 4. transform ─────────────────────────────────────────────────────────────
by_file = defaultdict(list)
dropped, legacy, unmapped = [], [], []

for r in sorted(rows, key=lambda x: (x["sort_order"] or 0, x["field_key"])):
    key = r["field_key"]
    rts = J(r["applicable_record_types"]) or []
    if key in DROP:
        dropped.append((key, DROP[key]))
        continue
    if not rts:
        legacy.append(key)  # 34 legacy flat fields — no columns, no config rows (§9.1)
        continue
    storage = EXPLICIT.get(key) or person_rule(key)
    if storage is None:
        unmapped.append(key)
        continue

    labels = {"en": r["label_en"], "hi": r["label_hi"]}
    section_labels = None
    if r.get("section_label_en") or r.get("section_label_hi"):
        section_labels = {"en": r.get("section_label_en"), "hi": r.get("section_label_hi")}
    out = {
        "field_key": key,
        "record_types": rts,
        "field_type": r["field_type"],
        "labels": labels,
        "section": r["section"],
        "section_labels": section_labels,
        "storage": storage,
        "options": J(r["options"]),
        "options_source": r["options_source"],
        "depends_on": r["depends_on"],
        "show_when": J(r["show_when"]),
        "validation_rules": J(r["validation_rules"]),
        "visible_to_levels": J(r["visible_to_levels"]) or [],
        "editable_by_levels": J(r["editable_by_levels"]) or [],
        "introduced_at_level": r["introduced_at_level"] or "PS",
        "repeater_entity": r["repeater_entity"],
        "sort_order": r["sort_order"],
        "full_width": bool(r["full_width"]),
        "readonly": bool(r["readonly"]),
        "is_active": bool(r["is_active"]),
        "scope_level": r["scope_level"] or "global",
    }
    out = {k: v for k, v in out.items() if v is not None}
    fname = rts[0].lower() if len(rts) == 1 else "common"
    by_file[fname].append(out)

if unmapped:
    print("UNMAPPED FIELD KEYS — add rules for these:", file=sys.stderr)
    for k in unmapped:
        print("  ", k, file=sys.stderr)
    sys.exit(1)

for fname, fields in sorted(by_file.items()):
    path = OUT / f"{fname}.json"
    path.write_text(json.dumps(fields, indent=1, ensure_ascii=False) + "\n")
    print(f"{path.relative_to(ROOT)}: {len(fields)} fields")

print(f"\ndropped ({len(dropped)}):")
for k, why in dropped:
    print(f"  {k}: {why}")
print(f"legacy no-home fields skipped ({len(legacy)}): {', '.join(legacy)}")
