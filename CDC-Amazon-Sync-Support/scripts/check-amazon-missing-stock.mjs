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
const missing=JSON.parse(await fs.readFile('work/amazon-excel-export/stock-missing.json','utf8'));
const query=new URLSearchParams({granularityType:'Marketplace',granularityId:marketplace,marketplaceIds:marketplace,details:'true',sellerSkus:missing.map(r=>r['seller-sku']).join(',')});
await guarded('inventory-missing-check',async()=>{
 const result=await api('/fba/inventory/v1/summaries?'+query);await save('inventory-missing-check',result);
 const inventory=JSON.parse(await fs.readFile(folder+'/inventory.json','utf8'));let added=0;
 for(const row of result.payload?.inventorySummaries||[]){if(!inventory.rows.some(x=>x.sellerSku===row.sellerSku&&x.asin===row.asin)){inventory.rows.push(row);added++;}}
 if(added){inventory.pulledAt=new Date().toISOString();await save('inventory',inventory);}
 await update('inventory-missing-check',{status:'complete',returned:result.payload?.inventorySummaries?.length||0,added});
});await save('status',status);console.log('Direct missing-stock check complete.');
