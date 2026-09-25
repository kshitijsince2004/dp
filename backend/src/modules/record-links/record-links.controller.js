import * as service from './record-links.service.js';
import { verifyRecordAccess } from '../../middleware/rbac.middleware.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('record-links.controller');

// Maps a thrown Error to an HTTP status consistent with the rest of the codebase
// (records.controller.js's `err.message.includes('Access denied') ? 403 : 500` pattern),
// extended with a 404 for the "not found" errors verifyRecordAccess/service throw.
const statusFor = (err) => {
  if (err.status) return err.status;
  if (err.message && err.message.includes('Access denied')) return 403;
  if (err.message && err.message.includes('not found')) return 404;
  return 500;
};

export const getLinkTypes = async (req, res) => {
  log.debug('getLinkTypes: enter');
  try {
    const types = await service.getLinkTypes();
    log.debug('getLinkTypes: 200', { count: types.length });
    return res.status(200).json({ success: true, data: types });
  } catch (err) {
    log.error('getLinkTypes: failed', { err });
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getLinksForRecord = async (req, res) => {
  const { recordId } = req.params;
  log.debug('getLinksForRecord: enter', { recordId, userId: req.user?.id });
  try {
    // Single-record read — P5.2: verify jurisdiction access before returning anything.
    await verifyRecordAccess(recordId, req.user);
    log.debug('getLinksForRecord: access check passed', { recordId, userId: req.user?.id });
    const links = await service.getLinksForRecord(recordId);
    log.info('getLinksForRecord: 200', { recordId, count: links.length });
    return res.status(200).json({ success: true, data: links });
  } catch (err) {
    const status = statusFor(err);
    log.warn('getLinksForRecord: rejected/failed', { recordId, status, err });
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const createLink = async (req, res) => {
  const { sourceRecordId, targetRecordId, linkTypeCode, metadata } = req.body;
  log.debug('createLink: enter', { sourceRecordId, targetRecordId, linkTypeCode, userId: req.user?.id });
  if (!sourceRecordId || !targetRecordId || !linkTypeCode) {
    log.warn('createLink: rejected — missing required fields', { sourceRecordId, targetRecordId, linkTypeCode });
    return res.status(400).json({ success: false, message: 'sourceRecordId, targetRecordId, and linkTypeCode are required' });
  }
  try {
    // RECORD-LINKAGE.md / P5.6: a link may only be created by someone with access to at
    // least the owning/source side.
    await verifyRecordAccess(sourceRecordId, req.user);
    log.debug('createLink: access check passed on source record', { sourceRecordId, userId: req.user?.id });
    const link = await service.createLink({
      sourceRecordId,
      targetRecordId,
      linkTypeCode,
      userId: req.user.id,
      metadata: metadata || {}
    });
    log.info('createLink: 201', { linkId: link.id, sourceRecordId, targetRecordId, linkTypeCode });
    return res.status(201).json({ success: true, data: link });
  } catch (err) {
    const status = statusFor(err);
    log.warn('createLink: rejected/failed', { sourceRecordId, targetRecordId, linkTypeCode, status, err });
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const deleteLink = async (req, res) => {
  const { id } = req.params;
  log.debug('deleteLink: enter', { linkId: id, userId: req.user?.id });
  try {
    const link = await service.getLinkById(id);
    if (!link) {
      log.warn('deleteLink: rejected — link not found', { linkId: id });
      return res.status(404).json({ success: false, message: 'Link not found' });
    }
    // Same rule as createLink: access to the owning/source record is required to unlink.
    await verifyRecordAccess(link.source_record_id, req.user);
    log.debug('deleteLink: access check passed on source record', { linkId: id, sourceRecordId: link.source_record_id });
    await service.deleteLink(id, req.user.id);
    log.info('deleteLink: 200', { linkId: id });
    return res.status(200).json({ success: true, message: 'Link removed' });
  } catch (err) {
    const status = statusFor(err);
    log.warn('deleteLink: rejected/failed', { linkId: id, status, err });
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const personSearch = async (req, res) => {
  const { searchTerm, fatherName, limit, psId, districtId } = req.query;
  log.debug('personSearch: enter', { searchTerm, fatherName, psId, districtId, userId: req.user?.id, jurisdictionQuery: req.jurisdictionQuery });
  try {
    const results = await service.searchPersonAcrossArrests({
      searchTerm,
      fatherName,
      jurisdictionQuery: req.jurisdictionQuery || {},
      // Optional narrowing within the enforced scope only — see service for the AND logic.
      psId,
      districtId,
      limit: limit ? parseInt(limit, 10) : 50
    });
    log.info('personSearch: 200', { resultCount: results.length, searchTerm, fatherName });
    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    const status = statusFor(err);
    log.error('personSearch: failed', { status, err });
    return res.status(status).json({ success: false, message: err.message });
  }
};
