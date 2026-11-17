import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { runPullJobs } from '../services/amazonSyncRunner.mjs';
import { assertAmazonStorage } from '../services/amazonDataSecurity.mjs';
import { acquireLock, atomicJson, monitorRoot, readJson } from '../services/amazonMonitorStore.mjs';

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
const scheduleEpoch = Date.now() - process.uptime() * 1000;

function nextRunAt(now = Date.now()) {
  const intervalMs = intervalMinutes * 60_000;
  return new Date(scheduleEpoch + (Math.max(0, Math.floor((now - scheduleEpoch) / intervalMs)) + 1) * intervalMs).toISOString();
}

function endOfTodayInTimeZone(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const nextDayUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + 1);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(now).find(part => part.type === 'timeZoneName')?.value || 'GMT+00:00';
  const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMinutes = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
  return new Date(nextDayUtc - offsetMinutes * 60_000 - 1).toISOString();
}

async function pauseAutomation(untilToday = false) {
  assertAmazonStorage();
  const current = await readJson(automationFile, {}) || {};
  const pausedAt = new Date().toISOString();
  const pauseUntil = untilToday ? endOfTodayInTimeZone() : null;
  await atomicJson(automationFile, {
    ...current,
    enabled: false,
    status: 'paused',
    pauseReason: untilToday ? 'Paused for today by dashboard operator.' : 'Paused until manually resumed by dashboard operator.',
    pausedAt,
    pauseUntil,
    nextRunAt: null,
  });
  console.log(JSON.stringify({ status: 'paused', pauseUntil }));
}

if (process.argv.includes('--pause')) {
  await pauseAutomation();
  process.exit(0);
}

if (process.argv.includes('--pause-for-today')) {
  await pauseAutomation(true);
  process.exit(0);
}

const existingAutomation = await readJson(automationFile, {}) || {};
if (process.argv.includes('--resume')) {
  assertAmazonStorage();
  const resumed = { ...existingAutomation, enabled: true, status: 'scheduled', pauseUntil: null, pauseReason: null, resumedAt: new Date().toISOString(), nextRunAt: nextRunAt() };
  await atomicJson(automationFile, resumed);
  console.log(JSON.stringify({ status: 'scheduled', nextRunAt: resumed.nextRunAt }));
  process.exit(0);
}

if (existingAutomation.status === 'paused' && (!existingAutomation.pauseUntil || Date.parse(existingAutomation.pauseUntil) > Date.now())) {
  console.log(JSON.stringify({ status: 'paused', pauseUntil: existingAutomation.pauseUntil }));
  process.exit(0);
}

let statusWrites = Promise.resolve();
function writeAutomation(update) {
  const snapshot = structuredClone(update);
  const operation = statusWrites.then(async () => {
    let current = {};
    try { const { readJson } = await import('../services/amazonMonitorStore.mjs'); current = await readJson(automationFile, {}) || {}; } catch { /* Restore from dataset status when control state was damaged. */ }
    const value = { ...current, enabled: true, schedule, timeZone, intervalMinutes, nextRunAt: nextRunAt(), ...snapshot };
    await atomicJson(automationFile, value);
    return value;
  });
  statusWrites = operation.catch(() => {});
  return operation;
}

const cycleBudgetMs = (intervalMinutes - 1) * 60_000;
const databaseBudgetMs = Math.min(120_000, cycleBudgetMs / 4);
const pullBudgetMs = cycleBudgetMs - databaseBudgetMs;
const cycleDeadlineAt = Date.now() + cycleBudgetMs - process.uptime() * 1000;
const remainingBudget = (reserveMs = 0) => Math.max(1000, cycleDeadlineAt - Date.now() - reserveMs - 10_000);

function run(script, timeoutMs = pullBudgetMs) {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const child = spawn(process.execPath, [path.join(process.cwd(), 'scripts', script)], {
      cwd: process.cwd(), env: process.env, windowsHide: true, stdio: 'inherit',
    });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    timer.unref();
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(Error(`${script} exceeded its ${Math.round(timeoutMs / 60_000)}-minute time limit; the next scheduled run can retry.`));
      else if (code === 0) resolve(undefined);
      else reject(Error(`${script} exited with ${signal || `code ${code}`}.`));
    });
  });
}

async function syncNow() {
  assertAmazonStorage();
  const release = await acquireLock('automatic-sync');
  const startedAt = new Date().toISOString();
  const jobs = [];
  try {
    await writeAutomation({ status: 'running', source: process.argv.includes('--now') ? 'manual' : 'scheduled', lastStartedAt: startedAt, lastError: null, jobs });
    const pulls = await runPullJobs([
      ['Catalog and listing monitor', 'amazon-monitor.mjs'],
      ['FBA inventory', 'pull-amazon-inventory.mjs'],
      ['Account Health', 'pull-amazon-account-health.mjs'],
      ['Recent order updates', 'pull-amazon-orders-history.mjs'],
    ], script => run(script, Math.min(pullBudgetMs, remainingBudget(databaseBudgetMs))), currentJobs => writeAutomation({ status: 'running', jobs: currentJobs }));
    jobs.push(...pulls);
    const databaseJobs = await runPullJobs([['Dashboard database', 'sync-amazon-pull-to-database.mjs']], script => run(script, remainingBudget()), currentJobs => writeAutomation({ status: 'running', jobs: [...jobs, ...currentJobs] }));
    jobs.push(...databaseJobs);
    const completedAt = new Date().toISOString();
    const failed = jobs.filter(job => job.status === 'failed');
    await writeAutomation({ status: failed.length ? 'partial' : 'complete', lastFinishedAt: completedAt, ...(!failed.length ? { lastSuccessfulAt: completedAt } : {}), lastError: failed.length ? failed.map(job => `${job.name}: ${job.error}`).join('; ') : null, jobs });
    if (failed.length) process.exitCode = 1;
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
