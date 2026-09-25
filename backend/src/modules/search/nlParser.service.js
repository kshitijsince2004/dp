import db from '../../config/db.js';
import { matchSeizureTaxonomy } from './seizureTaxonomy.js';
import { logger } from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

// Cached reference data for candidate matching
let cachedPsNodes = null;
let cachedDistrictNodes = null;
let cachedLocalHeads = null;

async function initReferenceCache() {
  if (!cachedPsNodes) {
    cachedPsNodes = await db('hierarchy_nodes').where({ node_type: 'PS', is_active: true }).select('id', 'name', 'code');
  }
  if (!cachedDistrictNodes) {
    cachedDistrictNodes = await db('hierarchy_nodes').where({ node_type: 'DISTRICT', is_active: true }).select('id', 'name', 'code');
  }
  if (!cachedLocalHeads) {
    cachedLocalHeads = await db('ref.local_heads').select('local_head_cd', 'local_head', 'canonical_code');
  }
}

const CANONICAL_CRIME_HEAD_MAP = [
  { code: 'MURDER', label: 'Murder', keywords: ['murder', 'killing', 'homicide', 'hatya', '302', '103 bns'] },
  { code: 'ATT_TO_MURDER', label: 'Attempt to Murder', keywords: ['attempt to murder', 'att to murder', '307', '109 bns', 'jaan se marne ki koshish'] },
  { code: 'DACOITY', label: 'Dacoity', keywords: ['dacoity', 'dakaiti', '395'] },
  { code: 'ROBBERY', label: 'Robbery', keywords: ['robbery', 'loot', '392'] },
  { code: 'BURGLARY', label: 'Burglary', keywords: ['burglary', 'nakabjani', 'house breaking', 'day burglary', 'night burglary'] },
  { code: 'HOUSE_THEFT', label: 'House Theft', keywords: ['house theft', 'home theft', 'ghar me chori'] },
  { code: 'MV_THEFT', label: 'Vehicle Theft', keywords: ['mv theft', 'vehicle theft', 'car theft', 'bike theft', 'motorcycle theft', 'gadi chori', 'auto theft'] },
  { code: 'OTHER_THEFT', label: 'Theft', keywords: ['theft', 'stolen', 'chori', '379', 'pick pocketing', 'snatching'] },
  { code: 'RAPE', label: 'Rape', keywords: ['rape', 'dusehad', '376', 'balatkar'] },
  { code: 'POCSO', label: 'POCSO / Child Abuse', keywords: ['pocso', 'child sexual abuse', 'minor abuse'] },
  { code: 'NDPS_ACT', label: 'NDPS / Narcotics', keywords: ['ndps', 'narcotics', 'drugs', 'ganja', 'charas', 'heroin', 'smack'] },
  { code: 'EXCISE_ACT', label: 'Excise Act / Liquor', keywords: ['excise', 'liquor', 'sharab', 'illegal alcohol'] },
  { code: 'ARMS_ACT', label: 'Arms Act', keywords: ['arms act', 'illegal weapon', 'katta seizure', 'illegal gun'] },
  { code: 'FATAL_ACCIDENT', label: 'Fatal Accident', keywords: ['fatal accident', 'road accident death', 'accident death'] },
  { code: 'SIMPLE_ACCIDENT', label: 'Simple Accident', keywords: ['simple accident', 'road accident'] },
  { code: 'KIDNAPPING', label: 'Kidnapping', keywords: ['kidnapping', 'abduction', 'apaharan', '363', '364'] }
];

/**
 * Open-ended catalog-driven parser: extracts dynamic candidate bindings over field_catalog.json
 */
