import { isolatedSalesProfitExport } from '../../../../services/isolatedSalesProfitExport.mjs';
import { limitSalesProfitTestingRange } from '../../../../services/salesProfitTestingRange.mjs';
import { withSalesProfitRequest } from '../../../../services/salesProfitRequest.mjs';
import { readAmazonJson } from '../../../../services/amazonDataSecurity.mjs';
import { readJson, monitorRoot } from '../../../../services/amazonMonitorStore.mjs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { accessGuard } from '../../../../services/accessSecurity.mjs';
import { salesProfitView } from '../../../../services/salesProfit.mjs';

import { resolveSalesProfitStock } from '../../../../services/salesProfitStock.mjs';
import { salesProfitMonthlyHistory, sixMonthSalesProfitRange } from '../../../../services/salesProfitMonthlyHistory.mjs';
import { previousSalesProfitStock, salesProfitFinanceForRange } from '../../../../services/salesProfitHistory.mjs';
import { liveSalesProfit } from '../../../../services/liveSalesProfit.mjs';
import { isAmazonConfigured } from '../../../../services/amazonSpApi';

function validDates(params: URLSearchParams) {
  const start = params.get('startDate') || '', end = params.get('endDate') || '';
  return ![start, end].some(value => value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) && !(start && end && start > end);
}
async function running(includeSources = false) {
  const names = includeSources ? ['sales-profit', 'sales-profit-finances', 'inventory-pull', 'orders-history', 'sales-profit-inventory-history'] : ['sales-profit'];
  const states = await Promise.all(names.map(async name => {
    const lock = await readJson(join(monitorRoot(), name + '.lock'));
    if (!lock?.pid) return false;
    try { process.kill(lock.pid, 0); return true; } catch { return false; }
  }));
  return states.some(Boolean);
}
export async function GET(request: Request) { return withSalesProfitRequest(() => getSalesProfit(request)); }
async function getSalesProfit(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  const params = new URL(request.url).searchParams;
  if (!validDates(params)) return Response.json({ error: 'Invalid date range.' }, { status: 400 });
  const testingRange = limitSalesProfitTestingRange(params);
  try {
    if (params.get('format') === 'xlsx') {
      const bytes=await isolatedSalesProfitExport(params);
      return new Response(bytes,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="Amazon-Sales-Profit.xlsx"','Cache-Control':'no-store'}});
    }
    if (params.get('view') === 'history') {
      const [report,finance,ledger,pulling]=await Promise.all([readAmazonJson(join(process.cwd(),'outputs','amazon-cdc','order-report.json')),salesProfitFinanceForRange(new URLSearchParams({startDate:sixMonthSalesProfitRange().start})),readJson(join(monitorRoot(),'sales-profit-inventory-history.json')),running(true)]);
      return Response.json({...salesProfitMonthlyHistory(report,finance,ledger),running:pulling},{headers:{'Cache-Control':'no-store'}});
    }
    const [report, finance, inventory, progress, pulling, financeProgress, orderProgress, fbaInventory, previousStock, inventoryHistory] = await Promise.all([
      readAmazonJson(join(process.cwd(), 'outputs', 'amazon-cdc', 'sales-profit-test-orders.json')),
      salesProfitFinanceForRange(params),
      readJson(join(monitorRoot(), 'latest.json')).then(latest => latest ? readJson(join(monitorRoot(), 'runs', latest.id + '.json')) : null),
      readJson(join(monitorRoot(), 'sales-profit-progress.json')), running(true), readJson(join(monitorRoot(), 'sales-profit-finances-progress.json')), readAmazonJson(join(process.cwd(), 'outputs', 'amazon-cdc', 'order-history-status.json')), readAmazonJson(join(process.cwd(), 'outputs', 'amazon-cdc', 'inventory.json')), previousSalesProfitStock(params), readJson(join(monitorRoot(), 'sales-profit-inventory-history.json')),
    ]);
    if (!params.get('sheet') && params.get('format') !== 'xlsx') params.set('_summary', '1');
    if (report) report.rows = report.rows.filter((row: Record<string,string>) => String(row['purchase-date']).slice(0,10) >= testingRange.startDate && String(row['purchase-date']).slice(0,10) <= testingRange.endDate);
    const resolvedStock = resolveSalesProfitStock(inventory, fbaInventory);
    const data = liveSalesProfit(report, finance, resolvedStock ? { ...resolvedStock, previousSnapshot: previousStock, history: inventoryHistory } : null, params);

    const result = salesProfitView(data, params);
    const effectiveProgress = progress ? { ...progress, jobs: progress.jobs?.map((job: { name: string; status: string; error?: string }) => job.name === 'Orders' && orderProgress?.status === 'complete' ? { ...job, status: 'complete', error: undefined } : job) } : null;
    return Response.json(result ? { ...result, notes: data.notes, importedAt: data.importedAt, coverage: data.coverage, running: pulling, progress: effectiveProgress, testingRange, financeUpdatedAt: finance?.pulledAt, financeError: financeProgress?.status === 'failed' ? financeProgress.error : undefined } : { error: 'Sheet not found.' }, { status: result ? 200 : 404, headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Saved Amazon sales data could not be read securely. Retry or pull latest data.' }, { status: 503 }); }
}
export async function POST(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  const params = new URL(request.url).searchParams;
  if (!validDates(params)) return Response.json({ error: 'Invalid date range.' }, { status: 400 });
  if (!isAmazonConfigured()) return Response.json({ error: 'Amazon credentials are not configured.' }, { status: 503 });
  const end = params.get('endDate') || new Date().toISOString().slice(0, 10);
  const start = params.get('startDate') || new Date(Date.parse(end) - 59 * 86400000).toISOString().slice(0, 10);
  const duration = Date.parse(end) - Date.parse(start) + 86400000;
  const previousStart = testingRange.startDate;
  void duration;
  if (end > new Date().toISOString().slice(0, 10)) return Response.json({ error: 'Amazon pulls cannot include future dates.' }, { status: 400 });
  try {
    if (!await running()) await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [join(process.cwd(), 'scripts', 'pull-amazon-sales-profit.mjs'), '--start', previousStart, '--end', end], { cwd: process.cwd(), env: process.env, detached: true, windowsHide: true, stdio: 'ignore' });
      child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
    });
    return Response.json({ running: true }, { status: 202 });
  } catch { return Response.json({ error: 'Could not start the Amazon Sales & Profit pull.' }, { status: 500 }); }
}



