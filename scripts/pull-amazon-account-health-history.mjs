import fs from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { amazonRequest } from '../services/amazonSpApi.ts';
import { reportDownloadUrl } from '../services/amazonTransport.mjs';
import { boundedBytes } from '../services/boundedBody.mjs';
import { monitorRoot, readJson, acquireLock } from '../services/amazonMonitorStore.mjs';
import { saveHealthSnapshot } from '../services/accountHealthHistory.mjs';

const env = parseEnv(await fs.readFile('.env', 'utf8'));
for (const [key, value] of Object.entries(env)) if (!process.env[key]) process.env[key] = value;
const release = await acquireLock('account-health-history');
try {
  const since = new Date(Date.now() - 89 * 86400_000);
  let nextToken;
  let imported = 0, existing = 0, unavailable = 0;
  do {
    const query = nextToken ? new URLSearchParams({ nextToken }) : new URLSearchParams({ reportTypes: 'GET_V2_SELLER_PERFORMANCE_REPORT', processingStatuses: 'DONE', marketplaceIds: process.env.AMAZON_MARKETPLACE_ID, createdSince: since.toISOString(), pageSize: '100' });
    const { data } = await amazonRequest(`/reports/2021-06-30/reports?${query}`);
    console.log(`Amazon returned ${data.reports?.length ?? 0} retained Account Health reports.`);
    for (const report of data.reports ?? []) {
      if (await readJson(join(monitorRoot(), 'account-health-history', `${report.reportId}.json`))) { existing++; continue; }
      try {
        const { data: document } = await amazonRequest(`/reports/2021-06-30/documents/${encodeURIComponent(report.reportDocumentId)}`);
        const response = await fetch(reportDownloadUrl(document.url), { redirect: 'error', signal: AbortSignal.timeout(120000) });
        if (!response.ok) throw Error(`Report download failed (${response.status}).`);
        let bytes = Buffer.from(await boundedBytes(response, 16 * 1024 * 1024));
        if (document.compressionAlgorithm === 'GZIP') bytes = gunzipSync(bytes, { maxOutputLength: 32 * 1024 * 1024 });
        const body = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
        if (!Array.isArray(body.accountStatuses) || !Array.isArray(body.performanceMetrics)) throw Error('Unexpected report structure.');
        const performanceMetrics = body.performanceMetrics.map(market => ({ marketplaceId: market.marketplaceId, metrics: Object.entries(market).filter(([name]) => name !== 'marketplaceId').map(([category, value]) => ({ category, value })) }));
        await saveHealthSnapshot({ reportId: report.reportId, reportType: report.reportType, capturedAt: report.createdTime, marketplaceId: process.env.AMAZON_MARKETPLACE_ID, accountStatuses: body.accountStatuses, performanceMetrics });
        imported++;
      } catch (error) { unavailable++; console.log(`Retained report unavailable: ${error.message}`); }
    }
    nextToken = data.nextToken;
  } while (nextToken);
  console.log(JSON.stringify({ imported, existing, unavailable, historyLimitDays: 90 }));
} finally { await release(); }
