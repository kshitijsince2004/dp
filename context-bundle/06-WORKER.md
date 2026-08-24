# PHAROS Python Report Worker & Generator Engine

> Architecture, message consumption flow, template format, and structural outline of `python_worker/`.

## 1. Python Dependencies (`python_worker/requirements.txt`)
```text
pika>=1.3.2
SQLAlchemy>=2.0.36
psycopg2-binary>=2.9.10
pandas>=2.2.2
openpyxl>=3.1.2
python-dotenv>=1.0.1
weasyprint>=62.3
```

## 2. RabbitMQ Consumer Entrypoint (`python_worker/main.py` — Verbatim)
```python
import pika
import json
import os
import time
from dotenv import load_dotenv
from generator import generate_report
from sqlalchemy import text
from db import engine
from datetime import datetime

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../backend/.env'))
load_dotenv()

def mark_job_failed(job_id, error_message):
    try:
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE report_jobs SET status='FAILED', error_message=:msg, updated_at=:now WHERE id=:id"),
                {'msg': error_message, 'now': datetime.now().isoformat(), 'id': job_id}
            )
        print(f"[Worker] Marked job {job_id} as FAILED in database.")
    except Exception as e:
        print(f"[WorkerError] Failed to mark job as failed: {e}")

def on_message(channel, method, properties, body):
    try:
        payload = json.loads(body)
    except Exception as parse_err:
        print(f"[Worker] Invalid JSON payload received: {parse_err}")
        channel.basic_ack(delivery_tag=method.delivery_tag)
        return

    job_id = payload.get('job_id')
    if not job_id:
        print("[Worker] Job ID missing from payload. Acknowledging and discarding.")
        channel.basic_ack(delivery_tag=method.delivery_tag)
        return

    print(f"[Worker] Received report job request for ID: {job_id}")
    try:
        generate_report(job_id)
        channel.basic_ack(delivery_tag=method.delivery_tag)
        print(f"[Worker] Job {job_id} processed and acknowledged.")
    except Exception as e:
        print(f"[ERROR] Job {job_id} failed: {e}")
        mark_job_failed(job_id, str(e))
        channel.basic_ack(delivery_tag=method.delivery_tag)

def connect_with_retry(rabbitmq_url, max_retries=10, delay=5):
    for attempt in range(1, max_retries + 1):
        try:
            params = pika.URLParameters(rabbitmq_url)
            params.heartbeat = 30
            params.blocked_connection_timeout = 300
            conn = pika.BlockingConnection(params)
            ch = conn.channel()
            ch.exchange_declare(exchange='pharos', exchange_type='topic', durable=True)
            ch.queue_declare(queue='report-generation-queue', durable=True)
            ch.queue_bind(exchange='pharos', queue='report-generation-queue', routing_key='report.requested')
            ch.basic_qos(prefetch_count=1)
            print(f"[Worker] RabbitMQ connected on attempt {attempt}.")
            return conn, ch
        except Exception as e:
            print(f"[Worker] RabbitMQ connection attempt {attempt}/{max_retries} failed: {e}")
            if attempt < max_retries:
                print(f"[Worker] Retrying in {delay}s...")
                time.sleep(delay)
            else:
                raise

def start():
    rabbitmq_url = os.getenv('RABBITMQ_URL', 'amqp://pharos:pharos123@localhost:5672')
    print(f"[Worker] Connecting to RabbitMQ at: {rabbitmq_url}")

    while True:
        try:
            conn, ch = connect_with_retry(rabbitmq_url)
            ch.basic_consume(queue='report-generation-queue', on_message_callback=on_message)
            print("[INFO] Python worker waiting for report jobs...")
            ch.start_consuming()
        except KeyboardInterrupt:
            print("[Worker] Shutting down gracefully.")
            try:
                conn.close()
            except Exception:
                pass
            break
        except Exception as e:
            print(f"[Worker] Connection lost ({e}). Reconnecting in 5s...")
            time.sleep(5)

if __name__ == '__main__':
    start()
```

## 3. Structural Outline: `generator.py` (1,181 lines)

- **Purpose:** Core reporting engine. Receives `job_id`, looks up `report_jobs` in PostgreSQL via SQLAlchemy, loads template specification from `report_templates` or `templates/<id>.json`, queries tabular records with SQL dynamic filtering, builds formatted multi-worksheet Excel workbook using `openpyxl`, saves file to `generated-reports/`, and updates `report_jobs.status = 'READY'` (or `FAILED` with error trace).
- **Exported Symbols:**
  - `generate_report(job_id)`: Primary entrypoint invoked by `main.py`.
  - `load_template(template_id, engine)`: Resolves template JSON definition.
  - `get_predefined_definition(template_id)`: Hardcoded fallbacks (`arrest-summary`, `pcr-call-log`, `cases-register`).
  - `load_field_registry(field_keys, engine)`: Fetches multi-lingual column headers.
  - `build_tabular_sheet(wb, df, template_def)`: Renders grid rows and headers.
  - `build_stat_sheet(wb, calc_data, template_def)`: Renders complex crime statistic matrices.
