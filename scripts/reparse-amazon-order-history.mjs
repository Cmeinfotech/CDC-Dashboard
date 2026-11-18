import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { readAmazonJson, minimizeAmazonData } from '../services/amazonDataSecurity.mjs';
import { atomicJson, acquireLock } from '../services/amazonMonitorStore.mjs';
import { reportDownloadUrl } from '../services/amazonTransport.mjs';
import { boundedBytes } from '../services/boundedBody.mjs';
import { parseAmazonTsv } from '../services/amazonTsv.mjs';
import { mergeOrderReportRows } from '../services/mergeOrderReportRows.mjs';
for(const[key,value]of Object.entries(parseEnv(await fs.readFile('.env','utf8').catch(()=>''))))if(process.env[key]==null)process.env[key]=value;
const{amazonRequest}=await import('../services/amazonSpApi.ts');
const release=await acquireLock('orders-history'),root=path.join(process.cwd(),'outputs','amazon-cdc');
try{
 const status=await readAmazonJson(path.join(root,'order-history-status.json'));
 if(status.status!=='complete'||status.mode!=='selected')throw Error('A completed selected-date pull is required before reparsing.');
 const all=[];
 for(let index=0;index<status.ranges.length;index++){
  const range=status.ranges[index];
  const{data:report}=await amazonRequest('/reports/2021-06-30/reports/'+encodeURIComponent(range.reportId));
  if(report.processingStatus!=='DONE'||report.reportType!=='GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL')throw Error('Saved order report is not a completed expected report.');
  const{data:document}=await amazonRequest('/reports/2021-06-30/documents/'+encodeURIComponent(report.reportDocumentId));
  const response=await fetch(reportDownloadUrl(document.url),{redirect:'error',signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw Error('Order report download failed.');
  let bytes=Buffer.from(await boundedBytes(response,128*1024*1024));if(document.compressionAlgorithm==='GZIP')bytes=gunzipSync(bytes,{maxOutputLength:256*1024*1024});
  const rows=minimizeAmazonData(parseAmazonTsv(bytes.toString('utf8')));
  if(rows.some(row=>!row['amazon-order-id']||!row['purchase-date']))throw Error('Order identity/date missing in parsed report.');
  all.push(...rows);
  await atomicJson(path.join(root,'order-report-'+String(index+1).padStart(2,'0')+'.json'),{marketplaceId:status.marketplaceId,reportId:range.reportId,start:range.start,end:range.end,pulledAt:new Date().toISOString(),rows});
 }
 const combined=await readAmazonJson(path.join(root,'order-report.json'));
 combined.rows=mergeOrderReportRows(combined.rows,all,{start:status.start,end:status.end});combined.pulledAt=new Date().toISOString();
 await atomicJson(path.join(root,'order-report.json'),combined);
 await atomicJson(path.join(root,'order-history-status.json'),{...status,rows:combined.rows.length,parser:'literal TSV; quote-safe',revalidatedAt:new Date().toISOString()});
 console.log(JSON.stringify({status:'complete',batches:status.ranges.length,reparsedRows:all.length,totalSavedRows:combined.rows.length}));
}finally{await release();}
