import { amazonFetch, amazonEndpoint, amazonUrl, reportDownloadUrl } from '../services/amazonTransport.mjs';
import { boundedBytes } from '../services/boundedBody.mjs';
import { assertAmazonStorage, purgeExpiredAmazonData } from '../services/amazonDataSecurity.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import XLSX from 'xlsx';
import { productRecords, compareProducts } from '../services/amazonMonitorCore.mjs';
import { monitorRoot, readJson, atomicJson, acquireLock, commitRun } from '../services/amazonMonitorStore.mjs';

const envFile = await fs.readFile('.env', 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
const config = { ...parseEnv(envFile), ...process.env };
if (config.AMAZON_MONITOR_DATA_DIR) process.env.AMAZON_MONITOR_DATA_DIR = config.AMAZON_MONITOR_DATA_DIR;
const region = config.AMAZON_SP_API_REGION; const marketplace = config.AMAZON_MARKETPLACE_ID;
const endpoints = { na: 'https://sellingpartnerapi-na.amazon.com', eu: 'https://sellingpartnerapi-eu.amazon.com', fe: 'https://sellingpartnerapi-fe.amazon.com' };
if (!endpoints[region] || !marketplace) throw Error('Set Amazon region and marketplace before monitoring.');
if (config.AMAZON_DATA_KEY) process.env.AMAZON_DATA_KEY = config.AMAZON_DATA_KEY;
if (config.AMAZON_ACCESS_REVOKED) process.env.AMAZON_ACCESS_REVOKED = config.AMAZON_ACCESS_REVOKED;
if (config.AMAZON_DATA_RETENTION_DAYS) process.env.AMAZON_DATA_RETENTION_DAYS = config.AMAZON_DATA_RETENTION_DAYS;
assertAmazonStorage();
const root = monitorRoot(); const sourceFolder = path.join(process.cwd(), 'outputs', 'amazon-cdc');
const release = await acquireLock('sync'); const runId = randomUUID(); const startedAt = new Date().toISOString();
let progress = { runId, startedAt, stage: 'starting', status: 'running', completedAsins: 0, totalAsins: 0, marketplaceId: marketplace };
const update = async patch => { progress = { ...progress, ...patch, updatedAt: new Date().toISOString() }; await atomicJson(path.join(root, 'progress.json'), progress); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let token, expiry = 0;
async function api(resource, init = {}) {
  if (!token || Date.now() >= expiry) {
    const response = await amazonFetch('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: config.AMAZON_LWA_CLIENT_ID || '', client_secret: config.AMAZON_LWA_CLIENT_SECRET || '', refresh_token: config.AMAZON_LWA_REFRESH_TOKEN || '' }) });
    const body = await response.json(); if (!response.ok || !body.access_token) throw Error('Amazon authentication failed.');
    token = body.access_token; expiry = Date.now() + (Number(body.expires_in) - 60) * 1000;
  }
  const response = await amazonFetch(amazonUrl(resource, amazonEndpoint(region)), { ...init, headers: { 'x-amz-access-token': token, 'content-type': 'application/json', 'user-agent': 'CDC-Sales-Dashboard/1.0 (Language=JavaScript)' } });
  if (!response.ok) throw Error('Amazon request failed (' + response.status + '); previous baseline preserved.');
  return response.json();
}
async function currentListings() {
  await update({ stage: 'requesting listings report' });
  const created = await api('/reports/2021-06-30/reports', { method: 'POST', body: JSON.stringify({ reportType: 'GET_MERCHANT_LISTINGS_ALL_DATA', marketplaceIds: [marketplace] }) });
  const deadline = Date.now() + 60 * 60 * 1000;
  let report;
  do {
    report = await api('/reports/2021-06-30/reports/' + encodeURIComponent(created.reportId));
    await update({ stage: `listings report: ${report.processingStatus}` });
    if (['FATAL', 'CANCELLED'].includes(report.processingStatus)) throw Error(`Listings report ${report.processingStatus}; baseline preserved.`);
    if (Date.now() > deadline) throw Error('Listings report timed out; baseline preserved.');
    if (report.processingStatus !== 'DONE') await pause(20000);
  } while (report.processingStatus !== 'DONE');
  const doc = await api('/reports/2021-06-30/documents/' + encodeURIComponent(report.reportDocumentId));
  const response = await fetch(reportDownloadUrl(doc.url), { redirect: 'error', signal: AbortSignal.timeout(120000) }); if (!response.ok) throw Error(`Report download failed (${response.status})`);
  let buffer = Buffer.from(await boundedBytes(response, 64 * 1024 * 1024)); if (doc.compressionAlgorithm === 'GZIP') buffer = gunzipSync(buffer, { maxOutputLength: 128 * 1024 * 1024 });
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (!text.includes('seller-sku') || !text.includes('\t')) throw Error('Amazon returned a report message, not a usable listings report.');
  const workbook = XLSX.read(text, { type: 'string', raw: true, FS: '\t' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
  return { rows, marketplaceId: marketplace, pulledAt: new Date().toISOString(), reportId: report.reportId };
}
try {
  await update({ stage: 'checking data retention' });
  await purgeExpiredAmazonData(root);
  await purgeExpiredAmazonData(sourceFolder);
  await update({});
  const latest = await readJson(path.join(root, 'latest.json'));
  const previous = latest ? await readJson(path.join(root, 'runs', `${latest.id}.json`)) : null;
  if (previous && previous.marketplaceId !== marketplace) throw Error('Configured marketplace differs from stored CDC monitoring baseline.');
  let catalog, detailItems, unavailableDetails, source;
  if (process.argv.includes('--bootstrap')) {
    if (previous) throw Error('Baseline already exists; use a live sync instead of bootstrapping again.');
    catalog = await readJson(path.join(sourceFolder, 'catalog.json'));
    const full = await readJson(path.join(sourceFolder, 'catalog-full-details.json'));
    if (!catalog?.rows || !full?.complete || full.marketplaceId !== marketplace) throw Error('A complete saved CDC catalog pull is required to bootstrap.');
    detailItems = full.items; unavailableDetails = full.missing; source = 'saved Amazon API baseline';
  } else {
    catalog = await currentListings();
    const ids = [...new Set(catalog.rows.map(row => row.asin1).filter(Boolean))];
    if (!ids.length && previous?.products.length) throw Error('Empty report needs manual investigation; previous baseline preserved.');
    detailItems = []; unavailableDetails = []; source = 'live Amazon API';
    await update({ stage: 'pulling product details', totalAsins: ids.length });
    for (let offset = 0; offset < ids.length; offset += 20) {
      const batch = ids.slice(offset, offset + 20); let next; const returned = new Set();
      do {
        const query = new URLSearchParams({ marketplaceIds: marketplace, identifiers: batch.join(','), identifiersType: 'ASIN', includedData: 'attributes,classifications,dimensions,identifiers,images,productTypes,relationships,salesRanks,summaries', pageSize: '20' });
        if (next) query.set('pageToken', next);
        const body = await api('/catalog/2022-04-01/items?' + query);
        for (const item of body.items || []) { detailItems.push(item); returned.add(item.asin); }
        next = body.pagination?.nextToken; await pause(550);
      } while (next);
      unavailableDetails.push(...batch.filter(asin => !returned.has(asin)));
      if (offset % 200 === 0 || offset + 20 >= ids.length) await update({ completedAsins: Math.min(offset + 20, ids.length) });
    }
  }
  const capturedAt = new Date().toISOString();
  const run = { id: runId, complete: true, marketplaceId: marketplace, startedAt, capturedAt, source,
    sourceCapturedAt: catalog.pulledAt || catalog.start || null, products: productRecords(catalog.rows, detailItems, marketplace), unavailableDetails, baseline: !previous, changes: [] };
  await update({ stage: 'comparing product data' });
  if (previous) run.changes = compareProducts(previous, run, { runId, detectedAt: capturedAt, previousRunId: previous.id });
  await commitRun(run);
  if (!process.argv.includes('--bootstrap')) {
    // Compatibility viewer files are updated only after the complete run is committed.
    await atomicJson(path.join(sourceFolder, 'catalog.json'), catalog);
    await atomicJson(path.join(sourceFolder, 'catalog-full-details.json'), { complete: true, marketplaceId: marketplace, requested: detailItems.length + unavailableDetails.length, count: detailItems.length, missing: unavailableDetails, pulledAt: capturedAt, items: detailItems });
  }
  await update({ status: 'complete', stage: 'complete', completedAt: capturedAt, productCount: run.products.length, changeCount: run.changes.length, baseline: run.baseline });
  console.log(JSON.stringify({ runId, status: 'complete', productCount: run.products.length, changeCount: run.changes.length, baseline: run.baseline }));
} catch (error) {
  await update({ status: 'failed', stage: 'failed', error: error.message, failedAt: new Date().toISOString() }); console.error(error.message); process.exitCode = 1;
} finally { await release(); }
