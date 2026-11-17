import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { accessGuard } from '../../../../../services/accessSecurity.mjs';
import { readAmazonJson } from '../../../../../services/amazonDataSecurity.mjs';
import { readJson, monitorRoot } from '../../../../../services/amazonMonitorStore.mjs';
import { accountHealthOrders } from '../../../../../services/accountHealthOrders.mjs';
import { isAmazonConfigured } from '../../../../../services/amazonSpApi';

async function running() {
  const lock = await readJson(join(monitorRoot(), 'orders-history.lock'));
  if (!lock?.pid) return false;
  try { process.kill(lock.pid, 0); return true; } catch { return false; }
}
export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  if (request.headers.get('x-cdc-account-id') === 'nana-jewellers') return Response.json({ error: 'CDC only.' }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const start = params.get('startDate') || '', end = params.get('endDate') || '';
  if ([start, end].some(date => date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) || start && end && start > end) return Response.json({ error: 'Invalid date range.' }, { status: 400 });
  try {
    const [report, pulling] = await Promise.all([readAmazonJson(join(process.cwd(), 'outputs', 'amazon-cdc', 'order-report.json')), running()]);
    const progress = await readAmazonJson(join(process.cwd(), 'outputs', 'amazon-cdc', 'order-history-status.json'));
    return Response.json({ ...accountHealthOrders(report, start, end, params.get('channel') || ''), running: pulling, pullFailed: !pulling && progress?.status === 'failed' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Saved Amazon orders could not be read. Retry or pull the latest orders.' }, { status: 503 }); }
}
export async function POST(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  if (request.headers.get('x-cdc-account-id') === 'nana-jewellers') return Response.json({ error: 'CDC only.' }, { status: 403 });
  if (!isAmazonConfigured()) return Response.json({ error: 'Amazon credentials are not configured.' }, { status: 503 });
  try {
    if (!await running()) await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [join(process.cwd(), 'scripts', 'pull-amazon-orders-history.mjs')], { cwd: process.cwd(), env: process.env, detached: true, windowsHide: true, stdio: 'ignore' });
      child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
    });
    return Response.json({ running: true }, { status: 202 });
  } catch { return Response.json({ error: 'Could not start the Amazon order pull.' }, { status: 500 }); }
}
