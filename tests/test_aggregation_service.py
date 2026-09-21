import unittest
from python_worker.aggregation_service import fetch_classified_counts, HEINOUS_CANONICAL_CODES


class TestAggregationServiceComplete(unittest.TestCase):

    # 1. Test each of the 7 Heinous heads individually
    def test_heinous_head_murder(self):
        res = fetch_classified_counts(jurisdiction_level="HQ", crime_head_selector="MURDER")
        self.assertIsNotNone(res)
        if res["items"]:
            self.assertEqual(res["items"][0]["crime_category"], "HEINOUS")

    def test_heinous_head_att_to_murder(self):
        res = fetch_classified_counts(jurisdiction_level="HQ", crime_head_selector="ATT_TO_MURDER")
        self.assertIsNotNone(res)
        if res["items"]:
            self.assertEqual(res["items"][0]["crime_category"], "HEINOUS")

    def test_heinous_head_dacoity(self):
        res = fetch_classified_counts(jurisdiction_level="HQ", crime_head_selector="DACOITY")
        self.assertIsNotNone(res)
        if res["items"]:
            self.assertEqual(res["items"][0]["crime_category"], "HEINOUS")

    def test_heinous_head_robbery(self):
        res = fetch_classified_counts(jurisdiction_level="HQ", crime_head_selector="ROBBERY")
        self.assertIsNotNone(res)
        if res["items"]:
            self.assertEqual(res["items"][0]["crime_category"], "HEINOUS")

    def test_heinous_head_rape(self):
        res = fetch_classified_counts(jurisdiction_level="HQ", crime_head_selector="RAPE")
        self.assertIsNotNone(res)
        if res["items"]:
            self.assertEqual(res["items"][0]["crime_category"], "HEINOUS")

    def test_heinous_head_riot(self):
        res = fetch_classified_counts(jurisdiction_level="HQ", crime_head_selector="RIOT")
        self.assertIsNotNone(res)
        if res["items"]:
            self.assertEqual(res["items"][0]["crime_category"], "HEINOUS")

    def test_heinous_head_kid_for_ransom(self):
        res = fetch_classified_counts(jurisdiction_level="HQ", crime_head_selector="KID_FOR_RANSOM")
        self.assertIsNotNone(res)
        if res["items"]:
            self.assertEqual(res["items"][0]["crime_category"], "HEINOUS")

    # 2. Generic Act / Special Laws classification test (local_head_cd = 73 / 'Other Act')
    def test_generic_act_classification(self):
        """
        Verify Special & Local Laws / Act selector (local_head_cd = 73 / ACT selector)
        counts STRICTLY under Act subtotal (never under Heinous or Non-Heinous).
        """
        res_act = fetch_classified_counts(jurisdiction_level="HQ", crime_head_selector="ACT")
        self.assertIn("subtotals", res_act)

        act_rep = res_act["subtotals"]["act"]["reported"]
        heinous_rep = res_act["subtotals"]["heinous"]["reported"]
        non_heinous_rep = res_act["subtotals"]["non_heinous"]["reported"]

        # Assert Act selector returns counts under Act subtotal and ZERO under Heinous/Non-Heinous
        self.assertGreater(act_rep, 0, "Act selector must return positive reported count for Special & Local Laws")
        self.assertEqual(heinous_rep, 0, "Act selector must NEVER count under Heinous")
        self.assertEqual(non_heinous_rep, 0, "Act selector must NEVER count under Non-Heinous")

    # 2b. BNS 111 / BNS 113 classification test with positive case proof
    def test_bns_111_113_act_classification(self):
        """
        Verify BNS 111 (local_head_cd 216) and BNS 113 (local_head_cd 217) prove POSITIVE classification
        when real records are present: subtotals['act']['reported'] >= 1, while heinous and non_heinous remain 0.
        Uses safe test data setup and teardown.
        """
        import uuid
        from sqlalchemy import text
        from python_worker.db import engine

        # Direct database assertion on ref.local_heads for real IDs 216 and 217
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT local_head_cd, canonical_code, crime_category FROM ref.local_heads WHERE local_head_cd IN (216, 217)")
            ).fetchall()
            row_map = {r.local_head_cd: r._mapping for r in rows}

        self.assertIn(216, row_map, "local_head_cd 216 must exist in ref.local_heads")
        self.assertEqual(row_map[216]["canonical_code"], "ORGANIZED_CRIME_BNS_111")
        self.assertEqual(row_map[216]["crime_category"], "OTHER")

        self.assertIn(217, row_map, "local_head_cd 217 must exist in ref.local_heads")
        self.assertEqual(row_map[217]["canonical_code"], "TERRORIST_ACTS_BNS_113")
        self.assertEqual(row_map[217]["crime_category"], "OTHER")

        # Dynamic lookup for PS, District, and User IDs to eliminate hardcoded UUID literals (2b)
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT r.ps_id, r.district_id, r.created_by
                    FROM records r
                    WHERE r.ps_id IS NOT NULL AND r.district_id IS NOT NULL AND r.created_by IS NOT NULL
                    LIMIT 1
                """)
            ).fetchone()
            ps_id = str(row.ps_id)
            district_id = str(row.district_id)
            user_id = str(row.created_by)

        # Create temporary test records with DELIBERATELY DIVERGENT dates (2a):
        # registration_date = '2026-09-15' (INSIDE query range '2026-09-01' to '2026-09-30')
        # fir_date = '2025-01-01' (OUTSIDE range)
        # record_date = '2026-08-01' (OUTSIDE range)
        rec_id_111 = str(uuid.uuid4())
        rec_id_113 = str(uuid.uuid4())
        target_reg_date = "2026-09-15"
        outside_fir_date = "2025-01-01"
        outside_rec_date = "2026-08-01"

        try:
            with engine.begin() as conn:
                # BNS 111 test record
                conn.execute(
                    text("""
                        INSERT INTO records (id, record_type, ps_id, district_id, current_status, current_level, record_date, is_frozen, is_legacy, created_by, created_at, updated_at, registration_date)
                        VALUES (:id, 'CASE', :ps_id, :district_id, 'SUBMITTED', 'PS', :rec_date, false, false, :user_id, NOW(), NOW(), :reg_date)
                    """),
                    {"id": rec_id_111, "ps_id": ps_id, "district_id": district_id, "rec_date": outside_rec_date, "user_id": user_id, "reg_date": target_reg_date}
                )
                conn.execute(
                    text("""
                        INSERT INTO fir_details (record_id, ps_id, fir_no, fir_year, fir_date, is_worked_out, local_head_id, extra, created_at, updated_at, is_legacy_format)
                        VALUES (:rec_id, :ps_id, 'TEST-BNS-111-001', 2026, :fir_date, false, 216, '{}'::jsonb, NOW(), NOW(), false)
                    """),
                    {"rec_id": rec_id_111, "ps_id": ps_id, "fir_date": outside_fir_date}
                )

                # BNS 113 test record
                conn.execute(
                    text("""
                        INSERT INTO records (id, record_type, ps_id, district_id, current_status, current_level, record_date, is_frozen, is_legacy, created_by, created_at, updated_at, registration_date)
                        VALUES (:id, 'CASE', :ps_id, :district_id, 'SUBMITTED', 'PS', :rec_date, false, false, :user_id, NOW(), NOW(), :reg_date)
                    """),
                    {"id": rec_id_113, "ps_id": ps_id, "district_id": district_id, "rec_date": outside_rec_date, "user_id": user_id, "reg_date": target_reg_date}
                )
                conn.execute(
                    text("""
                        INSERT INTO fir_details (record_id, ps_id, fir_no, fir_year, fir_date, is_worked_out, local_head_id, extra, created_at, updated_at, is_legacy_format)
                        VALUES (:rec_id, :ps_id, 'TEST-BNS-113-001', 2026, :fir_date, false, 217, '{}'::jsonb, NOW(), NOW(), false)
                    """),
                    {"rec_id": rec_id_113, "ps_id": ps_id, "fir_date": outside_fir_date}
                )

            # Call fetch_classified_counts filtering on range '2026-09-01' to '2026-09-30'
            res_111 = fetch_classified_counts(
                jurisdiction_level="HQ",
                jurisdiction_id=None,
                from_date="2026-09-01",
                to_date="2026-09-30",
                crime_head_selector="ORGANIZED_CRIME_BNS_111",
                channel_filter=None
            )
            # Proves COALESCE(r.registration_date, ...) authority: included because registration_date = 2026-09-15
            self.assertGreaterEqual(res_111["subtotals"]["act"]["reported"], 1, "BNS 111 positive classification must report >= 1 based on registration_date authority")
            self.assertEqual(res_111["subtotals"]["heinous"]["reported"], 0, "BNS 111 must NEVER count under Heinous")
            self.assertEqual(res_111["subtotals"]["non_heinous"]["reported"], 0, "BNS 111 must NEVER count under Non-Heinous")

            res_113 = fetch_classified_counts(
                jurisdiction_level="HQ",
                jurisdiction_id=None,
                from_date="2026-09-01",
                to_date="2026-09-30",
                crime_head_selector="TERRORIST_ACTS_BNS_113",
                channel_filter=None
            )
            # Proves COALESCE(r.registration_date, ...) authority: included because registration_date = 2026-09-15
            self.assertGreaterEqual(res_113["subtotals"]["act"]["reported"], 1, "BNS 113 positive classification must report >= 1 based on registration_date authority")
            self.assertEqual(res_113["subtotals"]["heinous"]["reported"], 0, "BNS 113 must NEVER count under Heinous")
            self.assertEqual(res_113["subtotals"]["non_heinous"]["reported"], 0, "BNS 113 must NEVER count under Non-Heinous")

        finally:
            # 1e. Clean up test records
            with engine.begin() as conn:
                conn.execute(text("DELETE FROM fir_details WHERE record_id IN (:r1, :r2)"), {"r1": rec_id_111, "r2": rec_id_113})
                conn.execute(text("DELETE FROM records WHERE id IN (:r1, :r2)"), {"r1": rec_id_111, "r2": rec_id_113})

    def test_coalesce_fallback_chain(self):
        """
        Item A1: Verify full COALESCE fallback chain:
        - Tier 2: when registration_date IS NULL, falls back to fir_date.
        - Tier 3: when both registration_date AND fir_date ARE NULL, falls back to record_date.
        """
        import uuid
        from sqlalchemy import text
        from python_worker.db import engine

        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT r.ps_id, r.district_id, r.created_by
                    FROM records r
                    WHERE r.ps_id IS NOT NULL AND r.district_id IS NOT NULL AND r.created_by IS NOT NULL
                    LIMIT 1
                """)
            ).fetchone()
            ps_id = str(row.ps_id)
            district_id = str(row.district_id)
            user_id = str(row.created_by)

        rec_id_t2 = str(uuid.uuid4())
        rec_id_t3 = str(uuid.uuid4())

        try:
            with engine.begin() as conn:
                # Tier 2: registration_date = NULL, fir_date = INSIDE window ('2026-09-15'), record_date = OUTSIDE ('2025-01-01')
                conn.execute(
                    text("""
                        INSERT INTO records (id, record_type, ps_id, district_id, current_status, current_level, record_date, is_frozen, is_legacy, created_by, created_at, updated_at, registration_date)
                        VALUES (:id, 'CASE', :ps_id, :district_id, 'SUBMITTED', 'PS', '2025-01-01', false, false, :user_id, NOW(), NOW(), NULL)
                    """),
                    {"id": rec_id_t2, "ps_id": ps_id, "district_id": district_id, "user_id": user_id}
                )
                conn.execute(
                    text("""
                        INSERT INTO fir_details (record_id, ps_id, fir_no, fir_year, fir_date, is_worked_out, local_head_id, extra, created_at, updated_at, is_legacy_format)
                        VALUES (:rec_id, :ps_id, 'TEST-COALESCE-T2', 2026, '2026-09-15', false, 216, '{}'::jsonb, NOW(), NOW(), false)
                    """),
                    {"rec_id": rec_id_t2, "ps_id": ps_id}
                )

                # Tier 3: registration_date = NULL, fir_date = NULL, record_date = INSIDE window ('2026-09-15')
                conn.execute(
                    text("""
                        INSERT INTO records (id, record_type, ps_id, district_id, current_status, current_level, record_date, is_frozen, is_legacy, created_by, created_at, updated_at, registration_date)
                        VALUES (:id, 'CASE', :ps_id, :district_id, 'SUBMITTED', 'PS', '2026-09-15', false, false, :user_id, NOW(), NOW(), NULL)
                    """),
                    {"id": rec_id_t3, "ps_id": ps_id, "district_id": district_id, "user_id": user_id}
                )
                conn.execute(
                    text("""
                        INSERT INTO fir_details (record_id, ps_id, fir_no, fir_year, fir_date, is_worked_out, local_head_id, extra, created_at, updated_at, is_legacy_format)
                        VALUES (:rec_id, :ps_id, 'TEST-COALESCE-T3', 2026, NULL, false, 217, '{}'::jsonb, NOW(), NOW(), false)
                    """),
                    {"rec_id": rec_id_t3, "ps_id": ps_id}
                )

            # Test Tier 2 fallback (fir_date)
            res_t2 = fetch_classified_counts(
                jurisdiction_level="HQ",
                from_date="2026-09-01",
                to_date="2026-09-30",
                crime_head_selector="ORGANIZED_CRIME_BNS_111"
            )
            self.assertGreaterEqual(res_t2["subtotals"]["act"]["reported"], 1, "COALESCE Tier 2 (fir_date) fallback must include record when registration_date is NULL")

            # Test Tier 3 fallback (record_date)
            res_t3 = fetch_classified_counts(
                jurisdiction_level="HQ",
                from_date="2026-09-01",
                to_date="2026-09-30",
                crime_head_selector="TERRORIST_ACTS_BNS_113"
            )
            self.assertGreaterEqual(res_t3["subtotals"]["act"]["reported"], 1, "COALESCE Tier 3 (record_date) fallback must include record when registration_date AND fir_date are NULL")

        finally:
            with engine.begin() as conn:
                conn.execute(text("DELETE FROM fir_details WHERE record_id IN (:r1, :r2)"), {"r1": rec_id_t2, "r2": rec_id_t3})
                conn.execute(text("DELETE FROM records WHERE id IN (:r1, :r2)"), {"r1": rec_id_t2, "r2": rec_id_t3})

    # 3. Date range spanning year boundary
    def test_year_boundary_date_range(self):
        res = fetch_classified_counts(
            jurisdiction_level="HQ",
            from_date="2025-12-01",
            to_date="2026-01-31",
            crime_head_selector="ALL",
        )
        self.assertIn("subtotals", res)
        self.assertIn("grand_total", res["subtotals"])

    # 4. E-FIR Channel Filter
    def test_efir_channel_filter(self):
        res = fetch_classified_counts(jurisdiction_level="HQ", channel_filter="E_FIR")
        self.assertIn("subtotals", res)


if __name__ == "__main__":
    unittest.main()
