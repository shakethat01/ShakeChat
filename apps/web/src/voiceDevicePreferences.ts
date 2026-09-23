const KEY='shakechat.voice-devices.v1';
export type VoiceDevices={audioinput:string;audiooutput:string};
export function loadVoiceDevices():VoiceDevices{
  try{
    const value=JSON.parse(localStorage.getItem(KEY)||'{}');
    return {audioinput:typeof value?.audioinput==='string'?value.audioinput:'',audiooutput:typeof value?.audiooutput==='string'?value.audiooutput:''};
  }catch{return {audioinput:'',audiooutput:''}}
}
export function saveVoiceDevices(value:VoiceDevices){
  try{localStorage.setItem(KEY,JSON.stringify(value))}catch{/* Storage can be unavailable. */}
}
