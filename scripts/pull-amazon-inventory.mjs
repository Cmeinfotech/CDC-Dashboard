import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { amazonFetch, amazonEndpoint, amazonUrl } from '../services/amazonTransport.mjs';
import { assertAmazonStorage, purgeExpiredAmazonData } from '../services/amazonDataSecurity.mjs';
import { atomicJson, acquireLock } from '../services/amazonMonitorStore.mjs';

const envFile = await fs.readFile('.env', 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error));
const config = { ...parseEnv(envFile), ...process.env };
for (const name of ['AMAZON_DATA_KEY', 'AMAZON_MONITOR_DATA_DIR', 'AMAZON_ACCESS_REVOKED', 'AMAZON_DATA_RETENTION_DAYS', 'AMAZON_LWA_CLIENT_ID', 'AMAZON_LWA_CLIENT_SECRET', 'AMAZON_LWA_REFRESH_TOKEN', 'AMAZON_SP_API_REGION', 'AMAZON_SP_API_ENDPOINT', 'AMAZON_MARKETPLACE_ID']) {
  if (config[name]) process.env[name] = config[name];
}

const region = config.AMAZON_SP_API_REGION;
const marketplace = config.AMAZON_MARKETPLACE_ID;
const endpoints = { na: 'https://sellingpartnerapi-na.amazon.com', eu: 'https://sellingpartnerapi-eu.amazon.com', fe: 'https://sellingpartnerapi-fe.amazon.com' };
if (!endpoints[region] || !marketplace || !config.AMAZON_LWA_CLIENT_ID || !config.AMAZON_LWA_CLIENT_SECRET || !config.AMAZON_LWA_REFRESH_TOKEN) {
  throw Error('Set Amazon SP-API credentials, region, and marketplace before pulling FBA inventory.');
}
assertAmazonStorage();

const sourceFolder = path.resolve('outputs', 'amazon-cdc');
const inventoryFile = path.join(sourceFolder, 'inventory.json');
const release = await acquireLock('inventory-pull');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let token;
let tokenExpiresAt = 0;

async function api(resource) {
  if (!token || Date.now() >= tokenExpiresAt) {
    const response = await amazonFetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: config.AMAZON_LWA_CLIENT_ID, client_secret: config.AMAZON_LWA_CLIENT_SECRET, refresh_token: config.AMAZON_LWA_REFRESH_TOKEN }),
    });
    const body = await response.json();
    if (!response.ok || !body.access_token) throw Error(`Amazon authentication failed (${response.status}).`);
    token = body.access_token;
    tokenExpiresAt = Date.now() + (Number(body.expires_in) - 60) * 1000;
  }
  const response = await amazonFetch(amazonUrl(resource, amazonEndpoint(region)), { headers: { 'x-amz-access-token': token, 'user-agent': 'CDC-Sales-Dashboard/1.0 (Language=JavaScript)' } });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { throw Error('Amazon returned an invalid inventory response.'); }
  if (!response.ok) {
    const details = body?.errors?.map(item => `${item.code || 'Error'}: ${item.message || 'Request failed'}`).join('; ');
    throw Error(details || `Amazon inventory request failed (${response.status}).`);
  }
  return body;
}

try {
  await purgeExpiredAmazonData(sourceFolder);
  await fs.mkdir(sourceFolder, { recursive: true });
  const inventorySummaries = [];
  let nextToken;
  do {
    const params = new URLSearchParams({ granularityType: 'Marketplace', granularityId: marketplace, marketplaceIds: marketplace, details: 'true' });
    if (nextToken) params.set('nextToken', nextToken);
    const body = await api(`/fba/inventory/v1/summaries?${params}`);
    inventorySummaries.push(...(body.payload?.inventorySummaries || []));
    nextToken = body.pagination?.nextToken;
    if (nextToken) await pause(600);
  } while (nextToken);

  const pulledAt = new Date().toISOString();
  await atomicJson(inventoryFile, { marketplaceId: marketplace, pulledAt, payload: { inventorySummaries } });
  console.log(JSON.stringify({ status: 'complete', dataset: 'FBA inventory', marketplaceId: marketplace, pulledAt, count: inventorySummaries.length }));
} finally {
  await release();
}
