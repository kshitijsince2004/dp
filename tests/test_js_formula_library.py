"""
Test asserting JS and Python Layer 2 formula outputs match identically against golden_dataset/expected_values.json.
"""

import json
import os
import subprocess
import unittest
from python_worker.formula_library import (
    person_display,
    address_compile,
    custody_status_display,
    missing_status_display,
    uidb_status_display,
    accused_history,
    compute_variation,
)

class TestJSFormulaLibraryParity(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        expected_path = os.path.join("golden_dataset", "expected_values.json")
        with open(expected_path, "r", encoding="utf-8") as f:
            cls.expected = json.load(f)["expected_layer2_formulas"]

    def _call_js_formula(self, fn_name, *args):
        js_code = f"""
import {{ {fn_name} }} from './backend/src/utils/formulaLibrary.js';
const args = {json.dumps(args)};
const res = {fn_name}(...args);
console.log(JSON.stringify(res));
"""
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", js_code],
            capture_output=True,
            text=True,
            check=True
        )
        return json.loads(proc.stdout.strip())

    def test_custody_status_parity(self):
        val = "Notice u/s 35(1) BNSS"
        py_res = custody_status_display(val)
        js_res = self._call_js_formula("custodyStatusDisplay", val)
        self.assertEqual(py_res, js_res)
        self.assertEqual(js_res, self.expected["custody_status_normalization"])

    def test_accused_history_parity(self):
        acc = {"prev_involvement_count": 2, "is_po": True, "is_bc": True}
        py_res = accused_history(acc)
        js_res = self._call_js_formula("accusedHistory", acc)
        self.assertEqual(py_res, js_res)
        self.assertEqual(js_res, self.expected["accused_history_all"])

    def test_person_display_alias_parity(self):
        p_multi = {
            "name": "Manoj Kumar",
            "nick_names": ["Mannu", "Bunty"],
            "age": 35,
            "father_husband_name": "Shakuntla Devi",
            "relation_type": "Mother",
            "gender": "Male"
        }
        py_res = person_display(p_multi, options={"include_age": True})
        js_res = self._call_js_formula("personDisplay", p_multi, {"include_age": True})
        self.assertEqual(py_res, js_res)
        self.assertEqual(js_res, self.expected["person_display_multi_alias"])

if __name__ == "__main__":
    unittest.main()
