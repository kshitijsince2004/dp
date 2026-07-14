import db from '../../config/db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { logoutUser, resolveScope } from '../auth/auth.service.js';

const ROLES = ['HC', 'SHO', 'ACP', 'DISTRICT_OFFICER', 'JCP', 'SCP', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'];

// Which scope FK a role must be created with — the rest are backfilled by
// climbing the hierarchy (resolveScope). JCP/SCP/HQ_*/SYSTEM_ADMIN need none.
const REQUIRED_SCOPE_FIELD = {
  HC: 'ps_id', SHO: 'ps_id',
  ACP: 'sub_div_id',
  DISTRICT_OFFICER: 'district_id',
};

const withJurisdiction = (query, jurisdictionQuery, table = 'users') => {
  if (!jurisdictionQuery) return query;
  if (jurisdictionQuery.ps_id) return query.where(`${table}.ps_id`, jurisdictionQuery.ps_id);
  if (jurisdictionQuery.sub_div_id) return query.where(`${table}.sub_div_id`, jurisdictionQuery.sub_div_id);
  if (jurisdictionQuery.district_id) return query.where(`${table}.district_id`, jurisdictionQuery.district_id);
  return query;
};

// Response aliases kept for a handful of frontend fallback readers
// (station_id, psId, districtId) — deprecated, drain on touch.
const sanitize = (user) => {
  const { password_hash, ...rest } = user;
  return {
    ...rest,
    userId: rest.id,
    psId: rest.ps_id || null,
    station_id: rest.ps_id || null,
    districtId: rest.district_id || null,
  };
};

export const getUsers = async (req, res) => {
  try {
    const role = req.query.role;
    const psId = req.query.psId || req.query.ps_id;
    const districtId = req.query.districtId || req.query.district_id;
    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 20, 10);
    const offset = (page - 1) * limit;

    let query = db('users')
      .select('users.*', 'ps.name as ps_name', 'dist.name as district_name', 'subdiv.name as sub_div_name')
      .leftJoin('hierarchy_nodes as ps', 'users.ps_id', 'ps.id')
      .leftJoin('hierarchy_nodes as dist', 'users.district_id', 'dist.id')
      .leftJoin('hierarchy_nodes as subdiv', 'users.sub_div_id', 'subdiv.id');
    let countQuery = db('users');

    query = withJurisdiction(query, req.jurisdictionQuery);
    countQuery = withJurisdiction(countQuery, req.jurisdictionQuery);

    if (role) {
      query = query.where('users.role', role);
      countQuery = countQuery.where('role', role);
    }
    if (psId) {
      query = query.where('users.ps_id', psId);
      countQuery = countQuery.where('ps_id', psId);
    }
    if (districtId) {
      query = query.where('users.district_id', districtId);
      countQuery = countQuery.where('district_id', districtId);
    }

    const totalRes = await countQuery.count('* as count').first();
    const total = parseInt(totalRes.count || 0, 10);

    const list = await query.orderBy('users.created_at', 'desc').limit(limit).offset(offset);

    return res.status(200).json({
      status: 'success',
      success: true,
      data: list.map(sanitize),
      meta: { page, limit, total }
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', success: false, message: error.message });
  }
};

export const getUser = async (req, res) => {
  const { id } = req.params;

  try {
    let query = db('users')
      .select('users.*', 'ps.name as ps_name', 'dist.name as district_name', 'subdiv.name as sub_div_name')
      .leftJoin('hierarchy_nodes as ps', 'users.ps_id', 'ps.id')
      .leftJoin('hierarchy_nodes as dist', 'users.district_id', 'dist.id')
      .leftJoin('hierarchy_nodes as subdiv', 'users.sub_div_id', 'subdiv.id')
      .where('users.id', id);
    query = withJurisdiction(query, req.jurisdictionQuery);
    const user = await query.first();

    // Out-of-scope users 404 the same as nonexistent ones — don't leak existence
    if (!user) {
      return res.status(404).json({ status: 'error', success: false, code: 'NOT_FOUND', message: 'User not found' });
    }

    return res.status(200).json({ status: 'success', success: true, data: sanitize(user) });
  } catch (error) {
    return res.status(500).json({ status: 'error', success: false, message: error.message });
  }
};

export const createUser = async (req, res) => {
  const badgeNo = req.body.badgeNo || req.body.badge_no;
  const name = req.body.name || req.body.name_en;
  const role = req.body.role;
  const psId = req.body.psId || req.body.ps_id || req.body.station_id;
  const districtId = req.body.districtId || req.body.district_id;
  const subDivId = req.body.subDivId || req.body.sub_div_id;
  const username = req.body.username || badgeNo;
  const password = req.body.password;

  if (!badgeNo || !password || !role || !name) {
    return res.status(400).json({
      status: 'error', success: false, code: 'BAD_REQUEST',
      message: 'badgeNo, password, role, and name are required'
    });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ status: 'error', success: false, code: 'BAD_REQUEST', message: `Invalid role: ${role}` });
  }
  const requiredField = REQUIRED_SCOPE_FIELD[role];
  const provided = { ps_id: psId || null, sub_div_id: subDivId || null, district_id: districtId || null };
  if (requiredField && !provided[requiredField]) {
    return res.status(400).json({ status: 'error', success: false, code: 'BAD_REQUEST', message: `${role} requires ${requiredField}` });
  }

  try {
    const scope = await resolveScope(provided);
    const hash = await bcrypt.hash(password, 12);
    const id = uuidv4();

    await db('users').insert({
      id,
      username,
      badge_no: badgeNo,
      name,
      password_hash: hash,
      role,
      ps_id: scope.ps_id,
      district_id: scope.district_id,
      sub_div_id: scope.sub_div_id,
      is_active: true,
      created_at: new Date().toISOString()
    });

    const user = await db('users').where({ id }).first();
    return res.status(201).json({ status: 'success', success: true, data: sanitize(user) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ status: 'error', success: false, code: 'CONFLICT', message: 'Username or badge number already in use' });
    }
    return res.status(500).json({ status: 'error', success: false, message: error.message });
  }
};

