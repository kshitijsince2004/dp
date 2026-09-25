// backend/scripts/seed-test-data.js — dev/test data seeder for PHAROS on the NEW typed
// schema (DB restructure 2026-07, Integration 5 / WS6 rewrite).
//
// The old version of this file inserted directly into records/detail/persons tables and
// wrote a flat `records.data` jsonb blob — both dead on the rebuilt schema. This rewrite
// goes through the ONE write path (records.service.js: createRecord / submitRecord /
// transitionRecord / updateDomainStatus — ENGINEERING_BASELINE.md P1.2) end to end, exactly
// like a real HC/SHO/DISTRICT_OFFICER/JCP/SCP would drive the app.
//
// Run (from backend/): node scripts/seed-test-data.js
// Prereq: npm run db:seed (seeds/01_users.js) must already have run — this script looks up
// those users by username and fails loudly if any are missing. It does NOT seed users itself.
//
// Re-runnable: every record this script creates is tagged (see TAGGING below) and the
// previous run's tagged records are deleted before new ones are created, so running twice
// produces the same dataset, not a duplicate pile-up.
//
// TAGGING MECHANISM: `records.io_id` (all 5 record types carry it — config/fields/common.json's
// `io_id` field, storage {table:'records', column:'io_id'}) is stamped with a dedicated
// "DEV SEED MARKER" investigating_officer row created per seeded PS (upserted by a distinctive
// `pis_no` = `DEVSEED-<PS_CODE>`). This was chosen over `records.source_system` because
// createRecord (the interactive write path this script is required to use) never stamps
// source_system/legacy_ref/is_legacy at all — only createImportedRecord does, and forcing every
// seed record through the import wrapper just to get a free-text column stamped would misrepresent
// this data as bulk-imported (source_system is hardcoded to 'BULK_IMPORT' there) and pull in
// import-specific semantics (batch id, legacy flag) that don't apply here. `io_id` is a real,
// intentional spine column with no such side effects, is visible in the DB for manual
// inspection/SQL filtering, and doubles as a realistic "investigating officer" value on every
// seeded record.
//
// Cleanup order respects FK constraints that are NOT ON DELETE CASCADE from `records`:
// notifications.record_id and record_links.{source,target}_record_id have plain (non-cascading)
// FKs to records(id), so they're deleted explicitly before the records themselves; everything
// else that references a record (detail tables, persons/+subtypes, record_properties,
// record_offences, record_revisions, workflow_transitions, record_status_events) IS
// ON DELETE CASCADE and is left to Postgres.

import db, { connectDB } from '../src/config/db.js';
import { connectEventBus } from '../src/events/eventBus.js';
import * as notifyHandler from '../src/events/handlers/notifyHandler.js';
import * as linkAuditHandler from '../src/events/handlers/linkAuditHandler.js';
import * as linkResolver from '../src/events/handlers/linkResolver.js';
import * as recordsService from '../src/modules/records/records.service.js';

if (process.env.NODE_ENV === 'production') {
  console.error('[seed-test-data] Refusing to run: NODE_ENV=production. This is a data-destroying dev tool.');
  process.exit(1);
}

const IP = '127.0.0.1';

// ── date helpers (mirrors utils/dateFormat.js's accepted formats) ──────────────────────
function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split('T')[0];
}
function dmyDaysAgo(n, hh = 10, mm = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mo}/${yyyy} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ── seeded users this script depends on (owned by seeds/01_users.js — never re-implemented) ──
const STATIONS = [
  { code: 'PS_NDD_PARLIAMENTSTREET', label: 'Parliament Street', hcUsername: 'hc_parliament_street', shoUsername: 'sho_parliament_street' },
  { code: 'PS_NDD_CONNAUGHTPLACE', label: 'Connaught Place', hcUsername: 'hc_connaught_place', shoUsername: 'sho_connaught_place' },
];
const DISTRICT_USERNAME = 'dcp_ndd'; // both seeded PS are in DIST_NDD
const JCP_USERNAME = 'jcp_new_delhi_range';
const SCP_USERNAME = 'scp_zone_2';

