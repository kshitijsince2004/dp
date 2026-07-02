import db from '../src/config/db.js';
import { createLink } from '../src/modules/record-links/record-links.service.js';
const parseFirAndYear=(str)=>{const nums=String(str||'').trim().match(/\d+/g);if(!nums)return{firNo:''};return{firNo:String(parseInt(nums[0],10))};};
try{
  const ps='PS_NDD_PARLIAMENTSTREET';
  const cases = await db('records').where({ps_id:ps,record_type:'CASE'}).select('id','data');
  const caseByFir={};
  for(const c of cases){const d=typeof c.data==='string'?JSON.parse(c.data):c.data; const f=parseFirAndYear(d.fir_no).firNo; if(f&&!caseByFir[f])caseByFir[f]=c.id;}
  const arr = await db('records').where({ps_id:ps,record_type:'ARREST'}).select('id','data');
  let pair=null;
  for(const a of arr){const d=typeof a.data==='string'?JSON.parse(a.data):a.data; if(d.linked_fir_dd_no){const f=parseFirAndYear(d.linked_fir_dd_no).firNo; if(caseByFir[f]){pair={caseId:caseByFir[f],arrestId:a.id,fir:d.linked_fir_dd_no};break;}}}
  console.log('found matchable pair:',pair);
  if(pair){
    console.log('calling createLink with 8s timeout...');
    const res = await Promise.race([
      createLink({sourceRecordId:pair.caseId,targetRecordId:pair.arrestId,linkTypeCode:'CASE_ARREST',userId:'U_HC001',metadata:{notes:'diag test'}}),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('TIMEOUT 8s -> likely eventBus.publish (RabbitMQ) hang')),8000))
    ]);
    console.log('createLink SUCCESS, id:', res.id);
    // clean up this diagnostic link
    await db('record_links').where({id:res.id}).del();
    console.log('(diagnostic link removed)');
  }
}catch(e){console.log('createLink ERROR/TIMEOUT:', e.message);}
await db.destroy();
