// Set test environment path BEFORE any imports
process.env.PHAROS_TEST = 'true';
process.env.PORT = '39998';
process.env.NODE_ENV = 'development';

import axios from 'axios';

async function run() {
  console.log('[Test Reports] Starting verification of reports module...');

  // Start app server locally
  const { default: app } = await import('../src/app.js');
  const eventBus = await import('../src/events/eventBus.js');
  const auditHandler = await import('../src/events/handlers/auditHandler.js');
  
  await eventBus.connect();
  await auditHandler.init();
  
  const server = app.listen(39998);
  const localBaseURL = 'http://localhost:39998/api/v1';

  try {
    // 1. Log in
    const loginRes = await axios.post(`${localBaseURL}/auth/login`, {
      badge_no: 'SA001',
      password: 'Test@1234'
    });
    const token = loginRes.data.data.access_token;
    console.log('[Test Reports] Login successful');

    // 2. Fetch templates
    const templatesRes = await axios.get(`${localBaseURL}/reports/templates`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('[Test Reports] Templates count:', templatesRes.data.data.templates.length);

    // 3. Generate PDF Report
    const genPdfRes = await axios.post(`${localBaseURL}/reports/generate`, {
      template_id: 'cases-register',
      format: 'pdf',
      filters: {}
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const pdfJobId = genPdfRes.data.data.job.id;
    console.log('[Test Reports] PDF Job queued:', pdfJobId);

    // 4. Poll job status
    let isReady = false;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const statusRes = await axios.get(`${localBaseURL}/reports/status/${pdfJobId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const status = statusRes.data.data.status;
      console.log(`[Test Reports] Polling PDF Job status (attempt ${i + 1}): ${status}`);
      if (status === 'READY') {
        isReady = true;
        break;
      }
      if (status === 'FAILED') {
        break;
      }
    }

    if (!isReady) {
      throw new Error('PDF Report generation timed out or failed');
    }

    // 5. Download report
    const downloadRes = await axios.get(`${localBaseURL}/reports/download/${pdfJobId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('[Test Reports] PDF download status:', downloadRes.status);

    // 6. Generate CSV Report
    const genCsvRes = await axios.post(`${localBaseURL}/reports/generate`, {
      template_id: 'cases-register',
      format: 'csv',
      filters: {}
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const csvJobId = genCsvRes.data.data.job.id;
    console.log('[Test Reports] CSV Job queued:', csvJobId);

    isReady = false;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const statusRes = await axios.get(`${localBaseURL}/reports/status/${csvJobId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const status = statusRes.data.data.status;
      console.log(`[Test Reports] Polling CSV Job status (attempt ${i + 1}): ${status}`);
      if (status === 'READY') {
        isReady = true;
        break;
      }
      if (status === 'FAILED') {
        break;
      }
    }

    if (!isReady) {
      throw new Error('CSV Report generation timed out or failed');
    }

    // 7. Get admin stats
    const statsRes = await axios.get(`${localBaseURL}/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('[Test Reports] Admin stats:', JSON.stringify(statsRes.data.data));

    console.log('[Test Reports] All reports and admin stats endpoints verified successfully!');
  } catch (err) {
    console.error('[Test Reports] Verification failed:', err.message, err.response?.data);
    process.exitCode = 1;
  } finally {
    server.close();
    console.log('[Test Reports] Test server closed.');
  }
}

run();
