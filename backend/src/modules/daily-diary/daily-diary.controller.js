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

  const role = user?.role;
  const userPsId = user?.ps_id || user?.psId || user?.station_id || user?.stationId || null;
  const userDistrictId = user?.district_id || user?.districtId || null;
  const userSubDivId = user?.sub_div_id || user?.subDivId || user?.sub_division_id || null;

  const reqPsId = query.psId || query.ps_id || query.station_id;
  const reqDistrictId = query.districtId || query.district_id;

  if (role === 'HC' || role === 'SHO') {
    scope.psId = userPsId;
  } else if (role === 'DISTRICT_OFFICER' || role === 'DISTRICT') {
    scope.districtId = userDistrictId;
    if (reqPsId && scope.districtId && await psBelongsToDistrict(reqPsId, scope.districtId)) {
      scope.psId = reqPsId;
    } else if (reqPsId) {
      scope.psId = reqPsId;
    }
  } else if (role === 'ACP') {
    scope.subDivId = userSubDivId;
    if (reqPsId && scope.subDivId && await psBelongsToSubDiv(reqPsId, scope.subDivId)) {
      scope.psId = reqPsId;
    } else if (reqPsId) {
      scope.psId = reqPsId;
    }
  } else {
    // HQ_ANALYST, HQ_ADMIN, SYSTEM_ADMIN, HQ
    if (reqPsId) scope.psId = reqPsId;
    if (reqDistrictId) scope.districtId = reqDistrictId;
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

export const exportDailyDiary = async (req, res, next) => {
  try {
    const rawDateFrom = req.query.date || req.query.fromDate || req.query.dateFrom || req.query.from_date || req.query.from || req.query.startDate;
    const rawDateTo = req.query.dateTo || req.query.toDate || req.query.date_to || req.query.to_date || req.query.to || req.query.endDate;

    const parseOptDate = (str) => {
      if (!str || str.toUpperCase() === 'ALL') return null;
      return toISO(str) || (/^\d{4}-\d{2}-\d{2}$/.test(str) ? str : null);
    };

    const date = parseOptDate(rawDateFrom);
    const dateTo = parseOptDate(rawDateTo);

    const scope = await resolveScope(req.user, req.query);
    const tableNames = req.query.tableNames ? req.query.tableNames.split(',') : null;

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
