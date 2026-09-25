// field_registry declares these two storage mappings (config/fields/case.json's
// supplementary_chargesheet_details, config/fields/uidb.json's inquest_status) but no
// migration ever created the underlying columns — sync-config's storage validation
// (backend/scripts/lib/sync-config-core.mjs) checks every field's storage.table/column
// against live information_schema.columns and fails loudly at boot when they don't exist:
//   supplementary_chargesheet_details: fir_details.supplementary_chargesheet_details does not exist
//   inquest_status: uidb_details.inquest_status does not exist
// This migration adds exactly those two columns so field_registry and the live schema agree.
export async function up(knex) {
  const hasSupplementary = await knex.schema.hasColumn('fir_details', 'supplementary_chargesheet_details');
  if (!hasSupplementary) {
    await knex.schema.alterTable('fir_details', (t) => {
      t.text('supplementary_chargesheet_details').nullable();
    });
  }

  const hasInquestStatus = await knex.schema.hasColumn('uidb_details', 'inquest_status');
  if (!hasInquestStatus) {
    await knex.schema.alterTable('uidb_details', (t) => {
      t.string('inquest_status', 50).nullable();
    });
  }
};

export async function down(knex) {
  const hasSupplementary = await knex.schema.hasColumn('fir_details', 'supplementary_chargesheet_details');
  if (hasSupplementary) {
    await knex.schema.alterTable('fir_details', (t) => {
      t.dropColumn('supplementary_chargesheet_details');
    });
  }

  const hasInquestStatus = await knex.schema.hasColumn('uidb_details', 'inquest_status');
  if (hasInquestStatus) {
    await knex.schema.alterTable('uidb_details', (t) => {
      t.dropColumn('inquest_status');
    });
  }
};
