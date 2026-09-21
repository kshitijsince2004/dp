"""
PHAROS Golden Dataset Seeding Script (Phase 2)
Seeds a comprehensive, deterministic, idempotent golden dataset for report engine correctness testing.
All records tagged with source_reference = 'GOLDEN_DATASET_PHAROS_V1'.
"""

import sys
import uuid
from datetime import date, datetime, timezone
sys.path.insert(0, ".")

from python_worker.db import engine
from sqlalchemy import text

# Safe deterministic namespace for golden dataset UUIDs
GOLDEN_NS = uuid.UUID("a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6")

def generate_golden_uuid(name):
    return str(uuid.uuid5(GOLDEN_NS, name))

def seed_golden_dataset():
    print("[GoldenDataset] Seeding Phase 2 Golden Dataset...")
    
    with engine.connect() as conn:
        ps_row1 = conn.execute(text("SELECT id, parent_id FROM hierarchy_nodes WHERE node_type = 'PS' ORDER BY id LIMIT 1")).fetchone()
        ps_row2 = conn.execute(text("SELECT id, parent_id FROM hierarchy_nodes WHERE node_type = 'PS' ORDER BY id DESC LIMIT 1")).fetchone()
        user_row = conn.execute(text("SELECT id FROM users LIMIT 1")).fetchone()

    ps_id_1 = str(ps_row1.id)
    district_id_1 = str(ps_row1.parent_id)
    ps_id_2 = str(ps_row2.id)
    district_id_2 = str(ps_row2.parent_id)
    user_id = str(user_row.id)

    records_to_insert = []
    fir_details_to_insert = []
    persons_to_insert = []
    arrests_to_insert = []
    missing_to_insert = []
    uidb_to_insert = []

    # 1. 7 Heinous Heads (Dacoity=1, Murder=2, Att Murder=3, Robbery=4, Riot=5, Kid Ransom=6, Rape=7)
    heinous_heads = [
        ("murder", 2, "MURDER", "2029-09-10"),
        ("att_to_murder", 3, "ATT_TO_MURDER", "2029-09-11"),
        ("dacoity", 1, "DACOITY", "2029-09-12"),
        ("robbery", 4, "ROBBERY", "2029-09-13"),
        ("rape", 7, "RAPE", "2029-09-14"),
        ("riot", 5, "RIOT", "2029-09-15"),
        ("kid_for_ransom", 6, "KID_FOR_RANSOM", "2029-09-16"),
    ]

    for name_key, head_cd, canon_code, fir_d in heinous_heads:
        rec_id = generate_golden_uuid(f"case-heinous-{name_key}")
        records_to_insert.append({
            "id": rec_id,
            "record_type": "CASE",
            "ps_id": ps_id_1,
            "district_id": district_id_1,
            "current_status": "SUBMITTED",
            "current_level": "PS",
            "record_date": fir_d,
            "registration_date": fir_d,
            "created_by": user_id,
            "source_system": "MANUAL",
        })
        fir_details_to_insert.append({
            "record_id": rec_id,
            "ps_id": ps_id_1,
            "fir_no": f"GOLDEN-{head_cd:03d}-2029",
            "fir_year": 2029,
            "fir_date": fir_d,
            "is_worked_out": True if head_cd % 2 == 0 else False,
            "local_head_id": head_cd,
            "source_reference": "GOLDEN_DATASET_PHAROS_V1",
        })

    # 2. BNS 111 & BNS 113
    bns_heads = [
        ("bns_111", 216, "2029-09-17"),
        ("bns_113", 217, "2029-09-18"),
    ]
    for name_key, head_cd, fir_d in bns_heads:
        rec_id = generate_golden_uuid(f"case-{name_key}")
        records_to_insert.append({
            "id": rec_id,
            "record_type": "CASE",
            "ps_id": ps_id_1,
            "district_id": district_id_1,
            "current_status": "SUBMITTED",
            "current_level": "PS",
            "record_date": fir_d,
            "registration_date": fir_d,
            "created_by": user_id,
            "source_system": "MANUAL",
        })
        fir_details_to_insert.append({
            "record_id": rec_id,
            "ps_id": ps_id_1,
            "fir_no": f"GOLDEN-{head_cd:03d}-2029",
            "fir_year": 2029,
            "fir_date": fir_d,
            "is_worked_out": False,
            "local_head_id": head_cd,
            "source_reference": "GOLDEN_DATASET_PHAROS_V1",
        })

    # 3. Non-Heinous & Act heads
    other_heads = [
        ("burglary", 12, "2029-09-19"),
        ("other_act", 73, "2029-09-20"),
        ("extortion", 8, "2029-09-27"),
    ]
    for name_key, head_cd, fir_d in other_heads:
        rec_id = generate_golden_uuid(f"case-{name_key}")
        records_to_insert.append({
            "id": rec_id,
            "record_type": "CASE",
            "ps_id": ps_id_2,
            "district_id": district_id_2,
            "current_status": "SUBMITTED",
            "current_level": "PS",
            "record_date": fir_d,
            "registration_date": fir_d,
            "created_by": user_id,
            "source_system": "MANUAL",
        })
        fir_details_to_insert.append({
            "record_id": rec_id,
            "ps_id": ps_id_2,
            "fir_no": f"GOLDEN-{head_cd:03d}-2029",
            "fir_year": 2029,
            "fir_date": fir_d,
            "is_worked_out": True,
            "local_head_id": head_cd,
            "source_reference": "GOLDEN_DATASET_PHAROS_V1",
        })

    # 4. Fallback Tiers (Tier 2: registration_date NULL; Tier 3: reg & fir NULL)
    rec_id_t2 = generate_golden_uuid("case-tier2-fallback")
    records_to_insert.append({
        "id": rec_id_t2,
        "record_type": "CASE",
        "ps_id": ps_id_1,
        "district_id": district_id_1,
        "current_status": "SUBMITTED",
        "current_level": "PS",
        "record_date": "2025-01-01",
        "registration_date": None,
        "created_by": user_id,
        "source_system": "MANUAL",
    })
    fir_details_to_insert.append({
        "record_id": rec_id_t2,
        "ps_id": ps_id_1,
        "fir_no": "GOLDEN-T2-2029",
        "fir_year": 2029,
        "fir_date": "2029-09-21",
        "is_worked_out": False,
        "local_head_id": 216,
        "source_reference": "GOLDEN_DATASET_PHAROS_V1",
    })

    rec_id_t3 = generate_golden_uuid("case-tier3-fallback")
    records_to_insert.append({
        "id": rec_id_t3,
        "record_type": "CASE",
        "ps_id": ps_id_1,
        "district_id": district_id_1,
        "current_status": "SUBMITTED",
        "current_level": "PS",
        "record_date": "2029-09-22",
        "registration_date": None,
        "created_by": user_id,
        "source_system": "MANUAL",
    })
    fir_details_to_insert.append({
        "record_id": rec_id_t3,
        "ps_id": ps_id_1,
        "fir_no": "GOLDEN-T3-2029",
        "fir_year": 2029,
        "fir_date": None,
        "is_worked_out": False,
        "local_head_id": 217,
        "source_reference": "GOLDEN_DATASET_PHAROS_V1",
    })

    # 5. Channel Variations (E_THEFT, E_MVT, NCRP, ZERO_FIR)
    channels = [
        ("e_theft", "E_THEFT", 19, "2029-09-23", "E_THEFT"),
        ("e_mvt", "E_MVT", 16, "2029-09-24", "E_MVT"),
        ("ncrp", "NCRP", 73, "2029-09-25", "NCRP"),
        ("zero_fir", "MANUAL", 2, "2029-09-26", "ZERO_FIR"),
    ]
    for ch_name, src_sys, head_cd, fir_d, reg_type in channels:
        rec_id = generate_golden_uuid(f"case-ch-{ch_name}")
        records_to_insert.append({
            "id": rec_id,
            "record_type": "CASE",
            "ps_id": ps_id_1,
            "district_id": district_id_1,
            "current_status": "SUBMITTED",
            "current_level": "PS",
            "record_date": fir_d,
            "registration_date": fir_d,
            "created_by": user_id,
            "source_system": src_sys,
        })
        fir_details_to_insert.append({
            "record_id": rec_id,
            "ps_id": ps_id_1,
            "fir_no": f"GOLDEN-{ch_name.upper()}-2029",
            "fir_year": 2029,
            "fir_date": fir_d,
            "is_worked_out": False,
            "local_head_id": head_cd,
            "registration_type": reg_type,
            "source_reference": "GOLDEN_DATASET_PHAROS_V1",
        })

    # 6. Year Boundary Cases (2028-12-15 & 2029-01-15)
    rec_id_yb1 = generate_golden_uuid("case-yb-2028")
    records_to_insert.append({
        "id": rec_id_yb1,
        "record_type": "CASE",
        "ps_id": ps_id_1,
        "district_id": district_id_1,
        "current_status": "SUBMITTED",
        "current_level": "PS",
        "record_date": "2028-12-15",
        "registration_date": "2028-12-15",
        "created_by": user_id,
        "source_system": "MANUAL",
    })
    fir_details_to_insert.append({
        "record_id": rec_id_yb1,
        "ps_id": ps_id_1,
        "fir_no": "GOLDEN-YB1-2028",
        "fir_year": 2028,
        "fir_date": "2028-12-15",
        "is_worked_out": False,
        "local_head_id": 1,
        "source_reference": "GOLDEN_DATASET_PHAROS_V1",
    })

    rec_id_yb2 = generate_golden_uuid("case-yb-2029")
    records_to_insert.append({
        "id": rec_id_yb2,
        "record_type": "CASE",
        "ps_id": ps_id_1,
        "district_id": district_id_1,
        "current_status": "SUBMITTED",
        "current_level": "PS",
        "record_date": "2029-01-15",
        "registration_date": "2029-01-15",
        "created_by": user_id,
        "source_system": "MANUAL",
    })
    fir_details_to_insert.append({
        "record_id": rec_id_yb2,
        "ps_id": ps_id_1,
        "fir_no": "GOLDEN-YB2-2029",
        "fir_year": 2029,
        "fir_date": "2029-01-15",
        "is_worked_out": True,
        "local_head_id": 1,
        "source_reference": "GOLDEN_DATASET_PHAROS_V1",
    })

    # Perform DB Insert
    with engine.begin() as conn:
        # First cleanup any prior golden records
        conn.execute(text("DELETE FROM fir_details WHERE source_reference = 'GOLDEN_DATASET_PHAROS_V1'"))
        conn.execute(text("DELETE FROM records WHERE legacy_ref = 'GOLDEN_DATASET_PHAROS_V1' OR id IN (SELECT record_id FROM fir_details WHERE source_reference = 'GOLDEN_DATASET_PHAROS_V1')"))

        for r in records_to_insert:
            conn.execute(
                text("""
                    INSERT INTO records (id, record_type, ps_id, district_id, current_status, current_level, record_date, is_frozen, is_legacy, created_by, created_at, updated_at, registration_date, source_system, legacy_ref)
                    VALUES (:id, :record_type, :ps_id, :district_id, :current_status, :current_level, :record_date, false, false, :created_by, NOW(), NOW(), :registration_date, :source_system, 'GOLDEN_DATASET_PHAROS_V1')
                    ON CONFLICT (id) DO UPDATE SET record_date = EXCLUDED.record_date, registration_date = EXCLUDED.registration_date
                """),
                r
            )

        for f in fir_details_to_insert:
            conn.execute(
                text("""
                    INSERT INTO fir_details (record_id, ps_id, fir_no, fir_year, fir_date, is_worked_out, local_head_id, registration_type, source_reference, extra, created_at, updated_at, is_legacy_format)
                    VALUES (:record_id, :ps_id, :fir_no, :fir_year, :fir_date, :is_worked_out, :local_head_id, :registration_type, :source_reference, '{}'::jsonb, NOW(), NOW(), false)
                    ON CONFLICT (record_id) DO UPDATE SET fir_date = EXCLUDED.fir_date, local_head_id = EXCLUDED.local_head_id
                """),
                {"registration_type": "MANUAL_CCTNS", **f}
            )

    print(f"[GoldenDataset] Successfully seeded {len(records_to_insert)} records and {len(fir_details_to_insert)} fir_details into PostgreSQL database.")

if __name__ == "__main__":
    seed_golden_dataset()
