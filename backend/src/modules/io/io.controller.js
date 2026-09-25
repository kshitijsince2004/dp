import * as ioService from './io.service.js';
import { getLogger } from '../../utils/logger.js';

// Matches modules/records/records.service.js style (logging-instrumentation-2026-07-22
// HANDOFF.md §7).
const log = getLogger('io.controller');

const statusForError = (message) => {
  if (message.includes('Access denied')) return 403;
  if (message.includes('already exists')) return 409;
  return 400;
};

export const listIOs = async (req, res) => {
  log.debug('listIOs: enter', { userId: req.user?.id || null, jurisdictionQuery: req.jurisdictionQuery, psIdFilter: req.query.ps_id || null });
  try {
    const data = await ioService.listIOs(req.jurisdictionQuery, { ps_id: req.query.ps_id, include_inactive: req.query.include_inactive === 'true' });
    log.info('listIOs: exit', { resultCount: data.length });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    log.error('listIOs: failed', { err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createIO = async (req, res) => {
  log.debug('createIO: enter', { userId: req.user?.id || null, jurisdictionQuery: req.jurisdictionQuery, name: req.body?.name || null });
  try {
    const data = await ioService.createIO(req.jurisdictionQuery, req.body);
    log.info('createIO: exit', { ioId: data.id });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    log.warn('createIO: rejected', { reason: error.message });
    return res.status(statusForError(error.message)).json({ success: false, message: error.message });
  }
};

export const updateIO = async (req, res) => {
  log.debug('updateIO: enter', { userId: req.user?.id || null, ioId: req.params.id, jurisdictionQuery: req.jurisdictionQuery });
  try {
    const data = await ioService.updateIO(req.jurisdictionQuery, req.params.id, req.body);
    log.info('updateIO: exit', { ioId: req.params.id });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    const status = error.message === 'Investigating officer not found' ? 404 : statusForError(error.message);
    log.warn('updateIO: rejected', { ioId: req.params.id, status, reason: error.message });
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const deleteIO = async (req, res) => {
  log.debug('deleteIO: enter', { userId: req.user?.id || null, ioId: req.params.id, jurisdictionQuery: req.jurisdictionQuery });
  try {
    await ioService.deleteIO(req.jurisdictionQuery, req.params.id);
    log.info('deleteIO: exit', { ioId: req.params.id });
    return res.status(200).json({ success: true, data: { message: 'Investigating officer deactivated' } });
  } catch (error) {
    const status = error.message === 'Investigating officer not found' ? 404 : statusForError(error.message);
    log.warn('deleteIO: rejected', { ioId: req.params.id, status, reason: error.message });
    return res.status(status).json({ success: false, message: error.message });
  }
};
