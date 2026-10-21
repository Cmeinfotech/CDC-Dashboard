import './legacy-amazon-disabled.mjs';
import fs from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { gunzipSync } from 'node:zlib';
import XLSX from 'xlsx';
const env = {...parseEnv(await fs.readFile('.env','utf8')), ...process.env};
const endpoint = {na:'https://sellingpartnerapi-na.amazon.com',eu:'https://sellingpartnerapi-eu.amazon.com',fe:'https://sellingpartnerapi-fe.amazon.com'}[env.AMAZON_SP_API_REGION];
const marketplace = env.AMAZON_MARKETPLACE_ID;
if (!endpoint || !marketplace) throw Error('Amazon region and marketplace are required.');
const folder = 'outputs/amazon-share-2026-10-09/source';
await fs.mkdir(folder,{recursive:true});
const save = (name,data) => fs.writeFile(`${folder}/${name}.json`,JSON.stringify(data));
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
let token, expiry=0;
const status=(process.argv.includes('--orders-only')||process.argv.includes('--missing-only')||process.argv.includes('--stock-only'))?JSON.parse(await fs.readFile(`${folder}/status.json`,'utf8')):{startedAt:new Date().toISOString(),marketplaceId:marketplace,datasets:{}};
const update=async(key,entry)=>{status.datasets[key]=entry;await save('status',status);};
async function api(resource,init={}) {
 for(let attempt=0;attempt<8;attempt++) {
  if(!token || Date.now()>=expiry) {
   const r=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:env.AMAZON_LWA_CLIENT_ID,client_secret:env.AMAZON_LWA_CLIENT_SECRET,refresh_token:env.AMAZON_LWA_REFRESH_TOKEN}),signal:AbortSignal.timeout(30000)});
   const b=await r.json();if(!r.ok||!b.access_token)throw Error(`Authentication failed (${r.status})`);token=b.access_token;expiry=Date.now()+(b.expires_in-60)*1000;
  }
  try {
   const r=await fetch(endpoint+resource,{...init,headers:{'x-amz-access-token':token,'content-type':'application/json'},signal:AbortSignal.timeout(45000)});
   if(r.status===429||r.status>=500){await pause(Math.min(60000,3000*2**attempt));continue;}
   const b=await r.json();if(!r.ok)throw Error(`Amazon ${r.status}: ${b.errors?.map(x=>x.message).join('; ')||'Request denied'}`);return b;
  }catch(e){if(attempt===7||!['TypeError','TimeoutError'].includes(e.name))throw e;await pause(3000);}
 }
 throw Error('Amazon retry limit reached');
}
async function report(key,type,start,end) {
 const body={reportType:type,marketplaceIds:[marketplace]};if(start){body.dataStartTime=start;body.dataEndTime=end;}
 const existingId=status.datasets[key]?.reportId;
 await update(key,{status:'requesting',type,start,end,reportId:existingId});
 const created=existingId?{reportId:existingId}:await api('/reports/2021-06-30/reports',{method:'POST',body:JSON.stringify(body)});
 const deadline=Date.now()+3600000;let meta;
 do {meta=await api('/reports/2021-06-30/reports/'+created.reportId);await update(key,{status:meta.processingStatus,type,start,end,reportId:created.reportId});if(['FATAL','CANCELLED'].includes(meta.processingStatus))throw Error(`Report ${meta.processingStatus}`);if(Date.now()>deadline)throw Error('Report timeout');if(meta.processingStatus!=='DONE')await pause(20000);}while(meta.processingStatus!=='DONE');
 const doc=await api('/reports/2021-06-30/documents/'+encodeURIComponent(meta.reportDocumentId));
 const response=await fetch(doc.url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error(`Report download failed (${response.status})`);
 let buffer=Buffer.from(await response.arrayBuffer());if(doc.compressionAlgorithm==='GZIP')buffer=gunzipSync(buffer);
 const text=buffer.toString('utf8').replace(/^\uFEFF/,'');let rows;
 if(text.trim().startsWith('{')) rows=JSON.parse(text);else if(text.includes('\t')){const w=XLSX.read(text,{type:'string',raw:true,FS:'\t'});rows=XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]],{defval:''});}else throw Error('Amazon returned no tabular report: '+text.slice(0,160));
 const result={reportType:type,marketplaceId:marketplace,pulledAt:new Date().toISOString(),start:meta.dataStartTime||start,end:meta.dataEndTime||end,reportId:created.reportId,rows};await save(key,result);await update(key,{status:'complete',count:Array.isArray(rows)?rows.length:undefined,type,start:result.start,end:result.end});return result;
}
async function guarded(key,fn){try{return await fn();}catch(e){await update(key,{status:'unavailable',error:e.message});console.log(key+': '+e.message);}}
async function catalog(){const r=await report('catalog','GET_MERCHANT_LISTINGS_ALL_DATA');const ids=[...new Set(r.rows.map(x=>x.asin1).filter(Boolean))];const items=[],missing=[];
 for(let offset=0;offset<ids.length;offset+=20){const batch=ids.slice(offset,offset+20),returned=new Set();let next;
  do{const q=new URLSearchParams({marketplaceIds:marketplace,identifiers:batch.join(','),identifiersType:'ASIN',includedData:'attributes,classifications,dimensions,identifiers,images,productTypes,relationships,salesRanks,summaries',pageSize:'20'});if(next)q.set('pageToken',next);const b=await api('/catalog/2022-04-01/items?'+q);for(const item of b.items||[]){items.push(item);returned.add(item.asin);}next=b.pagination?.nextToken;await pause(550);}while(next);
  missing.push(...batch.filter(x=>!returned.has(x)));if(offset%200===0||offset+20>=ids.length){await update('product-details',{status:'running',checked:Math.min(ids.length,offset+20),requested:ids.length,returned:items.length});console.log(`Products ${Math.min(ids.length,offset+20)}/${ids.length}`);}
 }
 await save('product-details',{marketplaceId:marketplace,pulledAt:new Date().toISOString(),complete:true,requested:ids.length,missing,items});await update('product-details',{status:'complete',count:items.length,requested:ids.length,missing});
}
async function inventory(){const rows=[];let next;do{const q=new URLSearchParams({granularityType:'Marketplace',granularityId:marketplace,marketplaceIds:marketplace,details:'true'});if(next)q.set('nextToken',next);const b=await api('/fba/inventory/v1/summaries?'+q);rows.push(...b.payload?.inventorySummaries||[]);next=b.pagination?.nextToken;await pause(550);}while(next);await save('inventory',{marketplaceId:marketplace,pulledAt:new Date().toISOString(),rows});await update('inventory',{status:'complete',count:rows.length});}
async function orders(){const first=await fs.readFile(`${folder}/orders-01.json`,'utf8').then(JSON.parse).catch(()=>null);const end=first?new Date(new Date(first.start).setUTCFullYear(new Date(first.start).getUTCFullYear()+2)):new Date(Math.floor((Date.now()-180000)/1000)*1000),start=first?new Date(first.start):new Date(end);if(!first)start.setUTCFullYear(start.getUTCFullYear()-2);const ranges=[];for(let cursor=new Date(start);cursor<end;){const until=new Date(Math.min(end.getTime(),cursor.getTime()+30*86400000));ranges.push([cursor.toISOString(),until.toISOString()]);cursor=new Date(until);}
 const all=[];let next=0;async function lane(){while(next<ranges.length){const i=next++,[a,b]=ranges[i],key='orders-'+String(i+1).padStart(2,'0');const existing=await fs.readFile(`${folder}/${key}.json`,'utf8').then(JSON.parse).catch(()=>null);const r=existing||await guarded(key,()=>report(key,'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',a,b));if(r)for(const row of r.rows){const date=Date.parse(row['purchase-date']);if(!Number.isFinite(date)||(date>=Date.parse(r.start)&&date<Date.parse(r.end)))all.push(row);}console.log(`Orders period ${i+1}/${ranges.length} complete`);}}
 await Promise.all([lane(),lane(),lane()]);const rows=all;
 await save('orders',{marketplaceId:marketplace,pulledAt:new Date().toISOString(),requestedStart:start.toISOString(),requestedEnd:end.toISOString(),ranges,rows});await update('orders',{status:ranges.every((_,i)=>status.datasets['orders-'+String(i+1).padStart(2,'0')]?.status==='complete')?'complete':'partial',count:rows.length,start:start.toISOString(),end:end.toISOString()});}
