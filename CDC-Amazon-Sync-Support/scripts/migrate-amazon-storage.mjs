import fs from 'node:fs/promises';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import {sealAmazonData,openAmazonData} from '../services/amazonDataSecurity.mjs';
const envPath=path.resolve('.env');let text=await fs.readFile(envPath,'utf8');
const env={...parseEnv(text),...process.env};
if(!env.AMAZON_DATA_KEY){
 env.AMAZON_DATA_KEY=randomBytes(32).toString('hex');
 text=text.replace(/^AMAZON_DATA_KEY=.*$/m,'');
 await fs.writeFile(envPath,text.trimEnd()+'\nAMAZON_DATA_KEY='+env.AMAZON_DATA_KEY+'\n',{mode:0o600});
}
Object.assign(process.env,env);
let migrated=0,encrypted=0;
for(const root of [path.resolve('outputs/amazon-cdc'),path.resolve(env.AMAZON_MONITOR_DATA_DIR || 'data-store/amazon-monitor')]){
 async function visit(dir){
  const entries=await fs.readdir(dir,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  for(const entry of entries){
   if(entry.isSymbolicLink())continue;
   const file=path.join(dir,entry.name);
   if(entry.isDirectory()){await visit(file);continue;}
   if(!entry.name.endsWith('.json'))continue;
   const value=JSON.parse(await fs.readFile(file,'utf8'));
   if(value.format==='cdc-amazon-aes256gcm-v1'){openAmazonData(JSON.stringify(value),file);encrypted++;continue;}
   const info=await fs.stat(file);
   const sealed=sealAmazonData(value,file,Math.floor(info.mtimeMs));
   openAmazonData(sealed,file);
   const temp=file+'.migration.tmp';await fs.writeFile(temp,sealed,{mode:0o600});await fs.rename(temp,file);migrated++;
  }
 }
 const info=await fs.lstat(root).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(info?.isSymbolicLink())throw Error('Storage root must not be a symlink.');
 if(info)await visit(root);
}
console.log(JSON.stringify({migrated,alreadyEncrypted:encrypted,originalRetentionAgePreserved:true}));
