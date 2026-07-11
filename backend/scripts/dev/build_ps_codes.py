#!/usr/bin/env python3
"""Derive config/org/ps_codes.json + rebuild the SUB_DIV layer of config/org/hierarchy.json
from the OFFICIAL district/SDPO/PS code list (scratch/Untitled.xlsx).

Decisions (recorded in docs/db-audit/HANDOFF.md):
- The old tree's sub-division layer was generic/fictional ("Anand Parbat Sub-Division");
  the official file carries the real SDPO structure → official sub-divisions REPLACE the
  old layer; matched PS are reparented onto them; old sub-divs left with no PS are dropped.
- Existing PS keep their mnemonic codes (stable keys); official numeric codes go to
  metadata.official_code and to ps_codes.json ({official ps_cd: hierarchy code}).
- PS name matching: token-sorted normalization, then containment, then difflib fuzzy
  (handles Prasad/Parshad, Tughlak/Tuglak, Jafrabad/Jaffrabad …), then explicit overrides.
  Unmatched official PS are inserted (Cyber PS, IITF, Kartavya Path … are genuinely new).

Rebuilds hierarchy.json from docs/db-audit/exports/hierarchy_nodes.json each run —
deterministic, safe to re-run.
"""
import difflib
import json
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[3]
EXPORT = ROOT / "docs" / "db-audit" / "exports" / "hierarchy_nodes.json"
XLSX = ROOT / "config" / "ref-data" / "PS_Codes.xlsx"  # canonical copy (scratch/Untitled.xlsx is gitignored)
HIER_OUT = ROOT / "config" / "org" / "hierarchy.json"
CODES_OUT = ROOT / "config" / "org" / "ps_codes.json"

NODE_TYPE_MAP = {"SCP": "ZONE", "JCP": "RANGE", "SUB_DIVISION": "SUB_DIV"}
DIST_ID_MAP = {
    "CENTRAL": "DIST_CD", "DWARKA": "DIST_DW", "EAST": "DIST_ED", "NEW DELHI": "DIST_NDD",
    "NORTH": "DIST_ND", "NORTH EAST": "DIST_NED", "NORTH WEST": "DIST_NWD",
    "OUTER DISTRICT": "DIST_OD", "OUTER NORTH": "DIST_OND", "ROHINI": "DIST_RND",
    "SHAHDARA": "DIST_SHD", "SOUTH": "DIST_SD", "SOUTH WEST": "DIST_SWD",
    "SOUTH-EAST": "DIST_SED", "WEST": "DIST_WD",
    "CRIME BRANCH": "DIST_CRIMEBRANCH", "EOW": "DIST_EOW", "IGI AIRPORT": "DIST_IGIAIRPORT",
    "METRO": "DIST_METRO", "RAILWAYS": "DIST_RAILWAYS", "SPECIAL CELL": "DIST_SPECIALCELL",
    "SPECIAL POLICE UNIT FOR WOMEN & CHILDREN": "DIST_SPUWAC", "VIGILANCE": "DIST_VIGILANCE",
}
PS_OVERRIDES = {  # official-file name (normalized) -> existing hierarchy code
    "kmpur": "PS_SD_KOTLAMUBARAKPUR",
    "hazaratnizamuddin": "PS_SED_HNDIN",
}

def norm(s):
    if not s:
        return ""
    v = re.sub(r"^ps\s+", "", str(s).lower())
    v = re.sub(r"[^a-z0-9]", "", v)
    # abbreviation aliases so official long forms hit the old short names
    v = v.replace("industrial", "ind").replace("indl", "ind")
    v = v.replace("swaroop", "swarup").replace("mandawli", "mandawali")
    v = re.sub(r"fazalpur$", "", v)
    return v
def tsort(s):
    return "".join(sorted(re.findall(r"[a-z0-9]+", re.sub(r"^ps\s+", "", str(s).lower()))))
title = lambda s: re.sub(r"\b\w", lambda m: m.group().upper(), str(s).lower())

# ── 1. baseline hierarchy from the pre-wipe export ───────────────────────────
exp = json.load(open(EXPORT))
by_old_id = {n["id"]: n for n in exp}
nodes = {}
for n in exp:
    nodes[n["code"]] = {
        "code": n["code"], "name": n["name_en"],
        "node_type": NODE_TYPE_MAP.get(n["node_type"], n["node_type"]),
        "parent_code": by_old_id[n["parent_id"]]["code"] if n["parent_id"] else None,
        "is_active": n["is_active"],
        "metadata": (json.loads(n["metadata"]) if isinstance(n["metadata"], str) else n["metadata"]) or {},
    }

old_ps = [v for v in nodes.values() if v["node_type"] == "PS"]
old_subdiv_of = {p["code"]: p["parent_code"] for p in old_ps}
dist_of_old_subdiv = {v["code"]: v["parent_code"] for v in nodes.values() if v["node_type"] == "SUB_DIV"}