if(process.argv.includes('--stock-only')){
 await Promise.all([guarded('catalog',()=>report('catalog','GET_MERCHANT_LISTINGS_ALL_DATA')),guarded('inventory',inventory)]);
}else if(process.argv.includes('--missing-only')){
 const details=JSON.parse(await fs.readFile(`${folder}/product-details.json`,'utf8'));let changed=false;
 for(const asin of [...details.missing])await guarded('catalog-item-'+asin,async()=>{const q=new URLSearchParams({marketplaceIds:marketplace,includedData:'attributes,classifications,dimensions,identifiers,images,productTypes,relationships,salesRanks,summaries'});const item=await api('/catalog/2022-04-01/items/'+encodeURIComponent(asin)+'?'+q);await save('catalog-item-'+asin,{item,pulledAt:new Date().toISOString()});details.items.push(item);details.missing=details.missing.filter(x=>x!==asin);changed=true;await update('catalog-item-'+asin,{status:'complete',count:1});});
 if(changed){details.pulledAt=new Date().toISOString();await save('product-details',details);await update('product-details',{status:'complete',count:details.items.length,requested:details.requested,missing:details.missing});}
}else if(process.argv.includes('--orders-only'))await guarded('orders',orders);else{
await guarded('participation',async()=>{const b=await api('/sellers/v1/marketplaceParticipations');await save('participation',b);await update('participation',{status:'complete',count:b.payload?.length});});
await Promise.all([guarded('catalog',catalog),guarded('inventory',inventory),guarded('orders',orders),guarded('business',()=>report('business','GET_SALES_AND_TRAFFIC_REPORT',new Date(Date.now()-30*86400000).toISOString(),new Date(Date.now()-86400000).toISOString()))]);}
status.finishedAt=new Date().toISOString();await save('status',status);console.log('Export source pull complete.');
