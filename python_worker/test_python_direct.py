import sys
import os

print("Starting direct python test...", flush=True)

try:
    print("Importing generator...", flush=True)
    import generator
    print("Generator imported successfully!", flush=True)
except Exception as e:
    print(f"Import failed: {e}", flush=True)
    sys.exit(1)

print("Checking db engine connection...", flush=True)
try:
    with generator.engine.connect() as conn:
        print("Connected to DB successfully!", flush=True)
except Exception as e:
    print(f"DB Connection failed: {e}", flush=True)

print("Direct Python test finished.", flush=True)
