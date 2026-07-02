import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';

const parseJsonField = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (e) { return val; }
  }
  return val;
};

// Resolve a district's own id plus every SUB_DIVISION under it, so PS nodes
// (which hang off a SUB_DIVISION, not the DISTRICT directly) can be matched
// with a single `parent_id IN (...)` check.
const districtScopeIds = async (districtId) => {
  const subDivs = await db('hierarchy_nodes')
    .where({ node_type: 'SUB_DIVISION', parent_id: districtId, is_active: true })
    .select('id');
  return [districtId, ...subDivs.map((s) => s.id)];
};

export const getNodes = async (req, res) => {
  try {
    const { type, districtId } = req.query;
    let query = db('hierarchy_nodes').where({ is_active: true });

    if (type) {
      query = query.where('node_type', type.toUpperCase());
    }

    // Jurisdiction scoping — a station/district-level user may only ever see
    // hierarchy nodes within their own jurisdiction, regardless of what
    // districtId (if any) was requested. HQ_ANALYST/HQ_ADMIN/SYSTEM_ADMIN
    // remain globally scoped and may optionally filter by districtId.
    const role = req.user?.role;
    if (role === 'HC' || role === 'SHO') {
      if (!req.user.ps_id) {
        return res.status(200).json({ status: 'success', success: true, data: [] });
      }
      query = query.where('id', req.user.ps_id);
    } else if (role === 'ACP') {
      if (!req.user.sub_div_id) {
        return res.status(200).json({ status: 'success', success: true, data: [] });
      }
      query = query.where(function () {
        this.where('id', req.user.sub_div_id).orWhere('parent_id', req.user.sub_div_id);
      });
    } else if (role === 'DISTRICT_OFFICER') {
      if (!req.user.district_id) {
        return res.status(200).json({ status: 'success', success: true, data: [] });
      }
      const scopeIds = await districtScopeIds(req.user.district_id);
      query = query.where(function () {
        this.whereIn('id', scopeIds).orWhereIn('parent_id', scopeIds);
      });
    } else if (districtId) {
      const scopeIds = await districtScopeIds(districtId);
      query = query.where(function () {
        this.whereIn('id', scopeIds).orWhereIn('parent_id', scopeIds);
      });
    }

    const list = await query.orderBy('name_en', 'asc');
    const formatted = list.map(n => ({
      ...n,
      metadata: parseJsonField(n.metadata)
    }));

    return res.status(200).json({
      status: 'success',
      success: true,
      data: formatted
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const getTree = async (req, res) => {
  try {
    const list = await db('hierarchy_nodes').where({ is_active: true });
    
    // Build recursive parent-child tree
    const idMap = new Map();
    list.forEach(n => {
      idMap.set(n.id, {
        id: n.id,
        node_type: n.node_type,
        name_en: n.name_en,
        name_hi: n.name_hi,
        code: n.code,
        parent_id: n.parent_id,
        children: []
      });
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
    return res.status(200).json({
      status: 'success',
      success: true,
      data: {
        tree: rootNodes,
        id: treeRoot.id,
        node_type: treeRoot.node_type,
        name_en: treeRoot.name_en,
        name_hi: treeRoot.name_hi,
        code: treeRoot.code,
        children: treeRoot.children
      }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const createNode = async (req, res) => {
  const { name_en, name_hi, node_type, parent_id, code } = req.body;

  if (!name_en || !name_hi || !node_type || !code) {
    return res.status(400).json({
      status: 'error',
      success: false,
      code: 'BAD_REQUEST',
      message: 'name_en, name_hi, node_type, and code are required'
    });
  }

  try {
    const id = uuidv4();
    const newNode = {
      id,
      name_en,
      name_hi,
      node_type: node_type.toUpperCase(),
      parent_id: parent_id || null,
      code,
      is_active: true
    };

    await db('hierarchy_nodes').insert(newNode);

    return res.status(201).json({
      status: 'success',
      success: true,
      data: newNode
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const updateNode = async (req, res) => {
  const { id } = req.params;
  const { name_en, name_hi, parent_id, code } = req.body;

  try {
    const updatePayload = {};
    if (name_en !== undefined) updatePayload.name_en = name_en;
    if (name_hi !== undefined) updatePayload.name_hi = name_hi;
    if (parent_id !== undefined) updatePayload.parent_id = parent_id || null;
    if (code !== undefined) updatePayload.code = code;

    await db('hierarchy_nodes').where({ id }).update(updatePayload);

    const updated = await db('hierarchy_nodes').where({ id }).first();
    if (!updated) {
      return res.status(404).json({
        status: 'error',
        success: false,
        code: 'NOT_FOUND',
        message: 'Node not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      success: true,
      data: updated
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const deleteNode = async (req, res) => {
  const { id } = req.params;

  try {
    await db('hierarchy_nodes').where({ id }).update({ is_active: false });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: { message: 'Node deactivated' }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};
