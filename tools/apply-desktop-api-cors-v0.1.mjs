import fs from 'node:fs';
import path from 'node:path';

const file=path.join(process.cwd(),'apps/api/src/messages/messages.gateway.ts');
if(!fs.existsSync(file))throw new Error('messages.gateway.ts bulunamadi: '+file);
let source=fs.readFileSync(file,'utf8');
if(source.includes('desktopCorsOrigins')){
  console.log('Desktop Socket.IO CORS zaten uygulanmis.');
  process.exit(0);
}
const importNeedle="import { VoiceService } from '../voice/voice.service';\n";
const helper=`import { VoiceService } from '../voice/voice.service';\n\nconst desktopCorsOrigins = [...new Set([\n  ...(process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',').map(value => value.trim()).filter(Boolean),\n  'http://localhost:5173',\n  'http://127.0.0.1:5173',\n  'tauri://localhost',\n  'http://tauri.localhost',\n  'https://tauri.localhost',\n])];\n`;
const corsNeedle="  cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true },";
if((source.split(importNeedle).length-1)!==1)throw new Error('VoiceService import hedefi bulunamadi/tekil degil.');
if((source.split(corsNeedle).length-1)!==1)throw new Error('Socket.IO CORS hedefi bulunamadi/tekil degil.');
source=source.replace(importNeedle,helper).replace(corsNeedle,'  cors: { origin: desktopCorsOrigins, credentials: true },');
fs.writeFileSync(file,source);
console.log('Desktop Socket.IO CORS uygulandi.');
