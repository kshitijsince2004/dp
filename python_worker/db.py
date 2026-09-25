import platform
import collections
if not hasattr(platform, '_uname_patched'):
    UnameResult = collections.namedtuple('uname_result', ['system', 'node', 'release', 'version', 'machine', 'processor'])
    platform.machine = lambda: 'AMD64'
    platform.uname = lambda: UnameResult('Windows', 'localhost', '10', '10.0.19045', 'AMD64', 'Intel64 Family 6 Model 158 Stepping 10, GenuineIntel')
    platform._uname_patched = True

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine

# Load .env from backend folder for developer convenience, fallback to current folder
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../backend/.env'))
load_dotenv()

db_url = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5435/pharos_db')
print(f"[WorkerDB] Connecting to PostgreSQL database...")
engine = create_engine(db_url, pool_pre_ping=True)