async function requireUser(username) {
  const row = await db('users').where({ username }).first();
  if (!row) {
    throw new Error(
      `Required seed user "${username}" not found in the users table — run "npm run db:seed" first (backend/seeds/01_users.js).`
    );
  }
  return row;
}

/** Shape a users-table row the way authMiddleware's normalizeAuthUser presents req.user —
 * records.service.js only ever reads .id/.role/.ps_id/.district_id/.sub_div_id off `user`. */
function asServiceUser(row) {
  return {
    id: row.id, sub: row.id, username: row.username, role: row.role,
    ps_id: row.ps_id, district_id: row.district_id, sub_div_id: row.sub_div_id,
  };
}

async function requireHierarchyNode(code) {
  const row = await db('hierarchy_nodes').where({ code }).first();
  if (!row) throw new Error(`Hierarchy node "${code}" not found — run "npm run load-ref" first.`);
  return row;
}

// ── seed IO marker (the tagging mechanism) ─────────────────────────────────────────────
async function getOrCreateSeedIO(psId, psLabel) {
  const pisNo = `DEVSEED-${psLabel.replace(/\s+/g, '').toUpperCase()}`;
  const existing = await db('investigating_officers').where({ pis_no: pisNo }).first();
  if (existing) return existing.id;
  const inserted = await db('investigating_officers')
    .insert({
      name: `DEV SEED MARKER (${psLabel}) — safe to delete, tags scripts/seed-test-data.js output`,
      rank: 'Inspector', pis_no: pisNo, mobile: null, ps_id: psId, is_active: true,
    })
    .returning('id');
  return inserted[0].id ?? inserted[0];
}

// ── cleanup: delete every record previously tagged with one of our seed IOs ────────────
async function cleanupPreviousSeed(seedIoIds) {
  if (!seedIoIds.length) return 0;
  const rows = await db('records').whereIn('io_id', seedIoIds).select('id');
  const ids = rows.map((r) => r.id);
  if (!ids.length) return 0;

  // Plain (non-cascading) FKs to records(id) — must go first.
  await db('notifications').whereIn('record_id', ids).delete();
  await db('record_links').where((b) => b.whereIn('source_record_id', ids).orWhereIn('target_record_id', ids)).delete();
  await db('audit_logs').whereIn('record_id', ids).delete();

  // records delete cascades: detail tables, persons(+subtypes), record_properties,
  // record_offences, record_revisions, workflow_transitions, record_status_events.
  await db('records').whereIn('id', ids).delete();
  return ids.length;
}

// ── workflow ladder (config/workflow/main.json's real action names) ───────────────────
const STATUS_LADDER = ['DRAFT', 'PENDING_SHO', 'SENT_BACK', 'DISTRICT_REVIEW', 'JCP_REVIEW', 'SCP_REVIEW', 'HQ_RECEIVED'];

async function driveToStatus(recordId, targetStatus, roleUsers) {
  if (targetStatus === 'DRAFT') return;
  await recordsService.submitRecord(recordId, roleUsers.hc, IP); // DRAFT -> PENDING_SHO
  if (targetStatus === 'PENDING_SHO') return;
  if (targetStatus === 'SENT_BACK') {
    await recordsService.transitionRecord(recordId, roleUsers.sho, 'send_back', 'Please verify IO details and section citations before resubmitting.', null, IP);
    return;
  }
  await recordsService.transitionRecord(recordId, roleUsers.sho, 'approve', null, null, IP); // -> DISTRICT_REVIEW
  if (targetStatus === 'DISTRICT_REVIEW') return;
  await recordsService.transitionRecord(recordId, roleUsers.dcp, 'approve', null, null, IP); // -> JCP_REVIEW
  if (targetStatus === 'JCP_REVIEW') return;
  await recordsService.transitionRecord(recordId, roleUsers.jcp, 'approve', null, null, IP); // -> SCP_REVIEW
  if (targetStatus === 'SCP_REVIEW') return;
  await recordsService.transitionRecord(recordId, roleUsers.scp, 'approve', null, null, IP); // -> HQ_RECEIVED
}

