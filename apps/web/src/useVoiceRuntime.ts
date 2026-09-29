import type { AppPreferences } from './preferences';
import { useVoice } from './useVoice';
import { useLocalMicActivity } from './useLocalMicActivity';
import { useNativeScreenShare } from './useNativeScreenShare';

/** One stable voice/camera room and one RNNoise microphone pipeline.
 * Desktop keeps the stable JS/LiveKit voice path, while screen capture is
 * replaced by the native Windows publisher when running inside Tauri.
 */
export function useVoiceRuntime(enabled:boolean,onError:(message:string)=>void,preferences:AppPreferences){
  const baseVoice=useVoice(enabled,onError,preferences);
  const voice=useNativeScreenShare(baseVoice,onError);
  const active=enabled&&voice.status==='connected'&&voice.canSpeak&&!voice.muted;
  const activity=useLocalMicActivity(active?voice.microphoneTrack:null,preferences.noiseGateThreshold);
  return {
    ...voice,
    participants:voice.participants.map(participant=>participant.local?{
      ...participant,
      speaking:active&&(activity.available?activity.speaking:participant.speaking),
    }:participant),
  };
}
