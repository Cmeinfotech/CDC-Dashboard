import './legacy-amazon-disabled.mjs';
import fs from 'node:fs';
import { parseEnv } from 'node:util';
const env = parseEnv(fs.readFileSync('.env', 'utf8'));
const folder = 'outputs/amazon-cdc';
const ids = [...new Set(JSON.parse(fs.readFileSync(`${folder}/catalog.json`, 'utf8')).rows.map(row => row.asin1).filter(Boolean))];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let token, expires = 0;
const items = [];
const missing = [];
const save = complete => fs.writeFileSync(`${folder}/catalog-attributes.json`, JSON.stringify({ complete, requested: ids.length, count: items.length, missing, items }, null, 2));
for (let index = 0; index < ids.length; index += 20) {
  const batch = ids.slice(index, index + 20);
  let page;
  const returned = new Set();
  do {
    for (let attempt = 0; attempt < 8; attempt++) {
      if (!token || Date.now() > expires) {
        const response = await fetch('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env.AMAZON_LWA_CLIENT_ID, client_secret: env.AMAZON_LWA_CLIENT_SECRET, refresh_token: env.AMAZON_LWA_REFRESH_TOKEN }), signal: AbortSignal.timeout(30000) });
        const body = await response.json(); if (!response.ok) throw Error(`Authentication ${response.status}`);
        token = body.access_token; expires = Date.now() + (body.expires_in - 60) * 1000;
      }
      const query = new URLSearchParams({ marketplaceIds: 'ATVPDKIKX0DER', identifiers: batch.join(','), identifiersType: 'ASIN', includedData: 'attributes,relationships,summaries,images', pageSize: '20' });
      if (page) query.set('pageToken', page);
      const response = await fetch('https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items?' + query, { headers: { 'x-amz-access-token': token }, signal: AbortSignal.timeout(30000) });
      if (response.status === 429 || response.status >= 500) { await pause(Math.min(60000, 3000 * 2 ** attempt)); continue; }
      const body = await response.json(); if (!response.ok) throw Error(`${response.status}: ${body.errors?.map(x => x.message).join('; ')}`);
      for (const item of body.items || []) { items.push(item); returned.add(item.asin); }
      page = body.pagination?.nextToken;
      break;
    }
    await pause(550);
  } while (page);
  missing.push(...batch.filter(id => !returned.has(id)));
  save(false);
  if (index % 500 === 0) console.log(`Catalog attributes: ${Math.min(index + 20, ids.length)}/${ids.length} ASINs checked, ${items.length} returned`);
}
save(true);
console.log(`Catalog attributes complete: ${items.length} returned; ${missing.length} unavailable`);
