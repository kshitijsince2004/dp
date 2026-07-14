// Bridges the small, human-curated taxonomies already embedded in field_registry's seed
// (act_name's 8 labels, the 12 per-crime minor-head field_keys, property_major_category)
// to the underlying government-supplied ref.* reference-data codes (loaded from the same
// Excel workbook by `npm run load-ref`). These mappings are static structural facts
// (verified directly against the seeded DB — see comments), not business logic, and change
// only if the source Excel workbook's taxonomy changes.
//
// Every literal act_cd / major_head_code / ref.* table+column name used by the fields
// module lives here and nowhere else — fields.service.js and fields.controller.js resolve
// through this file instead of hardcoding codes or building dynamic table/column identifiers
// from untrusted input.

// Act label (as stored in field_registry seed's act_name options / show_when values) -> act_cd(s)
// in ref.acts. Only acts that have a dedicated *_sections/*_major_head field_key need an entry;
// CrPC/BNSS/BNS/Other Act fall through to the generic free-text 'sections' / 'other_*' fields.
export const ACT_GROUP_CODES = {
  IPC: [43], // ref.acts: 'IPC 1860'
  'Delhi Excise Act': [3032, 3270], // 'DELHI EXCISE ACT, 2009' + '..., 2010'
  'Arms Act': [4], // 'ARMS ACT, 1959'
  'Gambling Act': [2612, 68], // 'DELHI PUBLIC GAMBLING ACT, 1955' + 'THE PUBLIC GAMBLING ACT, 1867'
};

// field_registry.field_key (the *_minor_head rows) -> verified ref.major_heads.major_head_code(s).
// Looked up once directly against the DB; [] means no matching major_head could be identified in
// the current seeded data (a documented source-data gap, not a bug). Safe/cheap to re-verify by
// querying: select major_head_code, major_head from ref.major_heads where major_head ilike '...'
export const MINOR_HEAD_MAJOR_CODES = {
  theft_minor_head: [54], // THEFT
  murder_minor_head: [36, 166], // 'MURDER (HOMICIDE)', 'Murder'
  hurt_minor_head: [31, 148], // two distinct 'HURT' rows in source data
  cheating_minor_head: [8, 165], // 'CHEATING', 'Cheating'
  robbery_minor_head: [48], // ROBBERY
  excise_possession_minor_head: [], // no 'POSSESSION' major head exists in ref.major_heads
  excise_sale_minor_head: [], // no 'SALE' major head exists
  excise_smuggling_minor_head: [70], // CUSTOMS (SMUGGLING) — correct, but currently unreachable
  // because excise_major_head itself has 0 live options (ref.major_minor_mapping has no rows
  // for act_cd 3032/3270) — will "just work" once that upstream data gap is fixed, no code change
  arms_possession_minor_head: [], // Arms Act only maps to one major head, 'ARMS' (61); no
  arms_use_minor_head: [], // 'possession'/'use' split exists in ref.major_heads
  gambling_house_minor_head: [], // no 'GAMING HOUSE' major head; and gambling_major_head has 0
  gambling_public_minor_head: [], // live options anyway (no mapping rows for act_cd 2612/68)
};

// ref.property_categories.parent_cd -> where to source that category's minor items from
// (the table merges the former top-level property types [major_property=1] and the OTHERS
// sub-categories [major_property=0]). type:'ARMS' is the one structurally different category
// (a 3-level sub-structure: arms_categories -> fire_arms, plus an unlinked arms_made list)
// and is handled by a small dedicated branch in fields.service.js; everything else is either
// type: 'GENERIC' (flat lookup table, no parent_cd column) or falls through to the default
// handler (ref.other_property_items, filtered by parent_cd) when absent from this map.
export const PROPERTY_CATEGORY_SOURCES = {
  4: { type: 'ARMS' }, // ARMS AND AMMUNITION
  8: { type: 'GENERIC', table: 'ref.currency_types', valueColumn: 'currency_type_cd', labelColumn: 'currency_type' }, // COIN AND CURRENCY
  9: { type: 'GENERIC', table: 'ref.automobiles', valueColumn: 'automobile_cd', labelColumn: 'automobile' }, // AUTOMOBILES AND OTHERS
  10: { type: 'GENERIC', table: 'ref.cultural_properties', valueColumn: 'cultural_prop_cd', labelColumn: 'cultural_prop' }, // CULTURAL PROPERTY
  11: { type: 'GENERIC', table: 'ref.document_types', valueColumn: 'document_type_cd', labelColumn: 'document_type' }, // DOCUMENTS AND VALUABLE SECURITIES
  12: { type: 'GENERIC', table: 'ref.drug_types', valueColumn: 'drug_type_cd', labelColumn: 'drug_type' }, // DRUGS/NARCOTIC DRUGS
  13: { type: 'GENERIC', table: 'ref.electric_goods', valueColumn: 'electric_goods_cd', labelColumn: 'electric_goods' }, // ELECTRICAL AND ELECTRONIC GOODS
  14: { type: 'GENERIC', table: 'ref.explosive_types', valueColumn: 'explosive_type_cd', labelColumn: 'explosive_type' }, // EXPLOSIVES
  17: { type: 'GENERIC', table: 'ref.jewelry_types', valueColumn: 'jewelry_type_cd', labelColumn: 'jewelry_type' }, // JEWELLERY
  // parent_cd 0 (OTHERS) and all major_property=0 sub-category parent_cds (1,2,3,5,6,7,15,16,
  // 18-25) are intentionally absent -> handled by the default branch (ref.other_property_items
  // filtered by parent_cd) in fields.service.js.
};
