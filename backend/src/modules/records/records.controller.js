import * as recordsService from './records.service.js';
import { verifyRecordAccess } from '../../middleware/rbac.middleware.js';
import { maskRecordData, maskRecordDetails } from '../level-contracts/levelContracts.service.js';
import path from 'path';

export const getRecords = async (req, res) => {
  const type = req.query.type || req.query.record_type;
  const { status, dateFrom, dateTo, search, linked_case_id, linked_fir_no } = req.query;

  try {
    const records = await recordsService.listRecords(
      type,
      { status: status !== 'ALL' ? status : null, dateFrom, dateTo, search, linked_case_id, linked_fir_no },
      req.jurisdictionQuery
    );
    const maskedRecords = await Promise.all(
      records.map(record => maskRecordData(record, req.user))
    );
    return res.status(200).json({ success: true, data: { cases: maskedRecords } }); // named cases for UI compatibility
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getRecord = async (req, res) => {
  const { id } = req.params;

  try {
    // Verify geographical scope access
    await verifyRecordAccess(id, req.user);

    const data = await recordsService.getRecordDetails(id);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
    const maskedData = await maskRecordDetails(data, req.user);
    return res.status(200).json({ success: true, data: maskedData });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const create = async (req, res) => {
  const { record_type, data, persons = [], properties = [] } = req.body;
  const record_date = req.body.record_date || new Date().toISOString().split('T')[0];
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

  if (!record_type || !record_date || !data) {
    return res.status(400).json({ success: false, message: 'record_type, record_date, and data block are required' });
  }

  try {
    const record = await recordsService.createRecord(
      req.user,
      record_type,
      record_date,
      data,
      ipAddress,
      { persons, properties }
    );
    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const update = async (req, res) => {
  const { id } = req.params;
  const { data, persons, properties } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

  if (!data) {
    return res.status(400).json({ success: false, message: 'Update data block is required' });
  }

  try {
    // Validate scope
    await verifyRecordAccess(id, req.user);

    const record = await recordsService.updateRecord(id, req.user, data, ipAddress, { persons, properties });
    return res.status(200).json({ success: true, data: record });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : (error.status || 500);
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const submit = async (req, res) => {
  const { id } = req.params;

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.submitRecord(id, req.user);
    return res.status(200).json({ success: true, message: 'Record submitted successfully' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const approve = async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.transitionRecord(id, req.user, 'approve', comment, null, ipAddress);
    return res.status(200).json({ success: true, message: 'Record approved and advanced successfully' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const sendBack = async (req, res) => {
  const { id } = req.params;
  const { comment, target_fields } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.transitionRecord(id, req.user, 'send_back', comment, target_fields, ipAddress);
    return res.status(200).json({ success: true, message: 'Record sent back to operator' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const overrideHead = async (req, res) => {
  const { id } = req.params;
  const { caseHeadId, reason } = req.body; // mapped to match verification test caseHeadId
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

  try {
    await verifyRecordAccess(id, req.user);
    const result = await recordsService.overrideCaseHead(id, req.user, caseHeadId, reason, ipAddress);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const getQueue = async (req, res) => {
  const { role } = req.user;
  const { type, status, dateFrom, dateTo, search } = req.query;
  let targetStatus;

  if (role === 'HC') {
    targetStatus = ['DRAFT', 'SENT_BACK'];
  } else if (role === 'SHO') {
    targetStatus = ['PENDING_SHO'];
  } else if (role === 'DISTRICT_OFFICER') {
    targetStatus = ['DISTRICT_REVIEW'];
  } else {
    targetStatus = ['HQ_RECEIVED', 'DISTRICT_REVIEW', 'PENDING_SHO'];
  }

  let filterStatus = targetStatus;
  if (status && status !== 'ALL') {
    filterStatus = targetStatus.includes(status) ? status : targetStatus;
  }

  try {
    const records = await recordsService.listRecords(
      type,
      { status: filterStatus, dateFrom, dateTo, search },
      req.jurisdictionQuery
    );
    const maskedRecords = await Promise.all(
      records.map(record => maskRecordData(record, req.user))
    );
    return res.status(200).json({ success: true, data: { queue: maskedRecords } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const jcpApprove = async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.transitionRecord(id, req.user, 'approve', comment, null, ipAddress);
    return res.status(200).json({ success: true, message: 'Record JCP approved and sent to SCP_REVIEW' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const scpApprove = async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.transitionRecord(id, req.user, 'approve', comment, null, ipAddress);
    return res.status(200).json({ success: true, message: 'Record SCP approved and sent to HQ_RECEIVED' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const seal = async (req, res) => {
  const { id } = req.params;
  const { seal_note } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.transitionRecord(id, req.user, 'seal', seal_note || 'Record sealed and archived', null, ipAddress);
    return res.status(200).json({ success: true, message: 'Record sealed and ARCHIVED successfully' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const checkDuplicate = async (req, res) => {
  const { record_type, fir_number, accused_name, date } = req.query;

  if (!record_type) {
    return res.status(400).json({ success: false, message: 'record_type query parameter is required' });
  }

  try {
    const result = await recordsService.checkDuplicateRecord(
      record_type,
      fir_number,
      accused_name,
      date
    );
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const uploadAttachment = async (req, res) => {
  const { id } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  try {
    await verifyRecordAccess(id, req.user);
    const attachment = await recordsService.addAttachment(id, file, req.user);
    return res.status(201).json({ success: true, data: attachment });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const getAttachments = async (req, res) => {
  const { id } = req.params;

  try {
    await verifyRecordAccess(id, req.user);
    const attachments = await recordsService.listAttachments(id);
    return res.status(200).json({ success: true, data: attachments });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const deleteAttachment = async (req, res) => {
  const { id, aid } = req.params;

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.removeAttachment(id, aid, req.user);
    return res.status(200).json({ success: true, message: 'Attachment deleted successfully' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const deleteRecord = async (req, res) => {
  const { id } = req.params;

  try {
    await verifyRecordAccess(id, req.user);
    await recordsService.deleteRecord(id, req.user);
    return res.status(200).json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : (error.status || 500);
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const downloadAttachment = async (req, res) => {
  const { filename } = req.params;
  const filePath = path.resolve('uploads', filename);
  return res.sendFile(filePath);
};

export const searchRecords = async (req, res) => {
  const { record_type, filter_spec } = req.body;

  try {
    const records = await recordsService.searchRecordsWithSpec(
      record_type,
      filter_spec,
      req.jurisdictionQuery
    );
    const maskedRecords = await Promise.all(
      records.map(record => maskRecordData(record, req.user))
    );
    return res.status(200).json({ success: true, data: { cases: maskedRecords } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
