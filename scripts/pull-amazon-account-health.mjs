import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { amazonFetch, amazonEndpoint, amazonUrl, reportDownloadUrl } from '../services/amazonTransport.mjs';
import { boundedBytes } from '../services/boundedBody.mjs';
import { assertAmazonStorage } from '../services/amazonDataSecurity.mjs';
import { monitorRoot, atomicJson, readJson, acquireLock } from '../services/amazonMonitorStore.mjs';
import { saveHealthSnapshot } from '../services/accountHealthHistory.mjs';

const env = { ...parseEnv(await fs.readFile('.env', 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; })), ...process.env };
for (const name of ['AMAZON_DATA_KEY', 'AMAZON_MONITOR_DATA_DIR', 'AMAZON_ACCESS_REVOKED', 'AMAZON_DATA_RETENTION_DAYS']) if (env[name]) process.env[name] = env[name];
assertAmazonStorage();
const endpoint = amazonEndpoint(env.AMAZON_SP_API_REGION, env.AMAZON_SP_API_ENDPOINT);
const marketplaceId = env.AMAZON_MARKETPLACE_ID;
if (!marketplaceId) throw Error('AMAZON_MARKETPLACE_ID is required.');
const reportType = 'GET_V2_SELLER_PERFORMANCE_REPORT';
const root = monitorRoot();
const statusFile = path.join(root, 'account-health-progress.json');
const release = await acquireLock('account-health');
let token, expiry = 0;
async function api(resource, init = {}) {
  if (!token || Date.now() >= expiry) {
    const response = await amazonFetch('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env.AMAZON_LWA_CLIENT_ID || '', client_secret: env.AMAZON_LWA_CLIENT_SECRET || '', refresh_token: env.AMAZON_LWA_REFRESH_TOKEN || '' }) });
    const body = await response.json();
    if (!response.ok || !body.access_token) throw Error(`Amazon authentication failed (${response.status}).`);
    token = body.access_token; expiry = Date.now() + (Number(body.expires_in) - 60) * 1000;
  }
  const response = await amazonFetch(amazonUrl(resource, endpoint), { ...init, headers: { 'content-type': 'application/json', 'x-amz-access-token': token } });
  if (!response.ok) throw Error(`Account Health request failed (${response.status}).${response.status === 403 ? ' Check Selling Partner Insights role and seller reauthorization.' : ''}`);
  return response.json();
}
try {
  const previous = await readJson(statusFile);
  const pending = previous?.marketplaceId === marketplaceId && previous?.reportId && !['DONE', 'FATAL', 'CANCELLED'].includes(previous.status);
  const created = pending ? previous : await api('/reports/2021-06-30/reports', { method: 'POST', body: JSON.stringify({ reportType, marketplaceIds: [marketplaceId] }) });
  const progress = { reportId: created.reportId, marketplaceId, reportType, requestedAt: pending ? previous.requestedAt : new Date().toISOString(), status: 'IN_QUEUE' };
  await atomicJson(statusFile, progress);
  console.log(`Account Health report requested: ${created.reportId}`);
  const deadline = Date.now() + 15 * 60 * 1000;
  let report;
  do {
    report = await api('/reports/2021-06-30/reports/' + encodeURIComponent(created.reportId));
    progress.status = report.processingStatus; await atomicJson(statusFile, progress);
    console.log(`Account Health: ${report.processingStatus}`);
    if (['FATAL', 'CANCELLED'].includes(report.processingStatus)) throw Error(`Amazon report ${report.processingStatus}; no usable Account Health data returned.`);
    if (Date.now() >= deadline) throw Error('Report pending; run this script again to resume the same report.');
    if (report.processingStatus !== 'DONE') await new Promise(resolve => setTimeout(resolve, 20000));
  } while (report.processingStatus !== 'DONE');
  const document = await api('/reports/2021-06-30/documents/' + encodeURIComponent(report.reportDocumentId));
  const response = await fetch(reportDownloadUrl(document.url), { redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw Error(`Account Health download failed (${response.status}).`);
  let buffer = Buffer.from(await boundedBytes(response, 16 * 1024 * 1024));
  if (document.compressionAlgorithm === 'GZIP') buffer = gunzipSync(buffer, { maxOutputLength: 32 * 1024 * 1024 });
  const data = JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  if (!Array.isArray(data.accountStatuses) || !Array.isArray(data.performanceMetrics)) throw Error('Unexpected Account Health report structure.');
  // Category names are values so aggregate CustomerComplaints metrics survive
  // the shared storage filter that removes buyer identity fields.
  const performanceMetrics = data.performanceMetrics.map(metrics => ({ marketplaceId: metrics.marketplaceId, metrics: Object.entries(metrics).filter(([name]) => name !== 'marketplaceId').map(([category, value]) => ({ category, value })) }));
  const capturedAt = new Date().toISOString();
  const file = path.join(root, 'account-health.json');
  const previousSnapshot = await readJson(file);
  if (previousSnapshot) await saveHealthSnapshot(previousSnapshot);
  await saveHealthSnapshot({ reportType, reportId: created.reportId, marketplaceId, capturedAt, accountStatuses: data.accountStatuses, performanceMetrics });
  await atomicJson(file, { reportType, reportId: created.reportId, marketplaceId, capturedAt, accountStatuses: data.accountStatuses, performanceMetrics });
  await atomicJson(statusFile, { ...progress, capturedAt, status: 'DONE', stored: true });
  console.log(JSON.stringify({ status: 'complete', marketplaceId, capturedAt, accountStatuses: data.accountStatuses, performanceMetrics, encryptedFile: file }, null, 2));
} catch (error) {
  const progress = await readJson(statusFile).catch(() => null);
  await atomicJson(statusFile, { ...progress, error: error.message, failedAt: new Date().toISOString() }).catch(() => {});
  console.error(error.message); process.exitCode = 1;
} finally { await release(); }
