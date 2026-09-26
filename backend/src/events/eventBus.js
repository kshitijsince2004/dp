import amqp from 'amqplib';
import EventEmitter from 'events';
import { env } from '../config/env.js';
import { getLogger } from '../utils/logger.js';

// STYLE ANCHOR follow-up (logging-instrumentation-2026-07-22, HANDOFF.md §3/§7, B3 scope): this
// is the ONE place every cross-module event flows through (P1's RabbitMQ-only rule), so every
// publish/subscribe/consume/ack/nack is logged here — a silent drop anywhere in the pharos
// exchange surfaces as a missing log line in this module's output.
const log = getLogger('eventBus');

let channel = null;
let connection = null;
const localEmitter = new EventEmitter();
/** True when RabbitMQ is unavailable — pub/sub uses in-process EventEmitter (no cross-process delivery). */
let useInMemoryBus = false;

export async function connect() {
  log.debug('connect: enter', { rabbitmqUrl: env.RABBITMQ_URL ? '[configured]' : '[missing]' });
  try {
    connection = await amqp.connect(env.RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertExchange('pharos', 'topic', { durable: true });
    useInMemoryBus = false;
    log.info('connect: RabbitMQ EventBus connected', { exchange: 'pharos', type: 'topic' });
  } catch (error) {
    useInMemoryBus = true;
    log.warn('connect: RabbitMQ offline, falling back to local in-memory events', { err: error });
  }
}

export async function publish(routingKey, payload) {
  const messagePayload = {
    ...payload,
    ts: new Date().toISOString()
  };

  // Key ids likely to identify "which entity this event is about" across the codebase's payload
  // shapes — logged whenever present so a tester can grep one id across publish/consume lines.
  const keyIds = {
    recordId: payload?.record_id ?? null,
    batchId: payload?.batch_id ?? payload?.batchId ?? null,
    compilationId: payload?.compilation_id ?? null,
    linkId: payload?.link_id ?? null,
  };

  log.debug('publish: enter', { routingKey, keyIds, keys: Object.keys(payload || {}) });

  if (useInMemoryBus || !channel) {
    // Dispatch via in-memory emitter
    localEmitter.emit(routingKey, messagePayload);
    // Also emit wildcard events
    const parts = routingKey.split('.');
    if (parts.length > 0) {
      localEmitter.emit(`${parts[0]}.*`, messagePayload);
    }
    log.info('publish: dispatched via in-memory event bus', { routingKey, keyIds });
    return;
  }

  try {
    channel.publish(
      'pharos',
      routingKey,
      Buffer.from(JSON.stringify(messagePayload)),
      { persistent: true }
    );
    log.info('publish: published to RabbitMQ exchange', { routingKey, exchange: 'pharos', keyIds });
  } catch (err) {
    log.error('publish: publish error, falling back to local emitter', { routingKey, keyIds, err });
    // Fallback to local
    localEmitter.emit(routingKey, messagePayload);
  }
}

export async function subscribe(pattern, queueName, handler) {
  if (typeof queueName === 'function') {
    handler = queueName;
    queueName = `${pattern.replace(/[^a-zA-Z0-9.-]/g, '_')}-queue`;
  }
  log.debug('subscribe: enter', { pattern, queueName, useInMemoryBus: useInMemoryBus || !channel });

  if (useInMemoryBus || !channel) {
    localEmitter.on(pattern, async (payload) => {
      log.debug('subscribe: in-memory message consumed', { pattern, queueName, routingKey: pattern, keys: Object.keys(payload || {}) });
      try {
        await handler(payload);
        log.debug('subscribe: in-memory handler completed', { pattern, queueName });
      } catch (err) {
        log.error('subscribe: in-memory handler error', { pattern, queueName, err });
      }
    });
    log.info('subscribe: bound in-memory event bus listener', { pattern, queueName });
    return;
  }

  try {
    const q = await channel.assertQueue(queueName, { durable: true });
    await channel.bindQueue(q.queue, 'pharos', pattern);

    await channel.consume(q.queue, async (msg) => {
      if (msg) {
        const deliveryTag = msg.fields?.deliveryTag;
        const routingKey = msg.fields?.routingKey;
        log.debug('subscribe: message consumed', { pattern, queueName, routingKey, deliveryTag });
        try {
          const payload = JSON.parse(msg.content.toString());
          await handler(payload);
          channel.ack(msg);
          log.debug('subscribe: handler completed, message acked', { pattern, queueName, routingKey, deliveryTag });
        } catch (err) {
          log.error('subscribe: handler error, message nacked (no requeue)', { pattern, queueName, routingKey, deliveryTag, err });
          channel.nack(msg, false, false);
        }
      }
    });
    log.info('subscribe: subscribed queue to pattern', { queueName, pattern, exchange: 'pharos' });
  } catch (error) {
    log.error('subscribe: real subscription error, binding locally as secondary fallback', { pattern, queueName, err: error });
    // Bind locally as secondary fallback
    localEmitter.on(pattern, handler);
  }
}

export function getEventBusMode() {
  return useInMemoryBus ? 'memory' : 'rabbitmq';
}

export { connect as connectEventBus };
