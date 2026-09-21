import unittest
from pathlib import Path
from python_worker.report_renderer import render_report


class TestPart5Sheet21Pilot(unittest.TestCase):
    """
    Part 5 Pilot Test Suite: Sheet 21 (FIR Goswara Summary) End-to-End Migration.
    Verifies rendering of Sheet 21 Layer 3 Spec against hand-derived expected values
    from the Phase 2 Golden Dataset for September 2029.
    """

    def setUp(self):
        self.spec_path = Path("golden_dataset/report_specs/sheet_21_goswara_summary.json")
        self.from_date = "2029-09-01"
        self.to_date = "2029-09-30"

        # Hand-derived expected values for Phase 2 Golden Dataset (Sept 2029):
        # -------------------------------------------------------------------
        # PS Gulabi Bagh (ps_id: 00a4e267-e8fa-4d76-9fb9-7718ed8605ce):
        #   11 MANUAL_CCTNS (002, 003, 001, 004, 007, 005, 006, 216, 217, T2, T3)
        #   1 E_THEFT (GOLDEN-E_THEFT-2029)
        #   0 E_HOUSE_THEFT
        #   0 E_BURGLARY
        #   1 E_MVT (GOLDEN-E_MVT-2029)
        #   1 NCRP (GOLDEN-NCRP-2029)
        #   1 ZERO_FIR (GOLDEN-ZERO_FIR-2029)
        #   Total = 11 + 1 + 0 + 0 + 1 + 1 + 1 = 15
        #
        # PS Cyber Crime (ps_id: ffb388dd-f5f3-4234-a1ef-e99aa5826e44):
        #   3 MANUAL_CCTNS (012, 073, 008)
        #   0 E_THEFT
        #   0 E_HOUSE_THEFT
        #   0 E_BURGLARY
        #   0 E_MVT
        #   0 NCRP
        #   0 ZERO_FIR
        #   Total = 3 + 0 + 0 + 0 + 0 + 0 + 0 = 3
        #
        # District North-West Total:
        #   14 MANUAL_CCTNS
        #   1 E_THEFT
        #   0 E_HOUSE_THEFT
        #   0 E_BURGLARY
        #   1 E_MVT
        #   1 NCRP
        #   1 ZERO_FIR
        #   Total = 14 + 1 + 0 + 0 + 1 + 1 + 1 = 18
        # -------------------------------------------------------------------
        self.expected_output = [
            {
                "jurisdiction": "PS Gulabi Bagh",
                "manual_fir": 11,
                "theft_efir": 1,
                "house_theft_efir": 0,
                "burglary_efir": 0,
                "mvt_motor_vehicle_theft": 1,
                "ncrp_fir": 1,
                "zero_fir": 1,
                "total": 15,
            },
            {
                "jurisdiction": "PS Cyber Crime",
                "manual_fir": 3,
                "theft_efir": 0,
                "house_theft_efir": 0,
                "burglary_efir": 0,
                "mvt_motor_vehicle_theft": 0,
                "ncrp_fir": 0,
                "zero_fir": 0,
                "total": 3,
            },
            {
                "jurisdiction": "District North-West Total",
                "manual_fir": 14,
                "theft_efir": 1,
                "house_theft_efir": 0,
                "burglary_efir": 0,
                "mvt_motor_vehicle_theft": 1,
                "ncrp_fir": 1,
                "zero_fir": 1,
                "total": 18,
            },
        ]

    def test_sheet21_pilot_rendering(self):
        result = render_report(self.spec_path, from_date=self.from_date, to_date=self.to_date)

        self.assertEqual(result["sheet_id"], "sheet_21_goswara_summary")
        self.assertEqual(result["title"], "FIR Goswara Summary (Daily Diary Sheet 21)")
        self.assertEqual(result["print_setup"]["paper_size"], "A4")
        self.assertTrue(result["print_setup"]["strip_row_5_annotation"])

        rows = result["rows"]
        self.assertEqual(len(rows), len(self.expected_output))

        print("\n=== LITERAL CELL OUTPUT COMPARISON FOR SHEET 21 PILOT ===")
        all_matched = True
        for i, (exp_row, act_row) in enumerate(zip(self.expected_output, rows)):
            print(f"\nRow {i+1}: {act_row['jurisdiction']}")
            for key in ["jurisdiction", "manual_fir", "theft_efir", "house_theft_efir", "burglary_efir", "mvt_motor_vehicle_theft", "ncrp_fir", "zero_fir", "total"]:
                act_val = act_row[key]
                exp_val = exp_row[key]
                match_str = "MATCH" if act_val == exp_val else "MISMATCH"
                print(f"  Column '{key}': expected={exp_val}, produced={act_val} -> {match_str}")
                self.assertEqual(act_val, exp_val, f"Mismatch in row {i+1} column '{key}'")

        self.assertTrue(all_matched)


if __name__ == "__main__":
    unittest.main()
