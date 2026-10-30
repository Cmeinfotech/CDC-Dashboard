import fs from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

if (!process.stdin.isTTY) throw Error('Run this command in an interactive terminal. Never pass passwords as arguments.');
const source = await fs.readFile('.env', 'utf8').catch(e => { if(e.code === 'ENOENT') return ''; throw e; });
const env = { ...parseEnv(source), ...process.env };
let muted = false;
const output = new Writable({ write(chunk, encoding, done) { if (!muted) process.stdout.write(chunk, encoding); done(); } });
const input = createInterface({ input: process.stdin, output, terminal: true });
async function secret(prompt) {
  const pending = input.question(prompt);
  muted = true;
  try { return await pending; } finally { muted = false; process.stdout.write('\n'); }
}
try {
  const local = env.LOCAL_DASHBOARD_ACCESS === 'true' ? env.DEFAULT_USER_ID || 'dashboard' : '';
  const defaultUser = env.AUTH_MAIN_ADMIN_USER_ID || local;
  const userId = (await input.question(`Main admin existing user ID${defaultUser ? ` [${defaultUser}]` : ''}: `)).trim() || defaultUser;
  const approved = JSON.parse(env.AUTH_USERS_JSON || '[]').some(u => u.enabled === true && u.userId === userId);
  if (!userId || !approved && userId !== local) throw Error('Choose an enabled existing user, or the configured local development user.');
  const password = await secret('New admin confirmation password (12+ characters, hidden): ');
  if (password.length < 12 || password.length > 1024) throw Error('Use between 12 and 1024 characters.');
  if (password !== await secret('Repeat admin password (hidden): ')) throw Error('Passwords did not match.');
  const salt = randomBytes(16).toString('hex');
  const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  let updated = source;
  for (const [name, value] of Object.entries({ AUTH_MAIN_ADMIN_USER_ID: userId, AUTH_MAIN_ADMIN_PASSWORD_HASH: hash })) {
    const line = `${name}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${name}=.*$`, 'm');
    updated = pattern.test(updated) ? updated.replace(pattern, line) : `${updated.trimEnd()}\n${line}\n`;
  }
  await fs.writeFile('.env', updated, { mode: 0o600 });
  console.log('Main administrator configured. Restart the dashboard server. Password was stored as a salted scrypt hash.');
} finally { input.close(); }
