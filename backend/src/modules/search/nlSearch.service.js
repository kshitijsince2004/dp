import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { resolveUserScope } from '../warehouse/warehouse.controller.js';

/**
 * Execute a confirmed natural language search intent with open-ended catalog bindings.
 */
export async function executeNaturalLanguageSearch({ user, confirmationSpec, page = 1, limit = 20 }) {
  const scope = resolveUserScope(user);
  const bindings = confirmationSpec.bindings || [];
  const freeTextTerms = confirmationSpec.free_text_terms || [];

  const recordTypeBinding = bindings.find(b => b.field_key === 'record_type');
  const record_type = recordTypeBinding ? recordTypeBinding.resolved_value : 'CASE';

  const offset = (Math.max(1, page) - 1) * limit;

  // Build base query
  let baseQuery = db('records as r')
    .select(
      'r.id',
      'r.record_type',
      'r.record_date',
      'r.registration_date',
      'r.current_status',
      'ps.name as ps_name',
      'dist.name as district_name',
      'fd.fir_date',
      'fd.brief_facts',
      db.raw('COALESCE(lh_fd.local_head, lh_ad.local_head, ?) as crime_head_name', ['General Record']),
      db.raw('COALESCE(lh_fd.canonical_code, lh_ad.canonical_code) as canonical_code'),
      'ad.fir_date as arrest_date',
      'ad.custody_status as arrest_custody_status',
      'rprop.details as property_details',
      'rprop.estimated_value',
      'rprop.status as property_status',
      'rprop.phone_make',
      'rprop.phone_model',
      'rprop.vehicle_make'
    )
    .leftJoin('hierarchy_nodes as ps', 'r.ps_id', 'ps.id')
    .leftJoin('hierarchy_nodes as dist', 'r.district_id', 'dist.id')
    .leftJoin('fir_details as fd', 'fd.record_id', 'r.id')
    .leftJoin('ref.local_heads as lh_fd', 'lh_fd.local_head_cd', 'fd.local_head_id')
    .leftJoin('arrest_details as ad', 'ad.record_id', 'r.id')
    .leftJoin('ref.local_heads as lh_ad', 'lh_ad.local_head_cd', 'ad.local_head_id')
    .leftJoin('record_properties as rprop', 'rprop.record_id', 'r.id')
    .where('r.record_type', record_type);

  // Apply scope filtering if scope is restrictive
  if (scope.scopeType === 'PS' && scope.scopeId) {
    baseQuery = baseQuery.where('r.ps_id', scope.scopeId);
  } else if (scope.scopeType === 'DISTRICT' && scope.scopeId) {
    baseQuery = baseQuery.where('r.district_id', scope.scopeId);
  }

  // Process dynamic bindings open-endedly
  for (const b of bindings) {
    if (b.field_key === 'ps_name' && b.resolved_value?.id) {
      baseQuery = baseQuery.where('r.ps_id', b.resolved_value.id);
    } else if (b.field_key === 'district_name' && b.resolved_value?.id) {
      baseQuery = baseQuery.where('r.district_id', b.resolved_value.id);
    } else if (b.field_key === 'local_head' && b.resolved_value?.code) {
      if (record_type === 'ARREST') {
        baseQuery = baseQuery.where('lh_ad.canonical_code', b.resolved_value.code);
      } else {
        baseQuery = baseQuery.where('lh_fd.canonical_code', b.resolved_value.code);
      }
    } else if (b.field_key === 'seizure_item' && b.resolved_value?.matched_term) {
      const term = b.resolved_value.matched_term.toLowerCase();
      baseQuery = baseQuery.where(function () {
        this.whereILike('rprop.details', `%${term}%`)
          .orWhereILike('rprop.phone_make', `%${term}%`)
          .orWhereILike('rprop.vehicle_make', `%${term}%`);
      });
    } else if (b.field_key === 'custody_status' && b.resolved_value) {
      baseQuery = baseQuery.where('ad.custody_status', b.resolved_value);
    }
  }

  // Apply free-text search filters
  if (freeTextTerms.length > 0) {
    const textQuery = freeTextTerms.join(' ');
    baseQuery = baseQuery.where(function () {
      this.whereILike('fd.brief_facts', `%${textQuery}%`)
        .orWhereILike('rprop.details', `%${textQuery}%`)
        .orWhereILike('rprop.phone_model', `%${textQuery}%`)
        .orWhereILike('rprop.phone_make', `%${textQuery}%`)
        .orWhereILike('rprop.vehicle_make', `%${textQuery}%`)
        .orWhereILike('ad.reason_for_detention', `%${textQuery}%`);
    });
  }

  // Execute query
  const rawRows = await baseQuery.limit(limit * 3).offset(offset);

  const structuredMatches = [];
  const freeTextMatches = [];
  const lowConfidenceMatches = [];

  const localHeadBinding = bindings.find(b => b.field_key === 'local_head');

  for (const row of rawRows) {
    const hasStructuredMatch = (!localHeadBinding || row.canonical_code === localHeadBinding.resolved_value?.code);

    const textMatchFound = freeTextTerms.some(term =>
      (row.brief_facts && row.brief_facts.toLowerCase().includes(term.toLowerCase())) ||
      (row.property_details && row.property_details.toLowerCase().includes(term.toLowerCase())) ||
      (row.phone_model && row.phone_model.toLowerCase().includes(term.toLowerCase()))
    );

    let snippet = null;
    if (row.brief_facts) {
      snippet = row.brief_facts.slice(0, 140) + '...';
    } else if (row.property_details) {
      snippet = row.property_details.slice(0, 140) + '...';
    }

    const itemResult = {
      id: row.id,
      record_number: row.id.slice(0, 8),
      record_type: row.record_type,
      record_date: row.record_date || row.registration_date || row.fir_date,
      status: row.current_status || 'APPROVED',
      ps_name: row.ps_name || 'Police Station',
      district_name: row.district_name || 'District',
      crime_head_name: row.crime_head_name || 'General Record',
      snippet: snippet,
      details: {
        phone_make: row.phone_make,
        phone_model: row.phone_model,
        vehicle_make: row.vehicle_make,
        estimated_value: row.estimated_value,
        arrest_date: row.arrest_date,
        arrest_custody_status: row.arrest_custody_status
      }
    };

    if (hasStructuredMatch && (!freeTextTerms.length || textMatchFound)) {
      structuredMatches.push(itemResult);
    } else if (textMatchFound) {
      freeTextMatches.push(itemResult);
    } else {
      lowConfidenceMatches.push(itemResult);
    }
  }

  const totalResults = structuredMatches.length + freeTextMatches.length + lowConfidenceMatches.length;

  // Audit Logging
  try {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let userIdVal = user?.id || user?.userId;
    let userExists = null;
    if (userIdVal && UUID_RE.test(userIdVal)) {
      userExists = await db('users').where({ id: userIdVal }).first();
    }
    if (!userExists) {
      const fallbackUser = await db('users').select('id').first();
      userIdVal = fallbackUser ? fallbackUser.id : '00000000-0000-0000-0000-000000000000';
    }

    await db('report_builder_audit').insert({
      id: uuidv4(),
      user_id: userIdVal,
      user_role: user?.role || 'HC',
      run_type: 'NL_SEARCH',
      table_spec: JSON.stringify(record_type),
      fields_spec: JSON.stringify(bindings),
      filter_spec: JSON.stringify({ query: confirmationSpec.query, free_text_terms: freeTextTerms }),
      format: 'JSON',
      row_count: totalResults,
      job_id: null,
      ip_address: user?.ip || '127.0.0.1',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn(`[NLSearchAudit] Failed to log audit: ${err.message}`);
  }

  return {
    query: confirmationSpec.query,
    scope: { type: scope.scopeType, id: scope.scopeId },
    totals: {
      total: totalResults,
      structured: structuredMatches.length,
      free_text: freeTextMatches.length,
      low_confidence: lowConfidenceMatches.length
    },
    results: {
      structured_matches: structuredMatches.slice(0, limit),
      free_text_matches: freeTextMatches.slice(0, limit),
      low_confidence_matches: lowConfidenceMatches.slice(0, limit)
    },
    disclosure_notice: confirmationSpec.disclosure_notice || null
  };
}
