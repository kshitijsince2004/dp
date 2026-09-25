import sys
import os

print("1. Importing dotenv...", flush=True)
from dotenv import load_dotenv
print("2. Importing create_engine...", flush=True)
from sqlalchemy import create_engine

print("3. Loading dotenv...", flush=True)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../backend/.env'))
load_dotenv()

db_url = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5435/pharos_db')
print(f"4. Resolving Postgres URL: {db_url}", flush=True)

print("5. Creating engine...", flush=True)
engine = create_engine(db_url)

print("6. Engine created! Testing engine connection...", flush=True)
with engine.connect() as conn:
    print("7. Connection succeeded!", flush=True)

print("Finished direct line-by-line test.", flush=True)
