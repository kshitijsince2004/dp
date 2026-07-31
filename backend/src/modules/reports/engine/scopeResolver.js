import db from '../../../config/db.js';
import { UPTODATE_DISTRICTS } from '../../phq-diary/phq-diary.config.js';

/**
 * Scope Resolver for Pharos Reporting Engine.
 * Manages scope-group definitions (LO_NORTH, LO_SOUTH, SPECIAL_UNITS, ALL_DELHI_TOTAL)
 * and performs hierarchical roll-up queries across hierarchy_nodes.
 */

export const SCOPE_GROUPS = {
  LO_NORTH: [
    'DIST_CD', 'DIST_ND', 'DIST_ED', 'DIST_NED', 'DIST_SHD', 'DIST_NWD', 'DIST_OND', 'DIST_RND'
  ],
  LO_SOUTH: [
    'DIST_NDD', 'DIST_SWD', 'DIST_SD', 'DIST_SED', 'DIST_WD', 'DIST_DW', 'DIST_OD'
  ],
  SPECIAL_UNITS: [
    'DIST_SPECIALCELL', 'DIST_SPUWAC', 'DIST_VIGILANCE', 'DIST_CRIMEBRANCH', 'DIST_EOW', 'DIST_IGIAIRPORT', 'DIST_METRO', 'DIST_RAILWAYS'
  ]
};

SCOPE_GROUPS.ALL_DELHI_TERRITORIAL = [
  ...SCOPE_GROUPS.LO_NORTH,
  ...SCOPE_GROUPS.LO_SOUTH
];

SCOPE_GROUPS.ALL_DELHI_TOTAL = [
  ...SCOPE_GROUPS.ALL_DELHI_TERRITORIAL,
  ...SCOPE_GROUPS.SPECIAL_UNITS
];

export async function resolveScopeCodes(scopeGroupName, trx = db) {
  const name = (scopeGroupName || '').toUpperCase().trim();
  if (SCOPE_GROUPS[name]) {
    return SCOPE_GROUPS[name];
  }
  
  // If it's a specific district code or array
  if (Array.isArray(scopeGroupName)) {
    return scopeGroupName;
  }
  
  // Check if it's a valid code in hierarchy_nodes
  const node = await trx('hierarchy_nodes').where({ code: scopeGroupName }).first();
  if (node) {
    if (node.node_type === 'DISTRICT') return [node.code];
    // If it's a RANGE or ZONE, fetch all child district codes
    const childDistricts = await getChildDistrictCodes(node.id, trx);
    return childDistricts;
  }

  return SCOPE_GROUPS.ALL_DELHI_TOTAL;
}

export async function getChildDistrictCodes(parentNodeId, trx = db) {
  const nodes = await trx('hierarchy_nodes').select('id', 'code', 'node_type', 'parent_id');
  const districtCodes = [];

  function collect(id) {
    const children = nodes.filter(n => n.parent_id === id);
    for (const child of children) {
      if (child.node_type === 'DISTRICT') {
        districtCodes.push(child.code);
      } else {
        collect(child.id);
      }
    }
  }

  collect(parentNodeId);
  return districtCodes;
}

export async function getDistrictNodeMap(trx = db) {
  const nodes = await trx('hierarchy_nodes')
    .where({ node_type: 'DISTRICT', is_active: true })
    .select('id', 'name', 'code');
  
  const map = new Map();
  for (const n of nodes) {
    map.set(n.code, n);
    map.set(n.id, n);
    map.set(n.id, n);
  }
  return map;
}

