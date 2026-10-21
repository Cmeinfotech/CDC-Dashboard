import test from 'node:test';
import assert from 'node:assert/strict';
import { compareProducts } from '../services/amazonMonitorCore.mjs';
import { isTrackingChange, isPreservedChange, preservedChangeDate, trackingDateInRange, reversalDate, trackingChangeLabel, trackingQueueValues, trackingValue } from '../services/amazonTrackingChanges.mjs';
import fs from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('date filters include local day boundaries and use reversal dates independently of detection', () => {
  const match = (date, from, to) => trackingDateInRange(date, from, to, 'Asia/Kolkata');
  assert.equal(match('2026-10-19T09:01:27Z', '2026-09-01','2026-09-30'), false);
  assert.equal(match('2026-10-19T09:01:27Z', '2026-10-19','2026-10-19'), true);
  assert.equal(match('2026-10-18T19:00:00Z', '2026-10-19','2026-10-19'), true);
  assert.equal(match('2026-10-19T19:00:00Z', '2026-10-19','2026-10-19'), false);
  assert.equal(match('2026-10-19T09:01:27Z', '2026-10-21','2026-10-19'), false);
  assert.equal(match('2026-10-19T09:01:27Z', '',''), true);
  const c = { detectedAt:'2026-10-19T09:01:27Z', audit:[{action:'Reversed',at:'2026-10-21T05:00:00Z'}] };
  assert.equal(match(reversalDate(c),'2026-10-21','2026-10-21'), true);
  assert.equal(match(c.detectedAt,'2026-10-21','2026-10-21'), false);
});

test('preserved history retains reversed merges after active link is cleared', () => {
  const change = { kind: 'family', status: 'Reversed', linkedAt: null, detectedAt: '2026-10-19T00:00:00Z', audit: [
    { action: 'Merged', at: '2026-10-20T00:00:00Z' },
    { action: 'Reversed', at: '2026-10-21T00:00:00Z' },
  ] };
  assert.equal(isPreservedChange(change), true);
  assert.equal(preservedChangeDate(change), '2026-10-21T00:00:00Z');
  assert.equal(isPreservedChange({ kind: 'family', status: 'Unreviewed' }), false);
  assert.equal(isPreservedChange({ kind: 'asin', status: 'Linked', linkedAt: '2026-10-20T00:00:00Z' }), true);
});

test('tracking screen renders a parent move instead of the empty replacement message', async () => {
  let source = await fs.readFile(new URL('../components/AmazonTracking.tsx', import.meta.url), 'utf8');
  source = source.replace("import AmazonProductCatalog from './AmazonProductCatalog';", 'const AmazonProductCatalog = () => null;');
  source = source.replace("import ProductThumbnail from './ProductThumbnail';", 'const ProductThumbnail = () => null;');
  source = source.replace("import TrackingDateRange from './TrackingDateRange';", 'const TrackingDateRange = () => null;');
  source = "import React from 'react';\n" + source;
  source = source.replace(/from '([^']+)'/g, (_, specifier) => `from '${specifier.startsWith('../services/') ? new URL(specifier, new URL('../components/', import.meta.url)).href : import.meta.resolve(specifier)}'`);
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  try {
    const { default: Component } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
    const change = { id: 'move', detectedAt: '2026-10-19T09:01:27Z', sku: 'child-sku', asin: 'CHILD', title: 'Child listing', kind: 'family', field: 'parentAsins', previous: ['OLD-PARENT'], current: ['NEW-PARENT'], status: 'Unreviewed' };
    const html = renderToStaticMarkup(React.createElement(Component, { data: { run: null, changes: [change], history: [{ baseline: false }] }, reload: async () => {} }));
    for (const expected of ['Parent ASIN changed', 'OLD-PARENT', 'NEW-PARENT', 'CHILD']) assert.ok(html.includes(expected), expected);
    assert.ok(!html.includes('No ASIN replacements or parent/child changes'));
    assert.ok(html.includes('<button class="tracking-primary">Merge shown histories</button>'));
  } catch (error) { throw Error(error.message); }
});

test('tracking includes detected parent moves and child membership changes even without ASIN replacements', () => {
  const child = { sku: 'child', asin: 'CHILD', title: 'Child', listing: {}, attributes: {}, images: [], detailsAvailable: true, parentAsins: ['OLD'], childAsins: [] };
  const parent = { ...child, sku: 'parent', asin: 'OLD', parentAsins: [], childAsins: ['CHILD', 'UNCHANGED'] };
  const run = products => ({ complete: true, marketplaceId: 'US', products });
  const changes = compareProducts(run([child, parent]), run([{ ...child, parentAsins: ['NEW'] }, { ...parent, childAsins: ['UNCHANGED'] }]), { runId: 'next', previousRunId: 'old', detectedAt: '2026-10-20T00:00:00Z' });
  const visible = changes.filter(isTrackingChange);
  assert.equal(visible.length, 2);
  assert.equal(trackingChangeLabel(visible[0]), 'Parent ASIN changed');
  assert.deepEqual(trackingQueueValues(visible[0]), ['OLD', 'NEW']);
  assert.equal(trackingChangeLabel(visible[1]), 'Child ASINs changed');
  assert.deepEqual(trackingQueueValues(visible[1]), ['CHILD', 'None returned']);
  assert.equal(trackingValue(visible[1].previous), 'CHILD, UNCHANGED');
});

test('replacement history stays distinct from family, listing and attribute events', () => {
  assert.equal(isTrackingChange({ kind: 'asin' }), true);
  for (const kind of ['attribute', 'listing', 'coverage', 'added', 'missing']) assert.equal(isTrackingChange({ kind }), false);
  assert.deepEqual(trackingQueueValues({ kind: 'asin', previous: 'OLD', current: 'NEW' }), ['OLD', 'NEW']);
  assert.deepEqual(trackingQueueValues({ kind: 'family', field: 'childAsins', previous: ['KEEP', 'OUT'], current: ['KEEP', 'IN'] }), ['OUT', 'IN']);
});
