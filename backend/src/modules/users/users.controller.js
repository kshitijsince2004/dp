import db from '../../config/db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { logoutUser, resolveScope } from '../auth/auth.service.js';
import { getLogger } from '../../utils/logger.js';
import { redact } from '../../utils/redact.js';

// Matches modules/records/records.service.js style (logging-instrumentation-2026-07-22
// HANDOFF.md §7). `password`/`newPassword` are never logged — redact()'d wherever a request
// body is logged, and password fields are otherwise extracted individually (never as part of
// a logged object) everywhere else in this file.
const log = getLogger('users.controller');

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
  if (jurisdictionQuery.ps_id) {
    log.debug('withJurisdiction: scoped by ps_id', { table, psId: jurisdictionQuery.ps_id });
    return query.where(`${table}.ps_id`, jurisdictionQuery.ps_id);
  }
  if (jurisdictionQuery.sub_div_id) {
    log.debug('withJurisdiction: scoped by sub_div_id', { table, subDivId: jurisdictionQuery.sub_div_id });
    return query.where(`${table}.sub_div_id`, jurisdictionQuery.sub_div_id);
  }
  if (jurisdictionQuery.district_id) {
    log.debug('withJurisdiction: scoped by district_id', { table, districtId: jurisdictionQuery.district_id });
    return query.where(`${table}.district_id`, jurisdictionQuery.district_id);
  }
  log.debug('withJurisdiction: no scope filter applied (global)', { table });
  return query;
};

// SHO may only touch HC users in their own PS (item 7) — mirrors verifyRecordAccess's
// per-record ownership check, but for users. SYSTEM_ADMIN is unrestricted.
const assertUserInScope = (target, caller) => {
  if (caller.role === 'SYSTEM_ADMIN') {
    log.debug('assertUserInScope: allowed — caller is SYSTEM_ADMIN', { targetUserId: target.id, callerUserId: caller.id });
    return;
  }
  if (caller.role === 'SHO' && target.role === 'HC' && target.ps_id === caller.ps_id) {
    log.debug('assertUserInScope: allowed — SHO acting on own-PS HC', { targetUserId: target.id, callerUserId: caller.id, psId: caller.ps_id });
    return;
  }
  log.warn('assertUserInScope: rejected — target outside caller jurisdiction', {
    targetUserId: target.id, targetRole: target.role, targetPsId: target.ps_id,
    callerUserId: caller.id, callerRole: caller.role, callerPsId: caller.ps_id,
  });
  const err = new Error('Access denied: user is outside your jurisdiction');
  err.status = 403;
  throw err;
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
  const role = req.query.role;
  const psId = req.query.psId || req.query.ps_id;
  const districtId = req.query.districtId || req.query.district_id;
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  log.debug('getUsers: enter', { role: role || null, psId: psId || null, districtId: districtId || null, page, limit, jurisdictionQuery: req.jurisdictionQuery });
  try {
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

    log.info('getUsers: exit', { resultCount: list.length, total, page, limit });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: list.map(sanitize),
      meta: { page, limit, total }
    });
  } catch (error) {
    log.error('getUsers: failed', { err: error });
    return res.status(500).json({ status: 'error', success: false, message: error.message });
  }
};

export const getUser = async (req, res) => {
  const { id } = req.params;
  log.debug('getUser: enter', { userId: id, jurisdictionQuery: req.jurisdictionQuery });

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
      log.warn('getUser: rejected — not found or out of scope', { userId: id });
      return res.status(404).json({ status: 'error', success: false, code: 'NOT_FOUND', message: 'User not found' });
    }

    log.info('getUser: exit', { userId: id, role: user.role });
    return res.status(200).json({ status: 'success', success: true, data: sanitize(user) });
  } catch (error) {
    log.error('getUser: failed', { userId: id, err: error });
    return res.status(500).json({ status: 'error', success: false, message: error.message });
  }
};

