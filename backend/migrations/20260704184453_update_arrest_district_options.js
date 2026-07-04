export async function up(knex) {
  const DISTRICTS = [
    "South District (SD)", "South East District (SED)", "New Delhi District (NDD)",
    "South West District (SWD)", "West District (WD)", "Outer District (OD)",
    "Dwarka District (DW)", "North West District (NWD)", "Rohini District (RND)",
    "Outer North District (OND)", "Central District (CD)", "North District (ND)",
    "East District (ED)", "North East District (NED)", "Shahdara District (SHD)"
  ];
  const DISTRICT_OPTS = JSON.stringify(DISTRICTS.map(d => ({ value: d, label_en: d, label_hi: d })));

  await knex('field_registry')
    .where({ id: 'A_7_district' })
    .update({ options: DISTRICT_OPTS });
}

export async function down(knex) {
  // Revert back to New Delhi/Central
  const OLD_OPTS = JSON.stringify([
    { value: 'New Delhi District (NDD)', label_en: 'New Delhi District (NDD)', label_hi: 'नई दिल्ली जिला' },
    { value: 'Central District', label_en: 'Central District', label_hi: 'मध्य जिला' }
  ]);

  await knex('field_registry')
    .where({ id: 'A_7_district' })
    .update({ options: OLD_OPTS });
}
