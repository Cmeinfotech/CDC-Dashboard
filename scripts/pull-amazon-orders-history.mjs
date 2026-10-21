import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { gunzipSync } from 'node:zlib';
import XLSX from 'xlsx';
import { amazonEndpoint, amazonFetch, amazonUrl, reportDownloadUrl } from '../services/amazonTransport.mjs';
import { assertAmazonStorage, minimizeAmazonData, readAmazonJson } from '../services/amazonDataSecurity.mjs';
import { atomicJson, acquireLock } from '../services/amazonMonitorStore.mjs';
import { boundedBytes } from '../services/boundedBody.mjs';

const env = { ...parseEnv(await fs.readFile('.env', 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error))), ...process.env };
for (const key of ['AMAZON_DATA_KEY', 'AMAZON_ACCESS_REVOKED', 'AMAZON_DATA_RETENTION_DAYS']) if (env[key]) process.env[key] = env[key];
assertAmazonStorage();
const marketplaceId = env.AMAZON_MARKETPLACE_ID;
const endpoint = amazonEndpoint(env.AMAZON_SP_API_REGION, env.AMAZON_SP_API_ENDPOINT);
if (!marketplaceId) throw Error('AMAZON_MARKETPLACE_ID is required.');

const mode = process.argv.includes('--history') ? 'history' : 'incremental';
const output = path.join(process.cwd(), 'outputs', 'amazon-cdc');
const statusFile = path.join(output, 'order-history-status.json');
const combinedFile = path.join(output, 'order-report.json');
const release = await acquireLock('orders-history');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let token, tokenExpiresAt = 0;