export const updateUser = async (req, res) => {
  const { id } = req.params;
  const name = req.body.name ?? req.body.name_en;
  const role = req.body.role;
  const psId = req.body.psId ?? req.body.ps_id ?? req.body.station_id;
  const districtId = req.body.districtId ?? req.body.district_id;
  const subDivId = req.body.subDivId ?? req.body.sub_div_id;
  const { is_active } = req.body;

  if (role !== undefined && !ROLES.includes(role)) {
    return res.status(400).json({ status: 'error', success: false, code: 'BAD_REQUEST', message: `Invalid role: ${role}` });
  }

  try {
    const updatePayload = {};
    if (name !== undefined) updatePayload.name = name;
    if (role !== undefined) updatePayload.role = role;
    if (psId !== undefined) updatePayload.ps_id = psId || null;
    if (districtId !== undefined) updatePayload.district_id = districtId || null;
    if (subDivId !== undefined) updatePayload.sub_div_id = subDivId || null;
    if (is_active !== undefined) updatePayload.is_active = !!is_active;
    updatePayload.updated_at = db.fn.now();

    await db('users').where({ id }).update(updatePayload);

    const updatedUser = await db('users').where({ id }).first();
    if (!updatedUser) {
      return res.status(404).json({ status: 'error', success: false, code: 'NOT_FOUND', message: 'User not found' });
    }

    return res.status(200).json({ status: 'success', success: true, data: sanitize(updatedUser) });
  } catch (error) {
    return res.status(500).json({ status: 'error', success: false, message: error.message });
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    await db('users').where({ id }).update({ is_active: false, updated_at: db.fn.now() });
    return res.status(200).json({ status: 'success', success: true, data: { message: 'User deactivated' } });
  } catch (error) {
    return res.status(500).json({ status: 'error', success: false, message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  const { id } = req.params;
  const newPassword = req.body.newPassword || req.body.new_password;

  if (!newPassword) {
    return res.status(400).json({ status: 'error', success: false, code: 'BAD_REQUEST', message: 'newPassword is required' });
  }

  try {
    const hash = await bcrypt.hash(newPassword, 12);
    await db('users').where({ id }).update({ password_hash: hash, updated_at: db.fn.now() });
    await logoutUser(id);
    return res.status(200).json({ status: 'success', success: true, data: { message: 'Password reset' } });
  } catch (error) {
    return res.status(500).json({ status: 'error', success: false, message: error.message });
  }
};
