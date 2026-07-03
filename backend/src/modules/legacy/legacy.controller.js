import ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import db from '../../config/db.js';
import { checkDuplicateRecord } from '../records/records.service.js';
import { publish } from '../../events/eventBus.js';
import { toISO, toDMY } from '../../utils/dateFormat.js';

const DATE_FIELD_KEYS = new Set(['fir_date', 'gd_date', 'occurrence_date', 'arrest_date']);

const DEFAULT_MAPS = {
  CASES: {
    'FIR Number': 'fir_no',
    'FIR Date': 'fir_date',
    'GD Number': 'gd_no',
    'GD Date': 'gd_date',
    'GD Time': 'gd_time',
    'Occurrence Date': 'occurrence_date',
    'Occurrence Place': 'occurrence_place',
    'Complainant Name': 'complainant_name',
    'Complainant Address': 'complainant_address',
    'Accused Name': 'accused_name',
    'Accused Address': 'accused_address',
    'IO Name': 'io_name',
    'IO PIS': 'io_pis',
    'Case Head': 'case_head',
    'Brief Facts': 'brief_facts',
    'Status': 'status'
  },
  ARREST: {
    'Linked FIR/DD': 'linked_fir_no',
    'Arrestee Name': 'arrested_name',
    'Date of Arrest': 'arrest_date',
    'Crime Head': 'crime_head'
  },
  PCR: {
    'GD Number': 'pcr_gd_no',
    'Call Category': 'pcr_head',
    'Call Gist': 'call_gist'
  }
};

export const getColumnMap = async (req, res) => {
  const { record_type } = req.params;
  const type = record_type.toUpperCase();
  const mapping = DEFAULT_MAPS[type] || DEFAULT_MAPS.CASES;
  return res.status(200).json({ status: 'success', data: mapping });
};

