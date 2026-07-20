import * as compilationService from './compilation.service.js';
import { toISO } from '../../utils/dateFormat.js';

/**
 * GET /compilations
 * Returns all compilations for the logged-in District Officer's district.
 */
export const getCompilations = async (req, res, next) => {
  try {
    // Prefer JWT-bound district_id; fall back to query param for HQ/admin overrides
    const districtId = req.user?.district_id || req.user?.districtId || req.query.districtId;
    const { period, status } = req.query;
    // compilations.period is a native DATE column; frontend sends dd/mm/yyyy.
    const compilations = await compilationService.getCompilations(districtId, toISO(period) || period, status);
    res.status(200).json({ status: 'success', success: true, data: compilations });
  } catch (error) {
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

    if (!period) {
      return res.status(400).json({ status: 'error', success: false, message: 'period is required' });
    }
    if (!districtId) {
      return res.status(400).json({ status: 'error', success: false, message: 'User is not bound to a district' });
    }

    const compilation = await compilationService.createCompilation(districtId, period, userId, toISO(fromDate), toISO(toDate));
    res.status(201).json({ status: 'success', success: true, data: compilation });
  } catch (error) {
    // Return 400 for validation errors (no records, bad input), 500 for DB errors
    const statusCode = error.message.includes('No records') || error.message.includes('required') ? 400 : 500;
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
    const compilation = await compilationService.getCompilation(id);
    if (!compilation) {
      return res.status(404).json({ status: 'error', success: false, message: 'Compilation not found' });
    }
    res.status(200).json({ status: 'success', success: true, data: compilation });
  } catch (error) {
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
    const compilation = await compilationService.submitCompilation(id, req.user);
    res.status(200).json({ status: 'success', success: true, data: compilation });
  } catch (error) {
    const statusCode = error.message.includes('not found') ? 404
      : error.message.includes('Only DRAFT') ? 409 : 500;
    res.status(statusCode).json({ status: 'error', success: false, message: error.message });
  }
};
