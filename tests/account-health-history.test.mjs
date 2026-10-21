import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveHealthSnapshot, healthTrendRows } from '../services/accountHealthHistory.mjs';
test('weekly history uses the latest real snapshot and leaves missing-week changes unavailable', async () => {
  const previous = { root: process.env.AMAZON_MONITOR_DATA_DIR, key: process.env.AMAZON_DATA_KEY };
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cdc-health-history-'));
  process.env.AMAZON_MONITOR_DATA_DIR = folder; process.env.AMAZON_DATA_KEY = 'ab'.repeat(32);
  try {
    const make = (id, capturedAt, score, rate) => ({ reportId: id, capturedAt, marketplaceId: 'US', performanceMetrics: [{ marketplaceId: 'US', metrics: [{ category: 'accountHealthRating', value: { ahrScore: score } }, { category: 'orderDefectRate', value: { afn: { rate }, mfn: { rate: 0 } } }] }] });
    for (const data of [make('1', '2026-09-22T00:00:00Z', 200, 0), make('2', '2026-09-29T00:00:00Z', 220, .01), make('3', '2026-09-30T00:00:00Z', 230, .02), make('4', '2026-10-14T00:00:00Z', 240, .01)]) await saveHealthSnapshot(data);
    const rows = await healthTrendRows({ marketplaceId: 'US' });
    assert.equal(rows.length, 3); assert.equal(rows[1]['AHR score'], 230);
    assert.equal(rows[1]['AHR change vs previous week'], 30); assert.equal(rows[1]['ODR FBA change (percentage points)'], 2);
    assert.equal(rows[2]['AHR change vs previous week'], ''); assert.equal(rows[2]['ODR FBA change (percentage points)'], '');
  } finally {
    for (const [name, value] of [['AMAZON_MONITOR_DATA_DIR', previous.root], ['AMAZON_DATA_KEY', previous.key]]) if (value === undefined) delete process.env[name]; else process.env[name] = value;
    // Delete only this explicitly created test fixture directory.
    assert.ok(path.resolve(folder).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(folder, { recursive: true, force: true });
  }
});
