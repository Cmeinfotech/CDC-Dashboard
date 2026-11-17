import { accessGuard } from '../../../../../services/accessSecurity.mjs';
import { monitorRoot, readJson } from '../../../../../services/amazonMonitorStore.mjs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const root = monitorRoot();
    const cached = await readJson(join(root, 'account-health-claims.json'));
    const report = await readJson(join(root, 'account-health.json'));
    const progress = await readJson(join(root, 'account-health-claims-progress.json'));
    const lock = await readJson(join(root, 'account-health-claims.lock'));
    let running = false;
    const yearStart = new Date();
    yearStart.setUTCFullYear(yearStart.getUTCFullYear() - 1);
    const needsYearCoverage = !cached?.reportingRange?.startDate || cached.reportingRange.startDate > yearStart.toISOString().slice(0, 10);
    if (lock) { try { process.kill(lock.pid, 0); running = true; } catch { /* Finished pull. */ } }
    if (!running && (!cached || needsYearCoverage || cached.truncated || Date.now() - Date.parse(cached.capturedAt) > 15 * 60_000 || Date.parse(cached.capturedAt) < Date.parse(report?.capturedAt ?? ''))) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, [join(process.cwd(), 'scripts/pull-amazon-account-health-claims.mjs')], { cwd: process.cwd(), env: process.env, detached: true, windowsHide: true, stdio: 'ignore' });
        child.once('error', reject);
        child.once('spawn', () => { child.unref(); resolve(); });
      });
      running = true;
    }
    return Response.json({ ...(cached ?? { available: false, events: [] }), pending: running, pagesLoaded: running ? progress?.pages : undefined }, { headers });
  } catch {
    return Response.json({ available: false, events: [], reason: 'Amazon claims pull could not start. Please try again.' }, { headers });
  }
}