// ── record payload generators (real field_registry field_keys — config/fields/*.json) ──
// Classification values below were verified live against the seeded ref.* tables:
// act 'IPC' -> ACT_GROUP_CODES.IPC = [43] ('IPC 1860'); sections 379/420/392/323/356 all
// exist under act_sec_cd 43; local_head labels are copied verbatim from the CASE/ARREST/UIDB
// field_registry option lists (themselves sourced from ref.local_heads); major_head labels
// THEFT/MURDER/ROBBERY/CHEATING/HURT all exist in ref.major_heads (case-insensitive match).

const GENDERS = ['Male', 'Female', 'Transgender', 'Male', 'Female']; // guarantees >=1 Transgender person
const LOCAL_HEADS = ['M.V. Theft', 'Snatching', 'Theft in Shop', 'Burglary', 'Simple Hurt', 'Cheating', 'Murder'];
const CRIME_HEADS = ['THEFT', 'MURDER', 'ROBBERY', 'CHEATING', 'HURT'];
const SECTION_BY_HEAD = { THEFT: '379', MURDER: '302', ROBBERY: '392', CHEATING: '420', HURT: '323' };
const FIRST_NAMES = ['Rahul', 'Priya', 'Amit', 'Meera', 'Suresh', 'Anjali'];
const LAST_NAMES = ['Kumar', 'Singh', 'Jain', 'Patel', 'Verma', 'Gupta'];

function caseData(i, station) {
  const localHead = LOCAL_HEADS[i % LOCAL_HEADS.length];
  const gender = GENDERS[i % GENDERS.length];
  const firNo = `${101 + i}/2026`;
  const daysAgo = 40 - i;
  const data = {
    case_type: ['cctns(manual FIR)', 'eTheft', 'eMVT', 'zero FIR'][i % 4],
    fir_no: firNo,
    fir_date: isoDaysAgo(daysAgo),
    gd_no: `GD/${2000 + i}`,
    gd_date: isoDaysAgo(daysAgo),
    gd_time: '10:30',
    source_reference: ['Written Complaint', 'PCR Call', 'Physically appear', 'Public Informant'][i % 4],
    is_important: i % 5 === 0,
    occurrence_time_type: 'Known',
    occurrence_from_date_time: dmyDaysAgo(daysAgo, 9, 0),
    occurrence_to_date_time: dmyDaysAgo(daysAgo, 9, 30),
    info_received_at_ps_date_time: dmyDaysAgo(daysAgo, 10, 0),
    occurrence_place: `${station.label} Market Area, New Delhi`,
    occurrence_house_no: `${10 + i}`,
    occurrence_city_town_village: 'New Delhi',
    local_head: localHead,
    brief_facts: `Complainant reported a ${localHead.toLowerCase()} incident near ${station.label}. FIR registered and investigation taken up by the station.`,
    complainant_first_name: FIRST_NAMES[i % FIRST_NAMES.length],
    complainant_last_name: LAST_NAMES[i % LAST_NAMES.length],
    complainant_gender: gender,
    complainant_mobile: `98${String(10000000 + i * 37).padStart(8, '0')}`,
    complainant_relation_type: 'Father',
    complainant_relative_name: `${FIRST_NAMES[(i + 1) % FIRST_NAMES.length]} ${LAST_NAMES[(i + 1) % LAST_NAMES.length]}`,
    complainant_house_no: `${100 + i}`,
    complainant_street: `${station.label} Road`,
    complainant_city_town_village: 'New Delhi',
  };
  const persons = [
    { person_type: 'VICTIM', data: { victim_first_name: FIRST_NAMES[i % FIRST_NAMES.length], victim_last_name: LAST_NAMES[i % LAST_NAMES.length], victim_gender: gender } },
    { person_type: 'ACCUSED', data: { accused_first_name: `Accused${i}`, accused_last_name: LAST_NAMES[(i + 2) % LAST_NAMES.length], accused_gender: GENDERS[(i + 2) % GENDERS.length] } },
  ];
  const properties = (i % 3 === 0)
    ? [{ phone_make: 'Samsung', phone_model: 'Galaxy A14', phone_imei: `35678901${String(100000 + i).padStart(6, '0')}`, phone_color: 'Black', property_details: 'Recovered stolen mobile phone from the accused.' }]
    : [];
  const section = ['379', '420', '392', '323', '356'][i % 5];
  const offences = [{ act: 'IPC', section }];
  return { data, persons, properties, offences, firNo, recordDate: isoDaysAgo(daysAgo) };
}

