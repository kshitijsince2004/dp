"""
PHAROS Golden Dataset Cleanup Script
Tears down all golden dataset records tagged with source_reference = 'GOLDEN_DATASET_PHAROS_V1'
or legacy_ref = 'GOLDEN_DATASET_PHAROS_V1'.
"""

import sys
sys.path.insert(0, ".")

from python_worker.db import engine
from sqlalchemy import text

def cleanup_golden_dataset():
    print("[GoldenDataset] Cleaning up Phase 2 Golden Dataset records...")
    with engine.begin() as conn:
        res1 = conn.execute(text("DELETE FROM fir_details WHERE source_reference = 'GOLDEN_DATASET_PHAROS_V1'"))
        res2 = conn.execute(text("DELETE FROM records WHERE legacy_ref = 'GOLDEN_DATASET_PHAROS_V1'"))
        print(f"[GoldenDataset] Deleted {res1.rowcount} fir_details rows and {res2.rowcount} records rows.")

if __name__ == "__main__":
    cleanup_golden_dataset()
