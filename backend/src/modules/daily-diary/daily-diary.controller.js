import db from '../../config/db.js';
import * as dailyDiaryService from './daily-diary.service.js';
import { logger } from '../../utils/logger.js';
import { toISO } from '../../utils/dateFormat.js';

// Helper to validate and default date; frontend sends dd/mm/yyyy, record_date
// is a native DATE column so we resolve to ISO for the actual query.
const getValidatedDate = (req) => {
  let dateStr = req.query.date;
  if (dateStr) {
    const iso = toISO(dateStr);
    if (!iso) {
      throw {
        status: 400,
        code: 'BAD_REQUEST',
        message: 'Invalid date format. Expected DD/MM/YYYY.'
      };
    }
    dateStr = iso;
  } else {
    // Today's date in local server time format YYYY-MM-DD
    const localDate = new Date();
    const offset = localDate.getTimezoneOffset();
    const localTime = new Date(localDate.getTime() - (offset * 60 * 1000));
    dateStr = localTime.toISOString().split('T')[0];
  }
  return dateStr;
};

// A PS hangs off a SUB_DIVISION, which hangs off a DISTRICT — walk that chain
// to confirm a client-supplied psId actually falls inside the caller's own
// district/sub-division before trusting it, instead of taking it verbatim.
const psBelongsToDistrict = async (psId, districtId) => {
  const ps = await db('hierarchy_nodes').where({ id: psId, node_type: 'PS', is_active: true }).first();
  if (!ps || !ps.parent_id) return false;
  const subDiv = await db('hierarchy_nodes').where({ id: ps.parent_id, is_active: true }).first();
  return !!subDiv && subDiv.parent_id === districtId;
};

const psBelongsToSubDiv = async (psId, subDivId) => {
  const ps = await db('hierarchy_nodes').where({ id: psId, node_type: 'PS', is_active: true }).first();
  return !!ps && ps.parent_id === subDivId;
};

// Helper to resolve scoping boundaries based on user and queries
const resolveScope = async (user, query) => {
  const scope = {
    psId: null,
    districtId: null,
    subDivId: null
  };

  const role = user.role;

  if (role === 'HC' || role === 'SHO') {
    scope.psId = user.ps_id || null;
  } else if (role === 'DISTRICT_OFFICER') {
    scope.districtId = user.district_id || null;
    if (query.psId && scope.districtId && await psBelongsToDistrict(query.psId, scope.districtId)) {
      scope.psId = query.psId;
    }
  } else if (role === 'ACP') {
    scope.subDivId = user.sub_div_id || null;
    if (query.psId && scope.subDivId && await psBelongsToSubDiv(query.psId, scope.subDivId)) {
      scope.psId = query.psId;
    }
  } else {
    // HQ_ANALYST, HQ_ADMIN, SYSTEM_ADMIN
    if (query.psId) scope.psId = query.psId;
    if (query.districtId) scope.districtId = query.districtId;
  }

  return scope;
};

export const getPreview = async (req, res, next) => {
  try {
    const date = getValidatedDate(req);
    const scope = await resolveScope(req.user, req.query);

    const data = await dailyDiaryService.getDailyDiaryPreview(
      req.user,
      date,
      scope.psId,
      scope.districtId,
      scope.subDivId
    );

    return res.status(200).json({
      status: 'success',
      success: true,
      data
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        status: 'error',
        success: false,
        code: error.code,
        message: error.message
      });
    }
    next(error);
  }
};

export const exportExcel = async (req, res, next) => {
  try {
    const date = getValidatedDate(req);
    const { fromDate, toDate } = req.query;
    const scope = await resolveScope(req.user, req.query);
    const tableNames = req.query.tableNames ? req.query.tableNames.split(',') : null;
    const dateTo = toISO(req.query.dateTo) || null;

    const { jobId } = await dailyDiaryService.queueDailyDiaryExport(
      req.user,
      date,
      scope.psId,
      scope.districtId,
      scope.subDivId,
      tableNames,
      dateTo
    );

    return res.status(202).json({
      status: 'accepted',
      success: true,
      data: {
        job_id: jobId,
        status_url: `/api/reports/status/${jobId}`,
        message: 'Daily diary export queued. Poll status_url to check progress.',
      }
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        status: 'error',
        success: false,
        code: error.code,
        message: error.message
      });
    }
    next(error);
  }
};

export const getDataAll = async (req, res, next) => {
  try {
    const date = getValidatedDate(req);
    const scope = await resolveScope(req.user, req.query);

    const data = await dailyDiaryService.getDailyDiaryData(
      req.user,
      date,
      scope.psId,
      scope.districtId,
      scope.subDivId
    );

    return res.status(200).json({
      status: 'success',
      success: true,
      data
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        status: 'error',
        success: false,
        code: error.code,
        message: error.message
      });
    }
    next(error);
  }
};

export const getDataByTable = async (req, res, next) => {
  try {
    const date = getValidatedDate(req);
    const scope = await resolveScope(req.user, req.query);
    const { tableName } = req.params;

    const data = await dailyDiaryService.getDailyDiaryData(
      req.user,
      date,
      scope.psId,
      scope.districtId,
      scope.subDivId,
      tableName
    );

    return res.status(200).json({
      status: 'success',
      success: true,
      data: data[tableName] || []
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        status: 'error',
        success: false,
        code: error.code,
        message: error.message
      });
    }
    next(error);
  }
};
