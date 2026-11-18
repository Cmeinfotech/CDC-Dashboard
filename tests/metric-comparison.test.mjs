import test from 'node:test';
import assert from 'node:assert/strict';
import { metricComparison } from '../services/metricComparison.mjs';
test('paired bars compare each metric on its own scale', () => {
  const data = metricComparison({ label: 'Orders', current: 75, previous: 100 });
  assert.equal(data.currentWidth, 75); assert.equal(data.previousWidth, 100); assert.equal(data.change, -25);
});
test('missing periods never become zero bars and zero baselines have no percentage change', () => {
  const missing = metricComparison({ label: 'Fees', current: 'Unavailable', previous: 25 });
  assert.equal(missing.currentWidth, null); assert.equal(missing.change, null);
  const zero = metricComparison({ label: 'Orders', current: 0, previous: 0 });
  assert.equal(zero.currentWidth, 0); assert.equal(zero.change, null);
});
test('profit margin shows percentage-point changes using the original ratios', () => {
  const data = metricComparison({ label: 'Provisional Profit Margin', current: 0.9524, previous: 0.9511 });
  assert.ok(Math.abs(data.change - 0.13) < 1e-10);
  assert.equal(data.margin, true);
});
