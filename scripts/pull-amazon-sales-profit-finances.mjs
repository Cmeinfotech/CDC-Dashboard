import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { readAmazonJson } from '../services/amazonDataSecurity.mjs';
import { pullLegacyFinance } from '../services/legacySalesProfitFinance.mjs';
import { atomicJson, acquireLock, monitorRoot } from '../services/amazonMonitorStore.mjs';
for (const [key, value] of Object.entries(parseEnv(await fs.readFile('.env', 'utf8').catch(() => '')))) if (process.env[key] == null) process.env[key] = value;
const { amazonRequest } = await import('../services/amazonSpApi.ts');
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? '' : process.argv[i + 1]; };
const end = new Date(Math.min(arg('--end') ? Date.parse(arg('--end')) + 86400000 : Date.now(), Date.now() - 180000));
const start = new Date(arg('--start') || new Date(end.getTime() - 60 * 86400000).toISOString());
if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw Error('Invalid finance date range.');
const release = await acquireLock('sales-profit-finances');
const progressFile = path.join(monitorRoot(), 'sales-profit-finances-progress.json');
async function saveFinanceSnapshot(data) {
  await atomicJson(path.join(monitorRoot(), 'sales-profit-finances.json'), data);
  if (Date.parse(data.end) - Date.parse(data.start) > 90 * 86400000) await atomicJson(path.join(monitorRoot(), 'sales-profit-finances-history.json'), data);
}
try {
  const transactions = new Map();
  let pages = 0;
  for (let cursor = start.getTime(); cursor < end.getTime();) {
    const before = Math.min(cursor + 179 * 86400000, end.getTime());
    let nextToken;
    do {
      const query = new URLSearchParams({ postedAfter: new Date(cursor).toISOString(), postedBefore: new Date(before).toISOString() });
      if (nextToken) query.set('nextToken', nextToken);
      // Omit marketplaceId so Amazon also returns US merchant-fulfilled transactions.
      const response = await amazonRequest(`/finances/2024-06-19/transactions?${query}`);
      const payload = response.data?.payload;
      if (!payload || payload.transactions != null && !Array.isArray(payload.transactions)) throw Error('Amazon returned an invalid finance response.');
      for (const event of payload.transactions || []) {
        if (event.sellingPartnerMetadata?.marketplaceId !== process.env.AMAZON_MARKETPLACE_ID) continue;
        if (!event.transactionId) throw Error('Amazon returned a transaction without an ID; snapshot was not replaced.');
        transactions.set(event.transactionId, event);
      }
      nextToken = payload.nextToken;
      pages++;
      await atomicJson(progressFile, { status: 'running', pages, rows: transactions.size, updatedAt: new Date().toISOString() });
      if (nextToken) await new Promise(resolve => setTimeout(resolve, 2100));
    } while (nextToken);
    cursor = before;
    if (cursor < end.getTime()) await new Promise(resolve => setTimeout(resolve, 2100));
  }
  await saveFinanceSnapshot({ source: 'Amazon Finances API 2024-06-19', marketplaceId: process.env.AMAZON_MARKETPLACE_ID, pulledAt: new Date().toISOString(), start: start.toISOString(), end: end.toISOString(), transactions: [...transactions.values()] });
  await atomicJson(progressFile, { status: 'complete', pages, rows: transactions.size, updatedAt: new Date().toISOString() });
  console.log(JSON.stringify({ status: 'complete', dataset: 'Financial transactions', pages, rows: transactions.size }));
} catch (error) {
  if (/Unauthorized|AccessDenied|access.*denied|Forbidden/i.test(error.message)) {
    try {
      const orders = await readAmazonJson(path.join(process.cwd(), 'outputs', 'amazon-cdc', 'order-report.json'));
      const orderIds = new Set((orders?.rows || []).filter(row => row['sales-channel'] === 'Amazon.com').map(row => row['amazon-order-id']));
      const result = await pullLegacyFinance({ api: amazonRequest, start, end, marketplaceId: process.env.AMAZON_MARKETPLACE_ID, orderIds, onProgress: progress => atomicJson(progressFile, { ...progress, status: 'running', updatedAt: new Date().toISOString() }) });
      await saveFinanceSnapshot({ ...result, pulledAt: new Date().toISOString() });
      await atomicJson(progressFile, { status: 'complete', pages: result.pages, rows: result.transactions.length, source: result.source, updatedAt: new Date().toISOString() });
      console.log(JSON.stringify({ status: 'complete', source: result.source, pages: result.pages, rows: result.transactions.length }));
    } catch (fallbackError) {
      await atomicJson(progressFile, { status: 'failed', error: fallbackError.message, updatedAt: new Date().toISOString() });
      throw fallbackError;
    }
  } else {
  await atomicJson(progressFile, { status: 'failed', error: error.message, updatedAt: new Date().toISOString() });
  throw error;
  }
} finally { await release(); }

