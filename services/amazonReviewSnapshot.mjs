import { join } from 'node:path';
import { boundedBytes } from './boundedBody.mjs';
import { atomicJson, monitorRoot, readJson } from './amazonMonitorStore.mjs';

const TTL_MS = 24 * 60 * 60 * 1000;
const pending = new Map();
const attribute = (tag, name) => tag?.match(new RegExp(`\\s${name}=["']([^"']*)["']`, 'i'))?.[1];

export function parseAmazonReviewSnapshot(html, asin) {
  if (/validateCaptcha|Robot Check|automated access|Enter the characters you see/i.test(html)) throw Error('Amazon did not provide a public product page.');
  const input = html.match(/<input\b[^>]*\sid=["']ASIN["'][^>]*>/i)?.[0];
  const displayedAsin = attribute(input, 'value');
  const canonicalTag = html.match(/<link\b[^>]*\srel=["']canonical["'][^>]*>/i)?.[0];
  let canonicalAsin;
  try {
    const canonical = new URL(attribute(canonicalTag, 'href'));
    if (canonical.protocol === 'https:' && /^(www\.)?amazon\.com$/.test(canonical.hostname)) canonicalAsin = canonical.pathname.match(/\/dp\/([A-Z0-9]{10})(?:\/|$)/)?.[1];
  } catch { /* An absent canonical is acceptable only with an exact selected ASIN. */ }
  if (displayedAsin !== asin && canonicalAsin !== asin) throw Error('Amazon returned a different product; its ratings were not used.');
  const popover = html.match(/<[a-z][\w:-]*\b[^>]*\sid=["']acrPopover["'][^>]*>/i)?.[0];
  const ratingText = attribute(popover, 'title');
  const rating = Number(ratingText?.match(/([0-5](?:\.\d+)?)\s+out of\s+5/i)?.[1]);
  const countText = html.match(/<span\b[^>]*\sid=["']acrCustomerReviewText["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]?.replace(/<[^>]*>/g, '').trim();
  const digits = countText?.match(/\d[\d,\s]*/)?.[0];
  const reviewCount = digits ? Number(digits.replace(/[,\s]/g, '')) : NaN;
  if (!Number.isFinite(rating) || rating < 0 || rating > 5 || !Number.isSafeInteger(reviewCount) || reviewCount < 0) throw Error('Amazon did not return a readable customer rating and count.');
  return { rating, reviewCount, countType: 'ratings', displayedAsin: displayedAsin || asin, scope: displayedAsin && displayedAsin !== asin ? 'listing-family' : 'listing' };
}

export async function getAmazonReviewSnapshot(asin, { fetchImpl = fetch, root = monitorRoot() } = {}) {
  if (!/^[A-Z0-9]{10}$/.test(asin)) throw Error('Invalid Amazon ASIN.');
  const key = `${root}:${asin}`;
  if (pending.has(key)) return pending.get(key);
  const operation = (async () => {
    const file = join(root, 'review-provider-amazon', `${asin}.json`);
    const cached = await readJson(file, null);
    const validCache = cached?.asin === asin && cached?.source === 'Amazon.com' && Number.isFinite(cached?.current?.rating) && cached.current.rating >= 0 && cached.current.rating <= 5 && Number.isSafeInteger(cached?.current?.reviewCount) && cached.current.reviewCount >= 0;
    const age = cached?.fetchedAt ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;
    if (validCache && age >= 0 && age < TTL_MS) return { ...cached, cached: true };
    try {
      const response = await fetchImpl(`https://www.amazon.com/dp/${asin}?th=1&psc=1`, {
        headers: { 'User-Agent': 'CDC-Sales-Dashboard/1.0', 'Accept-Language': 'en-US,en;q=0.9' },
        redirect: 'error', signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw Error('Amazon product page is temporarily unavailable.');
      const html = new TextDecoder().decode(await boundedBytes(response, 8 * 1024 * 1024));
      const parsed = parseAmazonReviewSnapshot(html, asin);
      const snapshot = { configured: true, asin, history: [], current: { rating: parsed.rating, reviewCount: parsed.reviewCount }, countType: parsed.countType, displayedAsin: parsed.displayedAsin, scope: parsed.scope, source: 'Amazon.com', fetchedAt: new Date().toISOString() };
      await atomicJson(file, snapshot);
      return { ...snapshot, cached: false };
    } catch (error) {
      if (validCache) return { ...cached, cached: true, stale: true, warning: 'Showing saved Amazon ratings; the latest check was unavailable.' };
      throw error;
    }
  })();
  pending.set(key, operation);
  try { return await operation; } finally { pending.delete(key); }
}
