import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { unzipSync, strFromU8 } from 'fflate';
import { appendExportTable, flattenExport, writeAmazonAllWorkbook, inventoryExportRow } from '../services/amazonAllWorkbook.mjs';
import { accountHealthWorkbook } from '../services/accountHealthWorkbook.mjs';
test('CDC inventory export excludes BRA listing open-date column', () => {
  const product = { sku: 'SKU-1', asin: 'ASIN-1', attributes: { product_site_launch_date: '2000-01-01' } };
  assert.equal(Object.hasOwn(inventoryExportRow(product), 'Listing open-date'), false);
});
test('child listing ASIN is explicit and parent child collections keep their separate meaning', () => {
  const child = inventoryExportRow({ asin: 'CHILD', parentage: 'Child', parentAsins: ['PARENT'], childAsins: [] });
  assert.equal(child['Child ASIN'], 'CHILD'); assert.equal(child['Parent ASIN'], 'PARENT'); assert.equal(child['Child ASINs'], '');
  const parent = inventoryExportRow({ asin: 'PARENT', parentage: 'Parent', parentAsins: [], childAsins: ['CHILD'] });
  assert.equal(parent['Child ASINs'], 'CHILD'); assert.equal(parent['Child ASIN'], 'Not applicable (parent listing)');
});

test('export retains identifier text, sorts newest orders first, and writes strings without executable formulas', () => {
  const book = XLSX.utils.book_new();
  appendExportTable(book, 'Orders', [{ sku: '00123', 'purchase-date': '2026-10-01', title: '=HYPERLINK("evil")' }, { sku: '00234', 'purchase-date': '2026-10-13', amount: 12.5 }], ['sku', 'purchase-date']);
  const data = writeAmazonAllWorkbook(book);
  const result = XLSX.read(data, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(result.Sheets.Orders);
  assert.equal(rows[0].sku, '00234'); assert.equal(rows[1].sku, '00123'); assert.equal(rows[0].amount, 12.5);
  const formulaCell = Object.values(result.Sheets.Orders).find(cell => cell?.v === '=HYPERLINK("evil")');
  assert.equal(formulaCell.t, 's'); assert.equal(formulaCell.f, undefined);
  const files = unzipSync(data); const xml = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.match(xml, /state="frozen"/); assert.match(xml, /<autoFilter/); assert.match(xml, /customHeight="1"/);
  assert.match(strFromU8(files['xl/styles.xml']), /FF17365D/);
});
test('long nested values are preserved without Excel cell truncation', () => {
  const text = 'x'.repeat(70000); const row = flattenExport({ nested: { content: text }, amounts: [1, 2] });
  assert.equal(Object.entries(row).filter(([key]) => key.startsWith('nested.content')).map(([, value]) => value).join(''), text);
  assert.equal(row.amounts, '1\n2');
});
test('Account Health rates keep percentage formats and component counts in the complete workbook', () => {
  const data = { capturedAt: '2026-10-14', accountStatuses: [{ marketplaceId: 'US', status: 'NORMAL' }], performanceMetrics: [{ marketplaceId: 'US', metrics: [{ category: 'accountHealthRating', value: { ahrScore: 864, ahrStatus: 'GREAT' } }, { category: 'validTrackingRate', value: { rate: 0.98, targetValue: 0.95, shipmentCount: 100 } }] }] };
  const roundtrip = XLSX.read(writeAmazonAllWorkbook(accountHealthWorkbook(data)), { type: 'array', cellNF: true });
  assert.equal(roundtrip.Sheets.Metrics.D2.v, 0.98); assert.equal(roundtrip.Sheets.Metrics.D2.z, '0.00%');
  assert.equal(XLSX.utils.sheet_to_json(roundtrip.Sheets['Returned Details']).find(row => row.Field === 'shipmentCount').Value, 100);
});