export async function resolveScope(nodeIdOrCode, trx = db) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  // 1. Fetch all active hierarchy nodes
  const nodes = await trx('hierarchy_nodes')
    .where({ is_active: true })
    .select('id', 'code', 'name', 'node_type', 'parent_id');

  // 2. Find the starting node
  let selfNode = null;
  if (nodeIdOrCode === 'ALL_DELHI_TOTAL' || !nodeIdOrCode) {
    selfNode = nodes.find(n => n.code === 'HQ');
  } else {
    selfNode = nodes.find(n => n.id === nodeIdOrCode || n.code === nodeIdOrCode);
  }

  if (!selfNode) {
    throw new Error(`Hierarchy node not found: ${nodeIdOrCode}`);
  }

  const level = selfNode.node_type; // 'HQ', 'ZONE', 'RANGE', 'DISTRICT', 'SUB_DIV', 'PS'
  const self_id = selfNode.id;
  const self_name = selfNode.name;
  const parent_id = selfNode.parent_id;

  // 3. Define children based on level
  let children = [];

  // Helper to collect all descendant nodes of a specific type
  function collectDescendants(parentId, targetType) {
    const result = [];
    function recurse(pid) {
      const direct = nodes.filter(n => n.parent_id === pid);
      for (const child of direct) {
        if (child.node_type === targetType) {
          result.push(child);
        } else {
          recurse(child.id);
        }
      }
    }
    recurse(parentId);
    return result;
  }

  if (level === 'HQ') {
    // PHQ Level: columns are all Districts (15 territorial + 8 specialized)
    children = nodes.filter(n => n.node_type === 'DISTRICT');
    
    // Sort children according to UPTODATE_DISTRICTS order
    const orderMap = new Map(UPTODATE_DISTRICTS.map((d, index) => [d.code, index]));
    children.sort((a, b) => {
      const idxA = orderMap.has(a.code) ? orderMap.get(a.code) : 999;
      const idxB = orderMap.has(b.code) ? orderMap.get(b.code) : 999;
      if (idxA !== idxB) return idxA - idxB;
      return a.name.localeCompare(b.name);
    });
  } else if (level === 'RANGE' || level === 'ZONE') {
    // Range Level: columns are Districts under this range
    children = collectDescendants(self_id, 'DISTRICT');
    children.sort((a, b) => a.name.localeCompare(b.name));
  } else if (level === 'DISTRICT') {
    // District Level: columns are Police Stations under this district
    children = collectDescendants(self_id, 'PS');
    children.sort((a, b) => a.name.localeCompare(b.name));
  } else if (level === 'SUB_DIV') {
    // Sub-division Level: columns are PS under this sub-division
    children = nodes.filter(n => n.parent_id === self_id && n.node_type === 'PS');
    children.sort((a, b) => a.name.localeCompare(b.name));
  } else if (level === 'PS') {
    // PS Level: leaf node, self is sole child
    children = [{ id: self_id, name: self_name, code: selfNode.code, node_type: 'PS' }];
  }

  const children_ids = children.map(c => c.id);
  const display_names = {};
  for (const n of nodes) {
    display_names[n.id] = n.name;
    display_names[n.code] = n.name;
  }

  // available sheets per level
  let available_sheets = [];
  if (level === 'HQ') {
    available_sheets = [
      'Upto_Date',
      'DISTRICTS',
      'L&O_SOUTH',
      'L&O_NORTH',
      'MANUALY',
      'Monday_Morning',
      'Daily_Diary',
      'for_week',
      'Variation_Pct'
    ];
  } else if (level === 'RANGE' || level === 'ZONE') {
    available_sheets = [
      'Upto_Date',
      'MANUALY',
      'Monday_Morning',
      'Daily_Diary',
      'for_week',
      'Variation_Pct'
    ];
  } else if (level === 'DISTRICT' || level === 'SUB_DIV') {
    available_sheets = [
      'Upto_Date',
      'MANUALY',
      'Monday_Morning',
      'Daily_Diary',
      'for_week',
      'Variation_Pct'
    ];
  } else if (level === 'PS') {
    available_sheets = [
      'MANUALY',
      'Monday_Morning',
      'Daily_Diary',
      'for_week',
      'Variation_Pct'
    ];
  }

  return {
    level,
    self_id,
    self_name,
    self_code: selfNode.code,
    children: children.map(c => ({ id: c.id, name: c.name, code: c.code, node_type: c.node_type })),
    children_ids,
    parent_id,
    display_names,
    available_sheets
  };
}
