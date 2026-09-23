import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'apps/web/src/App.tsx');
if(!fs.existsSync(file))throw new Error('App.tsx bulunamadi: '+file);
let source=fs.readFileSync(file,'utf8');
const oldImport="import { useVoice } from './useVoice';";
const newImport="import { useVoiceRuntime as useVoice } from './useVoiceRuntime';";
if(source.includes(newImport)){
  console.log('Birlesik RNNoise ses runtime zaten bagli.');
  process.exit(0);
}
const count=source.split(oldImport).length-1;
if(count!==1)throw new Error(`useVoice import hedef sayisi ${count} (1 bekleniyordu)`);
source=source.replace(oldImport,newImport);
fs.writeFileSync(file,source);
console.log('Birlesik RNNoise ses runtime baglandi: ses ve ekran paylasimi ayni baglantida.');
