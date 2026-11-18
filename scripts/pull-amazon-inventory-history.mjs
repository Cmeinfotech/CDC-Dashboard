import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { parseAmazonTsv } from '../services/amazonTsv.mjs';
import { atomicJson, acquireLock, monitorRoot, readJson } from '../services/amazonMonitorStore.mjs';
import { reportDownloadUrl } from '../services/amazonTransport.mjs';
import { boundedBytes } from '../services/boundedBody.mjs';
for (const [key,value] of Object.entries(parseEnv(await fs.readFile('.env','utf8').catch(()=>'')))) if(process.env[key]==null) process.env[key]=value;
const { amazonRequest } = await import('../services/amazonSpApi.ts');
const release = await acquireLock('sales-profit-inventory-history');
const file = path.join(monitorRoot(),'sales-profit-inventory-history-progress.json');
const start = process.argv[2] || '2026-05-01', end = process.argv[3] || '2026-10-31';
try {
  const existing = await readJson(file);
  let reportId = existing?.start === start && existing?.end === end && existing?.status !== 'failed' && (existing?.status !== 'complete' || process.argv.includes('--reuse')) ? existing.reportId : null;
  if (!reportId) {
    const result = await amazonRequest('/reports/2021-06-30/reports',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reportType:'GET_LEDGER_SUMMARY_VIEW_DATA',marketplaceIds:[process.env.AMAZON_MARKETPLACE_ID],dataStartTime:start+'T00:00:00Z',dataEndTime:end+'T23:59:59Z',reportOptions:{aggregateByLocation:'COUNTRY',aggregatedByTimePeriod:'MONTHLY'}})});
    reportId=result.data.reportId;
  }
  const deadline=Date.now()+30*60*1000;
  for(;;){
    const {data:report}=await amazonRequest('/reports/2021-06-30/reports/'+encodeURIComponent(reportId));
    await atomicJson(file,{status:report.processingStatus,reportId,start,end,updatedAt:new Date().toISOString()});
    if(report.processingStatus==='DONE'){
      const {data:document}=await amazonRequest('/reports/2021-06-30/documents/'+encodeURIComponent(report.reportDocumentId));
      const response=await fetch(reportDownloadUrl(document.url),{redirect:'error',signal:AbortSignal.timeout(180000)});
      if(!response.ok)throw Error('Inventory ledger download failed ('+response.status+').');
      let bytes=Buffer.from(await boundedBytes(response,128*1024*1024));
      if(document.compressionAlgorithm==='GZIP')bytes=gunzipSync(bytes,{maxOutputLength:256*1024*1024});
      const rows=parseAmazonTsv(bytes.toString('utf8'));
      if(rows.length&&!Object.keys(rows[0]).some(key=>/ending.?warehouse.?balance/i.test(key.replaceAll(' ',''))))throw Error('Amazon returned an unexpected inventory ledger schema.');
      for (const row of rows) { if (Object.hasOwn(row, 'Customer Shipments')) { row['Reported Units Shipped'] = row['Customer Shipments']; delete row['Customer Shipments']; } if (Object.hasOwn(row, 'Customer Returns')) { row['Reported Units Returned'] = row['Customer Returns']; delete row['Customer Returns']; } }
      await atomicJson(path.join(monitorRoot(),'sales-profit-inventory-history.json'),{source:'Amazon Inventory Ledger Summary',reportId,start,end,aggregation:'MONTHLY',marketplaceId:process.env.AMAZON_MARKETPLACE_ID,pulledAt:new Date().toISOString(),rows});
      await atomicJson(file,{status:'complete',reportId,start,end,rows:rows.length,updatedAt:new Date().toISOString()});
      console.log(JSON.stringify({status:'complete',rows:rows.length,start,end}));break;
    }
    if(['FATAL','CANCELLED'].includes(report.processingStatus))throw Error('Amazon inventory ledger report '+report.processingStatus+'.');
    if(Date.now()>deadline)throw Error('Inventory ledger generation timed out; rerun to resume.');
    await new Promise(resolve=>setTimeout(resolve,20000));
  }
}catch(error){await atomicJson(file,{status:'failed',start,end,error:error.message,updatedAt:new Date().toISOString()});throw error;}finally{await release();}
