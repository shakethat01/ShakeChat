import { check } from '@tauri-apps/plugin-updater';

export type DesktopUpdateState =
  | { status:'unsupported' }
  | { status:'up-to-date' }
  | { status:'available'; version:string; currentVersion:string; notes?:string }
  | { status:'installing'; version:string; progress:number|null };

function isTauriRuntime(){
  return typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window;
}

export async function checkDesktopUpdate():Promise<DesktopUpdateState>{
  if(!isTauriRuntime())return {status:'unsupported'};
  const update=await check({timeout:30_000});
  if(!update)return {status:'up-to-date'};
  return {
    status:'available',
    version:update.version,
    currentVersion:update.currentVersion,
    notes:update.body??undefined,
  };
}

export async function installDesktopUpdate(onState:(state:DesktopUpdateState)=>void){
  if(!isTauriRuntime())return;
  const update=await check({timeout:30_000});
  if(!update){onState({status:'up-to-date'});return}
  let downloaded=0;
  let total:number|undefined;
  onState({status:'installing',version:update.version,progress:null});
  await update.downloadAndInstall(event=>{
    if(event.event==='Started'){
      total=event.data.contentLength;
      onState({status:'installing',version:update.version,progress:0});
    }else if(event.event==='Progress'){
      downloaded+=event.data.chunkLength;
      onState({status:'installing',version:update.version,progress:total?Math.min(100,Math.round(downloaded/total*100)):null});
    }else if(event.event==='Finished'){
      onState({status:'installing',version:update.version,progress:100});
    }
  });
}
