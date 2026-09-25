# Prompt for Antigravity — Block resubmission when SHO-flagged fields weren't corrected

Scope is exactly the 5 files below. Nothing else. Do not touch line endings or reformat any file.

## Why this works (context, don't re-derive it)

- When SHO/District sends a record back, `workflow_transitions` already stores a `target_fields` JSON array (the field_keys the reviewer flagged) — set from `sendBack` in `records.controller.js` / `records.service.js`.
- Every save via `updateRecord` already writes a `record_revisions` row with `field_changes` (JSON array of `{field_key, old_value, new_value}`) — this is the existing diff/audit trail.
- So "did the HC actually fix the flagged fields" = "does any `record_revisions` row after the last SEND_BACK contain a `field_changes` entry for each flagged field_key." No new data needs to be captured — just compare what already exists.

## 1. New migration — `backend/migrations/<timestamp>_add_requires_field_correction.js`

Timestamp after the latest existing migration file. Additive only:
```js
export async function up(knex) {
  const hasCol = await knex.schema.hasColumn('workflow_transitions_config', 'requires_field_correction');
  if (!hasCol) {
    await knex.schema.alterTable('workflow_transitions_config', (t) => {
      t.boolean('requires_field_correction').notNullable().defaultTo(false);
    });
  }
}
export async function down(knex) {
  const hasCol = await knex.schema.hasColumn('workflow_transitions_config', 'requires_field_correction');
  if (hasCol) {
    await knex.schema.alterTable('workflow_transitions_config', (t) => {
      t.dropColumn('requires_field_correction');
    });
  }
}
```
Run it.

## 2. `config/workflow/main.json`

Find the object with `"code": "sent_back.submit"`. Add one line to it:
```json
"requires_field_correction": true,
```
(Same rule already has `requires_comment`, `sla_hours`, etc. — add this alongside them, don't reorder anything else in the file.)

## 3. `backend/scripts/lib/sync-config-core.mjs`

Find the `syncTable(db, log, 'workflow → transitions_config', ...)` call (~line 211). Its mapping object has `requires_comment: !!w.requires_comment,`. Add directly after it:
```js
requires_field_correction: !!w.requires_field_correction,
```
Then run `npm run sync-config`.

## 4. `backend/src/modules/workflow/workflow.engine.js`

Add this new exported function, placed after `assertComment`:
```js
/**
 * When a transition's config row has requires_field_correction = true, block it unless
 * every field_key the last SEND_BACK flagged (workflow_transitions.target_fields) shows
 * up in at least one record_revisions.field_changes entry written since that send-back.
 * No target_fields on the last send-back (reviewer gave only a comment, no specific
 * fields) => nothing to enforce, allow it through.
 */
export async function assertFieldsCorrected(trx, rule, record) {
  if (!rule.requires_field_correction) return;

  const lastSendBack = await trx('workflow_transitions')
    .where({ record_id: record.id, action: 'SEND_BACK' })
    .orderBy('performed_at', 'desc')
    .first();
  if (!lastSendBack) return;

  const targetFields = typeof lastSendBack.target_fields === 'string'
    ? JSON.parse(lastSendBack.target_fields) : (lastSendBack.target_fields || []);
  if (!targetFields.length) return;

  const revisions = await trx('record_revisions')
    .where({ record_id: record.id })
    .andWhere('changed_at', '>', lastSendBack.performed_at)
    .select('field_changes');

  const changedKeys = new Set();
  for (const rev of revisions) {
    const changes = typeof rev.field_changes === 'string' ? JSON.parse(rev.field_changes) : (rev.field_changes || []);
    for (const c of changes) changedKeys.add(c.field_key);
  }

  const missing = targetFields.filter((f) => !changedKeys.has(f));
  if (missing.length > 0) {
    log.warn('assertFieldsCorrected: rejected — flagged fields not corrected', { recordId: record.id, missing });
    throw new Error(`Cannot resend to SHO — please correct the following field(s) flagged for correction: ${missing.join(', ')}`);
  }
}
```
(`log` is already defined at the top of this file — reuse it, don't add a new logger.)

## 5. `backend/src/modules/records/records.service.js`

Inside `transitionRecord` (~line 1710), find this line:
```js
workflowEngine.assertComment(rule, comment);
```
Add directly after it:
```js
await workflowEngine.assertFieldsCorrected(trx, rule, record);
```
That's the only change in this file. `trx` and `record` are already in scope there.

## Do NOT touch

- `frontend/src/pages/hc/NewRecord.jsx` and `MyRecords.jsx` already display the SHO's comment and `target_fields`, and already show `err.response?.data?.message` in a toast on a failed submit. No frontend change is needed — the new error will surface automatically through the existing toast.
- Do not add a new hardcoded field-label map. If the error message needs nicer labels later, that's a separate follow-up.

## 6. Documentation (standing rule)

Append to `DECISIONS.md` (same template as existing entries: Decision/Context/Why/Alternatives/Tradeoffs/Relevant Code/Confidence) and to `FLOW.md`, describing: resubmission from `SENT_BACK` now requires every field the reviewer flagged in `target_fields` to appear in a `record_revisions.field_changes` entry recorded after that send-back, enforced via a new `requires_field_correction` flag on the `sent_back.submit` workflow-config row — config-driven like every other transition rule, not hardcoded.

## Verification — just this, nothing more

```
git status --short
git diff -b --stat
```
Paste both raw. Confirm only the 4 code files + 1 new migration + 2 docs changed — nothing else.

Then do ONE manual test: as SHO, send a record back flagging one field. As HC, try to resubmit without touching anything — should be blocked with the new message. Then actually edit that field and resubmit — should go through. Paste what you see (no need to re-verify anything else).
