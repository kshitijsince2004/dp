#!/usr/bin/env python3
"""Stage 3 — generate config/org/hierarchy.json, config/workflow/main.json,
config/proformas/*.json, config/contracts/*.json from the stage-0 exports +
FALLBACK_TRANSITIONS + the design's IN_TRANSFER/LEGACY/AMENDMENT specials."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EXP = ROOT / "docs" / "db-audit" / "exports"
CFG = ROOT / "config"
J = lambda v: (json.loads(v) if isinstance(v, str) else v)

# ── org/hierarchy.json ───────────────────────────────────────────────────────
NODE_TYPE_MAP = {"SCP": "ZONE", "JCP": "RANGE", "SUB_DIVISION": "SUB_DIV"}
nodes = json.load(open(EXP / "hierarchy_nodes.json"))
by_id = {n["id"]: n for n in nodes}
out_nodes = []
for n in nodes:
    out_nodes.append({
        "code": n["code"],
        "name": n["name_en"],
        "node_type": NODE_TYPE_MAP.get(n["node_type"], n["node_type"]),
        "parent_code": by_id[n["parent_id"]]["code"] if n["parent_id"] else None,
        "is_active": n["is_active"],
        "metadata": J(n["metadata"]) or {},
    })
order = {"HQ": 0, "ZONE": 1, "RANGE": 2, "DISTRICT": 3, "SUB_DIV": 4, "PS": 5}
out_nodes.sort(key=lambda x: (order[x["node_type"]], x["code"]))
(CFG / "org").mkdir(parents=True, exist_ok=True)
(CFG / "org" / "hierarchy.json").write_text(json.dumps(out_nodes, indent=1, ensure_ascii=False) + "\n")
print(f"org/hierarchy.json: {len(out_nodes)} nodes "
      f"({sum(1 for x in out_nodes if x['node_type']=='PS')} PS)")

# ── workflow/main.json ───────────────────────────────────────────────────────
def t(code, frm, action, to, from_level=None, to_level=None, roles=(), comment=False,
      record_type="*", sla=None):
    return {"code": code, "record_type": record_type, "from_status": frm, "action": action,
            "to_status": to, "from_level": from_level, "to_level": to_level,
            "allowed_roles": list(roles), "requires_comment": comment, "sla_hours": sla,
            "is_active": True}

# Full ops chain (FALLBACK_TRANSITIONS + JCP/SCP chain + WTC_0x rows). The
# DISTRICT->HQ skip is NOT hardcoded here: level_data_contracts route overrides
# express it (generalized route-skip mechanism).
workflow = [
    t("draft.submit", "DRAFT", "submit", "PENDING_SHO", "PS", "PS", ["HC"], sla=24),
    t("sent_back.submit", "SENT_BACK", "submit", "PENDING_SHO", "PS", "PS", ["HC"]),
    t("pending_sho.approve", "PENDING_SHO", "approve", "DISTRICT_REVIEW", "PS", "DISTRICT", ["SHO"]),
    t("pending_sho.send_back", "PENDING_SHO", "send_back", "SENT_BACK", "PS", "PS", ["SHO"], comment=True),
    t("district.approve", "DISTRICT_REVIEW", "approve", "JCP_REVIEW", "DISTRICT", "JCP", ["DISTRICT_OFFICER"]),
    t("district.send_back", "DISTRICT_REVIEW", "send_back", "SENT_BACK", "DISTRICT", "PS", ["DISTRICT_OFFICER"], comment=True),
    t("district.compile", "DISTRICT_REVIEW", "compile", "COMPILED", "DISTRICT", "DISTRICT", ["DISTRICT_OFFICER"]),
    t("compiled.submit", "COMPILED", "submit", "JCP_REVIEW", "DISTRICT", "JCP", ["DISTRICT_OFFICER"]),
    t("jcp.approve", "JCP_REVIEW", "approve", "SCP_REVIEW", "JCP", "SCP", ["JCP"]),
    t("jcp.send_back", "JCP_REVIEW", "send_back", "DISTRICT_REVIEW", "JCP", "DISTRICT", ["JCP"], comment=True),
    t("scp.approve", "SCP_REVIEW", "approve", "HQ_RECEIVED", "SCP", "HQ", ["SCP"]),
    t("scp.send_back", "SCP_REVIEW", "send_back", "JCP_REVIEW", "SCP", "JCP", ["SCP"], comment=True),
    t("hq.seal", "HQ_RECEIVED", "seal", "ARCHIVED", "HQ", "HQ", ["HQ_ADMIN"]),
    t("hq.archive", "HQ_RECEIVED", "archive", "ARCHIVED", "HQ", "HQ", ["HQ_ADMIN", "SYSTEM_ADMIN"]),
    # transfers (§4.1): to_status '@PRIOR' = restore record_transfers.prior_status/prior_level
    t("transfer.initiate", "*", "transfer_initiate", "IN_TRANSFER", None, None, ["SHO", "DISTRICT_OFFICER"], comment=True),
    t("transfer.accept", "IN_TRANSFER", "transfer_accept", "@PRIOR", None, None, ["SHO", "DISTRICT_OFFICER"]),
    t("transfer.reject", "IN_TRANSFER", "transfer_reject", "@PRIOR", None, None, ["SHO", "DISTRICT_OFFICER"], comment=True),
    # legacy/amendment specials (§4.6)
    t("legacy.amendment_request", "LEGACY_IMPORTED", "amendment_request", "AMENDMENT_PENDING", None, None,
      ["HC", "SHO", "DISTRICT_OFFICER"], comment=True),
    t("amendment.approve", "AMENDMENT_PENDING", "amendment_approve", "LEGACY_IMPORTED", None, None,
      ["DISTRICT_OFFICER", "HQ_ADMIN"]),
    t("amendment.reject", "AMENDMENT_PENDING", "amendment_reject", "LEGACY_IMPORTED", None, None,
      ["DISTRICT_OFFICER", "HQ_ADMIN"], comment=True),
]
(CFG / "workflow").mkdir(exist_ok=True)
(CFG / "workflow" / "main.json").write_text(json.dumps(workflow, indent=1) + "\n")
print(f"workflow/main.json: {len(workflow)} transitions")

# ── proformas/*.json (one file per proforma) ─────────────────────────────────
(CFG / "proformas").mkdir(exist_ok=True)
templates = json.load(open(EXP / "report_templates.json"))
for tpl in templates:
    code = tpl["id"]  # old text ids ARE the stable codes (T_DAILY_24HR_DIARY, …)
    out = {
        "code": code,
        "name": tpl["name_en"],
        "record_types": J(tpl["applicable_record_types"]),
        "levels": J(tpl["applicable_levels"]),
        "template_definition": J(tpl["template_definition"]),
        "output_formats": J(tpl["output_formats"]),
        "template_type": "PROFORMA",
        "is_active": tpl["is_active"],
    }
    (CFG / "proformas" / f"{code.lower()}.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
print(f"proformas/: {len(templates)} files")

# ── contracts/*.json ─────────────────────────────────────────────────────────
(CFG / "contracts").mkdir(exist_ok=True)
contracts = json.load(open(EXP / "level_data_contracts.json"))
out_c = []
for c in contracts:
    out_c.append({
        "code": c["id"],
        "from_level": c["from_level"],
        "to_level": c["to_level"],
        "route": c["route"],
        "record_type": c["record_type"],
        "visible_field_keys": J(c["visible_field_keys"]),
        "aggregate_definitions": J(c["aggregate_definitions"]),
        "is_active": c["is_active"],
    })
(CFG / "contracts" / "ops_chain.json").write_text(json.dumps(out_c, indent=1, ensure_ascii=False) + "\n")
print(f"contracts/ops_chain.json: {len(out_c)} contracts")
