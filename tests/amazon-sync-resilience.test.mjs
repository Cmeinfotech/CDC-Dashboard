import test from 'node:test';
import assert from 'node:assert/strict';
import { amazonFetch } from '../services/amazonTransport.mjs';

test('temporary read timeouts recover without abandoning the catalog pull', async () => {
  let calls = 0;
  const delays = [];
  const response = await amazonFetch('https://amazon.test/items', {}, {
    fetchImpl: async () => {
      if (++calls < 3) throw new DOMException('timed out', 'TimeoutError');
      return new Response('recovered');
    },
    sleep: async delay => delays.push(delay),
  });
  assert.equal(await response.text(), 'recovered');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test('network failures have a bounded retry count', async () => {
  let calls = 0;
  await assert.rejects(amazonFetch('https://amazon.test/items', {}, {
    fetchImpl: async () => { calls++; throw new TypeError('fetch failed'); },
    sleep: async () => {},
  }), /fetch failed/);
  assert.equal(calls, 4);
});

test('ambiguous report creation failures are never repeated', async () => {
  let calls = 0;
  await assert.rejects(amazonFetch('https://amazon.test/reports', { method: 'POST' }, {
    fetchImpl: async () => { calls++; throw new TypeError('fetch failed'); },
    sleep: async () => assert.fail('POST must not retry'),
  }), /fetch failed/);
  assert.equal(calls, 1);
});

test('caller cancellation is not retried', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(amazonFetch('https://amazon.test/items', { signal: controller.signal }, {
    fetchImpl: async () => { calls++; throw new DOMException('cancelled', 'AbortError'); },
    sleep: async () => assert.fail('cancelled reads must not retry'),
  }), /cancelled/);
  assert.equal(calls, 1);
});