function arrestData(i, station, sharedFirNo) {
  const crimeHead = CRIME_HEADS[i % CRIME_HEADS.length];
  const gender = GENDERS[(i + 1) % GENDERS.length];
  const daysAgo = 35 - i;
  const firNo = sharedFirNo || `${200 + i}/2026`;
  const data = {
    case_type: 'cctns(manual FIR)',
    fir_no: firNo,
    fir_date: isoDaysAgo(daysAgo),
    gd_no: `GD/${3000 + i}`,
    gd_date: isoDaysAgo(daysAgo),
    // Real custody vocabulary codes (status-options.config.js) so seeded current_value
    // matches the status-options dropdown values.
    status: ['JC', 'PC', 'Bail', 'Release', 'Lockup'][i % 5],
    is_dd_based: i % 2 === 0,
    local_head: LOCAL_HEADS[i % LOCAL_HEADS.length],
    crime_head: crimeHead,
    scheme_of_arrest: ['Integrated Pride', 'Group Patrolling', 'By Prahari'][i % 3],
    nafis_prepared: i % 2 === 0,
    dossier_prepared: i % 3 === 0,
    arresting_officer: `Insp. ${LAST_NAMES[i % LAST_NAMES.length]}`,
    arresting_officer_mobile: `99${String(20000000 + i * 41).padStart(8, '0')}`,
    verifying_officer_rank: 'Inspector',
    recovery: i % 2 === 0 ? `Recovered stolen ${crimeHead === 'THEFT' ? 'mobile phone' : 'property'} worth Rs.${(i + 1) * 5000}` : '',
  };
  const persons = [
    {
      person_type: 'ARRESTED',
      data: {
        arrested_first_name: FIRST_NAMES[(i + 3) % FIRST_NAMES.length],
        arrested_last_name: LAST_NAMES[(i + 3) % LAST_NAMES.length],
        arrested_gender: gender,
        arrested_age_year: 22 + (i * 3) % 30,
        arrested_perm_same: true,
        arrest_date: isoDaysAgo(daysAgo),
        arrest_place: `Near ${station.label}, New Delhi`,
        arrested_house_no: `${20 + i}`,
        arrested_city_town_village: 'New Delhi',
        proclaimed_offender: i % 5 === 0,
        listed_criminal: i % 4 === 0,
      },
    },
  ];
  const offences = [{ act: 'IPC', section: SECTION_BY_HEAD[crimeHead], major_head: crimeHead }];
  return { data, persons, properties: [], offences, recordDate: isoDaysAgo(daysAgo) };
}

const CALL_HEADS = ['THEFT', 'SIMPLE HURT', 'ROAD RAGE', 'MISSING CHILD', 'DOMESTIC VIOLENCE', 'ROBBERY'];

function pcrCallData(i, station) {
  const daysAgo = 20 - i;
  const data = {
    gd_no: `GD/${4000 + i}`,
    pcr_no: `PCR/2026/${5000 + i}`,
    call_head: CALL_HEADS[i % CALL_HEADS.length],
    call_gist: `PCR call regarding a ${CALL_HEADS[i % CALL_HEADS.length].toLowerCase()} incident near ${station.label}. Beat officer deputed to the spot.`,
    occurrence_place: `${station.label}, New Delhi`,
    occurrence_landmark: `Near ${station.label} bus stop`,
    caller_name: `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`,
    caller_mobile: `70${String(10000000 + i * 53).padStart(8, '0')}`,
    arrival_time: '14:20',
    status: ['attended', 'fir_registered', 'no_cognizable'][i % 3],
  };
  return { data, persons: [], properties: [], offences: [], recordDate: isoDaysAgo(daysAgo) };
}

