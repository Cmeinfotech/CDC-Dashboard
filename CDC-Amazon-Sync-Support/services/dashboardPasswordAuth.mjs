import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SESSION_SECONDS = 8 * 60 * 60;
const MAX_LOGIN_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;
const failedAttempts = new Map();

const digest = (value) => createHash('sha256').update(String(value)).digest();
const safeEqualText = (left, right) => timingSafeEqual(digest(left), digest(right));
const userStoreFile = (env = process.env) => path.resolve(env.DASHBOARD_USERS_FILE || path.join(process.cwd(), 'data-store', 'dashboard-users.enc'));
const userStoreKey = (env = process.env) => createHash('sha256').update(`cdc-dashboard-users:${env.DASHBOARD_SESSION_SECRET || ''}`).digest();

function readCreatedUsers(env = process.env) {
  const file = userStoreFile(env);
  if (!existsSync(file)) return [];
  const envelope = JSON.parse(readFileSync(file, 'utf8'));
  if (envelope.format !== 'cdc-dashboard-users-v1') throw Error('Dashboard user store format is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', userStoreKey(env), Buffer.from(envelope.iv, 'hex'));
  decipher.setAAD(Buffer.from(path.resolve(file)));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  const payload = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'));
  if (!Array.isArray(payload.users)) throw Error('Dashboard user store is invalid.');
  return payload.users;
}

function writeCreatedUsers(users, env = process.env) {
  const file = userStoreFile(env); const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true });
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', userStoreKey(env), iv);
  cipher.setAAD(Buffer.from(path.resolve(file)));
  const data = Buffer.concat([cipher.update(JSON.stringify({ users }), 'utf8'), cipher.final()]);
  const envelope = JSON.stringify({ format: 'cdc-dashboard-users-v1', iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('base64') });
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, envelope, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, file);
}

function withUsersLock(callback, env = process.env) {
  const lockFile = `${userStoreFile(env)}.lock`; mkdirSync(path.dirname(lockFile), { recursive: true }); let fd;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { fd = openSync(lockFile, 'wx', 0o600); break; }
    catch (error) { if (error.code !== 'EEXIST' || attempt === 59) throw Error('User management is busy. Retry shortly.'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); }
  }
  try { return callback(); } finally { closeSync(fd); try { unlinkSync(lockFile); } catch { /* The process is exiting. */ } }
}

export function passwordLoginConfigured(env = process.env) {
  return Boolean((env.DASHBOARD_USERS_JSON || env.DASHBOARD_LOGIN_USERNAME && env.DASHBOARD_LOGIN_PASSWORD) && env.DASHBOARD_SESSION_SECRET);
}

function configuredPasswordUsers(env = process.env) {
  if (env.DASHBOARD_USERS_JSON) {
    let users;
    try { users = JSON.parse(env.DASHBOARD_USERS_JSON); } catch { return null; }
    if (!Array.isArray(users) || !users.length || users.length > 100) return null;
    const names = new Set();
    for (const [index, user] of users.entries()) {
      if (!user || typeof user.username !== 'string' || !/^[a-zA-Z0-9@._-]{1,128}$/.test(user.username) || typeof user.password !== 'string' || user.password.length < 14 || user.password.length > 1024 || user.enabled !== undefined && typeof user.enabled !== 'boolean') return null;
      const key = user.username.toLowerCase();
      if (names.has(key)) return null;
      names.add(key);
      if (user.displayName !== undefined && (typeof user.displayName !== 'string' || !user.displayName.trim() || user.displayName.length > 128)) return null;
      if (user.role !== undefined && !['admin', 'lead', 'member'].includes(user.role)) return null;
      if (user.accounts !== undefined && (!Array.isArray(user.accounts) || !user.accounts.length || !user.accounts.every(account => ['cdc', 'nana-jewellers'].includes(account)))) return null;
    }
    if (!users.some(user => user.enabled !== false)) return null;
    const hasAdmin = users.some(user => user.enabled !== false && user.role === 'admin');
    const bootstrapIndex = users.findIndex(entry => entry.enabled !== false);
    return users.map((user, index) => ({ ...user, role: !hasAdmin && index === bootstrapIndex ? 'admin' : user.role || 'member' }));
  }
  if (!env.DASHBOARD_LOGIN_USERNAME || !env.DASHBOARD_LOGIN_PASSWORD) return null;
  if (!/^[a-zA-Z0-9@._-]{1,128}$/.test(env.DASHBOARD_LOGIN_USERNAME) || env.DASHBOARD_LOGIN_PASSWORD.length < 14 || env.DASHBOARD_LOGIN_PASSWORD.length > 1024) return null;
  return [{ username: env.DASHBOARD_LOGIN_USERNAME, password: env.DASHBOARD_LOGIN_PASSWORD, displayName: env.DASHBOARD_LOGIN_USERNAME, role: 'admin', enabled: true }];
}

