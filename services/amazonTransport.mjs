const endpoints = { na: 'https://sellingpartnerapi-na.amazon.com', eu: 'https://sellingpartnerapi-eu.amazon.com', fe: 'https://sellingpartnerapi-fe.amazon.com' };
export function amazonEndpoint(region, override) {
  const endpoint = endpoints[region];
  if (!endpoint || override && override !== endpoint) throw Error('Only the official regional Amazon SP-API endpoint is allowed.');
  return endpoint;
}
export function amazonUrl(resource, endpoint) {
  const url = new URL(resource, endpoint);
  if (!resource.startsWith('/') || resource.startsWith('//') || url.origin !== endpoint || url.username || url.password) throw Error('Invalid Amazon API resource.');
  return url;
}
export function reportDownloadUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || !/(^|\.)amazonaws\.com$/.test(url.hostname)) throw Error('Untrusted Amazon report download URL.');
  return url;
}
export function retryDelay(response, attempt, now = Date.now()) {
  const header = response.headers.get('retry-after');
  const specified = header ? (/^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now) : 0;
  return Math.max(Number.isFinite(specified) ? specified : 0, (response.status === 429 ? 60000 : 1000) * 2 ** attempt) + Math.floor(Math.random() * 250);
}
export async function amazonFetch(url, init = {}, { fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  // Retry safe reads and explicit throttling only. A failed POST can already have created a report.
  const read = ['GET', 'HEAD'].includes((init.method || 'GET').toUpperCase());
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, { ...init, redirect: 'error', signal: init.signal || AbortSignal.timeout(30000) });
    } catch (error) {
      // A failed safe read can be retried; an ambiguous report-creation POST
      // must not be repeated. Respect caller cancellation.
      if (!read || attempt === 3 || init.signal?.aborted || !['TimeoutError', 'TypeError'].includes(error.name)) throw error;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (attempt === 3 || !(response.status === 429 || read && [500, 502, 503, 504].includes(response.status))) return response;
    await response.body?.cancel();
    await sleep(retryDelay(response, attempt));
  }
  throw Error('Amazon retry limit reached.');
}
