import * as service from './record-links.service.js';
import { verifyRecordAccess } from '../../middleware/rbac.middleware.js';

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
  try {
    const types = await service.getLinkTypes();
    return res.status(200).json({ success: true, data: types });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getLinksForRecord = async (req, res) => {
  const { recordId } = req.params;
  try {
    // Single-record read — P5.2: verify jurisdiction access before returning anything.
    await verifyRecordAccess(recordId, req.user);
    const links = await service.getLinksForRecord(recordId);
    return res.status(200).json({ success: true, data: links });
  } catch (err) {
    return res.status(statusFor(err)).json({ success: false, message: err.message });
  }
};

export const createLink = async (req, res) => {
  const { sourceRecordId, targetRecordId, linkTypeCode, metadata } = req.body;
  if (!sourceRecordId || !targetRecordId || !linkTypeCode) {
    return res.status(400).json({ success: false, message: 'sourceRecordId, targetRecordId, and linkTypeCode are required' });
  }
  try {
    // RECORD-LINKAGE.md / P5.6: a link may only be created by someone with access to at
    // least the owning/source side.
    await verifyRecordAccess(sourceRecordId, req.user);
    const link = await service.createLink({
      sourceRecordId,
      targetRecordId,
      linkTypeCode,
      userId: req.user.id,
      metadata: metadata || {}
    });
    return res.status(201).json({ success: true, data: link });
  } catch (err) {
    return res.status(statusFor(err)).json({ success: false, message: err.message });
  }
};

export const deleteLink = async (req, res) => {
  const { id } = req.params;
  try {
    const link = await service.getLinkById(id);
    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found' });
    }
    // Same rule as createLink: access to the owning/source record is required to unlink.
    await verifyRecordAccess(link.source_record_id, req.user);
    await service.deleteLink(id, req.user.id);
    return res.status(200).json({ success: true, message: 'Link removed' });
  } catch (err) {
    return res.status(statusFor(err)).json({ success: false, message: err.message });
  }
};

export const personSearch = async (req, res) => {
  const { searchTerm, fatherName, limit, psId, districtId } = req.query;
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
    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    return res.status(statusFor(err)).json({ success: false, message: err.message });
  }
};