function iso(date) { return date.toISOString(); }
function dateOnly(date) { return date.toISOString().slice(0, 10); }
function chunkRanges(start, end) {
  const ranges = [];
  for (let cursor = new Date(start); cursor <= end;) {
    const last = new Date(Math.min(cursor.getTime() + 30 * 86400000 - 1, end.getTime()));
    ranges.push({ start: iso(cursor), end: iso(last), label: `${dateOnly(cursor)} to ${dateOnly(last)}` });
    cursor = new Date(last.getTime() + 1);
  }
  return ranges;
}
async function api(resource, init = {}) {
  if (!token || Date.now() >= tokenExpiresAt) {
    const response = await amazonFetch('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env.AMAZON_LWA_CLIENT_ID || '', client_secret: env.AMAZON_LWA_CLIENT_SECRET || '', refresh_token: env.AMAZON_LWA_REFRESH_TOKEN || '' }) });
    const body = await response.json();
    if (!response.ok || !body.access_token) throw Error(`Amazon authentication failed (${response.status}).`);
    token = body.access_token; tokenExpiresAt = Date.now() + Math.max(60, Number(body.expires_in || 3600) - 60) * 1000;
  }
  const response = await amazonFetch(amazonUrl(resource, endpoint), { ...init, headers: { 'content-type': 'application/json', 'x-amz-access-token': token } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(`Amazon order-report request failed (${response.status}): ${(body.errors || []).map(error => error.code || error.message).join(', ') || 'Request failed'}`);
  return body;
}
async function reportRows(reportId) {
  const deadline = Date.now() + 30 * 60 * 1000;
  for (;;) {
    const report = await api(`/reports/2021-06-30/reports/${encodeURIComponent(reportId)}`);
    if (report.processingStatus === 'DONE') {
      const document = await api(`/reports/2021-06-30/documents/${encodeURIComponent(report.reportDocumentId)}`);
      const response = await fetch(reportDownloadUrl(document.url), { redirect: 'error', signal: AbortSignal.timeout(180000) });
      if (!response.ok) throw Error(`Amazon order-report download failed (${response.status}).`);
      let bytes = Buffer.from(await boundedBytes(response, 128 * 1024 * 1024));
      if (document.compressionAlgorithm === 'GZIP') bytes = gunzipSync(bytes, { maxOutputLength: 256 * 1024 * 1024 });
      const workbook = XLSX.read(bytes.toString('utf8').replace(/^\uFEFF/, ''), { type: 'string', raw: true, FS: '\t' });
      return minimizeAmazonData(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }));
    }
    if (['FATAL', 'CANCELLED'].includes(report.processingStatus)) throw Error(`Amazon order report ${report.processingStatus}.`);
    if (Date.now() >= deadline) throw Error(`Amazon order report is still ${report.processingStatus}; rerun resumes the saved report ID.`);
    await pause(20_000);
  }
}
function rowKey(row) {
  return [row['amazon-order-id'], row.sku, row.asin, row['item-status'], row['quantity-purchased']].map(value => String(value || '')).join('\u001f');
}
async function saveCombined(rows, range) {
  const existing = await readAmazonJson(combinedFile, { rows: [] });
  const merged = new Map((existing.rows || []).map(row => [rowKey(row), row]));
  for (const row of rows) merged.set(rowKey(row), row);
  const data = { marketplaceId, pulledAt: new Date().toISOString(), start: range.start, end: range.end, rows: [...merged.values()] };
  await atomicJson(combinedFile, data);
  return data.rows.length;
}
async function rebuildCombined(status) {
  const merged = new Map();
  for (let index = 0; index < status.ranges.length; index++) {
    const file = path.join(output, `order-report-${String(index + 1).padStart(2, '0')}.json`);
    const part = await readAmazonJson(file, null);
    if (!part?.rows) throw Error(`Saved order batch ${index + 1} is missing; history was not replaced.`);
    for (const row of part.rows) merged.set(rowKey(row), row);
  }
  const data = { marketplaceId, pulledAt: new Date().toISOString(), start: status.start, end: status.end, rows: [...merged.values()] };
  await atomicJson(combinedFile, data);
  return data.rows.length;
}
try {
  await fs.mkdir(output, { recursive: true });
  const now = new Date();
  const initialStart = mode === 'history' ? new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), now.getUTCDate())) : new Date(now.getTime() - 7 * 86400000);
  let status = await readAmazonJson(statusFile, null);
  if (!status || status.mode !== mode || status.marketplaceId !== marketplaceId) {
    status = { mode, marketplaceId, startedAt: new Date().toISOString(), start: iso(initialStart), end: iso(now), ranges: chunkRanges(initialStart, now), completed: 0, rows: 0, status: 'running' };
  }
  for (let index = status.completed; index < status.ranges.length; index++) {
    const range = status.ranges[index];
    const created = range.reportId ? { reportId: range.reportId } : await api('/reports/2021-06-30/reports', { method: 'POST', body: JSON.stringify({ reportType: 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', marketplaceIds: [marketplaceId], dataStartTime: range.start, dataEndTime: range.end }) });
    range.reportId = created.reportId;
    range.status = 'processing'; await atomicJson(statusFile, status);
    const rows = await reportRows(created.reportId);
    const part = path.join(output, `order-report-${String(index + 1).padStart(2, '0')}.json`);
    await atomicJson(part, { marketplaceId, pulledAt: new Date().toISOString(), reportId: created.reportId, ...range, rows });
    status.rows = await saveCombined(rows, range);
    status.completed = index + 1; range.status = 'complete'; range.count = rows.length; await atomicJson(statusFile, status);
    if (index + 1 < status.ranges.length) await pause(2_100);
  }
  if (mode === 'history') status.rows = await rebuildCombined(status);
  else status.rows = (await readAmazonJson(combinedFile, { rows: [] })).rows.length;
  status.status = 'complete'; status.completedAt = new Date().toISOString(); await atomicJson(statusFile, status);
  console.log(JSON.stringify({ status: 'complete', mode, ranges: status.ranges.length, rows: status.rows }));
} catch (error) {
  const existing = await readAmazonJson(statusFile, {}).catch(() => ({}));
  await atomicJson(statusFile, { ...existing, status: 'failed', error: error.message, failedAt: new Date().toISOString() }).catch(() => {});
  throw error;
} finally { await release(); }
