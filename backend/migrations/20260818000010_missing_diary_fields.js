/**
 * Migration 20260818000010: Complete Field Verification & Missing Diary Fields
 * Unlocks: STAT_5, STAT_6, STAT_12, STAT_23, STAT_31, STAT_32, STAT_40, STAT_41, Daily sheets 5, 27, 29, 33
 */

export async function up(knex) {
  // ── 1. fir_details additions ──────────────────────────────────────────────────
  const firCols = await knex('information_schema.columns')
    .where('table_name', 'fir_details')
    .pluck('column_name');

  await knex.schema.table('fir_details', t => {
    if (!firCols.includes('is_important'))
      t.boolean('is_important').defaultTo(false)
       .comment('Unlocks: STAT_34 important cases, Daily sheet 27');

    if (!firCols.includes('organised_crime'))
      t.boolean('organised_crime').defaultTo(false)
       .comment('Unlocks: STAT_12 organised crime filter');

    if (!firCols.includes('registered_on_direction'))
      t.boolean('registered_on_direction').defaultTo(false)
       .comment('Unlocks: STAT_32 court-directed FIRs');

    if (!firCols.includes('direction_authority'))
      t.string('direction_authority', 100).nullable()
       .comment('Which court directed the FIR — STAT_32');

    if (!firCols.includes('cheating_amount'))
      t.decimal('cheating_amount', 14, 2).nullable()
       .comment('Unlocks: Daily sheet 29 financial fraud amount');

    if (!firCols.includes('modus_operandi'))
      t.string('modus_operandi', 500).nullable()
       .comment('Unlocks: Daily sheet 29 MO column');

    if (!firCols.includes('burglary_mo_cd'))
      t.integer('burglary_mo_cd').nullable()
       .comment('Unlocks: STAT_5 §A means of entry');

    // Strategic court fields directly on fir_details
    if (!firCols.includes('sent_to_court_date'))
      t.date('sent_to_court_date').nullable()
       .comment('Date challan filed in court — STAT_40/41 col 4');

    if (!firCols.includes('court_case_no'))
      t.string('court_case_no', 50).nullable()
       .comment('Court-assigned case number');

    if (!firCols.includes('court_name'))
      t.string('court_name', 100).nullable()
       .comment('Name of court where challan filed');

    if (!firCols.includes('court_disposal_type'))
      t.string('court_disposal_type', 30).nullable()
       .comment('Final court verdict — STAT_40/41 disposal columns');

    if (!firCols.includes('court_disposal_date'))
      t.date('court_disposal_date').nullable()
       .comment('Date of court verdict — for aging calculation STAT_40/41');
  });

  // ── 2. persons additions ──────────────────────────────────────────────────────
  const personCols = await knex('information_schema.columns')
    .where('table_name', 'persons')
    .pluck('column_name');

  await knex.schema.table('persons', t => {
    if (!personCols.includes('social_category'))
      t.string('social_category', 10).nullable()
       .comment('Unlocks: STAT_23 SC/ST, STAT_20 caste column');

    if (!personCols.includes('education'))
      t.string('education', 20).nullable()
       .comment('Unlocks: STAT_20 education bands');

    if (!personCols.includes('financial_status'))
      t.string('financial_status', 15).nullable()
       .comment('Optional financial status');
  });

  await knex.raw(`
    ALTER TABLE persons
      DROP CONSTRAINT IF EXISTS chk_social_category,
      ADD CONSTRAINT chk_social_category
        CHECK (social_category IN ('SC','ST','OBC','GEN','UNKNOWN')),
      DROP CONSTRAINT IF EXISTS chk_education,
      ADD CONSTRAINT chk_education
        CHECK (education IN (
          'ILLITERATE','SCHOOL_DROPOUT','UP_TO_10TH',
          'UP_TO_12TH','GRADUATE','PROFESSIONAL','UNKNOWN'
        )),
      DROP CONSTRAINT IF EXISTS chk_financial_status,
      ADD CONSTRAINT chk_financial_status
        CHECK (financial_status IN ('BPL','LOWER','MIDDLE','UPPER','UNKNOWN'));
  `);

  // ── 3. arrest_details additions ───────────────────────────────────────────────
  const arrestCols = await knex('information_schema.columns')
    .where('table_name', 'arrest_details')
    .pluck('column_name');

  await knex.schema.table('arrest_details', t => {
    if (!arrestCols.includes('reason_for_detention'))
      t.text('reason_for_detention').nullable()
       .comment('Kalandra: reason for DD-based arrest');
  });

  // ── 4. record_properties additions ────────────────────────────────────────────
  const propCols = await knex('information_schema.columns')
    .where('table_name', 'record_properties')
    .pluck('column_name');

  await knex.schema.table('record_properties', t => {
    if (!propCols.includes('recovery_date'))
      t.date('recovery_date').nullable()
       .comment('Date property recovered — STAT_13, STAT_33 recovery window');

    if (!propCols.includes('recovery_agency'))
      t.string('recovery_agency', 20).nullable()
       .comment('Who recovered — STAT_13 §B police/public/abandoned split');
  });

  await knex.raw(`
    ALTER TABLE record_properties
      DROP CONSTRAINT IF EXISTS chk_recovery_agency,
      ADD CONSTRAINT chk_recovery_agency
        CHECK (recovery_agency IN ('POLICE','PUBLIC','ABANDONED','OTHER'));
  `);

  // ── 5. victim_injury_details (new table) ────────────────────────────────────
  const hasInjuryTable = await knex.schema.hasTable('victim_injury_details');
  if (!hasInjuryTable) {
    await knex.schema.createTable('victim_injury_details', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('person_id').notNullable()
       .references('id').inTable('persons').onDelete('CASCADE');
      t.string('injury_severity', 20)
       .checkIn(['FATAL','GRIEVOUS','SIMPLE','NONE'])
       .comment('Unlocks: STAT_6 casualty columns');
      t.boolean('hospitalized').defaultTo(false);
      t.string('hospital_name', 150).nullable();
      t.timestamps(true, true);
      t.unique(['person_id']);
    });
  }

  // ── 6. ref.burglary_mo (new ref table) ──────────────────────────────────────
  const hasBurglaryMo = await knex.schema.withSchema('ref').hasTable('burglary_mo');
  if (!hasBurglaryMo) {
    await knex.schema.withSchema('ref').createTable('burglary_mo', t => {
      t.increments('mo_cd').primary();
      t.string('mo_desc', 100).notNullable();
    });
    await knex('ref.burglary_mo').insert([
      { mo_desc: 'Breaking lock'      },
      { mo_desc: 'Breaking kundas'    },
      { mo_desc: 'Breaking doors'     },
      { mo_desc: 'Breaking windows'   },
      { mo_desc: 'Scaling wall'       },
      { mo_desc: 'Through roofs'      },
      { mo_desc: 'Breaking glass'     },
      { mo_desc: 'Climbing pipe'      },
      { mo_desc: 'Any other means'    },
    ]);

    await knex.schema.table('fir_details', t => {
      t.foreign('burglary_mo_cd').references('mo_cd').inTable('ref.burglary_mo');
    });
  }

  // ── 7. ref.units ensure to_kg_factor exists ─────────────────────────────────
  const hasUnits = await knex.schema.withSchema('ref').hasTable('units');
  if (!hasUnits) {
    await knex.schema.withSchema('ref').createTable('units', t => {
      t.increments('unit_cd').primary();
      t.string('unit', 30).notNullable();
      t.decimal('to_kg_factor', 12, 8).notNullable().defaultTo(1.0)
       .comment('Multiply quantity by this to get kg equivalent');
    });
  }
}

export async function down(knex) {
  await knex.schema.table('fir_details', t => {
    ['registered_on_direction','direction_authority','cheating_amount',
     'modus_operandi','burglary_mo_cd','sent_to_court_date','court_case_no',
     'court_name','court_disposal_type','court_disposal_date']
    .forEach(col => t.dropColumn(col));
  });
  await knex.schema.table('persons', t => {
    ['social_category','education','financial_status']
    .forEach(col => t.dropColumn(col));
  });
  await knex.schema.table('arrest_details', t => {
    t.dropColumn('reason_for_detention');
  });
  await knex.schema.table('record_properties', t => {
    ['recovery_date','recovery_agency']
    .forEach(col => t.dropColumn(col));
  });
  await knex.schema.dropTableIfExists('victim_injury_details');
  await knex.schema.withSchema('ref').dropTableIfExists('burglary_mo');
}
