import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import { authenticatedUser } from './accessSecurity.mjs';
import { acquireLock, atomicJson, monitorRoot, readJson } from './amazonMonitorStore.mjs';

const derive = promisify(scrypt);
export function isMainAdmin(user, env = process.env) {
  return Boolean(env.AUTH_MAIN_ADMIN_USER_ID && user?.userId === env.AUTH_MAIN_ADMIN_USER_ID);
}
export function adminConfigured(env = process.env) {
  return Boolean(env.AUTH_MAIN_ADMIN_USER_ID && /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(env.AUTH_MAIN_ADMIN_PASSWORD_HASH || ''));
}
export async function verifyAdminPassword(request, password) {
  const user = authenticatedUser(request);
  if (!isMainAdmin(user)) return { error: 'Only the main administrator can reverse a merge.', status: 403 };
  if (!adminConfigured()) return { error: 'Main administrator password setup is required.', status: 503 };
  const release = await acquireLock('admin-password');
  try {
    const file = path.join(monitorRoot(), 'admin-attempts.json');
    const attempts = await readJson(file, {});
    const now = Date.now();
    const old = attempts[user.userId];
    const attempt = old && old.until > now ? old : { count: 0, until: now + 15 * 60_000 };
    if (attempt.count >= 5) return { error: 'Too many attempts. Try again after 15 minutes.', status: 429 };
    const [, salt, expected] = process.env.AUTH_MAIN_ADMIN_PASSWORD_HASH.split(':');
    const validInput = typeof password === 'string' && password.length >= 12 && password.length <= 1024;
    const actual = await derive(validInput ? password : '', salt, 64);
    if (!validInput || !timingSafeEqual(actual, Buffer.from(expected, 'hex'))) {
      attempts[user.userId] = { ...attempt, count: attempt.count + 1 };
      await atomicJson(file, attempts);
      return { error: 'Administrator password is incorrect.', status: 403 };
    }
    delete attempts[user.userId];
    await atomicJson(file, attempts);
    return { user };
  } finally { await release(); }
}
