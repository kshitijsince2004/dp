/**
 * Head Resolver for Pharos Reporting Engine.
 * Implements Delhi Police R2 cascade head classification resolution:
 *   1. Local Head (fir_details.local_head_id)
 *   2. Major Head (record_offences.major_head_id / ref.major_heads)
 *   3. Primary Act / Section (record_offences where is_primary = true)
 */

export function matchRecord(record, classificationSpec) {
  if (!record || !classificationSpec) return false;

  const { local_head_ids, major_head_ids, sections, act_ids } = classificationSpec;
  const detail = record.detail || {};
  const offences = record.offences || [];
  const primaryOffence = offences.find(o => o.is_primary) || offences[0] || {};

  // 1. Cascade Step 1: Check Local Head ID
  if (local_head_ids && local_head_ids.length > 0) {
    const recLocalHead = detail.local_head_id || record.local_head_id;
    if (recLocalHead && local_head_ids.includes(Number(recLocalHead))) {
      return true;
    }
  }

  // 2. Cascade Step 2: Check Major Head ID (check primary offence first, then all offences)
  if (major_head_ids && major_head_ids.length > 0) {
    if (primaryOffence.major_head_id && major_head_ids.includes(Number(primaryOffence.major_head_id))) {
      return true;
    }
    const hasMajor = offences.some(o => o.major_head_id && major_head_ids.includes(Number(o.major_head_id)));
    if (hasMajor) return true;
  }

  // 3. Cascade Step 3: Check Section Code or Act ID
  if (sections && sections.length > 0) {
    const hasSec = offences.some(o => o.section_id && sections.includes(o.section_id));
    if (hasSec) return true;
  }

  if (act_ids && act_ids.length > 0) {
    const hasAct = offences.some(o => o.act_id && act_ids.includes(Number(o.act_id)));
    if (hasAct) return true;
  }

  return false;
}

export function assertDisjointHeads(sectionsDef) {
  const seenMajors = new Set();
  const overlaps = [];

  for (const section of sectionsDef) {
    const majorIds = section.classification?.major_head_ids || [];
    for (const mId of majorIds) {
      if (seenMajors.has(mId)) {
        overlaps.push(mId);
      } else {
        seenMajors.add(mId);
      }
    }
  }

  if (overlaps.length > 0) {
    throw new Error(`[HeadResolver] Classification overlap detected for major head IDs: ${overlaps.join(', ')}`);
  }
}