export const importLegacy = async (req, res) => {
  const { record_type, ps_id, dry_run } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ status: 'error', message: 'No file uploaded' });
  }
  if (!record_type || !ps_id) {
    return res.status(400).json({ status: 'error', message: 'record_type and ps_id are required' });
  }

  const isDryRun = dry_run === 'true' || dry_run === true;
  const type = record_type.toUpperCase();

  try {
    const psNode = await db('hierarchy_nodes').where({ id: ps_id }).first();
    if (!psNode) {
      return res.status(404).json({ status: 'error', message: 'Police station node not found' });
    }

    let districtId = psNode.parent_id;
    const parentNode = await db('hierarchy_nodes').where({ id: psNode.parent_id }).first();
    if (parentNode && parentNode.node_type !== 'DISTRICT') {
      districtId = parentNode.parent_id;
    }

    const workbook = new ExcelJS.Workbook();
    if (file.originalname.endsWith('.csv')) {
      await workbook.csv.read(file.buffer);
    } else {
      await workbook.xlsx.load(file.buffer);
    }

    const worksheet = workbook.worksheets[0];
    const rows = [];
    
    const headers = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = cell.text ? cell.text.trim() : '';
    });

    const mapping = DEFAULT_MAPS[type] || DEFAULT_MAPS.CASES;

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowData = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber];
        const fieldKey = mapping[header];
        if (fieldKey) {
          const raw = cell.text ? cell.text.trim() : '';
          rowData[fieldKey] = DATE_FIELD_KEYS.has(fieldKey) ? (toDMY(raw) || raw) : raw;
        }
      });
      rows.push({ rowNum: rowNumber, data: rowData });
    });

    const errors = [];
    const duplicates = [];
    const validRecords = [];

    for (const r of rows) {
      const d = r.data;
      
      if (type === 'CASES' || type === 'CASE') {
        if (!d.fir_no) errors.push({ row: r.rowNum, reason: 'FIR Number is missing' });
        if (!d.fir_date) errors.push({ row: r.rowNum, reason: 'FIR Date is missing' });
      } else if (type === 'ARREST') {
        if (!d.arrested_name) errors.push({ row: r.rowNum, reason: 'Arrestee Name is missing' });
        if (!d.arrest_date) errors.push({ row: r.rowNum, reason: 'Date of Arrest is missing' });
      } else if (type === 'PCR' || type === 'PCR_CALL') {
        if (!d.pcr_gd_no) errors.push({ row: r.rowNum, reason: 'GD Number is missing' });
      }

      const hasError = errors.some(e => e.row === r.rowNum);
      if (!hasError) {
        const dupCheck = await checkDuplicateRecord(
          type,
          d.fir_no || d.pcr_gd_no || null,
          d.arrested_name || d.accused_name || null,
          d.fir_date || d.arrest_date || null
        );
        if (dupCheck.isDuplicate) {
          duplicates.push({ row: r.rowNum, existingId: dupCheck.existingId });
        } else {
          validRecords.push(r);
        }
      }
    }

    const batchId = uuidv4();
    const total_rows = rows.length;
    const skipped_count = duplicates.length;
    const error_count = errors.length;
    const imported_count = validRecords.length;

    if (isDryRun) {
      return res.status(200).json({
        status: 'success',
        data: {
          dry_run: true,
          total_rows,
          imported_count,
          skipped_count,
          error_count,
          errors,
          duplicates
        }
      });
    }

    await db.transaction(async (trx) => {
      await trx('legacy_import_batches').insert({
        id: batchId,
        ps_id: ps_id,
        record_type: type,
        source_file: file.originalname,
        imported_by: req.user ? (req.user.userId || req.user.id) : null,
        imported_at: new Date().toISOString(),
        total_rows,
        imported_count,
        skipped_count,
        error_count,
        status: 'COMPLETED',
        error_log: JSON.stringify(errors)
      });

      for (const r of validRecords) {
        const id = uuidv4();
        const recordDate = toISO(r.data.fir_date || r.data.arrest_date) || new Date().toISOString().split('T')[0];

        await trx('records').insert({
          id,
          record_type: type,
          ps_id: ps_id,
          district_id: districtId,
          data: JSON.stringify({ ...r.data, uid: `${type}-LEGACY-${id.substring(0,8)}` }),
          current_status: 'LEGACY_IMPORTED',
          current_level: 'PS',
          record_date: recordDate,
          created_by: req.user ? (req.user.userId || req.user.id) : null,
          is_legacy: true,
          source_system: 'EXCEL_IMPORT',
          imported_at: new Date().toISOString(),
          imported_by: req.user ? (req.user.userId || req.user.id) : null,
          legacy_ref: r.data.fir_no || r.data.pcr_gd_no || null
        });

        await trx('record_revisions').insert({
          id: uuidv4(),
          record_id: id,
          revision_number: 1,
          changed_by: req.user ? (req.user.userId || req.user.id) : null,
          changed_at: new Date().toISOString(),
          level: 'PS',
          change_type: 'CREATE',
          field_changes: JSON.stringify([]),
          comment: 'Legacy import provenance'
        });
      }
    });

    await publish('legacy.batch_imported', {
      batch_id: batchId,
      ps_id,
      record_type: type,
      imported_count,
      imported_by: req.user ? (req.user.userId || req.user.id) : null
    });

    return res.status(200).json({
      status: 'success',
      data: {
        batch_id: batchId,
        imported_count,
        skipped_count,
        error_count
      }
    });

  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const getBatches = async (req, res) => {
  try {
    const list = await db('legacy_import_batches')
      .orderBy('imported_at', 'desc')
      .limit(50);
    return res.status(200).json({ status: 'success', data: list });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const getBatch = async (req, res) => {
  const { id } = req.params;
  try {
    const batch = await db('legacy_import_batches').where({ id }).first();
    if (!batch) {
      return res.status(404).json({ status: 'error', message: 'Batch not found' });
    }
    batch.error_log = JSON.parse(batch.error_log || '[]');
    return res.status(200).json({ status: 'success', data: batch });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const requestAmendment = async (req, res) => {
  const { record_id, field_changes, reason } = req.body;

  if (!record_id || !field_changes || !reason) {
    return res.status(400).json({ status: 'error', message: 'record_id, field_changes, and reason are required' });
  }

  try {
    const id = uuidv4();
    await db('legacy_amendments').insert({
      id,
      record_id,
      requested_by: req.user ? (req.user.userId || req.user.id) : null,
      requested_at: new Date().toISOString(),
      status: 'PENDING',
      field_changes: JSON.stringify(field_changes),
      reason
    });

    await db('records').where({ id: record_id }).update({
      current_status: 'AMENDMENT_PENDING'
    });

    return res.status(201).json({ status: 'success', data: { amendment_id: id } });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const approveAmendment = async (req, res) => {
  const { id } = req.params;

  try {
    const amendment = await db('legacy_amendments').where({ id }).first();
    if (!amendment) {
      return res.status(404).json({ status: 'error', message: 'Amendment request not found' });
    }

    const changes = JSON.parse(amendment.field_changes);

    await db.transaction(async (trx) => {
      await trx('legacy_amendments').where({ id }).update({
        status: 'APPROVED',
        approved_by: req.user ? (req.user.userId || req.user.id) : null,
        approved_at: new Date().toISOString()
      });

      const record = await trx('records').where({ id: amendment.record_id }).first();
      if (record) {
        const oldData = JSON.parse(record.data || '{}');
        const newData = { ...oldData, ...changes };

        await trx('records').where({ id: amendment.record_id }).update({
          data: JSON.stringify(newData),
          current_status: 'LEGACY_IMPORTED'
        });

        const revCountRow = await trx('record_revisions')
          .where({ record_id: amendment.record_id })
          .count('* as count')
          .first();
        const nextRevNo = (parseInt(revCountRow.count, 10) || 0) + 1;

        await trx('record_revisions').insert({
          id: uuidv4(),
          record_id: amendment.record_id,
          revision_number: nextRevNo,
          changed_by: req.user ? (req.user.userId || req.user.id) : null,
          changed_at: new Date().toISOString(),
          level: 'PS',
          change_type: 'UPDATE',
          field_changes: JSON.stringify(changes),
          comment: `Amendment approved: ${amendment.reason}`
        });
      }
    });

    return res.status(200).json({ status: 'success', message: 'Amendment approved and record updated' });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const rejectAmendment = async (req, res) => {
  const { id } = req.params;

  try {
    const amendment = await db('legacy_amendments').where({ id }).first();
    if (!amendment) {
      return res.status(404).json({ status: 'error', message: 'Amendment request not found' });
    }

    await db.transaction(async (trx) => {
      await trx('legacy_amendments').where({ id }).update({
        status: 'REJECTED',
        approved_by: req.user ? (req.user.userId || req.user.id) : null,
        approved_at: new Date().toISOString()
      });

      await trx('records').where({ id: amendment.record_id }).update({
        current_status: 'LEGACY_IMPORTED'
      });
    });

    return res.status(200).json({ status: 'success', message: 'Amendment request rejected' });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const listAmendments = async (req, res) => {
  const { status } = req.query;
  try {
    let query = db('legacy_amendments')
      .select('legacy_amendments.*', 'r.record_type', 'u.username as requester_name')
      .leftJoin('records as r', 'legacy_amendments.record_id', 'r.id')
      .leftJoin('users as u', 'legacy_amendments.requested_by', 'u.id');

    if (status) {
      query = query.where('legacy_amendments.status', status.toUpperCase());
    }

    const list = await query.orderBy('requested_at', 'desc');
    return res.status(200).json({ status: 'success', data: list });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};