export const createUser = async (req, res) => {
  const badgeNo = req.body.badgeNo || req.body.badge_no;
  const name = req.body.name || req.body.name_en;
  let role = req.body.role;
  let psId = req.body.psId || req.body.ps_id || req.body.station_id;
  let districtId = req.body.districtId || req.body.district_id;
  let subDivId = req.body.subDivId || req.body.sub_div_id;
  const username = req.body.username || badgeNo;
  const password = req.body.password;
  // NEVER log the password itself — hasPassword only; redact() as a second line of defense
  // on the raw body in case new sensitive fields are ever added to it.
  log.debug('createUser: enter', { badgeNo, name, role, psId: psId || null, districtId: districtId || null, subDivId: subDivId || null, hasPassword: !!password, callerRole: req.user.role, callerUserId: req.user.id });
  log.debug('createUser: request body (redacted)', { body: redact(req.body) });

  // SHO provisions HC users for their own PS ONLY (item 7) — role and scope are stamped
  // server-side from the caller's own JWT, never trusted from the request body (P5.4).
  if (req.user.role === 'SHO') {
    if (role !== undefined && role !== 'HC') {
      log.warn('createUser: rejected — SHO attempted to create non-HC user', { callerUserId: req.user.id, requestedRole: role });
      return res.status(403).json({ status: 'error', success: false, code: 'FORBIDDEN', message: 'SHO may only create HC users' });
    }
    role = 'HC';
    psId = req.user.ps_id;
    districtId = undefined;
    subDivId = undefined;
    log.debug('createUser: SHO scope stamped server-side', { callerUserId: req.user.id, psId, role });
  }

  if (!badgeNo || !password || !role || !name) {
    log.warn('createUser: rejected — missing required fields', { hasBadgeNo: !!badgeNo, hasPassword: !!password, hasRole: !!role, hasName: !!name });
    return res.status(400).json({
      status: 'error', success: false, code: 'BAD_REQUEST',
      message: 'badgeNo, password, role, and name are required'
    });
  }
  if (!ROLES.includes(role)) {
    log.warn('createUser: rejected — invalid role', { role });
    return res.status(400).json({ status: 'error', success: false, code: 'BAD_REQUEST', message: `Invalid role: ${role}` });
  }
  const requiredField = REQUIRED_SCOPE_FIELD[role];
  const provided = { ps_id: psId || null, sub_div_id: subDivId || null, district_id: districtId || null };
  if (requiredField && !provided[requiredField]) {
    log.warn('createUser: rejected — missing required scope field for role', { role, requiredField });
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
    log.info('createUser: wrote users row', { userId: id, badgeNo, role, psId: scope.ps_id, districtId: scope.district_id, subDivId: scope.sub_div_id });

    const user = await db('users').where({ id }).first();
    log.info('createUser: exit', { userId: id, role });
    return res.status(201).json({ status: 'success', success: true, data: sanitize(user) });
  } catch (error) {
    if (error.code === '23505') {
      log.warn('createUser: rejected — badge/username conflict', { badgeNo, username });
      return res.status(409).json({ status: 'error', success: false, code: 'CONFLICT', message: 'Username or badge number already in use' });
    }
    log.error('createUser: failed', { badgeNo, err: error });
    return res.status(500).json({ status: 'error', success: false, message: error.message });
  }
};

