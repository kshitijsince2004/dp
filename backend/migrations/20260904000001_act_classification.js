/**
 * Migration: ref.act_classification
 * =================================
 * `ref.acts` carries no category column (only act_cd, act_long). The reporting
 * layer needs a Major-Act vs Special-&-Local-Law split for the "FIR/Arrest by
 * Act" Quick Access reports.
 *
 * Decision (project owner, 2026-09-04): MAJOR = Indian Penal Code (IPC),
 * Bharatiya Nyaya Sanhita (BNS), Code of Criminal Procedure (CrPC), Bharatiya
 * Nagarik Suraksha Sanhita (BNSS). Everything else = SLL. Membership is by
 * explicit act_cd list resolved here — never a runtime ILIKE.
 *
 * act_cd map (verified against ref.acts in this environment):
 *   10   CODE OF CRIMINAL PROCEDURE, 1973            -> MAJOR (CrPC)
 *   43   IPC 1860                                    -> MAJOR (IPC)
 *   1731 CODE OF CRIMINAL PROCEDURE REGULATION, 1974 -> MAJOR (CrPC family)
 *   4375 THE BHARATIYA NYAYA SANHITA (BNS), 2023     -> MAJOR (BNS)
 *   4377 THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023-> MAJOR (BNSS)
 */

const MAJOR_ACT_CDS = [10, 43, 1731, 4375, 4377];

export async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS ref.act_classification (
      act_cd     integer PRIMARY KEY REFERENCES ref.acts(act_cd) ON DELETE CASCADE,
      class      varchar(8) NOT NULL CHECK (class IN ('MAJOR', 'SLL')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // MAJOR — explicit list, only for act_cds that actually exist
  await knex('ref.act_classification')
    .insert(
      MAJOR_ACT_CDS.map((cd) => ({ act_cd: cd, class: 'MAJOR' }))
    )
    .onConflict('act_cd')
    .merge(['class', 'updated_at'])
    .then(() => {})
    .catch(async () => {
      // fallback for knex builds without onConflict on this path
      for (const cd of MAJOR_ACT_CDS) {
        await knex.raw(
          `INSERT INTO ref.act_classification (act_cd, class)
           SELECT :cd, 'MAJOR' WHERE EXISTS (SELECT 1 FROM ref.acts WHERE act_cd = :cd)
           ON CONFLICT (act_cd) DO UPDATE SET class = 'MAJOR', updated_at = now()`,
          { cd }
        );
      }
    });

  // Guard: drop any MAJOR rows whose act_cd is not actually in ref.acts
  await knex.raw(`
    DELETE FROM ref.act_classification ac
    WHERE NOT EXISTS (SELECT 1 FROM ref.acts a WHERE a.act_cd = ac.act_cd);
  `);

  // SLL — every other act
  await knex.raw(`
    INSERT INTO ref.act_classification (act_cd, class)
    SELECT a.act_cd, 'SLL'
    FROM ref.acts a
    WHERE NOT EXISTS (SELECT 1 FROM ref.act_classification ac WHERE ac.act_cd = a.act_cd)
    ON CONFLICT (act_cd) DO NOTHING;
  `);
}

export async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS ref.act_classification;');
}
