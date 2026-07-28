# python_worker/test_generator.py
import os
import uuid
import json
from datetime import datetime
from db import engine
from sqlalchemy import text
from generator import generate_report

def setup_mock_data():
    print("[Test] Setting up mock jobs in database...")
    job_id_custom = str(uuid.uuid4())
    job_id_predefined = str(uuid.uuid4())

    custom_definition = {
        "title_en": "Test Custom Report",
        "sheets": [
            {
                "record_type": "CASE",
                "field_keys": ["fir_no", "fir_date", "gd_no", "occurrence_place", "complainant_name"]
            }
        ],
        "header": {
            "title_en": "Custom Excel Generation Test",
            "short_name_en": "Custom Sheet",
            "show_date_range": True,
            "show_ps_name": True
        }
    }

    filters = {
        "date_from": "2020-01-01",
        "date_to": "2030-01-01",
        "ps_id": "PS_NDD_PARLIAMENTSTREET"
    }

    file_path_custom = os.path.abspath("./test_generated_custom.xlsx")
    file_path_predefined = os.path.abspath("./test_generated_predefined.xlsx")

    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO report_jobs (id, template_id, custom_definition, filters, format, status, file_path, created_by, created_at, updated_at)
            VALUES (:id, NULL, :def, :filters, 'EXCEL', 'PENDING', :file_path, 'bf5af8de-2e04-40ed-928e-6a0b02916fc2', :now, :now)
        """), {
            'id': job_id_custom,
            'def': json.dumps(custom_definition),
            'filters': json.dumps(filters),
            'file_path': file_path_custom,
            'now': datetime.now().isoformat()
        })

        conn.execute(text("""
            INSERT INTO report_jobs (id, template_id, custom_definition, filters, format, status, file_path, created_by, created_at, updated_at)
            VALUES (:id, '7b26c164-5379-416a-8605-9a1656caf0ae', NULL, :filters, 'EXCEL', 'PENDING', :file_path, 'bf5af8de-2e04-40ed-928e-6a0b02916fc2', :now, :now)
        """), {
            'id': job_id_predefined,
            'filters': json.dumps(filters),
            'file_path': file_path_predefined,
            'now': datetime.now().isoformat()
        })

    print(f"[Test] Inserted custom job ID: {job_id_custom}")
    print(f"[Test] Inserted predefined job ID: {job_id_predefined}")
    return job_id_custom, job_id_predefined, file_path_custom, file_path_predefined

def run_tests():
    job_id_custom, job_id_predefined, file_path_custom, file_path_predefined = setup_mock_data()

    print("\n--- Testing Custom Report Generation ---")
    try:
        generate_report(job_id_custom)
        print(f"[SUCCESS] Custom report file generated at: {file_path_custom}")
        assert os.path.exists(file_path_custom), "File was not created"
    except Exception as e:
        print(f"[FAIL] Custom report generation failed: {e}")

    print("\n--- Testing Predefined Report Generation ---")
    try:
        generate_report(job_id_predefined)
        print(f"[SUCCESS] Predefined report file generated at: {file_path_predefined}")
        assert os.path.exists(file_path_predefined), "File was not created"
    except Exception as e:
        print(f"[FAIL] Predefined report generation failed: {e}")

    for f in [file_path_custom, file_path_predefined]:
        if os.path.exists(f):
            try:
                os.remove(f)
                print(f"[Cleanup] Removed test output file: {f}")
            except Exception as clean_err:
                print(f"[CleanupError] Failed to remove test output file {f}: {clean_err}")

if __name__ == '__main__':
    run_tests()
