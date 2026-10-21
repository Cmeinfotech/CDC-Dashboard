import { createHash } from 'node:crypto';

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value ?? null;
}
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const sorted = values => [...new Set(values)].sort();
const attributeValue = (field, value) => field === 'bullet_point' || !Array.isArray(value) ? value : [...value].sort((a, b) => JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b))));
const marketData = (item, key, marketplace) => (item?.[key] || []).filter(group => group.marketplaceId === marketplace);

export function productRecords(listings, items, marketplace) {
  const details = new Map(items.map(item => [item.asin, item]));
  const records = [];
  const seen = new Set();
  for (const listing of listings) {
    const sku = String(listing['seller-sku'] || '').trim();
    const asin = String(listing.asin1 || '').trim();
    if (!sku || !asin) throw Error('A listing is missing SKU/ASIN. The incomplete catalog cannot become the comparison baseline.');
    if (seen.has(sku)) throw Error(`Duplicate seller SKU in catalog: ${sku}. Resolve the ambiguity before comparison.`);
    seen.add(sku);
    const item = details.get(asin);
    const summary = marketData(item, 'summaries', marketplace)[0] || {};
    const attributes = Object.fromEntries(Object.entries(item?.attributes || {}).map(([key, values]) => [key, Array.isArray(values) ? values.filter(entry => !entry.marketplace_id || entry.marketplace_id === marketplace) : values]));
    const relationships = marketData(item, 'relationships', marketplace).flatMap(group => group.relationships || []);
    const parentAsins = sorted(relationships.filter(r => r.type === 'VARIATION').flatMap(r => r.parentAsins || []));
    const childAsins = sorted(relationships.filter(r => r.type === 'VARIATION').flatMap(r => r.childAsins || []));
    const imageMap = new Map();
    for (const image of marketData(item, 'images', marketplace).flatMap(group => group.images || [])) {
      const old = imageMap.get(image.variant);
      if (!old || image.width * image.height > old.width * old.height) imageMap.set(image.variant, image);
    }
    const images = [...imageMap].sort(([a], [b]) => a.localeCompare(b)).map(([variant, image]) => ({ variant, link: image.link }));
    records.push({ sku, asin, title: summary.itemName || listing['item-name'] || listing['\uFEFFitem-name'] || '',
      listing: { title: listing['item-name'] || listing['\uFEFFitem-name'] || '', price: listing.price ?? null, quantity: listing.quantity === '' ? null : listing.quantity ?? null, status: listing.status || '', fulfillment: listing['fulfillment-channel'] || '' },
      detailsAvailable: Boolean(item), attributes, images, parentAsins, childAsins,
      parentage: item ? parentAsins.length ? 'Child' : childAsins.length ? 'Parent' : 'Unspecified' : 'Unavailable',
      source: { marketplace, catalogApi: '2022-04-01', listingReport: 'GET_MERCHANT_LISTINGS_ALL_DATA' },
    });
  }
  return records.sort((a, b) => a.sku.localeCompare(b.sku));
}

export function compareProducts(previous, current, { runId, detectedAt, previousRunId }) {
  if (previous.marketplaceId !== current.marketplaceId) throw Error('Marketplaces cannot be compared.');
  if (!previous.complete || !current.complete) throw Error('Only complete listing pulls may be compared.');
  const oldBySku = new Map(previous.products.map(product => [product.sku, product]));
  const nextBySku = new Map(current.products.map(product => [product.sku, product]));
  const changes = [];
  const add = (kind, field, before, after, product, availability = 'observed') => {
    const id = createHash('sha256').update(JSON.stringify([runId, product.sku, kind, field])).digest('hex');
    const structural = ['asin', 'missing', 'family'].includes(kind);
    changes.push({ id, runId, previousRunId, detectedAt, sku: product.sku, asin: product.asin, title: product.title,
      kind, field, previous: canonical(before), current: canonical(after), priority: structural ? 'High' : kind === 'attribute' || kind === 'images' ? 'Medium' : 'Low',
      availability, status: 'Unreviewed', attribution: 'Observed between Amazon API pulls. Actor and exact modification time are not supplied.' });
  };
  for (const next of current.products) {
    const old = oldBySku.get(next.sku);
    if (!old) { add('added', 'listing', null, next.asin, next); continue; }
    if (old.asin !== next.asin) add('asin', 'ASIN', old.asin, next.asin, next);
    for (const field of Object.keys({ ...old.listing, ...next.listing })) if (!equal(old.listing[field], next.listing[field])) add('listing', `listing.${field}`, old.listing[field], next.listing[field], next);
    if (old.asin !== next.asin) continue; // New ASIN attributes are not edits to the old ASIN's content.
    if (!old.detailsAvailable || !next.detailsAvailable) {
      if (old.detailsAvailable !== next.detailsAvailable) add('coverage', 'catalog details availability', old.detailsAvailable, next.detailsAvailable, next, 'availability change; not proof of content removal');
      continue;
    }
    for (const field of ['parentAsins', 'childAsins']) if (!equal(old[field], next[field])) add('family', field, old[field], next[field], next);
    if (!equal(old.images, next.images)) add('images', 'images', old.images, next.images, next);
    for (const field of sorted([...Object.keys(old.attributes), ...Object.keys(next.attributes)])) {
      if (!equal(attributeValue(field, old.attributes[field]), attributeValue(field, next.attributes[field]))) {
        const absent = !Object.hasOwn(old.attributes, field) || !Object.hasOwn(next.attributes, field);
        add('attribute', `attributes.${field}`, old.attributes[field], next.attributes[field], next, absent ? 'field returned/omitted by API; omission is not confirmed deletion' : 'observed');
      }
    }
  }
  for (const old of previous.products) if (!nextBySku.has(old.sku)) add('missing', 'listing', old.asin, null, old, 'Absent from complete all-listings report; verify seller listing status');
  return changes;
}