function missingData(i, station) {
  const daysAgo = 25 - i;
  const gender = GENDERS[(i + 2) % GENDERS.length];
  const data = {
    gd_no: `GD/${6000 + i}`,
    gd_date: isoDaysAgo(daysAgo),
    source: i % 2 === 0 ? 'PCR' : 'DD',
    missing_type: 'Missing',
    case_registered: 'No',
    mp_known: true,
    missing_name: `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`,
    gender,
    age: 10 + (i * 7) % 50,
    missing_date: isoDaysAgo(daysAgo),
    missing_place: `Near ${station.label}, New Delhi`,
    mp_perm_same: true,
    mp_house_no: `${30 + i}`,
    mp_city_town_village: 'New Delhi',
    informant_name: `${FIRST_NAMES[(i + 1) % FIRST_NAMES.length]} ${LAST_NAMES[(i + 1) % LAST_NAMES.length]}`,
    informant_relation: ['Father', 'Mother', 'Brother', 'Sister'][i % 4],
    informant_mobile: `91${String(10000000 + i * 61).padStart(8, '0')}`,
    zipnet_no: `ZN2026${String(1000 + i).padStart(4, '0')}`,
    height: `${150 + (i % 30)}cm`,
    complexion: ['Fair', 'Wheatish', 'Dark'][i % 3],
    physical_description: 'Last seen wearing a school uniform.',
  };
  return { data, persons: [], properties: [], offences: [], recordDate: isoDaysAgo(daysAgo) };
}

