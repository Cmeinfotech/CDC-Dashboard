import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { purgeExpiredAmazonData } from '../services/amazonDataSecurity.mjs';

const local = parseEnv(await fs.readFile('.env', 'utf8').catch(error => { if(error.code==='ENOENT') return ''; throw error; }));
for (const [key,value] of Object.entries(local)) if (process.env[key] === undefined) process.env[key]=value;
const roots = [path.resolve(process.env.AMAZON_MONITOR_DATA_DIR || 'data-store/amazon-monitor'), path.resolve('outputs/amazon-cdc')];
const apply = process.argv.includes('--purge-expired');
let files=0, plaintext=0, expired=0;
async function scan(root) {
  const info = await fs.lstat(root).catch(error => { if(error.code==='ENOENT') return null; throw error; });
  if(!info) return;
  if(info.isSymbolicLink() || !info.isDirectory()) throw Error('Maintenance requires a real directory.');
  const base = path.resolve(root);
  async function visit(dir) {
    for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
      if(entry.isSymbolicLink()) continue;
      const file=path.resolve(dir,entry.name);const relative=path.relative(base,file);
      if(!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Unsafe maintenance path.');
      if(entry.isDirectory()) await visit(file);
      else if(!entry.name.endsWith('.lock')) {
        files++;
        if(entry.name.endsWith('.json')) { const data=JSON.parse(await fs.readFile(file,'utf8')); if(data.format!=='cdc-amazon-aes256gcm-v1') plaintext++;else if(data.expiresAt<=Date.now())expired++; }
        else plaintext++;
      }
    }
  }
  await visit(base);
}
for(const root of roots) await scan(root);
let deleted=0;
if(apply) for(const root of roots) deleted+=await purgeExpiredAmazonData(root);
console.log(JSON.stringify({ mode:apply?'purge-expired':'read-only inventory',files,plaintext,expired,deleted, note:'Legacy plaintext and database records are not deleted by this command. Review all other exports and backups separately.' }));
