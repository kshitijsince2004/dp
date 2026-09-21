"""
PHAROS Golden Dataset Correctness Harness (Phase 2 - Hardened)
Automated harness that verifies Layer 1 (Classification & Aggregation Service)
and Layer 2 (Shared Formula Library) against golden_dataset/expected_values.json.
Contains explicit individual assertions for every item on B1's coverage list.
"""

import json
import os
import unittest
from python_worker.db import engine
from sqlalchemy import text
from python_worker.aggregation_service import fetch_classified_counts
from python_worker.formula_library import (
    person_display,
    address_compile,
    custody_status_display,
    missing_status_display,
    uidb_status_display,
    accused_history,
    compute_variation,
)


class TestGoldenCorrectnessHarness(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        expected_path = os.path.join("golden_dataset", "expected_values.json")
        with open(expected_path, "r", encoding="utf-8") as f:
            cls.expected = json.load(f)

        # Lookup test PS and District IDs from DB
        with engine.connect() as conn:
            ps_row1 = conn.execute(text("SELECT id, parent_id FROM hierarchy_nodes WHERE node_type = 'PS' ORDER BY id LIMIT 1")).fetchone()
            ps_row2 = conn.execute(text("SELECT id, parent_id FROM hierarchy_nodes WHERE node_type = 'PS' ORDER BY id DESC LIMIT 1")).fetchone()
            cls.ps_id_1 = str(ps_row1.id)
            cls.district_id_1 = str(ps_row1.parent_id)
            cls.ps_id_2 = str(ps_row2.id)
            cls.district_id_2 = str(ps_row2.parent_id)

    # 1. 7 Heinous Heads Individual Correctness
    def test_golden_heinous_heads_individual(self):
        exp_heads = self.expected["expected_heinous_heads_individual"]
        for head, exp in exp_heads.items():
            res = fetch_classified_counts(
                jurisdiction_level="HQ",
                from_date="2029-09-01",
                to_date="2029-09-30",
                crime_head_selector=head
            )
            self.assertEqual(len(res["items"]), 1, f"Expected 1 item for head {head}")
            item = res["items"][0]
            self.assertEqual(item["head_code"], exp["canonical_code"], f"Canonical code mismatch for {head}")
            self.assertEqual(item["crime_category"], exp["crime_category"], f"Category mismatch for {head}")
            self.assertEqual(item["reported_count"], exp["reported"], f"Reported count mismatch for {head}")
            self.assertEqual(item["worked_out_count"], exp["worked_out"], f"Worked out count mismatch for {head}")

    # 2. BNS 111 & 113 Classification & Numeric Count Assertions
    def test_golden_bns_111_113_classification(self):
        exp_111 = self.expected["expected_layer1_aggregations"]["sept_2026_bns_111"]
        res_111 = fetch_classified_counts(
            jurisdiction_level="HQ",
            from_date="2029-09-01",
            to_date="2029-09-30",
            crime_head_selector="ORGANIZED_CRIME_BNS_111"
        )
        self.assertEqual(res_111["items"][0]["reported_count"], exp_111["reported_count"])
        self.assertEqual(res_111["subtotals"]["heinous"]["reported"], exp_111["heinous_reported"])
        self.assertEqual(res_111["subtotals"]["non_heinous"]["reported"], exp_111["non_heinous_reported"])
        self.assertEqual(res_111["subtotals"]["act"]["reported"], exp_111["act_reported"])

        exp_113 = self.expected["expected_layer1_aggregations"]["sept_2026_bns_113"]
        res_113 = fetch_classified_counts(
            jurisdiction_level="HQ",
            from_date="2029-09-01",
            to_date="2029-09-30",
            crime_head_selector="TERRORIST_ACTS_BNS_113"
        )
        self.assertEqual(res_113["items"][0]["reported_count"], exp_113["reported_count"])
        self.assertEqual(res_113["subtotals"]["heinous"]["reported"], exp_113["heinous_reported"])
        self.assertEqual(res_113["subtotals"]["non_heinous"]["reported"], exp_113["non_heinous_reported"])
        self.assertEqual(res_113["subtotals"]["act"]["reported"], exp_113["act_reported"])

    # 3. Multi-Jurisdiction Rollup Assertions (PS 1, PS 2, District 1, District 2, HQ)
    def test_golden_jurisdiction_rollups(self):
        exp_rollups = self.expected["expected_jurisdiction_rollups"]

        # 1. PS 1 Rollup
        res_ps1 = fetch_classified_counts(
            jurisdiction_level="PS",
            jurisdiction_id=self.ps_id_1,
            from_date="2029-09-01",
            to_date="2029-09-30"
        )
        sub_ps1 = res_ps1["subtotals"]
        exp_ps1 = exp_rollups["ps_1_total"]
        self.assertEqual(sub_ps1["grand_total"]["reported"], exp_ps1["grand_total"]["reported"])
        self.assertEqual(sub_ps1["grand_total"]["worked_out"], exp_ps1["grand_total"]["worked_out"])
        self.assertEqual(sub_ps1["heinous"]["reported"], exp_ps1["heinous"]["reported"])
        self.assertEqual(sub_ps1["heinous"]["worked_out"], exp_ps1["heinous"]["worked_out"])
        self.assertEqual(sub_ps1["non_heinous"]["reported"], exp_ps1["non_heinous"]["reported"])
        self.assertEqual(sub_ps1["non_heinous"]["worked_out"], exp_ps1["non_heinous"]["worked_out"])
        self.assertEqual(sub_ps1["act"]["reported"], exp_ps1["act"]["reported"])
        self.assertEqual(sub_ps1["act"]["worked_out"], exp_ps1["act"]["worked_out"])

        # 2. PS 2 Rollup
        res_ps2 = fetch_classified_counts(
            jurisdiction_level="PS",
            jurisdiction_id=self.ps_id_2,
            from_date="2029-09-01",
            to_date="2029-09-30"
        )
        sub_ps2 = res_ps2["subtotals"]
        exp_ps2 = exp_rollups["ps_2_total"]
        self.assertEqual(sub_ps2["grand_total"]["reported"], exp_ps2["grand_total"]["reported"])
        self.assertEqual(sub_ps2["grand_total"]["worked_out"], exp_ps2["grand_total"]["worked_out"])
        self.assertEqual(sub_ps2["heinous"]["reported"], exp_ps2["heinous"]["reported"])
        self.assertEqual(sub_ps2["heinous"]["worked_out"], exp_ps2["heinous"]["worked_out"])
        self.assertEqual(sub_ps2["non_heinous"]["reported"], exp_ps2["non_heinous"]["reported"])
        self.assertEqual(sub_ps2["non_heinous"]["worked_out"], exp_ps2["non_heinous"]["worked_out"])
        self.assertEqual(sub_ps2["act"]["reported"], exp_ps2["act"]["reported"])
        self.assertEqual(sub_ps2["act"]["worked_out"], exp_ps2["act"]["worked_out"])

        # 3. District 1 Rollup
        res_dist1 = fetch_classified_counts(
            jurisdiction_level="DISTRICT",
            jurisdiction_id=self.district_id_1,
            from_date="2029-09-01",
            to_date="2029-09-30"
        )
        sub_dist1 = res_dist1["subtotals"]
        exp_dist1 = exp_rollups["district_1_total"]
        self.assertEqual(sub_dist1["grand_total"]["reported"], exp_dist1["grand_total"]["reported"])
        self.assertEqual(sub_dist1["grand_total"]["worked_out"], exp_dist1["grand_total"]["worked_out"])
        self.assertEqual(sub_dist1["heinous"]["reported"], exp_dist1["heinous"]["reported"])
        self.assertEqual(sub_dist1["heinous"]["worked_out"], exp_dist1["heinous"]["worked_out"])
        self.assertEqual(sub_dist1["non_heinous"]["reported"], exp_dist1["non_heinous"]["reported"])
        self.assertEqual(sub_dist1["non_heinous"]["worked_out"], exp_dist1["non_heinous"]["worked_out"])
        self.assertEqual(sub_dist1["act"]["reported"], exp_dist1["act"]["reported"])
        self.assertEqual(sub_dist1["act"]["worked_out"], exp_dist1["act"]["worked_out"])

        # 4. District 2 Rollup
        res_dist2 = fetch_classified_counts(
            jurisdiction_level="DISTRICT",
            jurisdiction_id=self.district_id_2,
            from_date="2029-09-01",
            to_date="2029-09-30"
        )
        sub_dist2 = res_dist2["subtotals"]
        exp_dist2 = exp_rollups["district_2_total"]
        self.assertEqual(sub_dist2["grand_total"]["reported"], exp_dist2["grand_total"]["reported"])
        self.assertEqual(sub_dist2["grand_total"]["worked_out"], exp_dist2["grand_total"]["worked_out"])
        self.assertEqual(sub_dist2["heinous"]["reported"], exp_dist2["heinous"]["reported"])
        self.assertEqual(sub_dist2["heinous"]["worked_out"], exp_dist2["heinous"]["worked_out"])
        self.assertEqual(sub_dist2["non_heinous"]["reported"], exp_dist2["non_heinous"]["reported"])
        self.assertEqual(sub_dist2["non_heinous"]["worked_out"], exp_dist2["non_heinous"]["worked_out"])
        self.assertEqual(sub_dist2["act"]["reported"], exp_dist2["act"]["reported"])
        self.assertEqual(sub_dist2["act"]["worked_out"], exp_dist2["act"]["worked_out"])

        # 5. HQ Level Grand Total Rollup
        res_hq = fetch_classified_counts(
            jurisdiction_level="HQ",
            from_date="2029-09-01",
            to_date="2029-09-30"
        )
        sub_hq = res_hq["subtotals"]
        exp_hq = exp_rollups["hq_total"]
        self.assertEqual(sub_hq["grand_total"]["reported"], exp_hq["grand_total"]["reported"])
        self.assertEqual(sub_hq["grand_total"]["worked_out"], exp_hq["grand_total"]["worked_out"])
        self.assertEqual(sub_hq["heinous"]["reported"], exp_hq["heinous"]["reported"])
        self.assertEqual(sub_hq["heinous"]["worked_out"], exp_hq["heinous"]["worked_out"])
        self.assertEqual(sub_hq["non_heinous"]["reported"], exp_hq["non_heinous"]["reported"])
        self.assertEqual(sub_hq["non_heinous"]["worked_out"], exp_hq["non_heinous"]["worked_out"])
        self.assertEqual(sub_hq["act"]["reported"], exp_hq["act"]["reported"])
        self.assertEqual(sub_hq["act"]["worked_out"], exp_hq["act"]["worked_out"])

    # 4. Channel Filter Correctness (E-FIR combining rule)
    def test_golden_channel_efir(self):
        exp_efir = self.expected["expected_layer1_aggregations"]["sept_2026_hq_efir"]
        res_efir = fetch_classified_counts(
            jurisdiction_level="HQ",
            from_date="2029-09-01",
            to_date="2029-09-30",
            channel_filter="E_FIR"
        )
        self.assertEqual(res_efir["subtotals"]["non_heinous"]["reported"], exp_efir["non_heinous_reported"])
        self.assertEqual(res_efir["subtotals"]["heinous"]["reported"], exp_efir["heinous_reported"])

    # 5. Layer 2 Person Display & JSON Alias
    def test_golden_person_display(self):
        exp_str = self.expected["expected_layer2_formulas"]["person_display_json_string"]
        p_json = {
            "name": "Manoj Kumar",
            "nick_names": '["Mannu"]',
            "age": 35,
            "father_husband_name": "Shakuntla Devi",
            "relation_type": "Mother",
            "gender": "Male",
            "location": {"house_no": "236", "colony": "Jahangirpuri", "district": "Delhi"}
        }
        res_json = person_display(p_json, options={"include_age": True})
        self.assertEqual(res_json, exp_str)

    # 6. Layer 2 Multi-Alias Join
    def test_golden_multi_alias_join(self):
        exp_multi = self.expected["expected_layer2_formulas"]["person_display_multi_alias"]
        p_multi = {
            "name": "Manoj Kumar",
            "nick_names": ["Mannu", "Bunty"],
            "age": 35,
            "father_husband_name": "Shakuntla Devi",
            "relation_type": "Mother",
            "gender": "Male"
        }
        res_multi = person_display(p_multi, options={"include_age": True})
        self.assertEqual(res_multi, exp_multi)

    # 7. Layer 2 Address Compilation Present Preference
    def test_golden_address_compile_preference(self):
        exp_addr = self.expected["expected_layer2_formulas"]["address_compile_full_mode_preference"]
        loc_differ = {
            "house_no": "12-Permanent",
            "present_house_no": "24-B Present",
            "street": "Old Lane",
            "present_street": "New Avenue",
            "colony": "Civil Lines",
            "present_district": "North",
            "landmark": "Near Gate 2",
            "tehsil": "Kotwali"
        }
        full_compiled = address_compile(loc_differ, mode="full")
        self.assertEqual(full_compiled, exp_addr)

    # 8. Layer 2 Status Normalizations
    def test_golden_status_normalizations(self):
        self.assertEqual(
            custody_status_display("Notice u/s 35(1) BNSS"),
            self.expected["expected_layer2_formulas"]["custody_status_normalization"]
        )
        self.assertEqual(
            missing_status_display("Traced"),
            self.expected["expected_layer2_formulas"]["missing_status_normalization"]
        )
        self.assertEqual(
            uidb_status_display("Unidentified"),
            self.expected["expected_layer2_formulas"]["uidb_status_unidentified"]
        )
        self.assertEqual(
            uidb_status_display("PENDING"),
            self.expected["expected_layer2_formulas"]["uidb_status_pending"]
        )

    # 9. Layer 2 Accused History & Variation %
    def test_golden_accused_history_and_variation(self):
        self.assertEqual(
            accused_history({"prev_involvement_count": 2, "is_po": True, "is_bc": True}),
            self.expected["expected_layer2_formulas"]["accused_history_all"]
        )
        self.assertEqual(
            accused_history({"prev_involvement_count": 0, "is_po": False, "is_bc": False}),
            self.expected["expected_layer2_formulas"]["accused_history_none"]
        )
        self.assertEqual(
            compute_variation(5, 0),
            self.expected["expected_layer2_formulas"]["compute_variation_inf"]
        )


if __name__ == "__main__":
    unittest.main()
