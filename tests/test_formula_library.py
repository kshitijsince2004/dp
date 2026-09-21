import unittest
from datetime import date, datetime
from python_worker.formula_library import (
    compute_variation,
    compute_detection,
    person_display,
    address_compile,
    io_display,
    custody_status_display,
    missing_status_display,
    uidb_status_display,
    accused_history,
    recovery_display,
    scheme_of_arrest_display,
    record_date_for,
    body_description,
    multi_value_cell,
)


class TestFormulaLibraryComplete(unittest.TestCase):

    # 1. compute_variation
    def test_compute_variation(self):
        self.assertEqual(compute_variation(5, 0), "+∞")
        self.assertEqual(compute_variation(0, 0), "-")
        self.assertEqual(compute_variation(120, 100), "+20.0%")
        self.assertEqual(compute_variation(80, 100), "-20.0%")
        self.assertEqual(compute_variation(120, 100, raw_float=True), 20.0)
        self.assertIsNone(compute_variation(0, 0, raw_float=True))

    # 2. compute_detection
    def test_compute_detection(self):
        self.assertEqual(compute_detection(5, 0), "-")
        self.assertEqual(compute_detection(8, 10), "80.0%")
        self.assertEqual(compute_detection(8, 10, raw_float=True), 80.0)

    # 3. person_display
    def test_person_display(self):
        p1 = {
            "name": "Manoj Kumar",
            "alias": ["Mannu"],
            "age": 35,
            "father_husband_name": "Shakuntla Devi",
            "relation_type": "Mother",
            "gender": "Male",
            "location": {"house_no": "236", "colony": "Jahangirpuri", "district": "Delhi"}
        }
        res1 = person_display(p1, options={"include_age": True})
        self.assertEqual(res1, "Manoj Kumar @Mannu, 35, S/O Shakuntla Devi R/O 236, Jahangirpuri, Delhi")

        p2 = {
            "name": "Sunita Devi",
            "father_husband_name": "Ramesh Kumar",
            "relation_type": "Husband",
            "gender": "Female",
            "location": "Sector 5, Rohini"
        }
        res2 = person_display(p2, options={"include_age": False})
        self.assertEqual(res2, "Sunita Devi, W/O Ramesh Kumar R/O Sector 5, Rohini")

    def test_nick_names_json_string_type_safety(self):
        """Item 2a: Confirm nick_names passed as a JSON-encoded string parses cleanly into single alias."""
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
        self.assertEqual(res_json, "Manoj Kumar @Mannu, 35, S/O Shakuntla Devi R/O 236, Jahangirpuri, Delhi")
        self.assertNotIn("[", res_json)
        self.assertNotIn("]", res_json)
        self.assertNotIn('"', res_json)

        # Fallback test for plain comma-split string
        p_csv = {"name": "Manoj Kumar", "nick_names": "Mannu, Bunty"}
        self.assertEqual(person_display(p_csv), "Manoj Kumar @Mannu / Bunty")

    def test_multi_alias_join_behavior(self):
        """Item 2b: Confirm multi-alias join uses explicit ' / ' standard separator."""
        p_multi = {
            "name": "Manoj Kumar",
            "nick_names": ["Mannu", "Bunty"],
            "age": 35,
            "father_husband_name": "Shakuntla Devi",
            "relation_type": "Mother",
            "gender": "Male"
        }
        res_multi = person_display(p_multi, options={"include_age": True})
        self.assertEqual(res_multi, "Manoj Kumar @Mannu / Bunty, 35, S/O Shakuntla Devi")

    # 4. address_compile
    def test_address_compile(self):
        loc = {
            "house_no": "12",
            "street": "Main Road",
            "colony": "Civil Lines",
            "present_house_no": "12",
            "present_street": "Main Road",
            "present_colony": "Civil Lines",
            "present_district": "Central",
            "landmark": "Near Metro Gate 2",
            "tehsil": "Kotwali"
        }
        full_addr = address_compile(loc, mode="full")
        self.assertIn("Near Metro Gate 2", full_addr)
        self.assertIn("Kotwali", full_addr)

        present_addr = address_compile(loc, mode="present_only")
        self.assertNotIn("Near Metro Gate 2", present_addr)
        self.assertNotIn("Kotwali", present_addr)

    def test_address_compile_full_mode_present_preference(self):
        """Item 2c: Confirm full mode prefers present_* over plain fields when values differ."""
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
        self.assertIn("24-B Present", full_compiled)
        self.assertIn("New Avenue", full_compiled)
        self.assertNotIn("12-Permanent", full_compiled)
        self.assertNotIn("Old Lane", full_compiled)
        self.assertEqual(full_compiled, "24-B Present, New Avenue, Civil Lines, Kotwali, Near Gate 2, North")

    # 5. io_display
    def test_io_display(self):
        io = {"name": "Ramesh Singh", "rank": "Sub-Inspector", "pis_no": "28109482"}
        self.assertEqual(io_display(io), "Sub-Inspector, Ramesh Singh, 28109482")

    # 6. custody_status_display
    def test_custody_status_display(self):
        self.assertEqual(custody_status_display("Notice u/s 35(1) BNSS"), "Notice 35(1) BNSS")
        self.assertEqual(custody_status_display("Notice 35(1) BNSS"), "Notice 35(1) BNSS")
        self.assertEqual(custody_status_display("J/C"), "J/C")

    # 7. missing_status_display
    def test_missing_status_display(self):
        self.assertEqual(missing_status_display("Traced"), "TRACED")
        self.assertEqual(missing_status_display("TRACED"), "TRACED")

    # 8. uidb_status_display
    def test_uidb_status_display(self):
        self.assertEqual(uidb_status_display("Unidentified"), "UNIDENTIFIED")
        self.assertEqual(uidb_status_display("PENDING"), "PENDING")

    # 9. accused_history
    def test_accused_history(self):
        arr_all = {"prev_involvement_count": 2, "is_po": True, "is_bc": True}
        self.assertEqual(accused_history(arr_all), "PI/PO/BC")

        arr_none = {"prev_involvement_count": 0, "is_po": False, "is_bc": False}
        self.assertEqual(accused_history(arr_none), "")

    # 10. recovery_display
    def test_recovery_display(self):
        props = [
            {"major_category": "Automobile", "minor_category": "Car", "description": "White Swift Dzire", "estimated_value": "500000"},
            {"major_category": "Jewelry", "minor_category": "Gold Ring", "description": "5 grams", "estimated_value": "30000"}
        ]
        res = recovery_display(props)
        self.assertIn("1) Automobile, Car, White Swift Dzire, 500000", res)
        self.assertIn("2) Jewelry, Gold Ring, 5 grams, 30000", res)

        # String fallback
        self.assertEqual(recovery_display("One stolen mobile phone"), "One stolen mobile phone")

    # 11. scheme_of_arrest_display
    def test_scheme_of_arrest_display(self):
        arr_dropdown = {"scheme_of_arrest": "Integrated Picket Staff"}
        self.assertEqual(scheme_of_arrest_display(arr_dropdown), "Integrated Picket Staff")

        arr_legacy = {"integrated_pi": True, "by_prahari": True}
        self.assertIn("Integrated Picket", scheme_of_arrest_display(arr_legacy))

    # 12. record_date_for
    def test_record_date_for(self):
        rec_dict = {"registration_date": "2026-03-15T10:30:00Z"}
        self.assertEqual(record_date_for(rec_dict), date(2026, 3, 15))

        rec_obj = date(2026, 3, 15)
        self.assertEqual(record_date_for(rec_obj), date(2026, 3, 15))

    # 13. body_description
    def test_body_description(self):
        desc = {
            "height": "5ft 8in",
            "complexion": "Wheatish",
            "upper_dress": "Blue Shirt",
            "identification_marks": "Scar on left forehead"
        }
        res = body_description(desc)
        self.assertEqual(res, "5ft 8in, Wheatish, Blue Shirt, Scar on left forehead")

    # 14. multi_value_cell
    def test_multi_value_cell(self):
        items = ["Item A", "Item B", "Item C"]
        self.assertEqual(multi_value_cell(items), "1) Item A\n2) Item B\n3) Item C")
        self.assertEqual(multi_value_cell(["Only One"]), "Only One")


if __name__ == "__main__":
    unittest.main()
