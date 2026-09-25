/**
 * SSE Connection Registry
 * Holds live response objects for each authenticated user.
 * When a new notification is written to the DB, notifyHandler calls
 * pushToUser() which instantly streams the event to all open browser tabs.
 */

import { getLogger } from '../../utils/logger.js';

const log = getLogger('notifications.sse');

/** @type {Map<string, Set<import('express').Response>>} */
const clients = new Map();

/**
 * Register a new SSE client connection for a user.
 * @param {string} userId
 * @param {import('express').Response} res
 */
export function registerClient(userId, res) {
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }
  clients.get(userId).add(res);
  log.info('registerClient: SSE client registered', { userId, connectionsForUser: clients.get(userId).size, totalUsers: clients.size });
}

/**
 * Remove an SSE client connection (on disconnect).
 * @param {string} userId
 * @param {import('express').Response} res
 */
export function removeClient(userId, res) {
  const userClients = clients.get(userId);
  if (!userClients) { log.debug('removeClient: no registry entry for user, nothing to remove', { userId }); return; }
  userClients.delete(res);
  if (userClients.size === 0) {
    clients.delete(userId);
  }
  log.info('removeClient: SSE client removed', { userId, remainingConnectionsForUser: userClients.size, totalUsers: clients.size });
}

/**
 * Push an SSE event to all open connections for a specific user.
 * @param {string} userId
 * @param {string} event  - SSE event name (e.g. 'notification')
 * @param {object} data   - JSON-serializable payload
 */
export function pushToUser(userId, event, data) {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) {
    log.debug('pushToUser: no live SSE connections for user, event dropped', { userId, event });
    return;
  }

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let delivered = 0;
  for (const res of userClients) {
    try {
      res.write(payload);
      delivered++;
    } catch (err) {
      // Connection died silently — remove it
      log.warn('pushToUser: write to dead connection failed, removing', { userId, event, err });
      userClients.delete(res);
    }
  }
  log.debug('pushToUser: event pushed', { userId, event, delivered });
}

/**
 * Broadcast an SSE event to ALL connected users.
 * @param {string} event
 * @param {object} data
 */
export function pushToAll(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let delivered = 0;
  for (const [, userClients] of clients) {
    for (const res of userClients) {
      try {
        res.write(payload);
        delivered++;
      } catch (_) {
        userClients.delete(res);
      }
    }
  }
  log.debug('pushToAll: event broadcast', { event, delivered, totalUsers: clients.size });
}

/** Returns how many users are currently connected (for health checks). */
export function getConnectedCount() {
  return clients.size;
}
