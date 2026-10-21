import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { assertAmazonStorage } from '../services/amazonDataSecurity.mjs';
import { atomicJson, monitorRoot, readJson } from '../services/amazonMonitorStore.mjs';

const env = { ...parseEnv(await fs.readFile('.env', 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error))), ...process.env };
for (const key of ['AMAZON_DATA_KEY', 'AMAZON_MONITOR_DATA_DIR', 'AMAZON_ACCESS_REVOKED', 'AMAZON_DATA_RETENTION_DAYS']) if (env[key]) process.env[key] = env[key];
assertAmazonStorage();
const monitor = monitorRoot();
const source = path.resolve(process.cwd(), 'outputs', 'amazon-cdc');
const workspace = path.resolve(process.cwd());
for (const target of [monitor, source]) {
  const relative = path.relative(workspace, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Refusing to clear a path outside the workspace.');
}
for (const lock of ['automatic-sync', 'sync', 'account-health', 'orders-history']) {
  const file = path.join(monitor, `${lock}.lock`);
  const value = await readJson(file).catch(() => null);
  if (value?.pid) { try { process.kill(value.pid, 0); throw Error(`Cannot clear Amazon data while ${lock} is running.`); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
}
const previousAutomation = await readJson(path.join(monitor, 'automation.json'), null).catch(() => null);
await fs.rm(monitor, { recursive: true, force: true });
await fs.rm(source, { recursive: true, force: true });
await fs.mkdir(monitor, { recursive: true });
await fs.mkdir(source, { recursive: true });
if (previousAutomation?.enabled) await atomicJson(path.join(monitor, 'automation.json'), { ...previousAutomation, status: 'history backfill pending', lastError: null, clearedAt: new Date().toISOString() });
console.log(JSON.stringify({ status: 'cleared', cleared: [monitor, source] }));
