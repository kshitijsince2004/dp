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
