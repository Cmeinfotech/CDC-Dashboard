import { accessGuard } from '../../../../services/accessSecurity.mjs';
import { monitorRoot, readJson } from '../../../../services/amazonMonitorStore.mjs';
import { assertAmazonStorage } from '../../../../services/amazonDataSecurity.mjs';
import { isAmazonConfigured } from '../../../../services/amazonSpApi';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

async function state() {
  const root = monitorRoot();
  const [data, progress, lock] = await Promise.all([readJson(join(root, 'account-health.json')), readJson(join(root, 'account-health-progress.json')), readJson(join(root, 'account-health.lock'))]);
  let running = false;
  if (lock) { try { process.kill(lock.pid, 0); running = true; } catch { /* An exited process is not running. */ } }
  return { data, progress, running };
}
export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  try { return Response.json(await state(), { headers: { 'Cache-Control': 'no-store' } }); }
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
