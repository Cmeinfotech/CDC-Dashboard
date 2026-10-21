

import { amazonEndpoint, amazonFetch, amazonUrl } from './amazonTransport.mjs';

type AmazonConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  region: string;
  endpoint: string;
  marketplaceId: string;
};

type TokenResponse = { access_token: string; expires_in: number };

export function getAmazonConfig(): AmazonConfig {
  const required = {
    clientId: process.env.AMAZON_LWA_CLIENT_ID,
    clientSecret: process.env.AMAZON_LWA_CLIENT_SECRET,
    refreshToken: process.env.AMAZON_LWA_REFRESH_TOKEN,
    marketplaceId: process.env.AMAZON_MARKETPLACE_ID,
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Amazon SP-API is not configured. Missing: ${missing.join(", ")}.`);
  const region = (process.env.AMAZON_SP_API_REGION || "").toLowerCase();
  if (!["na", "eu", "fe"].includes(region)) throw new Error("Set AMAZON_SP_API_REGION to na, eu or fe.");
  return {
    clientId: required.clientId!,
    clientSecret: required.clientSecret!,
    refreshToken: required.refreshToken!,
    region,
    endpoint: amazonEndpoint(region, process.env.AMAZON_SP_API_ENDPOINT),
    marketplaceId: required.marketplaceId!,
  };
}

export function isAmazonConfigured() {
  return Boolean(process.env.AMAZON_LWA_CLIENT_ID && process.env.AMAZON_LWA_CLIENT_SECRET && process.env.AMAZON_LWA_REFRESH_TOKEN && process.env.AMAZON_MARKETPLACE_ID && process.env.AMAZON_SP_API_REGION);
}

let tokenCache: { token: string; expiresAt: number } | undefined;
async function accessToken(config: AmazonConfig) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const response = await amazonFetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: config.refreshToken, client_id: config.clientId, client_secret: config.clientSecret }),
  });
  const body = await response.json() as Partial<TokenResponse> & { error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(`Amazon LWA token request failed (${response.status}).`);
  tokenCache = { token: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 };
  return body.access_token;
}

export async function amazonRequest<T>(path: string, init: RequestInit = {}) {
  if (process.env.AMAZON_ACCESS_REVOKED === 'true') throw new Error('Amazon authorization has been revoked.');
  const config = getAmazonConfig();
  const access = await accessToken(config);
  const url = amazonUrl(path, config.endpoint);
  const headers = new Headers(init.headers);
  headers.set("x-amz-access-token", access);
  headers.set("user-agent", "CDC-Sales-Dashboard/1.0 (Language=TypeScript)");
  const response = await amazonFetch(url, { ...init, headers });
  const text = await response.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* leave non-JSON response intact */ }
  if (!response.ok) {
    const errors = parsed && typeof parsed === "object" && "errors" in parsed ? (parsed as { errors?: Array<{ code?: string; message?: string }> }).errors : undefined;
    const error = errors?.map(item => `${item.code || "Error"}: ${item.message || "Request failed"}`).join("; ") || `Amazon SP-API request failed (${response.status}).`;
    throw new Error(`${error}${response.status === 429 ? " Retry after backoff." : ""}`);
  }
  return { data: parsed as T, rateLimit: response.headers.get("x-amzn-RateLimit-Limit"), requestId: response.headers.get("x-amzn-RequestId") };
}

export async function checkAmazonConnection() {
  const config = getAmazonConfig();
  const result = await amazonRequest<{ payload?: Array<{ marketplace: { id: string; name: string }; participation: { isParticipating: boolean } }> }>("/sellers/v1/marketplaceParticipations");
  const selected = result.data.payload?.find(item => item.marketplace.id === config.marketplaceId);
  if (!selected?.participation?.isParticipating) throw new Error("Configured marketplace is not participating in this seller authorization.");
  return { ok: true, marketplaceId: config.marketplaceId, marketplaceName: selected.marketplace.name, requestId: result.requestId, rateLimit: result.rateLimit };
}