function uidbData(i, station) {
  const daysAgo = 22 - i;
  const identified = i % 2 === 0;
  const data = {
    gd_no: `GD/${7000 + i}`,
    gd_date: isoDaysAgo(daysAgo),
    uidb_no: `UIDB/2026/${8000 + i}`,
    local_head: LOCAL_HEADS[i % LOCAL_HEADS.length],
    found_date: isoDaysAgo(daysAgo),
    found_place: `Near ${station.label} railway crossing, New Delhi`,
    found_time: '06:15',
    cause_of_death: ['Accidental', 'Natural', 'Unknown'][i % 3],
    identified,
    informant_name: `${FIRST_NAMES[(i + 2) % FIRST_NAMES.length]} ${LAST_NAMES[(i + 2) % LAST_NAMES.length]}`,
    informant_relation: ['Neighbor', 'Friend', 'Other'][i % 3],
    informant_mobile: `92${String(10000000 + i * 71).padStart(8, '0')}`,
    zipnet_no: `ZN2026${String(2000 + i).padStart(4, '0')}`,
    approx_age: `${30 + (i * 5) % 40}-${40 + (i * 5) % 40} yrs`,
    description: `${['Tall', 'Medium', 'Short'][i % 3]} build, no ID found on the body.`,
  };
  if (identified) {
    data.deceased_name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`;
    data.deceased_perm_same = true;
    data.gender = GENDERS[i % GENDERS.length];
  }
  const section = ['379', '302'][i % 2];
  const offences = [{ act: 'IPC', section }];
  return { data, persons: [], properties: [], offences, recordDate: isoDaysAgo(daysAgo) };
}

// ── main ────────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('[seed-test-data] Connecting to PostgreSQL + RabbitMQ event bus...');
  await connectDB();
  await connectEventBus();
  // Mirror backend/index.js's real startup (minus the HTTP server): these handlers are what
  // make notifications and the async CASE/ARREST link resolver actually fire on our record
  // events. If RabbitMQ isn't reachable, connectEventBus()/subscribe() fall back to the
  // in-process EventEmitter automatically (eventBus.js) — still works, just single-process.
  await notifyHandler.init();
  await linkAuditHandler.init();
  await linkResolver.init();
  console.log('[seed-test-data] Event handlers wired (notify / link-audit / link-resolver).');

  // ── resolve seeded users (fail loudly, never re-implement seeding) ──
  const dcpRow = await requireUser(DISTRICT_USERNAME);
  const jcpRow = await requireUser(JCP_USERNAME);
  const scpRow = await requireUser(SCP_USERNAME);
  const dcp = asServiceUser(dcpRow);
  const jcp = asServiceUser(jcpRow);
  const scp = asServiceUser(scpRow);

  const stationCtx = [];
  for (const st of STATIONS) {
    const hcRow = await requireUser(st.hcUsername);
    const shoRow = await requireUser(st.shoUsername);
    const node = await requireHierarchyNode(st.code);
    const seedIoId = await getOrCreateSeedIO(node.id, st.label);
    stationCtx.push({
      ...st, node,
      users: { hc: asServiceUser(hcRow), sho: asServiceUser(shoRow), dcp, jcp, scp },
      seedIoId,
    });
  }
  console.log(`[seed-test-data] Resolved users for ${stationCtx.length} station(s): ${stationCtx.map((s) => s.label).join(', ')}.`);
  console.log('[seed-test-data] NOTE: seeds/01_users.js seeds no HC/SHO in the NWD district '
    + '(only dcp_nwd exists there) — only an HC can create() records, so this run covers '
    + 'Parliament Street + Connaught Place (both NDD) only. See report for detail.');

  // ── cleanup: remove records tagged by a previous run of this script ──
  const seedIoIds = stationCtx.map((s) => s.seedIoId);
  const deletedCount = await cleanupPreviousSeed(seedIoIds);
  console.log(`[seed-test-data] Cleanup: removed ${deletedCount} previously-seeded record(s).`);

  const tally = []; // { recordType, station, status, id }
  const firLinkPair = {}; // station.code -> shared fir_no for the CASE/ARREST link test

  async function createAndAdvance(recordType, station, payload, statusTarget) {
    const stampedData = { ...payload.data, io_id: station.seedIoId };
    const { id } = await recordsService.createRecord(
      station.users.hc, recordType, payload.recordDate, stampedData, IP,
      { persons: payload.persons, properties: payload.properties, offences: payload.offences }
    );
    try {
      await driveToStatus(id, statusTarget, station.users);
      tally.push({ recordType, station: station.label, status: statusTarget, id });
    } catch (err) {
      console.warn(`  [warn] ${recordType} ${id} (${station.label}) could not reach ${statusTarget}: ${err.message}`);
      tally.push({ recordType, station: station.label, status: `${statusTarget} (FAILED, see warning)`, id });
    }
  }

  const TYPE_OFFSETS = { CASE: 0, ARREST: 2, PCR_CALL: 4, MISSING: 5, UIDB: 6 };
  const statusForIndex = (type, i) => STATUS_LADDER[(TYPE_OFFSETS[type] + i) % STATUS_LADDER.length];

  console.log('\n[seed-test-data] Creating records...');
  for (const station of stationCtx) {
    // CASE (5 per station)
    for (let i = 0; i < 5; i++) {
      const payload = caseData(i, station);
      if (i === 0) firLinkPair[station.code] = payload.firNo; // first CASE's fir_no reused by first ARREST
      await createAndAdvance('CASE', station, payload, statusForIndex('CASE', i));
    }
    // ARREST (5 per station) — index 0 deliberately cites the same fir_no as CASE index 0
    // at the same PS, so linkResolver.js's CASE_ARREST resolution has something to match.
    for (let i = 0; i < 5; i++) {
      const sharedFirNo = i === 0 ? firLinkPair[station.code] : null;
      const payload = arrestData(i, station, sharedFirNo);
      await createAndAdvance('ARREST', station, payload, statusForIndex('ARREST', i));
    }
    // PCR_CALL (4 per station)
    for (let i = 0; i < 4; i++) {
      const payload = pcrCallData(i, station);
      await createAndAdvance('PCR_CALL', station, payload, statusForIndex('PCR_CALL', i));
    }
    // MISSING (4 per station)
    for (let i = 0; i < 4; i++) {
      const payload = missingData(i, station);
      await createAndAdvance('MISSING', station, payload, statusForIndex('MISSING', i));
    }
    // UIDB (4 per station)
    for (let i = 0; i < 4; i++) {
      const payload = uidbData(i, station);
      await createAndAdvance('UIDB', station, payload, statusForIndex('UIDB', i));
    }
  }
  console.log(`[seed-test-data] Created ${tally.length} records across ${stationCtx.length} station(s).`);

  // ── domain-status events (ruling 22 — record_status_events) ──
  console.log('\n[seed-test-data] Writing domain-status events...');
  const firstCase = tally.find((t) => t.recordType === 'CASE');
  const firstMissing = tally.find((t) => t.recordType === 'MISSING');
  let statusEventsWritten = 0;
  if (firstCase) {
    const station = stationCtx.find((s) => s.label === firstCase.station);
    try {
      await recordsService.updateDomainStatus(firstCase.id, station.users.hc, {
        statusField: 'is_worked_out', newValue: true, effectiveDate: isoDaysAgo(3),
        comment: 'Accused arrested and chargesheet filed.',
      }, IP);
      statusEventsWritten++;
      await recordsService.updateDomainStatus(firstCase.id, station.users.hc, {
        statusField: 'case_status', newValue: 'CHARGE SHEET', effectiveDate: isoDaysAgo(2),
        comment: 'Chargesheet filed in court.',
      }, IP);
      statusEventsWritten++;
    } catch (err) {
      console.warn(`  [warn] CASE domain-status update failed: ${err.message}`);
    }
  }
  if (firstMissing) {
    const station = stationCtx.find((s) => s.label === firstMissing.station);
    try {
      await recordsService.updateDomainStatus(firstMissing.id, station.users.hc, {
        statusField: 'missing_status', newValue: 'Traced', effectiveDate: isoDaysAgo(1),
        comment: "Person found safe at a relative's house.",
      }, IP);
      statusEventsWritten++;
    } catch (err) {
      console.warn(`  [warn] MISSING domain-status update failed: ${err.message}`);
    }
  }
  console.log(`[seed-test-data] Wrote ${statusEventsWritten} domain-status event(s).`);

  // ── drain the event bus: notifyHandler / linkAuditHandler / linkResolver run async
  // (real amqp consume callbacks, or the local EventEmitter fallback's fire-and-forget
  // dispatch) — give them a few seconds to finish writing before we query for a summary. ──
  console.log('\n[seed-test-data] Draining async event handlers (notifications / link resolver)...');
  await new Promise((resolve) => setTimeout(resolve, 4000));

  // ── summary ──
  const recordIds = tally.map((t) => t.id);
  const byTypeStatus = {};
  for (const t of tally) {
    const key = `${t.recordType} | ${t.station} | ${t.status}`;
    byTypeStatus[key] = (byTypeStatus[key] || 0) + 1;
  }
  const linkCount = recordIds.length
    ? await db('record_links').where((b) => b.whereIn('source_record_id', recordIds).orWhereIn('target_record_id', recordIds)).count('id as c').first()
    : { c: 0 };
  const statusEventCount = recordIds.length
    ? await db('record_status_events').whereIn('record_id', recordIds).count('id as c').first()
    : { c: 0 };
  const notificationCount = recordIds.length
    ? await db('notifications').whereIn('record_id', recordIds).count('id as c').first()
    : { c: 0 };

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log('SEED SUMMARY (record_type | station | status : count)');
  console.log('───────────────────────────────────────────────────────────────');
  for (const [key, count] of Object.entries(byTypeStatus).sort()) {
    console.log(`  ${key.padEnd(55)} : ${count}`);
  }
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`Total records created this run : ${tally.length}`);
  console.log(`record_links rows (this batch)  : ${linkCount.c}`);
  console.log(`record_status_events rows       : ${statusEventCount.c}`);
  console.log(`notifications rows              : ${notificationCount.c}`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log('Seeded HC/SHO logins used (password Test@1234, all from seeds/01_users.js):');
  for (const s of stationCtx) console.log(`  ${s.users.hc.username} / ${s.users.sho.username}  — ${s.label}`);
  console.log('───────────────────────────────────────────────────────────────');

  await db.destroy();
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[seed-test-data] Seed failed:', err);
    try { await db.destroy(); } catch { /* ignore */ }
    process.exit(1);
  });
