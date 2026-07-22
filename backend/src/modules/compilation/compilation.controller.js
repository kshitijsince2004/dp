import * as compilationService from './compilation.service.js';
import { toISO } from '../../utils/dateFormat.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('compilation.controller');

/**
 * GET /compilations
 * Returns all compilations for the logged-in District Officer's district.
 */
export const getCompilations = async (req, res, next) => {
  try {
    // Prefer JWT-bound district_id; fall back to query param for HQ/admin overrides
    const districtId = req.user?.district_id || req.user?.districtId || req.query.districtId;
    const { period, status } = req.query;
    log.debug('getCompilations: enter', { districtId, period, status, userId: req.user?.id });
    // compilations.period is a native DATE column; frontend sends dd/mm/yyyy.
    const compilations = await compilationService.getCompilations(districtId, toISO(period) || period, status);
    log.info('getCompilations: 200', { districtId, resultCount: compilations.length });
    res.status(200).json({ status: 'success', success: true, data: compilations });
  } catch (error) {
    log.error('getCompilations: failed', { err: error });
    next(error);
  }
};

/**
 * POST /compilations
 * Creates a new DRAFT compilation.
 */
export const createCompilation = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    // Resolve district from JWT first (authoritative), fall back to request body for admin overrides
    const districtId = req.user?.district_id || req.user?.districtId || req.body.district_id;
    const period = toISO(req.body.period || req.body.date);
    const { fromDate, toDate } = req.body;
    log.debug('createCompilation: enter', { districtId, period, userId, fromDate, toDate });

    if (!period) {
      log.warn('createCompilation: rejected — period missing', { userId });
      return res.status(400).json({ status: 'error', success: false, message: 'period is required' });
    }
    if (!districtId) {
      log.warn('createCompilation: rejected — user not bound to a district', { userId });
      return res.status(400).json({ status: 'error', success: false, message: 'User is not bound to a district' });
    }

    const compilation = await compilationService.createCompilation(districtId, period, userId, toISO(fromDate), toISO(toDate));
    log.info('createCompilation: 201', { compilationId: compilation.id, districtId, period });
    res.status(201).json({ status: 'success', success: true, data: compilation });
  } catch (error) {
    // Return 400 for validation errors (no records, bad input), 500 for DB errors
    const statusCode = error.message.includes('No records') || error.message.includes('required') ? 400 : 500;
    log.error('createCompilation: failed', { statusCode, err: error });
    res.status(statusCode).json({ status: 'error', success: false, message: error.message });
  }
};

/**
 * GET /compilations/:id
 * Returns a single compilation by ID.
 */
export const getCompilation = async (req, res, next) => {
  try {
    const { id } = req.params;
    log.debug('getCompilation: enter', { compilationId: id });
    const compilation = await compilationService.getCompilation(id);
    if (!compilation) {
      log.info('getCompilation: 404 not found', { compilationId: id });
      return res.status(404).json({ status: 'error', success: false, message: 'Compilation not found' });
    }
    log.info('getCompilation: 200', { compilationId: id });
    res.status(200).json({ status: 'success', success: true, data: compilation });
  } catch (error) {
    log.error('getCompilation: failed', { err: error });
    next(error);
  }
};

/**
 * POST /compilations/:id/submit
 * Submits a DRAFT compilation to HQ.
 */
export const submitCompilation = async (req, res, next) => {
  try {
    const { id } = req.params;
    log.debug('submitCompilation: enter', { compilationId: id, userId: req.user?.id });
    const compilation = await compilationService.submitCompilation(id, req.user);
    log.info('submitCompilation: 200', { compilationId: id });
    res.status(200).json({ status: 'success', success: true, data: compilation });
  } catch (error) {
    const statusCode = error.message.includes('not found') ? 404
      : error.message.includes('Only DRAFT') ? 409 : 500;
    log.error('submitCompilation: failed', { statusCode, err: error });
    res.status(statusCode).json({ status: 'error', success: false, message: error.message });
  }
};
