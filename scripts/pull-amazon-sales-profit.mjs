import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { acquireLock, atomicJson, monitorRoot } from '../services/amazonMonitorStore.mjs';
for (const [key, value] of Object.entries(parseEnv(await fs.readFile('.env', 'utf8').catch(() => '')))) if (process.env[key] == null) process.env[key] = value;
const release = await acquireLock('sales-profit');
const file = path.join(monitorRoot(), 'sales-profit-progress.json');
const args = process.argv.slice(2);
const jobs = [
  { name: 'Orders', script: 'pull-amazon-orders-history.mjs', args },
  { name: 'Financial transactions', script: 'pull-amazon-sales-profit-finances.mjs', args },
  { name: 'FBA stock', script: 'pull-amazon-inventory.mjs', args: [] },
  { name: 'Catalog and listings', script: 'amazon-monitor.mjs', args: [] },
];
let saveQueue = Promise.resolve();
const save = () => { saveQueue = saveQueue.then(() => atomicJson(file, { status: jobs.some(job => job.status === 'running') ? 'running' : jobs.some(job => job.status === 'failed') ? 'failed' : 'complete', jobs, updatedAt: new Date().toISOString() })); return saveQueue; };
try {
  for (const job of jobs) job.status = 'running';
  await save();
  await Promise.all(jobs.map(async job => {
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(process.cwd(), 'scripts', job.script), ...job.args], { cwd: process.cwd(), env: process.env, windowsHide: true, stdio: 'ignore' });
        child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Error(`Amazon ${job.name} pull failed (exit ${code}). Check its saved progress and Amazon permissions.`)));
      });
      job.status = 'complete';
    } catch (error) { job.status = 'failed'; job.error = error.message; }
    await save();
  }));
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(process.cwd(),'scripts','prepare-sales-profit-testing.mjs')],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Testing snapshot refresh failed.')));});
  await save();
  if (jobs.some(job => job.status === 'failed')) process.exitCode = 1;
} finally { await release(); }

