import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { assertAmazonStorage } from '../services/amazonDataSecurity.mjs';
import { acquireLock, atomicJson, monitorRoot } from '../services/amazonMonitorStore.mjs';

const envFile = await fs.readFile('.env', 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error));
const env = { ...parseEnv(envFile), ...process.env };
for (const name of ['AMAZON_DATA_KEY', 'AMAZON_MONITOR_DATA_DIR', 'AMAZON_ACCESS_REVOKED', 'AMAZON_DATA_RETENTION_DAYS']) {
  if (env[name]) process.env[name] = env[name];
}

const argument = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const timeZone = argument('--timezone') || env.AMAZON_AUTO_SYNC_TIMEZONE || 'Asia/Kolkata';
const intervalMinutes = Number(argument('--interval-minutes') || env.AMAZON_AUTO_SYNC_INTERVAL_MINUTES || 30);
if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 1440) throw Error('AMAZON_AUTO_SYNC_INTERVAL_MINUTES must be a whole number from 5 to 1440.');
try { new Intl.DateTimeFormat('en-GB', { timeZone }).format(); }
catch { throw Error('AMAZON_AUTO_SYNC_TIMEZONE must be a valid IANA time zone.'); }

const root = monitorRoot();
const automationFile = path.join(root, 'automation.json');
const schedule = `Every ${intervalMinutes} minutes (${timeZone})`;

function nextRunAt(now = Date.now()) {
  const intervalMs = intervalMinutes * 60_000;
  return new Date((Math.floor(now / intervalMs) + 1) * intervalMs).toISOString();
}

async function writeAutomation(update) {
  const current = await (async () => {
    try { const { readJson } = await import('../services/amazonMonitorStore.mjs'); return await readJson(automationFile, {}); }
    catch { return {}; }
  })();
  const value = { ...current, enabled: true, schedule, timeZone, intervalMinutes, nextRunAt: nextRunAt(), ...update };
  await atomicJson(automationFile, value);
  return value;
}

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), 'scripts', script)], {
      cwd: process.cwd(), env: process.env, windowsHide: true, stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve(undefined) : reject(Error(`${script} exited with ${signal || `code ${code}`}.`)));
  });
}

async function syncNow() {
  assertAmazonStorage();
  const release = await acquireLock('automatic-sync');
  const startedAt = new Date().toISOString();
  const jobs = [];
  try {
    await writeAutomation({ status: 'running', source: process.argv.includes('--now') ? 'manual' : 'scheduled', lastStartedAt: startedAt, lastError: null, jobs });
    for (const [name, script] of [['Catalog and listing monitor', 'amazon-monitor.mjs'], ['Account Health', 'pull-amazon-account-health.mjs'], ['Recent order updates', 'pull-amazon-orders-history.mjs'], ['Dashboard database', 'sync-amazon-pull-to-database.mjs']]) {
      const started = new Date().toISOString();
      try {
        await run(script);
        jobs.push({ name, status: 'complete', startedAt: started, completedAt: new Date().toISOString() });
      } catch (error) {
        jobs.push({ name, status: 'failed', startedAt: started, completedAt: new Date().toISOString(), error: error.message });
        await writeAutomation({ status: 'failed', lastFinishedAt: new Date().toISOString(), lastError: `${name}: ${error.message}`, jobs });
        throw error;
      }
      await writeAutomation({ status: 'running', jobs });
    }
    await writeAutomation({ status: 'complete', lastFinishedAt: new Date().toISOString(), lastError: null, jobs });
  } finally {
    await release();
  }
}

if (process.argv.includes('--configure')) {
  assertAmazonStorage();
  await writeAutomation({ status: 'scheduled', intervalMinutes, lastError: null });
  console.log(JSON.stringify({ status: 'scheduled', intervalMinutes, schedule, nextRunAt: nextRunAt() }));
} else {
  await syncNow();
}
