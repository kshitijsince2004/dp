import os
import pika
import json
from dotenv import load_dotenv

# Load .env from backend folder for developer convenience, fallback to current folder
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../backend/.env'))
load_dotenv()

def publish_event(routing_key, payload):
    rabbitmq_url = os.getenv('RABBITMQ_URL', 'amqp://pharos:pharos123@localhost:5672')
    if 'socket_timeout' not in rabbitmq_url:
        if '?' in rabbitmq_url:
            rabbitmq_url += '&socket_timeout=2&connection_attempts=1'
        else:
            rabbitmq_url += '?socket_timeout=2&connection_attempts=1'
    try:
        params = pika.URLParameters(rabbitmq_url)
        connection = pika.BlockingConnection(params)
        channel = connection.channel()
        
        channel.exchange_declare(exchange='pharos', exchange_type='topic', durable=True)
        
        channel.basic_publish(
            exchange='pharos',
            routing_key=routing_key,
            body=json.dumps(payload),
            properties=pika.BasicProperties(
                delivery_mode=2,
            )
        )
        connection.close()
        print(f"[WorkerEvent] Successfully published event '{routing_key}' with payload: {payload}")
    except Exception as e:
        print(f"[WorkerEventError] Failed to publish event '{routing_key}': {e}")
