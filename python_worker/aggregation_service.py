"""
PHAROS Classification & Aggregation Service (Layer 1)
Centralized service for fetching, classifying, and aggregating reported and worked-out
crime counts per TAXONOMY_LOCK.md and ref.local_heads classifications.
"""

from sqlalchemy import text
from python_worker.db import engine
from python_worker.formula_library import compute_variation, compute_detection


# 7 Heinous Heads canonical codes per TAXONOMY_LOCK.md / ref.local_heads
HEINOUS_CANONICAL_CODES = {
    "DACOITY",
    "MURDER",
    "ATT_TO_MURDER",
    "ROBBERY",
    "RIOT",
    "KID_FOR_RANSOM",
    "RAPE",
}


def fetch_classified_counts(
    jurisdiction_level="HQ",
    jurisdiction_id=None,
    from_date=None,
    to_date=None,
    crime_head_selector="ALL",
    channel_filter=None,
):
    """
    Fetch and aggregate reported and worked-out counts.
    - jurisdiction_level: 'PS', 'DISTRICT', or 'HQ'
    - jurisdiction_id: hierarchy node UUID (optional for HQ)
    - from_date / to_date: 'YYYY-MM-DD' strings
    - crime_head_selector: 'ALL', 'HEINOUS', 'NON_HEINOUS', 'ACT', or specific head code
    - channel_filter: None, 'MANUAL', 'E_FIR' (E_THEFT + E_MVT), 'NCRP'
    """
    where_clauses = ["r.record_type = 'CASE'"]
    params = {}

    # Jurisdiction Filter
    if jurisdiction_level == "PS" and jurisdiction_id:
        where_clauses.append("r.ps_id = :jurisdiction_id")
        params["jurisdiction_id"] = str(jurisdiction_id)
    elif jurisdiction_level == "DISTRICT" and jurisdiction_id:
        where_clauses.append("r.district_id = :jurisdiction_id")
        params["jurisdiction_id"] = str(jurisdiction_id)

    # Date Range Filter (1b: COALESCE prioritizes registration_date per design spec, with fir_date/record_date fallback)
    if from_date:
        where_clauses.append("COALESCE(r.registration_date, f.fir_date, r.record_date) >= :from_date")
        params["from_date"] = str(from_date)
    if to_date:
        where_clauses.append("COALESCE(r.registration_date, f.fir_date, r.record_date) <= :to_date")
        params["to_date"] = str(to_date)

    # Channel Filter (4b)
    if channel_filter:
        if channel_filter.upper() == "E_FIR":
            where_clauses.append("r.source_system IN ('E_THEFT', 'E_MVT')")
        elif channel_filter.upper() == "MANUAL":
            where_clauses.append("(r.source_system = 'MANUAL' OR r.source_system IS NULL)")
        else:
            where_clauses.append("r.source_system = :channel_filter")
            params["channel_filter"] = channel_filter.upper()

    # Crime Head Filter
    if crime_head_selector and crime_head_selector.upper() != "ALL":
        sel = crime_head_selector.upper()
        if sel == "HEINOUS":
            where_clauses.append("lh.crime_category = 'HEINOUS'")
        elif sel == "NON_HEINOUS":
            where_clauses.append("lh.crime_category = 'NON_HEINOUS'")
        elif sel == "ACT":
            where_clauses.append("lh.crime_category = 'OTHER'")
        else:
            where_clauses.append("lh.canonical_code = :head_code")
            params["head_code"] = sel

    where_sql = " AND ".join(where_clauses)

    query = f"""
        SELECT
            COALESCE(lh.canonical_code, 'UNCLASSIFIED') as head_code,
            COALESCE(lh.local_head, 'Unclassified Head') as head_name,
            COALESCE(lh.crime_category, 'OTHER') as crime_category,
            COUNT(r.id) as reported_count,
            COUNT(CASE WHEN f.is_worked_out = true THEN 1 END) as worked_out_count
        FROM records r
        JOIN fir_details f ON f.record_id = r.id
        LEFT JOIN ref.local_heads lh ON lh.local_head_cd = f.local_head_id
        WHERE {where_sql}
        GROUP BY lh.canonical_code, lh.local_head, lh.crime_category
        ORDER BY lh.crime_category, lh.canonical_code
    """

    with engine.connect() as conn:
        rows = conn.execute(text(query), params).fetchall()

    results = []
    heinous_total = {"reported": 0, "worked_out": 0}
    non_heinous_total = {"reported": 0, "worked_out": 0}
    act_total = {"reported": 0, "worked_out": 0}
    grand_total = {"reported": 0, "worked_out": 0}

    for row in rows:
        head_code, head_name, cat, rep, wo = row[0], row[1], row[2], int(row[3]), int(row[4])
        det_pct = compute_detection(wo, rep)

        item = {
            "head_code": head_code,
            "head_name": head_name,
            "crime_category": cat,
            "reported_count": rep,
            "worked_out_count": wo,
            "detection_pct": det_pct,
        }
        results.append(item)

        if cat == "HEINOUS":
            heinous_total["reported"] += rep
            heinous_total["worked_out"] += wo
        elif cat == "NON_HEINOUS":
            non_heinous_total["reported"] += rep
            non_heinous_total["worked_out"] += wo
        else:
            act_total["reported"] += rep
            act_total["worked_out"] += wo

        grand_total["reported"] += rep
        grand_total["worked_out"] += wo

    return {
        "items": results,
        "subtotals": {
            "heinous": {**heinous_total, "detection_pct": compute_detection(heinous_total["worked_out"], heinous_total["reported"])},
            "non_heinous": {**non_heinous_total, "detection_pct": compute_detection(non_heinous_total["worked_out"], non_heinous_total["reported"])},
            "act": {**act_total, "detection_pct": compute_detection(act_total["worked_out"], act_total["reported"])},
            "grand_total": {**grand_total, "detection_pct": compute_detection(grand_total["worked_out"], grand_total["reported"])},
        },
    }


