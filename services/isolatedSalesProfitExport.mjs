import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export async function isolatedSalesProfitExport(params) {
  const folder=await mkdtemp(join(tmpdir(),'cdc-sales-export-'));
  const file=join(folder,'export.xlsx');
  try {
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['--max-old-space-size=2048',join(process.cwd(),'scripts','export-sales-profit-worker.mjs'),params.get('startDate'),params.get('endDate'),file],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:'ignore'});
      const timer=setTimeout(()=>{child.kill();reject(Error('Excel export timed out. Select a smaller date range and retry.'));},300000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(Error('Excel export exceeded its worker budget. Select a smaller date range and retry.'));});
    });
    return new Uint8Array(await readFile(file));
  } finally { await rm(folder,{recursive:true,force:true}); }
}