function allPasswordUsers(env = process.env) {
  const configured = configuredPasswordUsers(env) || [];
  return [...configured, ...readCreatedUsers(env)];
}

export function dashboardUserList(env = process.env) {
  const staticUsers = configuredPasswordUsers(env) || [];
  const managedUsers = readCreatedUsers(env);
  return [...staticUsers.map(user => ({ username: user.username, displayName: user.displayName || user.username, role: user.role, accounts: user.accounts || ['cdc', 'nana-jewellers'], enabled: user.enabled !== false, managed: false })), ...managedUsers.map(user => ({ username: user.username, displayName: user.displayName, role: user.role, accounts: user.accounts, enabled: user.enabled !== false, managed: true }))];
}

export function createDashboardUser(input, env = process.env, now = Date.now()) {
  if (!input || typeof input !== 'object' || typeof input.username !== 'string' || !/^[a-zA-Z0-9@._-]{1,128}$/.test(input.username) || typeof input.displayName !== 'string' || !input.displayName.trim() || input.displayName.trim().length > 128 || typeof input.password !== 'string' || input.password.length < 14 || input.password.length > 1024 || !['lead', 'member'].includes(input.role) || !Array.isArray(input.accounts) || !input.accounts.length || !input.accounts.every(account => ['cdc', 'nana-jewellers'].includes(account))) throw Error('Enter a valid username, name, strong password, role, and at least one account.');
  return withUsersLock(() => {
    const users = readCreatedUsers(env);
    if (allPasswordUsers(env).some(user => user.username.toLowerCase() === input.username.toLowerCase())) throw Error('That username already exists.');
    if (users.length >= 100) throw Error('The dashboard supports up to 100 additional users.');
    const salt = randomBytes(16).toString('hex');
    users.push({ username: input.username, displayName: input.displayName.trim(), role: input.role, accounts: [...new Set(input.accounts)], salt, passwordHash: scryptSync(input.password, salt, 64).toString('hex'), enabled: true, createdAt: new Date(now).toISOString() });
    writeCreatedUsers(users, env);
    return { username: input.username, displayName: input.displayName.trim(), role: input.role, accounts: [...new Set(input.accounts)], enabled: true, managed: true };
  }, env);
}

export function passwordLoginConfigurationError(env = process.env) {
  if (!env.DASHBOARD_SESSION_SECRET) return 'Dashboard login is not configured.';
  if (!configuredPasswordUsers(env)) return 'Dashboard user configuration is invalid. Add one or more valid users with strong passwords.';
  if (!/^[a-fA-F0-9]{64}$/.test(env.DASHBOARD_SESSION_SECRET)) {
    return 'Dashboard session secret must be 64 hexadecimal characters.';
  }
  return null;
}

function attemptKey(username) {
  return createHash('sha256').update(String(username).trim().toLowerCase()).digest('hex');
}

