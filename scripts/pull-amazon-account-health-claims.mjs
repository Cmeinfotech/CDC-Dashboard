import fs from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { join } from 'node:path';
import { monitorRoot, atomicJson, acquireLock } from '../services/amazonMonitorStore.mjs';
import { pullAccountHealthClaims } from '../services/accountHealthClaims.mjs';

const env = parseEnv(await fs.readFile('.env', 'utf8'));
for (const [key, value] of Object.entries(env)) if (!process.env[key]) process.env[key] = value;
const release = await acquireLock('account-health-claims');
try {
  const data = await pullAccountHealthClaims();
  await atomicJson(join(monitorRoot(), 'account-health-claims.json'), { ...data, capturedAt: new Date().toISOString() });
  console.log(JSON.stringify({ available: data.available, count: data.events.length, truncated: data.truncated, reason: data.reason }));
} finally { await release(); }
