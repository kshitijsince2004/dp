import db from "../src/config/db.js";
try {
  // What local_head_ids appear in Dwarka on 2026-07-29?
  const r1 = await db.raw(`
    SELECT fd.local_head_id, lh.canonical_code, lh.local_head, COUNT(*) cnt
    FROM records r
    JOIN fir_details fd ON fd.record_id=r.id
    LEFT JOIN ref.local_heads lh ON lh.local_head_cd=fd.local_head_id
    WHERE r.ps_id IN ('788234fc-f40f-4edb-91cd-75943d80fe28','f30547d8-f866-48c9-b445-0334d77008e4','5c412cd5-272b-4a47-8123-80518f14edeb')
      AND COALESCE(r.registration_date,r.record_date)='2026-07-29'
      AND r.record_type='CASE'
    GROUP BY fd.local_head_id, lh.canonical_code, lh.local_head ORDER BY 1
  `);
  console.log('Dwarka local_head_ids on 2026-07-29:', JSON.stringify(r1.rows));
} catch(e) { console.error(e.message); }
await db.destroy();