export const updateUser = async (req, res) => {
  const { id } = req.params;
  const name = req.body.name ?? req.body.name_en;
  let role = req.body.role;
  let psId = req.body.psId ?? req.body.ps_id ?? req.body.station_id;
  let districtId = req.body.districtId ?? req.body.district_id;
  let subDivId = req.body.subDivId ?? req.body.sub_div_id;
  const { is_active } = req.body;
  log.debug('updateUser: enter', { userId: id, role: role ?? null, psId: psId ?? null, districtId: districtId ?? null, subDivId: subDivId ?? null, isActive: is_active ?? null, callerRole: req.user.role, callerUserId: req.user.id });

  if (role !== undefined && !ROLES.includes(role)) {
    log.warn('updateUser: rejected — invalid role', { userId: id, role });
    return res.status(400).json({ status: 'error', success: false, code: 'BAD_REQUEST', message: `Invalid role: ${role}` });
  }

  try {
    const target = await db('users').where({ id }).first();
    if (!target) {
      log.warn('updateUser: rejected — user not found', { userId: id });
      return res.status(404).json({ status: 'error', success: false, code: 'NOT_FOUND', message: 'User not found' });
    }
    assertUserInScope(target, req.user);
    if (req.user.role === 'SHO') {
      // SHO cannot re-role or re-scope a user out of their own PS.
      role = undefined; psId = undefined; districtId = undefined; subDivId = undefined;
      log.debug('updateUser: SHO caller — role/scope fields stripped from update', { userId: id, callerUserId: req.user.id });
    }

    const updatePayload = {};
    if (name !== undefined) updatePayload.name = name;
    if (role !== undefined) updatePayload.role = role;
    if (psId !== undefined) updatePayload.ps_id = psId || null;
    if (districtId !== undefined) updatePayload.district_id = districtId || null;
    if (subDivId !== undefined) updatePayload.sub_div_id = subDivId || null;
    if (is_active !== undefined) updatePayload.is_active = !!is_active;
    updatePayload.updated_at = db.fn.now();

    await db('users').where({ id }).update(updatePayload);
    log.info('updateUser: wrote users row', { userId: id, changedKeys: Object.keys(updatePayload) });

    const updatedUser = await db('users').where({ id }).first();
    log.info('updateUser: exit', { userId: id });
    return res.status(200).json({ status: 'success', success: true, data: sanitize(updatedUser) });
  } catch (error) {
    const status = error.status || 500;
    log.error('updateUser: failed', { userId: id, err: error });
    return res.status(status).json({ status: 'error', success: false, message: error.message });
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;
  log.debug('deleteUser: enter', { userId: id, callerRole: req.user.role, callerUserId: req.user.id });

  try {
    const target = await db('users').where({ id }).first();
    if (!target) {
      log.warn('deleteUser: rejected — user not found', { userId: id });
      return res.status(404).json({ status: 'error', success: false, code: 'NOT_FOUND', message: 'User not found' });
    }
    assertUserInScope(target, req.user);

    await db('users').where({ id }).update({ is_active: false, updated_at: db.fn.now() });
    log.info('deleteUser: wrote users row (deactivated)', { userId: id });
    return res.status(200).json({ status: 'success', success: true, data: { message: 'User deactivated' } });
  } catch (error) {
    const status = error.status || 500;
    log.error('deleteUser: failed', { userId: id, err: error });
    return res.status(status).json({ status: 'error', success: false, message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  const { id } = req.params;
  const newPassword = req.body.newPassword || req.body.new_password;
  // NEVER log the new password value — presence only.
  log.debug('resetPassword: enter', { userId: id, hasNewPassword: !!newPassword, callerRole: req.user.role, callerUserId: req.user.id });

  if (!newPassword) {
    log.warn('resetPassword: rejected — no newPassword supplied', { userId: id });
    return res.status(400).json({ status: 'error', success: false, code: 'BAD_REQUEST', message: 'newPassword is required' });
  }

  try {
    const target = await db('users').where({ id }).first();
    if (!target) {
      log.warn('resetPassword: rejected — user not found', { userId: id });
      return res.status(404).json({ status: 'error', success: false, code: 'NOT_FOUND', message: 'User not found' });
    }
    assertUserInScope(target, req.user);

    const hash = await bcrypt.hash(newPassword, 12);
    await db('users').where({ id }).update({ password_hash: hash, updated_at: db.fn.now() });
    log.info('resetPassword: wrote users row (new password_hash)', { userId: id });
    await logoutUser(id);
    log.info('resetPassword: exit', { userId: id });
    return res.status(200).json({ status: 'success', success: true, data: { message: 'Password reset' } });
  } catch (error) {
    const status = error.status || 500;
    log.error('resetPassword: failed', { userId: id, err: error });
    return res.status(status).json({ status: 'error', success: false, message: error.message });
  }
};
