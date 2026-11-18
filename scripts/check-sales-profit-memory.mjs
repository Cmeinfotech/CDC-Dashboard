import { readAmazonJson } from '../services/amazonDataSecurity.mjs';
import { readJson, monitorRoot } from '../services/amazonMonitorStore.mjs';
import { liveSalesProfit } from '../services/liveSalesProfit.mjs';
import { salesProfitView } from '../services/salesProfit.mjs';
import { limitSalesProfitTestingRange } from '../services/salesProfitTestingRange.mjs';
import { join } from 'node:path';
const samples=[];
for(let i=0;i<12;i++){
 const report=await readAmazonJson(join(process.cwd(),'outputs','amazon-cdc','sales-profit-test-orders.json'));
 const finance=await readJson(join(monitorRoot(),'sales-profit-test-finances.json'));
 const params=new URLSearchParams();limitSalesProfitTestingRange(params);
 if(i%2===0)params.set('_summary','1');else params.set('sheet','Total Orders');
 const data=liveSalesProfit(report,finance,null,params);
 const result=salesProfitView(data,params);
 if(params.has('sheet')&&result.rows.length>50)throw Error('Pagination exceeded 50 rows.');
 samples.push(Math.round(process.memoryUsage().heapUsed/1048576));
}
console.log(JSON.stringify({requests:12,heapLimitMB:768,heapSamplesMB:samples,rssMB:Math.round(process.memoryUsage().rss/1048576)}));