- **Database Tables Read:** `report_jobs`, `report_templates`, `records`, `fir_details`, `arrest_details`, `pcr_call_details`, `missing_details`, `uidb_details`, `field_registry`, `hierarchy_nodes`.
- **Database Tables Written:** `report_jobs` (updates status, `file_path`, `error_message`, `updated_at`).

## 4. Local Worker Template Definitions (`python_worker/templates/`)

### `python_worker/templates/arrested-24hr-list.json`
```json
{
  "template_type": "LINKED",
  "primary_record_type": "ARREST",
  "link_type_code": "CASE_ARREST",
  "direction": "target_to_source",
  "header": {
    "title_en": "District – List of Arrested Persons for Last 24 Hours",
    "title_hi": "जिला – पिछले 24 घंटों में गिरफ़्तार व्यक्तियों की सूची",
    "short_name_en": "Arrested 24Hr List"
  },
  "columns": [
    { "key": "arrested_name",    "label": "Name / Nick Name",            "source": "arrest" },
    { "key": "parents_name",     "label": "Father / Husband Name",       "source": "arrest" },
    { "key": "arrested_address", "label": "Address",                     "source": "arrest" },
    { "key": "age_gender",       "label": "Age",                         "source": "arrest" },
    { "key": "fir_dd_no",        "label": "FIR / DD No.",                "source": "derived" },
    { "key": "arrest_date",      "label": "Date of Arrest",              "source": "arrest" },
    { "key": "sections",         "label": "Under Section (U/S)",         "source": "arrest" },
    { "key": "ps_name",          "label": "Police Station",              "source": "hierarchy" },
    { "key": "io_name",          "label": "Name of IO",                  "source": "arrest" },
    { "key": "io_rank",          "label": "Rank of IO",                  "source": "arrest" },
    { "key": "io_mobile",        "label": "Mobile No. of IO",            "source": "arrest" },
    { "key": "status",           "label": "Remarks (Remand/Bail etc.)",  "source": "arrest" }
  ],
  "header_groups": [
    { "label": "S. No.",           "span": 1 },
    { "label": "NAME / NICK NAME", "span": 4 },
    { "label": "FIR / DD No.",     "span": 1 },
    { "label": "Date of Arrest",   "span": 1 },
    { "label": "Under Section",    "span": 1 },
    { "label": "Police Station",   "span": 1 },
    { "label": "Name of IO",       "span": 1 },
    { "label": "Rank of IO",       "span": 1 },
    { "label": "Mobile No. of IO", "span": 1 },
    { "label": "Remarks",          "span": 1 }
  ]
}
```

### `python_worker/templates/manual-fir.json`
```json
{
  "template_type": "LINKED",
  "primary_record_type": "CASE",
  "link_type_code": "CASE_ARREST",
  "direction": "source_to_target",
  "header": {
    "title_en": "Manual FIR Register",
    "title_hi": "मैनुअल एफआईआर रजिस्टर",
    "short_name_en": "Manual FIR"
  },
  "columns": [
    { "key": "ps_name",                  "label": "Police Station (P.S.)",      "source": "hierarchy" },
    { "key": "fir_no",                   "label": "FIR No.",                    "source": "case" },
    { "key": "sections",                 "label": "Under Section (U/S)",        "source": "case" },
    { "key": "complainant_name",         "label": "Name of Complainant",        "source": "case" },
    { "key": "complainant_parent_name",  "label": "Father / Husband Name",      "source": "case" },
    { "key": "complainant_address",      "label": "Address of Complainant",     "source": "case" },
    { "key": "time_of_occurrence",       "label": "Time of Occurrence",         "source": "case" },
    { "key": "occurrence_place",         "label": "Place of Occurrence",        "source": "case" },
    { "key": "occurrence_date",          "label": "Date of Occurrence",         "source": "case" },
    { "key": "brief_facts",              "label": "Gist",                       "source": "case" },
    { "key": "arrested_name",            "label": "Name (Arrested)",            "source": "arrest" },
    { "key": "parents_name",             "label": "Father / Husband Name",      "source": "arrest" },
    { "key": "arrested_address",         "label": "Address",                    "source": "arrest" },
    { "key": "age_gender",               "label": "Age",                        "source": "arrest" },
    { "key": "io_name",                  "label": "Name of IO",                 "source": "case" }
  ],
  "header_groups": [
    { "label": "S. No.",              "span": 1 },
    { "label": "Police Station",      "span": 1 },
    { "label": "FIR No.",             "span": 1 },
    { "label": "Under Section",       "span": 1 },
    { "label": "NAME OF COMPLAINANT", "span": 3 },
    { "label": "Time",                "span": 1 },
    { "label": "Place",               "span": 1 },
    { "label": "Date",                "span": 1 },
    { "label": "Gist",                "span": 1 },
    { "label": "ARRESTED PERSON",     "span": 4 },
    { "label": "Name of IO",          "span": 1 }
  ]
}
```
