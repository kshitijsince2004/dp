import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../../utils/logger.js';
import { resolveScope } from '../reports/engine/scopeResolver.js';

// Matches modules/records/records.service.js style (logging-instrumentation-2026-07-22
// HANDOFF.md §7).
const log = getLogger('hierarchy.controller');

const NODE_TYPES = ['HQ', 'ZONE', 'RANGE', 'DISTRICT', 'SUB_DIV', 'PS'];

const parseJsonField = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (e) { return val; }
  }
  return val;
};

// Resolve a district's own id plus every SUB_DIV under it, so PS nodes
// (which hang off a SUB_DIV, not the DISTRICT directly) can be matched
// with a single `parent_id IN (...)` check.
const districtScopeIds = async (districtId) => {
  const subDivs = await db('hierarchy_nodes')
    .where({ node_type: 'SUB_DIV', parent_id: districtId, is_active: true })
    .select('id');
  return [districtId, ...subDivs.map((s) => s.id)];
};

// Compat alias: name_en mirrors the single `name` column for frontend
// consumers that still read name_en — deprecated, drain on touch.
const withNameAlias = (n) => ({ ...n, name_en: n.name });

export const getNodes = async (req, res) => {
  const { type, districtId, for_transfer } = req.query;
  const role = req.user?.role;
  // for_transfer=true bypasses jurisdiction scoping: any authenticated user needs to see
  // the full PS list when selecting a transfer destination (they are transferring TO another PS,
  // not browsing their own jurisdiction).
  const isForTransfer = for_transfer === 'true';
  log.debug('getNodes: enter', { type: type || null, districtId: districtId || null, role: role || null, userId: req.user?.id || null, isForTransfer });
  try {
    let query = db('hierarchy_nodes').where({ is_active: true });

    if (type) {
      query = query.where('node_type', type.toUpperCase());
      log.debug('getNodes: filtered by node_type', { type: type.toUpperCase() });
    }

    // Jurisdiction scoping — a station/district-level user may only ever see
    // hierarchy nodes within their own jurisdiction, regardless of what
    // districtId (if any) was requested. HQ_ANALYST/HQ_ADMIN/SYSTEM_ADMIN
    // remain globally scoped and may optionally filter by districtId.
    // Exception: for_transfer=true bypasses all scoping so the caller can pick
    // any PS as a transfer destination.
    if (isForTransfer) {
      log.debug('getNodes: for_transfer bypass — no jurisdiction scope applied', { userId: req.user?.id, role });
    } else if (role === 'HC' || role === 'SHO') {
      if (!req.user.ps_id) {
        log.warn('getNodes: HC/SHO caller has no ps_id, returning empty', { userId: req.user.id, role });
        return res.status(200).json({ status: 'success', success: true, data: [] });
      }
      log.debug('getNodes: scoped to own ps_id', { userId: req.user.id, psId: req.user.ps_id });
      query = query.where('id', req.user.ps_id);
    } else if (role === 'ACP') {
      if (!req.user.sub_div_id) {
        log.warn('getNodes: ACP caller has no sub_div_id, returning empty', { userId: req.user.id });
        return res.status(200).json({ status: 'success', success: true, data: [] });
      }
      log.debug('getNodes: scoped to own sub_div_id (self + children)', { userId: req.user.id, subDivId: req.user.sub_div_id });
      query = query.where(function () {
        this.where('id', req.user.sub_div_id).orWhere('parent_id', req.user.sub_div_id);
      });
    } else if (role === 'DISTRICT_OFFICER') {
      if (!req.user.district_id) {
        log.warn('getNodes: DISTRICT_OFFICER caller has no district_id, returning empty', { userId: req.user.id });
        return res.status(200).json({ status: 'success', success: true, data: [] });
      }
      const scopeIds = await districtScopeIds(req.user.district_id);
      log.debug('getNodes: scoped to own district (self + sub-divs + children)', { userId: req.user.id, districtId: req.user.district_id, scopeIdCount: scopeIds.length });
      query = query.where(function () {
        this.whereIn('id', scopeIds).orWhereIn('parent_id', scopeIds);
      });
    } else if (districtId) {
      const scopeIds = await districtScopeIds(districtId);
      log.debug('getNodes: global-scope caller filtered by requested districtId', { districtId, scopeIdCount: scopeIds.length });
      query = query.where(function () {
        this.whereIn('id', scopeIds).orWhereIn('parent_id', scopeIds);
      });
    } else {
      log.debug('getNodes: no jurisdiction filter applied (global role, no districtId)', { role });
    }

    const list = await query.orderBy('name', 'asc');
    const formatted = list.map(n => withNameAlias({ ...n, metadata: parseJsonField(n.metadata) }));

    log.info('getNodes: exit', { resultCount: formatted.length, role });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: formatted
    });
  } catch (error) {
    log.error('getNodes: failed', { role, err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const getTree = async (req, res) => {
  log.debug('getTree: enter', { userId: req.user?.id || null });
  try {
    const list = await db('hierarchy_nodes').where({ is_active: true });

    // Build recursive parent-child tree
    const idMap = new Map();
    list.forEach(n => {
      idMap.set(n.id, withNameAlias({
        id: n.id,
        node_type: n.node_type,
        name: n.name,
        code: n.code,
        parent_id: n.parent_id,
        children: []
      }));
    });

    const rootNodes = [];
    list.forEach(n => {
      const node = idMap.get(n.id);
      if (n.parent_id && idMap.has(n.parent_id)) {
        idMap.get(n.parent_id).children.push(node);
      } else {
        rootNodes.push(node);
      }
    });

    // Support dual response formats: flat tree array OR the first root node
    const treeRoot = rootNodes[0] || {};
    log.info('getTree: exit', { nodeCount: list.length, rootCount: rootNodes.length });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: {
        tree: rootNodes,
        id: treeRoot.id,
        node_type: treeRoot.node_type,
        name: treeRoot.name,
        name_en: treeRoot.name,
        code: treeRoot.code,
        children: treeRoot.children
      }
    });
  } catch (error) {
    log.error('getTree: failed', { err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const createNode = async (req, res) => {
  const name = req.body.name || req.body.name_en;
  const { parent_id, code } = req.body;
  const node_type = req.body.node_type ? String(req.body.node_type).toUpperCase() : undefined;
  log.debug('createNode: enter', { name, node_type, code, parent_id: parent_id || null, callerUserId: req.user?.id || null });

  if (!name || !node_type || !code) {
    log.warn('createNode: rejected — missing required fields', { hasName: !!name, hasNodeType: !!node_type, hasCode: !!code });
    return res.status(400).json({
      status: 'error',
      success: false,
      code: 'BAD_REQUEST',
      message: 'name, node_type, and code are required'
    });
  }
  if (!NODE_TYPES.includes(node_type)) {
    log.warn('createNode: rejected — invalid node_type', { node_type });
    return res.status(400).json({
      status: 'error',
      success: false,
      code: 'BAD_REQUEST',
      message: `Invalid node_type: ${node_type}`
    });
  }

  try {
    const id = uuidv4();
    const newNode = {
      id,
      name,
      node_type,
      parent_id: parent_id || null,
      code,
      is_active: true
    };

    await db('hierarchy_nodes').insert(newNode);
    log.info('createNode: wrote hierarchy_nodes row', { nodeId: id, node_type, code, parent_id: parent_id || null });

    return res.status(201).json({
      status: 'success',
      success: true,
      data: withNameAlias(newNode)
    });
  } catch (error) {
    log.error('createNode: failed', { name, node_type, err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const updateNode = async (req, res) => {
  const { id } = req.params;
  const name = req.body.name ?? req.body.name_en;
  const { parent_id, code } = req.body;
  log.debug('updateNode: enter', { nodeId: id, name: name ?? null, parent_id: parent_id ?? null, code: code ?? null, callerUserId: req.user?.id || null });

  try {
    const updatePayload = {};
    if (name !== undefined) updatePayload.name = name;
    if (parent_id !== undefined) updatePayload.parent_id = parent_id || null;
    if (code !== undefined) updatePayload.code = code;
    updatePayload.updated_at = db.fn.now();

    await db('hierarchy_nodes').where({ id }).update(updatePayload);
    log.info('updateNode: wrote hierarchy_nodes row', { nodeId: id, changedKeys: Object.keys(updatePayload) });

    const updated = await db('hierarchy_nodes').where({ id }).first();
    if (!updated) {
      log.warn('updateNode: rejected — node not found', { nodeId: id });
      return res.status(404).json({
        status: 'error',
        success: false,
        code: 'NOT_FOUND',
        message: 'Node not found'
      });
    }

    log.info('updateNode: exit', { nodeId: id });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: withNameAlias(updated)
    });
  } catch (error) {
    log.error('updateNode: failed', { nodeId: id, err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const deleteNode = async (req, res) => {
  const { id } = req.params;
  log.debug('deleteNode: enter', { nodeId: id, callerUserId: req.user?.id || null });

  try {
    await db('hierarchy_nodes').where({ id }).update({ is_active: false, updated_at: db.fn.now() });
    log.info('deleteNode: wrote hierarchy_nodes row (deactivated)', { nodeId: id });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: { message: 'Node deactivated' }
    });
  } catch (error) {
    log.error('deleteNode: failed', { nodeId: id, err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

function isDescendant(nodes, childId, parentId) {
  if (childId === parentId) return true;
  let curr = nodes.find(n => n.id === childId);
  while (curr && curr.parent_id) {
    if (curr.parent_id === parentId) return true;
    curr = nodes.find(n => n.id === curr.parent_id);
  }
  return false;
}

export const getScope = async (req, res) => {
  const { node_id } = req.query;
  const user = req.user;
  log.debug('getScope: enter', { requestedNodeId: node_id, userId: user?.id, role: user?.role });

  try {
    // 1. Resolve default node based on user role if node_id not specified
    let targetNodeId = node_id;
    if (!targetNodeId) {
      const hqRoles = ['HQ', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'];
      if (hqRoles.includes(user?.role)) {
        targetNodeId = 'ALL_DELHI_TOTAL';
      } else if (user?.district_id) {
        targetNodeId = user.district_id;
      } else if (user?.sub_div_id) {
        targetNodeId = user.sub_div_id;
      } else if (user?.ps_id) {
        targetNodeId = user.ps_id;
      } else {
        targetNodeId = 'ALL_DELHI_TOTAL';
      }
    }

    // 2. Perform access control check
    const hqRoles = ['HQ', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'];
    let allowed = false;
    if (hqRoles.includes(user?.role)) {
      allowed = true;
    } else {
      const userNodeId = user?.district_id || user?.sub_div_id || user?.ps_id;
      if (userNodeId) {
        const allNodes = await db('hierarchy_nodes').where({ is_active: true }).select('id', 'parent_id', 'code');
        // Find the node corresponding to targetNodeId
        const targetNode = allNodes.find(n => n.id === targetNodeId || n.code === targetNodeId);
        if (targetNode && isDescendant(allNodes, targetNode.id, userNodeId)) {
          allowed = true;
          // Normalize targetNodeId to the UUID
          targetNodeId = targetNode.id;
        }
      }
    }

    if (!allowed) {
      log.warn('getScope: unauthorized access attempt', { userId: user?.id, requestedNodeId: targetNodeId });
      return res.status(403).json({
        status: 'error',
        success: false,
        message: 'You do not have permission to access the requested scope.'
      });
    }

    // 3. Resolve scope
    const scopeData = await resolveScope(targetNodeId);
    log.info('getScope: scope resolved successfully', { level: scopeData.level, self_name: scopeData.self_name });
    
    return res.status(200).json({
      status: 'success',
      success: true,
      data: scopeData
    });
  } catch (error) {
    log.error('getScope: failed', { err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};