export function verifyDashboardCredentials(username, password, env = process.env, now = Date.now()) {
  const configError = passwordLoginConfigurationError(env);
  if (configError) return { ok: false, status: 503, error: configError };

  const key = attemptKey(username);
  const previous = failedAttempts.get(key);
  if (previous?.lockedUntil > now) return { ok: false, status: 429, error: 'Too many attempts. Try again in 15 minutes.' };
  if (previous?.lockedUntil && previous.lockedUntil <= now) failedAttempts.delete(key);

  const users = allPasswordUsers(env);
  const candidate = users.find(user => safeEqualText(username, user.username));
  const passwordMatches = candidate?.passwordHash && candidate?.salt
    ? timingSafeEqual(scryptSync(password || 'invalid-password-placeholder', candidate.salt, 64), Buffer.from(candidate.passwordHash, 'hex'))
    : safeEqualText(password, candidate?.password || 'invalid-password-placeholder');
  if (!candidate || candidate.enabled === false || !passwordMatches) {
    const current = failedAttempts.get(key) || { count: 0, lockedUntil: 0 };
    current.count += 1;
    if (current.count >= MAX_LOGIN_ATTEMPTS) current.lockedUntil = now + LOCKOUT_MS;
    failedAttempts.set(key, current);
    return { ok: false, status: current.lockedUntil > now ? 429 : 401, error: current.lockedUntil > now ? 'Too many attempts. Try again in 15 minutes.' : 'Username or password is incorrect.' };
  }

  failedAttempts.delete(key);
  return { ok: true, username: candidate.username };
}

export function createDashboardSession(username, env = process.env, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sub: username, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + SESSION_SECONDS })).toString('base64url');
  const unsigned = `pwd1.${payload}`;
  const signature = createHmac('sha256', Buffer.from(env.DASHBOARD_SESSION_SECRET, 'hex')).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

export function verifyDashboardSession(token, env = process.env, now = Date.now()) {
  if (passwordLoginConfigurationError(env) || typeof token !== 'string' || token.length > 2048) throw Error('Invalid dashboard session.');
  const [version, encodedPayload, signature, extra] = token.split('.');
  if (version !== 'pwd1' || !encodedPayload || !signature || extra !== undefined) throw Error('Invalid dashboard session.');
  const unsigned = `${version}.${encodedPayload}`;
  const expected = createHmac('sha256', Buffer.from(env.DASHBOARD_SESSION_SECRET, 'hex')).update(unsigned).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { throw Error('Invalid dashboard session.'); }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw Error('Invalid dashboard session.');

  let claims;
  try { claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')); } catch { throw Error('Invalid dashboard session.'); }
  const seconds = Math.floor(now / 1000);
  const configuredUser = allPasswordUsers(env).find(user => user.username === claims.sub && user.enabled !== false);
  if (!configuredUser || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.iat > seconds || claims.exp <= seconds || claims.exp - claims.iat > SESSION_SECONDS) {
    throw Error('Expired dashboard session.');
  }
  // All configured users share one data owner by default. userId remains unique
  // per person for actor attribution and main-admin checks.
  const dataOwnerId = env.DEFAULT_USER_ID || 'dashboard';
  return { subject: claims.sub, userId: configuredUser.username, displayName: configuredUser.displayName || configuredUser.username, role: configuredUser.role || 'member', dataOwnerId, enabled: true, accounts: configuredUser.accounts || ['cdc', 'nana-jewellers'] };
}

export function dashboardSessionCookie(token, secure = true) {
  return `cdc_session=${token}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function clearDashboardSessionCookie(secure = true) {
  return `cdc_session=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function requestHasValidOrigin(request, env = process.env) {
  const requestUrl = new URL(request.url);
  const expectedOrigin = env.APP_ORIGIN || requestUrl.origin;
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === expectedOrigin && request.headers.get('sec-fetch-site') !== 'cross-site');
}

export function dashboardSessionLifetimeSeconds() { return SESSION_SECONDS; }