# ── 2. official file ─────────────────────────────────────────────────────────
wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
rows = []
for r in list(wb["Dist_SDPO_PS_CD"].iter_rows(values_only=True))[1:]:
    if not r[3] or not r[5]:
        continue
    rows.append({"dist": str(r[1]).strip(), "subdiv": str(r[2] or "HQ").strip(),
                 "ps": str(r[3]).strip(), "dist_code": str(int(r[4])), "ps_code": str(int(r[5]))})

# ── 3. match / insert ────────────────────────────────────────────────────────
ps_codes, claimed = {}, {}
stats = {"matched": 0, "fuzzy": 0, "inserted_ps": 0, "inserted_dist": 0}

def match_ps(row, district_code):
    pn, pt = norm(row["ps"]), tsort(row["ps"])
    if pn in PS_OVERRIDES:
        return nodes.get(PS_OVERRIDES[pn]), "override"
    in_dist, anywhere = [], []
    for p in old_ps:
        same_dist = dist_of_old_subdiv.get(old_subdiv_of[p["code"]]) == district_code
        (in_dist if same_dist else anywhere).append(p)
    # official "CYBER POLICE STATION <district>" = the old generic "PS Cyber Crime" of that district
    if pn.startswith("cyber"):
        cyber = [p for p in in_dist if norm(p["name"]).startswith("cyber")]
        if len(cyber) == 1:
            return cyber[0], "exact"
    for pool in (in_dist, anywhere):
        exact = [p for p in pool if norm(p["name"]) == pn or tsort(p["name"]) == pt]
        if exact:
            return exact[0], "exact"
    for pool in (in_dist, anywhere):
        contain = [p for p in pool if pn in norm(p["name"]) or norm(p["name"]) in pn]
        if len(contain) == 1:
            return contain[0], "exact"
    for pool in (in_dist, anywhere):
        cand = {norm(p["name"]): p for p in pool}
        close = difflib.get_close_matches(pn, cand.keys(), n=1, cutoff=0.84)
        if close:
            return cand[close[0]], "fuzzy"
    return None, None

for row in rows:
    dist_code = DIST_ID_MAP.get(row["dist"])
    if not dist_code:
        raise SystemExit(f"UNMATCHED district: {row['dist']!r} — extend DIST_ID_MAP")
    if dist_code not in nodes:
        nodes[dist_code] = {"code": dist_code, "name": title(row["dist"]), "node_type": "DISTRICT",
                            "parent_code": "HQ", "is_active": True,
                            "metadata": {"official_code": row["dist_code"]}}
        stats["inserted_dist"] += 1
    nodes[dist_code]["metadata"]["official_code"] = row["dist_code"]

    # official sub-division (REPLACES the old fictional layer)
    sd_code = f"SUBDIV_{row['dist_code']}_{norm(row['subdiv']).upper()[:20]}"
    if sd_code not in nodes:
        nodes[sd_code] = {"code": sd_code, "name": f"{title(row['subdiv'])} Sub-Division",
                          "node_type": "SUB_DIV", "parent_code": dist_code,
                          "is_active": True, "metadata": {}}

    node, how = match_ps(row, dist_code)
    if node is not None and node["code"] in claimed:
        node, how = None, None  # already claimed by another official PS -> treat as new
    if node is None:
        code = f"PS_{row['dist_code']}_{norm(row['ps']).upper()[:20]}"
        node = {"code": code, "name": f"PS {title(row['ps'])}", "node_type": "PS",
                "is_active": True, "metadata": {}}
        nodes[code] = node
        stats["inserted_ps"] += 1
    else:
        stats["fuzzy" if how == "fuzzy" else "matched"] += 1
    node["parent_code"] = sd_code           # reparent onto the official sub-division
    node["metadata"]["official_code"] = row["ps_code"]
    claimed[node["code"]] = row["ps_code"]
    ps_codes[row["ps_code"]] = node["code"]

# ── 4. drop old sub-divs that no longer have any PS ──────────────────────────
used_parents = {v["parent_code"] for v in nodes.values() if v["node_type"] == "PS"}
dropped = [c for c, v in nodes.items() if v["node_type"] == "SUB_DIV" and c not in used_parents]
for c in dropped:
    del nodes[c]

unmatched_old = [v["name"] for v in nodes.values() if v["node_type"] == "PS" and v["code"] not in claimed]

order = {"HQ": 0, "ZONE": 1, "RANGE": 2, "DISTRICT": 3, "SUB_DIV": 4, "PS": 5}
out = sorted(nodes.values(), key=lambda x: (order[x["node_type"]], x["code"]))
HIER_OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
CODES_OUT.write_text(json.dumps(dict(sorted(ps_codes.items())), indent=1) + "\n")

from collections import Counter
print(f"official PS rows: {len(rows)} → matched {stats['matched']} (+{stats['fuzzy']} fuzzy), "
      f"inserted {stats['inserted_ps']} PS, {stats['inserted_dist']} districts; "
      f"dropped {len(dropped)} empty old sub-divs")
print("node counts:", dict(Counter(v["node_type"] for v in out)))
print(f"ps_codes.json: {len(ps_codes)} entries")
print(f"old PS not in official file (kept, no official code): {len(unmatched_old)}")
for n in sorted(unmatched_old):
    print("   ", n)
