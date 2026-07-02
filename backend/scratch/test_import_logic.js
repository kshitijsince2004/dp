import db from '../src/config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { generateUID } from '../src/modules/records/records.service.js';
import { createLink } from '../src/modules/record-links/record-links.service.js';

const parseFirAndYear = (str) => {
  if (!str) return { firNo: '', year: null };
  const clean = String(str).trim();
  const match = clean.match(/(?:FIR[- ]*)?(\d+)\/(\d+)/i);
  if (match) {
    let seq = match[1];
    let yr = match[2];
    if (yr.length === 2) {
      yr = '20' + yr;
    }
    return { firNo: seq, year: parseInt(yr, 10) };
  }
  const simpleMatch = clean.match(/^(\d+)$/);
  if (simpleMatch) {
    return { firNo: simpleMatch[1], year: null };
  }
  return { firNo: clean, year: null };
};

const runAutoLinkageForArrests = async (trx, arrestRecords, psId, userId) => {
  const linkedDetails = [];
  const unmatchedDetails = [];

  const cases = await trx('records')
    .where({ record_type: 'CASE', ps_id: psId })
    .select('id', 'data');

  const parsedCases = cases.map(c => {
    let dataObj = {};
    try {
      dataObj = typeof c.data === 'string' ? JSON.parse(c.data) : c.data;
    } catch(e) {}
    const firNo = dataObj.fir_no || '';
    const firDate = dataObj.fir_date || '';
    const firYear = firDate ? new Date(firDate).getFullYear() : null;
    return {
      id: c.id,
      data: dataObj,
      firNo,
      firYear
    };
  });

  for (const arrest of arrestRecords) {
    const arrestData = arrest.data;
    const linkedFirDdNo = arrestData.linked_fir_dd_no;

    if (!linkedFirDdNo) {
      unmatchedDetails.push({
        arrest_uid: arrestData.uid,
        linked_fir_dd_no: null,
        reason: 'No Linked FIR / DD No. provided in arrest record'
      });
      continue;
    }

    const parsedArrest = parseFirAndYear(linkedFirDdNo);

    const candidates = parsedCases.filter(c => {
      const parsedCaseFir = parseFirAndYear(c.firNo);
      return parsedCaseFir.firNo === parsedArrest.firNo && parsedCaseFir.firNo !== '';
    });

    if (candidates.length === 0) {
      unmatchedDetails.push({
        arrest_uid: arrestData.uid,
        linked_fir_dd_no: linkedFirDdNo,
        reason: 'No matching CASE record found with this FIR number'
      });
      continue;
    }

    let yearFiltered = candidates;
    if (parsedArrest.year) {
      yearFiltered = candidates.filter(c => {
        const parsedCaseFir = parseFirAndYear(c.firNo);
        const caseYear = parsedCaseFir.year || c.firYear;
        return caseYear === parsedArrest.year;
      });
    }

    if (yearFiltered.length === 0) {
      unmatchedDetails.push({
        arrest_uid: arrestData.uid,
        linked_fir_dd_no: linkedFirDdNo,
        reason: `Case found but year mismatch (Expected FIR year: ${parsedArrest.year})`
      });
      continue;
    }

    let bestCase = null;
    if (yearFiltered.length === 1) {
      bestCase = yearFiltered[0];
    } else {
      let bestScore = -1;
      for (const candidate of yearFiltered) {
        let score = 0;
        const candidateData = candidate.data;

        if (candidateData.local_head && arrestData.crime_head) {
          if (String(candidateData.local_head).trim().toLowerCase() === String(arrestData.crime_head).trim().toLowerCase()) {
            score += 1;
          }
        }

        if (candidateData.sections && arrestData.sections) {
          if (String(candidateData.sections).trim().toLowerCase() === String(arrestData.sections).trim().toLowerCase()) {
            score += 1;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestCase = candidate;
        }
      }
    }

    if (bestCase) {
      try {
        await createLink({
          sourceRecordId: bestCase.id,
          targetRecordId: arrest.id,
          linkTypeCode: 'CASE_ARREST',
          userId,
          metadata: { notes: 'Auto-linked during bulk import' }
        });

        const caseData = bestCase.data;
        linkedDetails.push({
          arrest_uid: arrestData.uid,
          case_uid: caseData.uid,
          fir_no: caseData.fir_no
        });
      } catch (err) {
        console.error(`[AutoLinkage] Failed to create link: ${err.message}`);
        unmatchedDetails.push({
          arrest_uid: arrestData.uid,
          linked_fir_dd_no: linkedFirDdNo,
          reason: `Failed to link: ${err.message}`
        });
      }
    } else {
      unmatchedDetails.push({
        arrest_uid: arrestData.uid,
        linked_fir_dd_no: linkedFirDdNo,
        reason: 'Multiple matching cases found but secondary validation failed'
      });
    }
  }

  return {
    linkedCount: linkedDetails.length,
    unmatchedCount: unmatchedDetails.length,
    linkedDetails,
    unmatchedDetails
  };
};

async function run() {
  const caseId = uuidv4();
  const arrestId = uuidv4();
  let createdLinkId = null;

  try {
    console.log('Fetching system context...');
    const user = await db('users').first();
    const ps = await db('hierarchy_nodes').where({ node_type: 'PS' }).first();
    
    if (!user || !ps) {
      console.log('Error: User or Police Station not found.');
      process.exit(1);
    }

    const caseDate = '2026-06-21';
    const caseUid = await generateUID('CASE', ps.id, caseDate);
    const caseData = {
      uid: caseUid,
      fir_no: '900',
      fir_date: caseDate,
      local_head: 'Snatching',
      sections: '379 IPC',
      brief_facts: 'Snatching on main street'
    };

    const arrestDate = '2026-06-21';
    const arrestUid = await generateUID('ARREST', ps.id, arrestDate);
    const arrestData = {
      uid: arrestUid,
      linked_fir_dd_no: '900/2026',
      crime_head: 'Snatching',
      sections: '379 IPC',
      arrest_date: arrestDate,
      arrested_name: 'Amit Kumar',
      arrested_address: 'H.No 502, Sector 15, Rohini'
    };

    console.log('Inserting records...');
    await db('records').insert({
      id: caseId,
      record_type: 'CASE',
      ps_id: ps.id,
      district_id: ps.parent_id || null,
      data: JSON.stringify(caseData),
      current_status: 'DRAFT',
      current_level: 'PS',
      record_date: caseDate,
      created_by: user.id,
      updated_by: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    await db('records').insert({
      id: arrestId,
      record_type: 'ARREST',
      ps_id: ps.id,
      district_id: ps.parent_id || null,
      data: JSON.stringify(arrestData),
      current_status: 'DRAFT',
      current_level: 'PS',
      record_date: arrestDate,
      created_by: user.id,
      updated_by: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    console.log('Running auto-linkage...');
    const newlyInserted = [
      { id: arrestId, data: arrestData }
    ];

    const linkageReport = await runAutoLinkageForArrests(db, newlyInserted, ps.id, user.id);
    console.log('Linkage Report:', JSON.stringify(linkageReport, null, 2));

    // Verify link created
    const link = await db('record_links')
      .where({ source_record_id: caseId, target_record_id: arrestId })
      .first();

    if (link) {
      console.log('SUCCESS: Auto-link created in record_links table!', link.id);
      createdLinkId = link.id;
    } else {
      throw new Error('Link creation failed');
    }

  } catch (err) {
    console.error('Test failed with error:', err);
  } finally {
    console.log('Cleaning up test records...');
    if (createdLinkId) {
      await db('record_links').where({ id: createdLinkId }).delete();
    }
    await db('records').whereIn('id', [caseId, arrestId]).delete();
    console.log('Cleanup complete.');
    process.exit(0);
  }
}

run();