export async function parseNaturalLanguageQuery(queryText) {
  if (!queryText || typeof queryText !== 'string') {
    return {
      query: '',
      bindings: [],
      free_text_terms: [],
      unresolved_terms: [],
      is_ambiguous: false,
      ambiguity_warning: null,
      disclosure_notice: null
    };
  }

  await initReferenceCache();

  const cleanText = queryText.trim();
  const lowerText = cleanText.toLowerCase();

  const bindings = [];
  const matchedPhrases = [];

  // 1. Target Record Type Binding
  let recordType = 'CASE';
  let recordTypePhrase = 'cases';
  if (/\barrests?\b|\barrested\b|\bcustody\b/i.test(lowerText)) {
    recordType = 'ARREST';
    recordTypePhrase = lowerText.match(/\barrests?\b|\barrested\b|\bcustody\b/i)[0];
  } else if (/\bmissing\b|\bdisappeared\b|\bgumshuda\b/i.test(lowerText)) {
    recordType = 'MISSING';
    recordTypePhrase = lowerText.match(/\bmissing\b|\bdisappeared\b|\bgumshuda\b/i)[0];
  } else if (/\buidb\b|\bunidentified body\b|\blawaris laash\b/i.test(lowerText)) {
    recordType = 'UIDB';
    recordTypePhrase = lowerText.match(/\buidb\b|\bunidentified body\b|\blawaris laash\b/i)[0];
  }

  bindings.push({
    field_key: 'record_type',
    catalog_entry: { key: 'record_type', label_en: 'Target Record Type' },
    match_type: 'bounded_categorical',
    matched_phrase: recordTypePhrase,
    resolved_value: recordType,
    display_label: `Record Type: ${recordType}`
  });
  matchedPhrases.push(recordTypePhrase.toLowerCase());

  // 2. Police Station Binding (canonical_enum over hierarchy_nodes PS)
  for (const psNode of cachedPsNodes) {
    // Extract base station name (e.g. "PS Parliament Street" -> "parliament street")
    const cleanPsName = psNode.name.replace(/^PS\s+/i, '').trim().toLowerCase();
    if (cleanPsName.length > 2) {
      const psRegex = new RegExp(`\\b${cleanPsName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (psRegex.test(lowerText)) {
        const fullMatchedPhrase = `at ${cleanPsName} police station`;
        bindings.push({
          field_key: 'ps_name',
          catalog_entry: { key: 'ps_name', label_en: 'Police Station' },
          match_type: 'canonical_enum',
          matched_phrase: cleanPsName,
          resolved_value: { id: psNode.id, name: psNode.name, code: psNode.code },
          display_label: `PS: ${psNode.name}`
        });
        matchedPhrases.push(cleanPsName);
        matchedPhrases.push('at');
        matchedPhrases.push('police');
        matchedPhrases.push('station');
        break;
      }
    }
  }

  // 3. District Binding (canonical_enum over hierarchy_nodes DISTRICT)
  for (const distNode of cachedDistrictNodes) {
    const cleanDistName = distNode.name.replace(/\s+District$/i, '').trim().toLowerCase();
    if (cleanDistName.length > 2) {
      const distRegex = new RegExp(`\\b${cleanDistName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (distRegex.test(lowerText)) {
        bindings.push({
          field_key: 'district_name',
          catalog_entry: { key: 'district_name', label_en: 'Police District' },
          match_type: 'canonical_enum',
          matched_phrase: cleanDistName,
          resolved_value: { id: distNode.id, name: distNode.name, code: distNode.code },
          display_label: `District: ${distNode.name}`
        });
        matchedPhrases.push(cleanDistName);
        matchedPhrases.push('district');
        break;
      }
    }
  }

  // 4. Canonical Crime Head Binding
  let matchedCrimeHeads = [];
  for (const ch of CANONICAL_CRIME_HEAD_MAP) {
    for (const kw of ch.keywords) {
      const regex = new RegExp(`\\b${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lowerText)) {
        if (!matchedCrimeHeads.some(m => m.code === ch.code)) {
          matchedCrimeHeads.push({ ...ch, matched_term: kw });
        }
        break;
      }
    }
  }

  let isAmbiguous = false;
  let ambiguityWarning = null;

  if (matchedCrimeHeads.length > 1) {
    isAmbiguous = true;
    ambiguityWarning = `Query mentions multiple conflicting crime heads: ${matchedCrimeHeads.map(m => m.label).join(', ')}. Please select one.`;
  } else if (matchedCrimeHeads.length === 1) {
    const chMatch = matchedCrimeHeads[0];
    bindings.push({
      field_key: 'local_head',
      catalog_entry: { key: 'local_head', label_en: 'Canonical Crime Head' },
      match_type: 'canonical_enum',
      matched_phrase: chMatch.matched_term,
      resolved_value: { code: chMatch.code, label: chMatch.label },
      display_label: `Crime Head: ${chMatch.label}`
    });
    matchedPhrases.push(chMatch.matched_term.toLowerCase());
  }

  // 5. Seizure Weapon Binding
  const seizureMatch = matchSeizureTaxonomy(lowerText);
  if (seizureMatch) {
    bindings.push({
      field_key: 'seizure_item',
      catalog_entry: { key: 'seizure_item', label_en: 'Seizure Weapon / Category' },
      match_type: 'canonical_enum',
      matched_phrase: seizureMatch.matched_term,
      resolved_value: { code: seizureMatch.code, label: seizureMatch.label_en, matched_term: seizureMatch.matched_term },
      display_label: `Seizure: ${seizureMatch.label_en}`
    });
    matchedPhrases.push(seizureMatch.matched_term.toLowerCase());
  }

  // 6. Gender Binding
  if (/\bmale\b|\bman\b|\bboy\b/i.test(lowerText)) {
    bindings.push({
      field_key: 'gender',
      catalog_entry: { key: 'gender', label_en: 'Gender' },
      match_type: 'bounded_categorical',
      matched_phrase: 'male',
      resolved_value: 'MALE',
      display_label: 'Gender: MALE'
    });
    matchedPhrases.push('male', 'man', 'boy');
  } else if (/\bfemale\b|\bwoman\b|\bgirl\b/i.test(lowerText)) {
    bindings.push({
      field_key: 'gender',
      catalog_entry: { key: 'gender', label_en: 'Gender' },
      match_type: 'bounded_categorical',
      matched_phrase: 'female',
      resolved_value: 'FEMALE',
      display_label: 'Gender: FEMALE'
    });
    matchedPhrases.push('female', 'woman', 'girl');
  }

  // 7. Age Range Binding
  const ageRangeMatch = lowerText.match(/(?:aged|age)\s+(?:between\s+)?(\d+)\s+(?:and|to|-)\s+(\d+)/i);
  if (ageRangeMatch) {
    const minAge = parseInt(ageRangeMatch[1], 10);
    const maxAge = parseInt(ageRangeMatch[2], 10);
    bindings.push({
      field_key: 'age',
      catalog_entry: { key: 'age', label_en: 'Age Range' },
      match_type: 'numeric_range',
      matched_phrase: ageRangeMatch[0],
      resolved_value: { min: minAge, max: maxAge },
      display_label: `Age Range: ${minAge} - ${maxAge} Years`
    });
    matchedPhrases.push(ageRangeMatch[0].toLowerCase(), 'aged', 'between', 'and', 'to');
  }

  // 8. Extract remaining free-text terms
  const stopwords = ['cases', 'case', 'of', 'involving', 'in', 'at', 'as', 'the', 'seizure', 'weapon', 'item', 'with', 'their', 'descriptions', 'for', 'a', 'an', 'specific', 'police', 'station', 'district', 'record', 'records'];
  let remainingWords = lowerText.split(/\s+/).filter(w => w.length > 1 && !stopwords.includes(w));

  for (const mp of matchedPhrases) {
    remainingWords = remainingWords.filter(w => !mp.includes(w));
  }

  const freeTextTerms = remainingWords.join(' ').trim() ? [remainingWords.join(' ')] : [];

  let disclosureNotice = null;
  if (freeTextTerms.length > 0) {
    disclosureNotice = `Specific model or description term "${freeTextTerms.join(' ')}" is searched via free-text matching. Results depend on text descriptions and may be incomplete for sparse records.`;
  }

  return {
    query: cleanText,
    bindings: bindings,
    resolved: {
      record_type: recordType,
      crime_head: bindings.find(b => b.field_key === 'local_head')?.resolved_value || null,
      seizure_item: bindings.find(b => b.field_key === 'seizure_item')?.resolved_value || null,
      ps_node: bindings.find(b => b.field_key === 'ps_name')?.resolved_value || null,
      district_node: bindings.find(b => b.field_key === 'district_name')?.resolved_value || null,
    },
    free_text_terms: freeTextTerms,
    unresolved_terms: [],
    is_ambiguous: isAmbiguous,
    ambiguity_warning: ambiguityWarning,
    disclosure_notice: disclosureNotice
  };
}
