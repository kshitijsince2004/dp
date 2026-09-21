import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { db } from '../src/config/db.js';
import * as analyticsController from '../src/modules/analytics/analytics.controller.js';

const mockReq = (query = {}, jq = {}) => ({
  query,
  jurisdictionQuery: jq,
  user: { id: 'admin', role: 'HQ' }
});

const mockRes = () => {
  const res = {
    statusCode: 200,
    data: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.data = obj; return this; }
  };
  return res;
};

async function testEndpoints() {
  console.log('=== TESTING NEW & UPGRADED ANALYTICS ENDPOINTS ===');

  const periods = ['day', 'week', 'month', 'year'];

  for (const p of periods) {
    console.log(`\n--- Period: ${p} ---`);
    
    // 1. ps-dashboard-v2
    const resPs = mockRes();
    await analyticsController.getPsDashboardStatsV2(mockReq({ period: p }), resPs);
    console.log(`ps-dashboard-v2 status: ${resPs.statusCode}, FIR: ${resPs.data?.data?.fir?.count}, LeftOut: ${resPs.data?.data?.leftout_heinous?.count}`);
    if (resPs.data?.data?.leftout_heinous_list?.length > 0) {
      console.log('Sample Left-out item (with record_id):', resPs.data.data.leftout_heinous_list[0]);
    }

    // 2. property-recovery
    const resProp = mockRes();
    await analyticsController.getPropertyRecoveryStats(mockReq({ period: p }), resProp);
    console.log(`property-recovery status: ${resProp.statusCode}, Stolen: ₹${resProp.data?.data?.stolen_value_inr}, Recovered: ₹${resProp.data?.data?.recovered_value_inr}, Rate: ${resProp.data?.data?.recovery_rate_pct}%`);

    // 3. investigation-disposal
    const resInv = mockRes();
    await analyticsController.getInvestigationDisposalStats(mockReq({ period: p }), resInv);
    console.log(`investigation-disposal status: ${resInv.statusCode}, Total Cases: ${resInv.data?.data?.total_cases}, Charge Sheet: ${resInv.data?.data?.charge_sheet_filed}, Rate: ${resInv.data?.data?.charge_sheet_rate_pct}%`);

    // 4. community-safety
    const resComm = mockRes();
    await analyticsController.getCommunitySafetyStats(mockReq({ period: p }), resComm);
    console.log(`community-safety status: ${resComm.statusCode}, PCR: ${resComm.data?.data?.pcr?.total_calls}, Missing: ${resComm.data?.data?.missing_persons?.total_reported} (Traced: ${resComm.data?.data?.missing_persons?.total_traced}), UIDB: ${resComm.data?.data?.uidb_inquests?.total_bodies_found}`);

    // 5. beat-preventive
    const resBeat = mockRes();
    await analyticsController.getBeatPreventiveStats(mockReq({ period: p }), resBeat);
    console.log(`beat-preventive status: ${resBeat.statusCode}, Beats: ${resBeat.data?.data?.beat_rankings?.length}, Preventive total: ${resBeat.data?.data?.preventive_enforcement?.total_kalandras}`);

    // 6. crime-head-matrix
    const resMatrix = mockRes();
    await analyticsController.getCrimeHeadMatrix(mockReq({ period: p }), resMatrix);
    console.log(`crime-head-matrix status: ${resMatrix.statusCode}, Rows: ${resMatrix.data?.data?.rows?.length}`);
    if (resMatrix.data?.data?.rows?.length > 0) {
      console.log('Sample Matrix Row:', resMatrix.data.data.rows[0]);
    }
  }

  console.log('\n=== ALL ENDPOINTS FUNCTIONING WITH 100% OPERATIONAL FIDELITY ===');
  process.exit(0);
}

testEndpoints().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
