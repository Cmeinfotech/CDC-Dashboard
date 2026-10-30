import { join } from 'node:path';
import { monitorRoot, readJson } from './amazonMonitorStore.mjs';

export async function loadAmazonSyncStatus(root = monitorRoot()) {
  const warnings = [];
  const readStatus = async file => {
    try { return await readJson(file); }
    catch { warnings.push('Some sync status records could not be read.'); return null; }
  };
  const [latest, progress, automation] = await Promise.all(['latest.json', 'progress.json', 'automation.json'].map(name => readStatus(join(root, name))));
  const run = latest?.id ? await readStatus(join(root, 'runs', `${latest.id}.summary.json`)) : null;
  const dates = [latest?.capturedAt, run?.capturedAt, automation?.lastSuccessfulAt,
    ...(progress?.status === 'complete' ? [progress.completedAt] : []),
    ...(automation?.jobs || []).filter(job => job.status === 'complete' && job.name !== 'Dashboard database').map(job => job.completedAt),
  ].filter(value => typeof value === 'string' && Number.isFinite(Date.parse(value)));
  const lock = await readStatus(join(root, 'automatic-sync.lock'));
  let workerRunning = false;
  if (Number.isInteger(lock?.pid)) { try { process.kill(lock.pid, 0); workerRunning = true; } catch { /* stale worker */ } }
  return {
    capturedAt: run?.capturedAt || latest?.capturedAt || null,
    completedAt: dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null,
    syncStatus: workerRunning ? 'running' : automation?.status === 'running' ? 'interrupted' : automation?.status || (warnings.length ? 'unavailable' : null),
    lastError: automation?.lastError || null,
    lastFinishedAt: automation?.lastFinishedAt || null,
    nextRunAt: automation?.nextRunAt || null,
    intervalMinutes: automation?.intervalMinutes || 30,
    stage: progress?.stage || null,
    progressStatus: progress?.status || null,
    statusWarning: warnings.length ? warnings[0] : null,
  };
}
