import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'apps/api/src/messages/messages.gateway.ts');
if(!fs.existsSync(file))throw new Error('messages.gateway.ts bulunamadi: '+file);
let source=fs.readFileSync(file,'utf8');
if(source.includes('desktopCorsOrigins')){
  console.log('Desktop Socket.IO CORS zaten uygulanmis.');
  process.exit(0);
}
const importRegex=/import \{ VoiceService \} from '\.\.\/voice\/voice\.service';\r?\n/;
const helper=`import { VoiceService } from '../voice/voice.service';\n\nconst desktopCorsOrigins = [...new Set([\n  ...(process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',').map(value => value.trim()).filter(Boolean),\n  'http://localhost:5173',\n  'http://127.0.0.1:5173',\n  'tauri://localhost',\n  'http://tauri.localhost',\n  'https://tauri.localhost',\n])];\n`;
const corsRegex=/  cors: \{ origin: process\.env\.WEB_ORIGIN \?\? 'http:\/\/localhost:5173', credentials: true \},/;
const importMatches=source.match(new RegExp(importRegex.source,'g'))?.length??0;
const corsMatches=source.match(new RegExp(corsRegex.source,'g'))?.length??0;
if(importMatches!==1)throw new Error(`VoiceService import hedef sayisi ${importMatches} (1 bekleniyordu).`);
if(corsMatches!==1)throw new Error(`Socket.IO CORS hedef sayisi ${corsMatches} (1 bekleniyordu).`);
source=source.replace(importRegex,helper).replace(corsRegex,'  cors: { origin: desktopCorsOrigins, credentials: true },');
fs.writeFileSync(file,source);
console.log('Desktop Socket.IO CORS uygulandi.');
