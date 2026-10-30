import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireLock, atomicJson, readJson } from '../services/amazonMonitorStore.mjs';
import { loadAmazonSyncStatus } from '../services/amazonSyncStatus.mjs';
import { runPullJobs } from '../services/amazonSyncRunner.mjs';

test('damaged automation cannot hide a committed catalog timestamp', async () => {
  const oldKey = process.env.AMAZON_DATA_KEY;
  process.env.AMAZON_DATA_KEY = 'ab'.repeat(32);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cdc-status-'));
  try {
    const capturedAt = new Date().toISOString();
    await atomicJson(path.join(root, 'latest.json'), { id: 'run-1', capturedAt });
    await atomicJson(path.join(root, 'runs', 'run-1.summary.json'), { capturedAt });
    await fs.writeFile(path.join(root, 'automation.json'), Buffer.alloc(1500));
    const state = await loadAmazonSyncStatus(root);
    assert.equal(state.completedAt, capturedAt);
    assert.equal(state.capturedAt, capturedAt);
    assert(state.statusWarning);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    if (oldKey === undefined) delete process.env.AMAZON_DATA_KEY; else process.env.AMAZON_DATA_KEY = oldKey;
  }
});

test('status backups recover zero-filled files and the next durable write heals them', async () => {
  const oldKey = process.env.AMAZON_DATA_KEY;
  process.env.AMAZON_DATA_KEY = 'ab'.repeat(32);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cdc-recovery-'));
  try {
    const file = path.join(root, 'automation.json');
    await atomicJson(file, { status: 'complete', generation: 1 });
    await atomicJson(file, { status: 'running', generation: 2 });
    await fs.writeFile(file, Buffer.alloc(1500));
    assert.equal((await readJson(file)).generation, 1);
    await atomicJson(file, { status: 'complete', generation: 3 });
    assert.equal((await readJson(file)).generation, 3);
    assert.equal((await loadAmazonSyncStatus(root)).statusWarning, null);
    // Snapshot corruption never gets silently accepted as valid data.
    const snapshot = path.join(root, 'snapshot.json');
    await fs.writeFile(snapshot, Buffer.alloc(10));
    await assert.rejects(readJson(snapshot));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    if (oldKey === undefined) delete process.env.AMAZON_DATA_KEY; else process.env.AMAZON_DATA_KEY = oldKey;
  }
});

test('pull jobs start concurrently and an API failure does not block the others', async () => {
  const started = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const operation = runPullJobs([['Catalog', 'catalog'], ['Inventory', 'inventory'], ['Orders', 'orders']], async script => {
    started.push(script);
    await gate;
    if (script === 'catalog') throw Error('temporary API outage');
  }, async () => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ['catalog', 'inventory', 'orders']);
  release();
  const jobs = await operation;
  assert.deepEqual(jobs.map(job => job.status), ['failed', 'complete', 'complete']);
});

test('a crashed zero-filled lock recovers without removing a fresh or live lock', async () => {
  const oldRoot = process.env.AMAZON_MONITOR_DATA_DIR;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cdc-lock-recovery-'));
  process.env.AMAZON_MONITOR_DATA_DIR = root;
  try {
    const file = path.join(root, 'automatic-sync.lock');
    await fs.writeFile(file, Buffer.alloc(100));
    await assert.rejects(acquireLock('automatic-sync'), /initialized/);
    const staleAt = new Date(Date.now() - 120_000);
    await fs.utimes(file, staleAt, staleAt);
    const release = await acquireLock('automatic-sync');
    try {
      assert.equal((await readJson(file)).pid, process.pid);
      await assert.rejects(acquireLock('automatic-sync'), /Another Amazon/);
    } finally { await release(); }
    await assert.rejects(fs.stat(file), { code: 'ENOENT' });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    if (oldRoot === undefined) delete process.env.AMAZON_MONITOR_DATA_DIR; else process.env.AMAZON_MONITOR_DATA_DIR = oldRoot;
  }
});
