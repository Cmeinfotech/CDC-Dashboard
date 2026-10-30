import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { assertAmazonStorage } from '../services/amazonDataSecurity.mjs';
import { acquireLock, atomicJson, monitorRoot, readJson } from '../services/amazonMonitorStore.mjs';

const env = { ...parseEnv(await fs.readFile('.env', 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error))), ...process.env };
for (const key of ['AMAZON_DATA_KEY', 'AMAZON_MONITOR_DATA_DIR', 'AMAZON_ACCESS_REVOKED', 'AMAZON_DATA_RETENTION_DAYS']) if (env[key]) process.env[key] = env[key];
assertAmazonStorage();
const root = monitorRoot(), automationFile = path.join(root, 'automation.json');
const release = await acquireLock('automatic-sync');
const run = script => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(process.cwd(), 'scripts', script), ...(script === 'pull-amazon-orders-history.mjs' ? ['--history'] : [])], { cwd: process.cwd(), env: process.env, windowsHide: true, stdio: 'inherit' });
  child.once('error', reject); child.once('exit', (code, signal) => code === 0 ? resolve(undefined) : reject(Error(`${script} exited with ${signal || `code ${code}`}.`)));
});
try {
  const current = await readJson(automationFile, {});
  const jobs = [];
  await atomicJson(automationFile, { ...current, enabled: true, status: 'running two-year backfill', source: 'manual', lastStartedAt: new Date().toISOString(), lastError: null, jobs });
  for (const [name, script] of [['Catalog and listing monitor', 'amazon-monitor.mjs'], ['Account Health', 'pull-amazon-account-health.mjs'], ['Two-year order history', 'pull-amazon-orders-history.mjs'], ['Dashboard database', 'sync-amazon-pull-to-database.mjs']]) {
    const startedAt = new Date().toISOString();
    try { await run(script); jobs.push({ name, status: 'complete', startedAt, completedAt: new Date().toISOString() }); }
    catch (error) { jobs.push({ name, status: 'failed', startedAt, completedAt: new Date().toISOString(), error: error.message }); await atomicJson(automationFile, { ...current, enabled: true, status: 'failed', lastFinishedAt: new Date().toISOString(), lastError: `${name}: ${error.message}`, jobs }); throw error; }
    await atomicJson(automationFile, { ...current, enabled: true, status: 'running two-year backfill', jobs });
  }
  await atomicJson(automationFile, { ...current, enabled: true, status: 'complete', lastFinishedAt: new Date().toISOString(), lastError: null, jobs });
} finally { await release(); }
