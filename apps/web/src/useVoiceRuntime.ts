import type { AppPreferences } from './preferences';
import { useVoice } from './useVoice';
import { useLocalMicActivity } from './useLocalMicActivity';

/** One room and one microphone pipeline for voice, camera and screen sharing.
 * Desktop uses the same RNNoise processor as the web media path. Starting or
 * receiving video must never disconnect the room or acquire another microphone.
 */
export function useVoiceRuntime(enabled:boolean,onError:(message:string)=>void,preferences:AppPreferences){
  const voice=useVoice(enabled,onError,preferences);
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
