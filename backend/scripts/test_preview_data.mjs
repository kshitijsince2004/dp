import { getDailyDiaryPreview, getDailyDiaryData } from '../src/modules/daily-diary/daily-diary.service.js';

async function test() {
  const prev = await getDailyDiaryPreview({
    date: '2026-09-01',
    dateTo: '2026-09-21',
    policeStationId: 'Parliament Street',
    userScope: { role: 'PS_OPERATOR', policeStationId: 'Parliament Street' }
  });
  console.log('Preview summary counts:', prev.counts);

  const data = await getDailyDiaryData({
    date: '2026-09-01',
    dateTo: '2026-09-21',
    policeStationId: 'Parliament Street',
    userScope: { role: 'PS_OPERATOR', policeStationId: 'Parliament Street' }
  });
  console.log('\nData table counts:');
  Object.keys(data).forEach(k => {
    console.log(`- ${k}: ${Array.isArray(data[k]) ? data[k].length : typeof data[k]}`);
  });
  process.exit(0);
}
test().catch(err => {
  console.error(err);
  process.exit(1);
});
