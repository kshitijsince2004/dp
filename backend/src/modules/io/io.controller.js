import * as ioService from './io.service.js';

const statusForError = (message) => {
  if (message.includes('Access denied')) return 403;
  if (message.includes('already exists')) return 409;
  return 400;
};

export const listIOs = async (req, res) => {
  try {
    const data = await ioService.listIOs(req.jurisdictionQuery, { ps_id: req.query.ps_id, include_inactive: req.query.include_inactive === 'true' });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createIO = async (req, res) => {
  try {
    const data = await ioService.createIO(req.jurisdictionQuery, req.body);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return res.status(statusForError(error.message)).json({ success: false, message: error.message });
  }
};

export const updateIO = async (req, res) => {
  try {
    const data = await ioService.updateIO(req.jurisdictionQuery, req.params.id, req.body);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    const status = error.message === 'Investigating officer not found' ? 404 : statusForError(error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const deleteIO = async (req, res) => {
  try {
    await ioService.deleteIO(req.jurisdictionQuery, req.params.id);
    return res.status(200).json({ success: true, data: { message: 'Investigating officer deactivated' } });
  } catch (error) {
    const status = error.message === 'Investigating officer not found' ? 404 : statusForError(error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
};