def fetch_channel_counts(ps_id=None, district_id=None, from_date=None, to_date=None):
    """
    Layer 1 Channel Count Aggregation for FIR Goswara Summary & Channel-Scoped reports.
    """
    where_clauses = ["r.record_type = 'CASE'"]
    params = {}

    if ps_id:
        where_clauses.append("r.ps_id = :ps_id")
        params["ps_id"] = str(ps_id)
    elif district_id:
        where_clauses.append("r.district_id = :district_id")
        params["district_id"] = str(district_id)

    if from_date:
        where_clauses.append("COALESCE(r.registration_date, f.fir_date, r.record_date) >= :from_date")
        params["from_date"] = str(from_date)
    if to_date:
        where_clauses.append("COALESCE(r.registration_date, f.fir_date, r.record_date) <= :to_date")
        params["to_date"] = str(to_date)

    where_sql = " AND ".join(where_clauses)

    query = f"""
        SELECT
            COALESCE(f.registration_type, 'MANUAL_CCTNS') as reg_type,
            f.local_head_id,
            COUNT(r.id) as count
        FROM records r
        JOIN fir_details f ON f.record_id = r.id
        WHERE {where_sql}
        GROUP BY COALESCE(f.registration_type, 'MANUAL_CCTNS'), f.local_head_id
    """

    with engine.connect() as conn:
        rows = conn.execute(text(query), params).fetchall()

    counts = {
        "MANUAL_CCTNS": 0,
        "E_THEFT": 0,
        "E_HOUSE_THEFT": 0,
        "E_BURGLARY": 0,
        "E_MVT": 0,
        "NCRP": 0,
        "ZERO_FIR": 0,
    }

    for row in rows:
        reg_type, head_id, cnt = row[0], row[1], int(row[2])
        if reg_type == "E_THEFT":
            if head_id == 17: # House Theft
                counts["E_HOUSE_THEFT"] += cnt
            elif head_id == 18: # Burglary
                counts["E_BURGLARY"] += cnt
            else:
                counts["E_THEFT"] += cnt
        elif reg_type in counts:
            counts[reg_type] += cnt
        else:
            counts["MANUAL_CCTNS"] += cnt

    return counts

