import * as recordsService from './records.service.js';
import * as workflowEngine from '../workflow/workflow.engine.js';
import { verifyRecordAccess } from '../../middleware/rbac.middleware.js';
import { maskRecordData, maskRecordDataBatch, maskRecordDetails } from '../level-contracts/levelContracts.service.js';
import { toISO } from '../../utils/dateFormat.js';
import { getLogger } from '../../utils/logger.js';
import { redact } from '../../utils/redact.js';

// Thin HTTP layer over records.service.js (the STYLE ANCHOR — see HANDOFF.md §7). The service
// already logs every step of the actual work; this file logs only entry (redacted
// params/counts), exit (status + primary id), and catch — no re-logging of service internals.
const log = getLogger('records.controller');

export const getRecords = async (req, res) => {
  const type = req.query.type || req.query.record_type;
  // C12 (2026-07-26 bugfix batch): derived Kalandra / Arrest-against-FIR filter (frontend
  // contract fixed in advance — UnifiedFilterStrip.jsx / MyRecords.jsx send `arrest_kind`,
  // never classify locally, per P4). Unrecognized/omitted values are intentionally passed
  // through unfiltered — listRecords only acts on the two known enum values.
  const { status, dateFrom, dateTo, search, linked_case_id, linked_fir_no, localHead, local_head, arrest_kind, limit, offset, ...extraFilters } = req.query;
  log.debug('getRecords: enter', { type, query: redact(req.query), userId: req.user?.id });

  try {
    const records = await recordsService.listRecords(
      type,
      {
        ...extraFilters,
        status: status !== 'ALL' ? status : null,
        dateFrom: toISO(dateFrom) || dateFrom,
        dateTo: toISO(dateTo) || dateTo,
        search,
        linked_case_id,
        linked_fir_no,
        localHead: localHead || local_head,
        arrestKind: arrest_kind,
        limit,
        offset
      },
      req.jurisdictionQuery
    );
    const maskedRecords = await maskRecordDataBatch(records, req.user);
    log.info('getRecords: exit', { type, resultCount: maskedRecords.length, userId: req.user?.id });
    return res.status(200).json({ success: true, data: { cases: maskedRecords } }); // named cases for UI compatibility
  } catch (error) {
    log.error('getRecords: failed', { type, userId: req.user?.id, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getRecord = async (req, res) => {
  const { id } = req.params;
  log.debug('getRecord: enter', { recordId: id, userId: req.user?.id });

  try {
    // Verify geographical scope access
    await verifyRecordAccess(id, req.user);

    const data = await recordsService.getRecordDetails(id);
    if (!data) {
      log.info('getRecord: not found', { recordId: id });
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
    const maskedData = await maskRecordDetails(data, req.user);
    log.info('getRecord: exit', { recordId: id, userId: req.user?.id });
    return res.status(200).json({ success: true, data: maskedData });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 500;
    log.error('getRecord: failed', { recordId: id, userId: req.user?.id, status, err: error });
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const create = async (req, res) => {
  const { record_type, data, persons = [], properties = [], offences = [] } = req.body;
  // record_date is a native DATE column; frontend sends dd/mm/yyyy, parse to ISO.
  const record_date = toISO(req.body.record_date) || new Date().toISOString().split('T')[0];
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  log.debug('create: enter', {
    record_type, record_date, userId: req.user?.id,
    keys: Object.keys(data || {}), personsCount: persons.length, propertiesCount: properties.length, offencesCount: offences.length,
  });

  if (!record_type || !record_date || !data) {
    log.warn('create: rejected — missing record_type/record_date/data', { record_type, record_date, hasData: !!data });
    return res.status(400).json({ success: false, message: 'record_type, record_date, and data block are required' });
  }

  // G2 defence-in-depth (Kalandra safety) — mirrors import.compose.js. If the data block
  // carries is_dd_based=true (stamped by DynamicForm for caseType=kalandra), clear fir_no
  // so linkResolver never auto-links a standalone DD arrest to a CASE. Applied here rather
  // than inside the service so the sanitised value is what the mapper/registry writes.
  if (record_type === 'ARREST' && data.is_dd_based === true) {
    delete data.fir_no;
    delete data.fir_date;
    log.debug('create: G2 Kalandra guard applied — fir_no/fir_date stripped from is_dd_based record', { record_type });
  }

  try {
    const record = await recordsService.createRecord(
      req.user,
      record_type,
      record_date,
      data,
      ipAddress,
      { persons, properties, offences }
    );
    log.info('create: exit', { recordId: record.id, record_type, userId: req.user?.id });
    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    const status = error.status || 500;
    log.error('create: failed', { record_type, userId: req.user?.id, status, err: error });
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const update = async (req, res) => {
  const { id } = req.params;
  const { data, persons, properties, offences } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  log.debug('update: enter', {
    recordId: id, userId: req.user?.id, keys: Object.keys(data || {}),
    personsProvided: persons !== undefined, propertiesProvided: properties !== undefined, offencesProvided: offences !== undefined,
  });

  if (!data) {
    log.warn('update: rejected — missing data block', { recordId: id });
    return res.status(400).json({ success: false, message: 'Update data block is required' });
  }

  try {
    // Validate scope
    await verifyRecordAccess(id, req.user);

    const record = await recordsService.updateRecord(id, req.user, data, ipAddress, { persons, properties, offences });
    log.info('update: exit', { recordId: id, userId: req.user?.id });
    return res.status(200).json({ success: true, data: record });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : (error.status || 500);
    log.error('update: failed', { recordId: id, userId: req.user?.id, status, err: error });
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const submit = async (req, res) => {
  const { id } = req.params;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  log.debug('submit: enter', { recordId: id, userId: req.user?.id });

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.submitRecord(id, req.user, ipAddress);
    log.info('submit: exit', { recordId: id, userId: req.user?.id });
    return res.status(200).json({ success: true, message: 'Record submitted successfully' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : (error.status || 500);
    log.error('submit: failed', { recordId: id, userId: req.user?.id, status, err: error });
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const updateStatus = async (req, res) => {
  const { id } = req.params;
  const {
    status_field, new_value, effective_date, comment, property_id,
    supplementary_chargesheet_details, court_case_no, court_name, court_disposal_date, sent_to_court_date,
    transfer_to_type, transferred_to_ps_id, transferred_to_agency_id, date_of_transfer,
  } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  log.debug('updateStatus: enter', { recordId: id, statusField: status_field, newValue: new_value, userId: req.user?.id });

  try {
    await verifyRecordAccess(id, req.user);
    const result = await recordsService.updateDomainStatus(
      id, req.user,
      {
        statusField: status_field, newValue: new_value, effectiveDate: effective_date, comment, propertyId: property_id,
        supplementary_chargesheet_details, court_case_no, court_name, court_disposal_date, sent_to_court_date,
        transfer_to_type, transferred_to_ps_id, transferred_to_agency_id, date_of_transfer,
      },
      ipAddress
    );
    log.info('updateStatus: exit', { recordId: id, statusField: status_field, userId: req.user?.id });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : (error.status || 400);
    log.error('updateStatus: failed', { recordId: id, statusField: status_field, userId: req.user?.id, status, err: error });
    return res.status(status).json({ success: false, message: error.message });
  }
};

// Registry-driven status field/options catalog for the record's type (WS8) — feeds the
// frontend's "update status" modal so it never hardcodes which fields exist or their
// vocabulary (baseline P4). Same access guard as PATCH /:id/status.
export const getStatusOptions = async (req, res) => {
  const { id } = req.params;
  log.debug('getStatusOptions: enter', { recordId: id, userId: req.user?.id });

  try {
    await verifyRecordAccess(id, req.user);
    const result = await recordsService.getStatusOptions(id, req.user);
    log.debug('getStatusOptions: exit', { recordId: id });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : (error.status || 500);
    log.error('getStatusOptions: failed', { recordId: id, status, err: error });
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const approve = async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  log.debug('approve: enter', { recordId: id, userId: req.user?.id });

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.transitionRecord(id, req.user, 'approve', comment, null, ipAddress);
    log.info('approve: exit', { recordId: id, userId: req.user?.id });
    return res.status(200).json({ success: true, message: 'Record approved and advanced successfully' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    log.error('approve: failed', { recordId: id, userId: req.user?.id, status, err: error });
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const sendBack = async (req, res) => {
  const { id } = req.params;
  const { comment, target_fields } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  log.debug('sendBack: enter', { recordId: id, userId: req.user?.id, targetFields: target_fields });

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.transitionRecord(id, req.user, 'send_back', comment, target_fields, ipAddress);
    log.info('sendBack: exit', { recordId: id, userId: req.user?.id });
    return res.status(200).json({ success: true, message: 'Record sent back to operator' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    log.error('sendBack: failed', { recordId: id, userId: req.user?.id, status, err: error });
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const overrideHead = async (req, res) => {
  const { id } = req.params;
  const { caseHeadId, reason } = req.body; // mapped to match verification test caseHeadId
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  log.debug('overrideHead: enter', { recordId: id, caseHeadId, userId: req.user?.id });

  try {
    await verifyRecordAccess(id, req.user);
    const result = await recordsService.overrideCaseHead(id, req.user, caseHeadId, reason, ipAddress);
    log.info('overrideHead: exit', { recordId: id, caseHeadId, userId: req.user?.id });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    log.error('overrideHead: failed', { recordId: id, caseHeadId, userId: req.user?.id, status, err: error });
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const getQueue = async (req, res) => {
  const { type, status, dateFrom, dateTo, search, localHead, local_head } = req.query;
  log.debug('getQueue: enter', { type, status, userId: req.user?.id, role: req.user?.role });

  try {
    // Queue statuses derive from workflow config: the from_status values of the
    // transitions this role may perform. Roles without transitions (HQ_ANALYST,
    // ACP until its config rows land) get an empty queue by design.
    const targetStatus = await workflowEngine.getQueueStatuses(req.user);
    log.debug('getQueue: derived queue statuses from workflow config', { role: req.user?.role, targetStatus });
    if (targetStatus.length === 0) {
      log.info('getQueue: exit — empty queue (no transitions for role)', { role: req.user?.role, userId: req.user?.id });
      return res.status(200).json({ success: true, data: { queue: [] } });
    }

    let filterStatus = targetStatus;
    if (status && status !== 'ALL') {
      filterStatus = targetStatus.includes(status) ? status : targetStatus;
      log.debug('getQueue: narrowed by requested status filter', { requestedStatus: status, filterStatus });
    }

    const records = await recordsService.listRecords(
      type,
      {
        status: filterStatus,
        dateFrom: toISO(dateFrom) || dateFrom,
        dateTo: toISO(dateTo) || dateTo,
        search,
        localHead: localHead || local_head
      },
      req.jurisdictionQuery
    );
    const maskedRecords = await maskRecordDataBatch(records, req.user);
    log.info('getQueue: exit', { role: req.user?.role, resultCount: maskedRecords.length, userId: req.user?.id });
    return res.status(200).json({ success: true, data: { queue: maskedRecords } });
  } catch (error) {
    log.error('getQueue: failed', { type, userId: req.user?.id, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const jcpApprove = async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  log.debug('jcpApprove: enter', { recordId: id, userId: req.user?.id });

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.transitionRecord(id, req.user, 'approve', comment, null, ipAddress);
    log.info('jcpApprove: exit', { recordId: id, userId: req.user?.id });
    return res.status(200).json({ success: true, message: 'Record JCP approved and sent to SCP_REVIEW' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    log.error('jcpApprove: failed', { recordId: id, userId: req.user?.id, status, err: error });
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const scpApprove = async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  log.debug('scpApprove: enter', { recordId: id, userId: req.user?.id });

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.transitionRecord(id, req.user, 'approve', comment, null, ipAddress);
    log.info('scpApprove: exit', { recordId: id, userId: req.user?.id });
    return res.status(200).json({ success: true, message: 'Record SCP approved and sent to HQ_RECEIVED' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    log.error('scpApprove: failed', { recordId: id, userId: req.user?.id, status, err: error });
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const seal = async (req, res) => {
  const { id } = req.params;
  const { seal_note } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  log.debug('seal: enter', { recordId: id, userId: req.user?.id });

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.transitionRecord(id, req.user, 'seal', seal_note || 'Record sealed and archived', null, ipAddress);
    log.info('seal: exit', { recordId: id, userId: req.user?.id });
    return res.status(200).json({ success: true, message: 'Record sealed and ARCHIVED successfully' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    log.error('seal: failed', { recordId: id, userId: req.user?.id, status, err: error });
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const checkDuplicate = async (req, res) => {
  const { record_type, fir_number, accused_name, date } = req.query;
  log.debug('checkDuplicate: enter', { record_type, fir_number, hasAccusedName: !!accused_name, date });

  if (!record_type) {
    log.warn('checkDuplicate: rejected — missing record_type', {});
    return res.status(400).json({ success: false, message: 'record_type query parameter is required' });
  }

  try {
    const result = await recordsService.checkDuplicateRecord(
      record_type,
      fir_number,
      accused_name,
      date
    );
    log.debug('checkDuplicate: exit', { record_type, isDuplicate: result?.isDuplicate, existingId: result?.existingId || null });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    log.error('checkDuplicate: failed', { record_type, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteRecord = async (req, res) => {
  const { id } = req.params;
  log.debug('deleteRecord: enter', { recordId: id, userId: req.user?.id });

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.deleteRecord(id, req.user);
    log.info('deleteRecord: exit', { recordId: id, userId: req.user?.id });
    return res.status(200).json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : (error.status || 500);
    log.error('deleteRecord: failed', { recordId: id, userId: req.user?.id, status, err: error });
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const searchRecords = async (req, res) => {
  const { record_type, filter_spec } = req.body;
  log.debug('searchRecords: enter', { record_type, filterSpec: redact(filter_spec), userId: req.user?.id });

  try {
    const records = await recordsService.searchRecordsWithSpec(
      record_type,
      filter_spec,
      req.jurisdictionQuery
    );
    const maskedRecords = await maskRecordDataBatch(records, req.user);
    log.info('searchRecords: exit', { record_type, resultCount: maskedRecords.length, userId: req.user?.id });
    return res.status(200).json({ success: true, data: { cases: maskedRecords } });
  } catch (error) {
    log.error('searchRecords: failed', { record_type, userId: req.user?.id, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};
