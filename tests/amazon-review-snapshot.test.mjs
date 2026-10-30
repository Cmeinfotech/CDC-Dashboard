import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseAmazonReviewSnapshot, getAmazonReviewSnapshot } from '../services/amazonReviewSnapshot.mjs';
import { atomicJson } from '../services/amazonMonitorStore.mjs';

const asin = 'B0BLW69PFD';
const page = (selected = asin, canonical = asin, count = '(1,234)') => `<link rel="canonical" href="https://www.amazon.com/example/dp/${canonical}"><input type="hidden" id="ASIN" value="${selected}"><span id="acrPopover" title="4.4 out of 5 stars"></span><span id="acrCustomerReviewText">${count}</span>`;

test('Amazon rating and grouped count are parsed from the matched listing', () => {
  const result = parseAmazonReviewSnapshot(page(), asin);
  assert.equal(result.rating, 4.4);
  assert.equal(result.reviewCount, 1234);
  assert.equal(result.countType, 'ratings');
  assert.equal(result.scope, 'listing');
});

test('a parent listing displaying its child identifies the shared family total', () => {
  const result = parseAmazonReviewSnapshot(page('B06X9FZSM1'), asin);
  assert.equal(result.scope, 'listing-family');
  assert.equal(result.displayedAsin, 'B06X9FZSM1');
});

test('unrelated products, bot checks and missing counts never produce invented values', () => {
  assert.throws(() => parseAmazonReviewSnapshot(page('B000000000', 'B000000000'), asin), /different product/);
  assert.throws(() => parseAmazonReviewSnapshot(`Robot Check ${page()}`, asin), /public product page/);
  assert.throws(() => parseAmazonReviewSnapshot(page(asin, asin, ''), asin), /readable/);
});

test('concurrent requests share one fetch; saved ratings survive a temporary failure', async () => {
  const previousKey = process.env.AMAZON_DATA_KEY;
  process.env.AMAZON_DATA_KEY = 'ab'.repeat(32);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cdc-review-'));
  try {
    let calls = 0;
    const options = { root, fetchImpl: async () => { calls++; return new Response(page()); } };
    const results = await Promise.all([getAmazonReviewSnapshot(asin, options), getAmazonReviewSnapshot(asin, options)]);
    assert.equal(calls, 1);
    assert.equal(results[0].current.reviewCount, 1234);
    assert.deepEqual(results[0].history, []);
    const cached = await getAmazonReviewSnapshot(asin, { root, fetchImpl: async () => assert.fail('fresh cache must not refetch') });
    assert.equal(cached.cached, true);
    await atomicJson(path.join(root, 'review-provider-amazon', `${asin}.json`), { ...cached, fetchedAt: '2000-01-01T00:00:00Z' });
    const stale = await getAmazonReviewSnapshot(asin, { root, fetchImpl: async () => { throw Error('offline'); } });
    assert.equal(stale.stale, true);
    assert.equal(stale.current.rating, 4.4);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    if (previousKey === undefined) delete process.env.AMAZON_DATA_KEY; else process.env.AMAZON_DATA_KEY = previousKey;
  }
});
