import './legacy-amazon-disabled.mjs';
import fs from 'node:fs';
import { parseEnv } from 'node:util';

const folder = 'outputs/amazon-cdc';
const output = `${folder}/catalog-full-details.json`;
const env = parseEnv(fs.readFileSync('.env', 'utf8'));
const base = 'https://sellingpartnerapi-na.amazon.com';
const marketplace = 'ATVPDKIKX0DER';
if (env.AMAZON_SP_API_REGION !== 'na' || env.AMAZON_MARKETPLACE_ID !== marketplace) throw Error('This pull is only for the configured CDC US marketplace.');
const listings = JSON.parse(fs.readFileSync(`${folder}/catalog.json`, 'utf8')).rows;
const sellerAsins = [...new Set(listings.map(row => row.asin1).filter(Boolean))];
const referenceAsins = ['B08KSJNG6G'];
const ids = [...new Set([...sellerAsins, ...referenceAsins])];
const includedData = 'attributes,classifications,dimensions,identifiers,images,productTypes,relationships,salesRanks,summaries';
let previous = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : { items: [], checked: [], missing: [] };
if (fs.existsSync(`${output}.tmp`)) {
  try { const pending = JSON.parse(fs.readFileSync(`${output}.tmp`, 'utf8')); if (pending.checked.length >= previous.checked.length) previous = pending; } catch { /* retain the last valid checkpoint */ }
}
const items = new Map(previous.items.map(item => [item.asin, item]));
const checked = new Set(previous.checked);
const missing = new Set(previous.missing);
let token, expires = 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const save = async complete => {
  const body = { complete, marketplaceId: marketplace, requested: ids.length, sellerAsinCount: sellerAsins.length, referenceAsins, includedData: includedData.split(','), checked: [...checked], missing: [...missing], count: items.size, pulledAt: new Date().toISOString(), items: [...items.values()] };
  fs.writeFileSync(`${output}.tmp`, JSON.stringify(body));
  for (let attempt = 0; attempt < 20; attempt++) {
    try { fs.renameSync(`${output}.tmp`, output); return; }
    catch (error) { if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt === 19) throw error; await pause(250); }
  }
};
async function request(query) {
  for (let attempt = 0; attempt < 8; attempt++) {
    if (!token || Date.now() > expires) {
      const response = await fetch('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env.AMAZON_LWA_CLIENT_ID, client_secret: env.AMAZON_LWA_CLIENT_SECRET, refresh_token: env.AMAZON_LWA_REFRESH_TOKEN }), signal: AbortSignal.timeout(30000) });
      const body = await response.json(); if (!response.ok || !body.access_token) throw Error(`Authentication failed (${response.status})`);
      token = body.access_token; expires = Date.now() + (body.expires_in - 60) * 1000;
    }
    try {
      const response = await fetch(`${base}/catalog/2022-04-01/items?${query}`, { headers: { 'x-amz-access-token': token }, signal: AbortSignal.timeout(30000) });
      if (response.status === 429 || response.status >= 500) { await pause(Math.min(60000, 3000 * 2 ** attempt)); continue; }
      const body = await response.json(); if (!response.ok) throw Error(`${response.status}: ${body.errors?.map(error => error.message).join('; ')}`);
      return body;
    } catch (error) { if (attempt === 7 || !['TimeoutError', 'TypeError'].includes(error.name)) throw error; await pause(3000); }
  }
  throw Error('Catalog retry limit reached; saved progress can be resumed.');
}
await save(false);
try {
  const pending = ids.filter(asin => !checked.has(asin));
  for (let index = 0; index < pending.length; index += 20) {
    const batch = pending.slice(index, index + 20);
    const returned = new Set(); let next;
    do {
      const query = new URLSearchParams({ marketplaceIds: marketplace, identifiers: batch.join(','), identifiersType: 'ASIN', includedData, pageSize: '20' });
      if (next) query.set('pageToken', next);
      const body = await request(query);
      for (const item of body.items || []) { items.set(item.asin, item); returned.add(item.asin); }
      next = body.pagination?.nextToken;
      await pause(550);
    } while (next);
    for (const asin of batch) { checked.add(asin); if (!returned.has(asin)) missing.add(asin); else missing.delete(asin); }
    if (index === 0 || checked.size % 200 === 0 || checked.size === ids.length) { await save(false); console.log(`Full product details: ${checked.size}/${ids.length} checked; ${items.size} returned; ${missing.size} unavailable`); }
  }
  await save(true); console.log('Full product details pull complete.');
} catch (error) { try { await save(false); } catch { /* valid temporary checkpoint remains recoverable */ } console.error(error.message); process.exitCode = 1; }
