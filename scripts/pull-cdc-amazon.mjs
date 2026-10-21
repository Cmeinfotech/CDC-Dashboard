import './legacy-amazon-disabled.mjs';
import fs from 'node:fs';
import { parseEnv } from 'node:util';
import { gunzipSync } from 'node:zlib';
import XLSX from 'xlsx';

const env = parseEnv(fs.readFileSync('.env', 'utf8'));
const folder = 'outputs/amazon-cdc';
fs.mkdirSync(folder, { recursive: true });
const save = (name, value) => fs.writeFileSync(`${folder}/${name}.json`, JSON.stringify(value, null, 2));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let token, expiry = 0;
async function request(path, init = {}) {
  for (let attempt = 0; attempt < 8; attempt++) {
    if (!token || Date.now() > expiry) {
      const response = await fetch('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env.AMAZON_LWA_CLIENT_ID, client_secret: env.AMAZON_LWA_CLIENT_SECRET, refresh_token: env.AMAZON_LWA_REFRESH_TOKEN }), signal: AbortSignal.timeout(30000) });
      const body = await response.json();
      if (!response.ok) throw Error(`Authentication failed (${response.status})`);
      token = body.access_token; expiry = Date.now() + (body.expires_in - 60) * 1000;
    }
    const response = await fetch(`https://sellingpartnerapi-na.amazon.com${path}`, { ...init, headers: { 'x-amz-access-token': token, 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (response.status === 429 || response.status >= 500) { await pause(Math.min(60000, 3000 * 2 ** attempt)); continue; }
    const body = await response.json();
    if (!response.ok) throw Error(`${response.status}: ${body.errors?.map(x => x.message).join('; ') || 'Request failed'}`);
    return body;
  }
  throw Error('Retry limit reached');
}
const progress = { startedAt: new Date().toISOString(), marketplace: 'ATVPDKIKX0DER', period: { start: '2026-07-09', end: '2026-10-06' }, inventory: { status: 'running', count: 0 }, catalog: { status: 'generating' }, orderReport: { status: 'generating' }, business: { status: 'denied', error: '403: Sales and traffic report access denied' } };
const update = () => save('pull-status', progress);
async function inventory() {
  const rows = []; let next;
  try {
    do {
      const params = new URLSearchParams({ granularityType: 'Marketplace', granularityId: 'ATVPDKIKX0DER', marketplaceIds: 'ATVPDKIKX0DER', details: 'true' });
      if (next) params.set('nextToken', next);
      const body = await request('/fba/inventory/v1/summaries?' + params);
      rows.push(...(body.payload?.inventorySummaries || [])); next = body.pagination?.nextToken;
      save('inventory', { payload: { inventorySummaries: rows }, pagination: next ? { nextToken: next } : {} });
      progress.inventory.count = rows.length; update();
      if (rows.length % 500 === 0 || !next) console.log(`Inventory: ${rows.length} records${next ? ' (pulling)' : ' (complete)'}`);
      if (next) await pause(550);
    } while (next);
    progress.inventory.status = 'complete';
  } catch (error) { progress.inventory.status = 'failed'; progress.inventory.error = error.message; }
  update();
}
async function report(key, type, name, suppliedId) {
  try {
    const reportId = suppliedId || JSON.parse(fs.readFileSync(`${folder}/${type}-request.json`, 'utf8')).reportId;
    let status;
    do {
      status = await request('/reports/2021-06-30/reports/' + reportId);
      progress[key].status = status.processingStatus; update();
      if (['FATAL', 'CANCELLED'].includes(status.processingStatus)) throw Error(`Report ${status.processingStatus}`);
      if (status.processingStatus !== 'DONE') await pause(20000);
    } while (status.processingStatus !== 'DONE');
    const doc = await request('/reports/2021-06-30/documents/' + status.reportDocumentId);
    const response = await fetch(doc.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw Error(`Download failed (${response.status})`);
    let buffer = Buffer.from(await response.arrayBuffer());
    if (doc.compressionAlgorithm === 'GZIP') buffer = gunzipSync(buffer);
    if (!buffer.toString('utf8').includes('\t')) throw Error('Amazon returned a report message: ' + buffer.toString('utf8').slice(0, 200));
    fs.writeFileSync(`${folder}/${name}.tsv`, buffer);
    const workbook = XLSX.read(buffer.toString('utf8').replace(/^\uFEFF/, ''), { type: 'string', raw: true, FS: '\t' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    save(name, { reportType: type, start: status.dataStartTime, end: status.dataEndTime, rows });
    progress[key] = { status: 'complete', count: rows.length, columns: Object.keys(rows[0] || {}), start: status.dataStartTime, end: status.dataEndTime };
    console.log(`${name}: ${rows.length} records (complete)`);
  } catch (error) { progress[key].status = 'failed'; progress[key].error = error.message; console.log(`${name}: ${error.message}`); }
  update();
}
update();
async function orderReports() {
  const ranges = [['2026-07-09', '2026-08-07'], ['2026-08-08', '2026-09-06'], ['2026-09-07', '2026-10-06']];
  const combined = [];
  for (let index = 0; index < ranges.length; index++) {
    const [start, end] = ranges[index];
    const key = `ordersPart${index + 1}`;
    progress[key] = { status: 'generating', start, end }; update();
    try {
      const name = `order-report-part-${index + 1}`;
      const result = await request('/reports/2021-06-30/reports', { method: 'POST', body: JSON.stringify({ reportType: 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', marketplaceIds: ['ATVPDKIKX0DER'], dataStartTime: start + 'T00:00:00Z', dataEndTime: end + 'T23:59:59Z' }) });
      await report(key, 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', name, result.reportId);
      if (progress[key].status !== 'complete') throw Error(progress[key].error);
      combined.push(...JSON.parse(fs.readFileSync(`${folder}/${name}.json`, 'utf8')).rows);
      save('order-report', { start: ranges[0][0], end: ranges[2][1], rows: combined });
      progress.orderReport = { status: index === 2 ? 'complete' : 'running', count: combined.length, columns: Object.keys(combined[0] || {}) }; update();
    } catch (error) { progress.orderReport.status = 'failed'; progress.orderReport.error = error.message; update(); return; }
  }
}
await Promise.all([inventory(), report('catalog', 'GET_MERCHANT_LISTINGS_ALL_DATA', 'catalog'), orderReports()]);
progress.finishedAt = new Date().toISOString(); update();
console.log(JSON.stringify(progress));
