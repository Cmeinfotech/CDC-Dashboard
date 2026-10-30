import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function key() {
  const value = process.env.AMAZON_DATA_KEY;
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) throw Error('Set AMAZON_DATA_KEY using a protected secret manager (32 random bytes as hex).');
  return Buffer.from(value, 'hex');
}
export function assertAmazonStorage() { key(); if (process.env.AMAZON_ACCESS_REVOKED === 'true') throw Error('Amazon access revoked; data processing is disabled.'); }
export function retentionDays() {
  const value = Number(process.env.AMAZON_DATA_RETENTION_DAYS || 90);
  if (!Number.isInteger(value) || value < 1 || value > 180) throw Error('Amazon local retention must be between 1 and 180 days.');
  return value;
}
// This analytics application does not need buyer identity, addresses or gift content.
// Do not collect restricted report types; this is additional protection, not a PII classifier.
const sensitive = /buyer|customer|recipient|address|postal|postcode|zip.?code|phone|email|gift|tax.?id|identification.?number|payment|customized.?url/i;
const giftMoneyField = /^(?:gift[-_ ]?wrap[-_ ]?(?:price|tax)|giftwrap(?:price|tax))$/i;
function safeGiftMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return /^-?\d+(?:\.\d+)?$/.test(value.trim());
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([field, item]) =>
    /^(?:currency(?:code)?|amount)$/i.test(field) && (typeof item === 'string' || typeof item === 'number')
  );
}
export function minimizeAmazonData(value) {
  if (Array.isArray(value)) return value.map(minimizeAmazonData);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([field, data]) => !sensitive.test(field) || giftMoneyField.test(field) && safeGiftMoney(data))
    .map(([field, data]) => [field, minimizeAmazonData(data)]));
  return value;
}
export function sealAmazonData(value, file, now = Date.now()) {
  assertAmazonStorage(); const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const expiresAt = now + retentionDays() * 86400000;
  cipher.setAAD(Buffer.from(`${path.resolve(file)}:${expiresAt}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(minimizeAmazonData(value)), 'utf8'), cipher.final()]);
  return JSON.stringify({ format: 'cdc-amazon-aes256gcm-v1', expiresAt, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('base64') });
}
export function openAmazonData(text, file, fallback = null, now = Date.now()) {
  assertAmazonStorage(); const envelope = JSON.parse(text);
  if (envelope.format !== 'cdc-amazon-aes256gcm-v1') throw Error('Legacy plaintext Amazon data is blocked. Migrate it before use.');
  if (!Number.isSafeInteger(envelope.expiresAt)) throw Error('Invalid encrypted Amazon data.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(envelope.iv, 'hex'));
  decipher.setAAD(Buffer.from(`${path.resolve(file)}:${envelope.expiresAt}`)); decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  const value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
  return envelope.expiresAt <= now ? fallback : value;
}
export async function readAmazonJson(file, fallback = null) {
  try { return openAmazonData(await fs.readFile(file, 'utf8'), file, fallback); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function purgeExpiredAmazonData(root, now = Date.now()) {
  let count = 0;
  const base = path.resolve(root);
  const info = await fs.lstat(base).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!info) return 0;
  if (info.isSymbolicLink() || !info.isDirectory()) throw Error('Retention root must be a real directory.');
  async function visit(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const file = path.resolve(dir, entry.name); const relative = path.relative(base, file);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Unsafe retention path.');
      if (entry.isDirectory()) await visit(file);
      else if (entry.name.endsWith('.json')) {
        const envelope = JSON.parse(await fs.readFile(file, 'utf8'));
        if (envelope.format === 'cdc-amazon-aes256gcm-v1' && Number.isSafeInteger(envelope.expiresAt) && envelope.expiresAt <= now) {
          // Authenticate metadata before deleting; modified expiry must not cause deletion.
          openAmazonData(JSON.stringify(envelope), file, null, now);
          await fs.unlink(file); count++;
        }
      }
    }
  }
  await visit(base); return count;
}
