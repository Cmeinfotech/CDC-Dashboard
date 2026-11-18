import { stat } from 'node:fs/promises';
import { resolveSalesProfitStock } from './salesProfitStock.mjs';
import { join } from 'node:path';
import { monitorRoot, readJson, atomicJson } from './amazonMonitorStore.mjs';
export function previousSalesProfitPeriod(params, now = new Date()) {
  const end = params.get('endDate') || now.toISOString().slice(0,10);
  const start = params.get('startDate') || new Date(Date.parse(end)-29*86400000).toISOString().slice(0,10);
  const duration = Date.parse(end)-Date.parse(start)+86400000;
  return { start: new Date(Date.parse(start)-duration).toISOString().slice(0,10), end: new Date(Date.parse(start)-86400000).toISOString().slice(0,10) };
}
export function selectStockSnapshotDate(dates, start, end) { return dates.filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&date>=start&&date<=end).sort().at(-1)||null; }
export async function previousSalesProfitStock(params) {
  const period=previousSalesProfitPeriod(params), index=await readJson(join(monitorRoot(),'stock-history-index.json'),{dates:[]});
  const date=selectStockSnapshotDate(index.dates,period.start,period.end);
  return date?readJson(join(monitorRoot(),'stock-history',date+'.json')):null;
}

export async function salesProfitFinanceForRange(params) {
  const testFile=join(monitorRoot(),'sales-profit-test-finances.json');
  if(await stat(testFile).catch(()=>null))return readJson(testFile);
  const historyFile=join(monitorRoot(),'sales-profit-finances-history.json'), currentFile=join(monitorRoot(),'sales-profit-finances.json');
  const [historyInfo,currentInfo]=await Promise.all([stat(historyFile).catch(()=>null),stat(currentFile).catch(()=>null)]);
  const start=params.get('startDate')||new Date(Date.now()-29*86400000).toISOString().slice(0,10);
  const recentStart=new Date(Date.now()-59*86400000).toISOString().slice(0,10);
  if(currentInfo&&(!historyInfo||currentInfo.mtimeMs>historyInfo.mtimeMs&&start>=recentStart))return readJson(currentFile);
  return historyInfo?readJson(historyFile):readJson(currentFile);
}

export async function captureSalesProfitStock(catalog, inventory) {
  if(!catalog||!inventory||String(catalog.capturedAt).slice(0,10)!==String(inventory.pulledAt).slice(0,10)||catalog.marketplaceId!==inventory.marketplaceId)return false;
  const resolved=resolveSalesProfitStock(catalog,inventory),date=String(inventory.pulledAt).slice(0,10);
  const snapshot={marketplaceId:catalog.marketplaceId,capturedAt:catalog.capturedAt,inventoryPulledAt:inventory.pulledAt,source:'Saved daily catalog and FBA inventory',products:resolved.products.map(({sku,asin,title,listing,stockSource,stockCapturedAt})=>({sku,asin,title,listing,stockSource,stockCapturedAt}))};
  await atomicJson(join(monitorRoot(),'stock-history',date+'.json'),snapshot);
  const index=await readJson(join(monitorRoot(),'stock-history-index.json'),{dates:[]});
  await atomicJson(join(monitorRoot(),'stock-history-index.json'),{dates:[...new Set([...index.dates,date])].sort()});
  return true;
}
