import { accessGuard } from '../../../../services/accessSecurity.mjs';
import { monitorRoot, readJson } from '../../../../services/amazonMonitorStore.mjs';
import { assertAmazonStorage } from '../../../../services/amazonDataSecurity.mjs';
import { isAmazonConfigured } from '../../../../services/amazonSpApi';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { healthSnapshots, selectHealthSnapshot } from '../../../../services/accountHealthHistory.mjs';

async function state() {
  const root = monitorRoot();
  const [data, progress, lock] = await Promise.all([readJson(join(root, 'account-health.json')), readJson(join(root, 'account-health-progress.json')), readJson(join(root, 'account-health.lock'))]);
  let running = false;
  if (lock) { try { process.kill(lock.pid, 0); running = true; } catch { /* An exited process is not running. */ } }
  return { data, progress, running };
}
export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  try {
    const params = new URL(request.url).searchParams;
    const startDate = params.get('startDate') || '', endDate = params.get('endDate') || '';
    if ([startDate, endDate].some(value => value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) || startDate && endDate && startDate > endDate) return Response.json({ error: 'Invalid date range.' }, { status: 400 });
    const current = await state();
    const snapshots = await healthSnapshots(current.data);
    if (params.get('view') === 'trend') return Response.json({ snapshots: snapshots.filter((snapshot: { capturedAt: string }) => (!startDate || snapshot.capturedAt.slice(0, 10) >= startDate) && (!endDate || snapshot.capturedAt.slice(0, 10) <= endDate)).map((snapshot: { capturedAt: string; marketplaceId: string; performanceMetrics: { marketplaceId: string; metrics: { category: string; value: unknown }[] }[] }) => ({ capturedAt: snapshot.capturedAt, rating: snapshot.performanceMetrics.find(entry => entry.marketplaceId === snapshot.marketplaceId)?.metrics.find(metric => metric.category === 'accountHealthRating')?.value })) }, { headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ ...current, data: startDate || endDate ? selectHealthSnapshot(snapshots, startDate, endDate) : current.data, availableRange: { startDate: snapshots[0]?.capturedAt.slice(0, 10) || '', endDate: snapshots.at(-1)?.capturedAt.slice(0, 10) || '' } }, { headers: { 'Cache-Control': 'no-store' } });
  }
  catch { return Response.json({ error: 'Account Health data unavailable.' }, { status: 500 }); }
}
export async function POST(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  if (!isAmazonConfigured()) return Response.json({ error: 'Amazon credentials are not configured.' }, { status: 503 });
  try {
    assertAmazonStorage();
    const current = await state();
    if (current.running) return Response.json({ status: 'running' }, { status: 202 });
    if (Date.now() - Date.parse(current.progress?.requestedAt || '') < 60000) return Response.json({ error: 'Wait one minute before pulling again.' }, { status: 429 });
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [join(process.cwd(), 'scripts', 'pull-amazon-account-health.mjs')], { cwd: process.cwd(), env: process.env, detached: true, windowsHide: true, stdio: 'ignore' });
      child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
    });
    return Response.json({ status: 'starting' }, { status: 202 });
  } catch { return Response.json({ error: 'Account Health pull could not start.' }, { status: 500 }); }
}
