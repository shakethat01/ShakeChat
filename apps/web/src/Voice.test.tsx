// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { VoiceDock, VoicePanel } from './Voice';
import { clampVoiceVolume, publicationIsActive } from './useVoice';

function voiceState(overrides:Record<string,unknown>={}){
  return {
    status:'connected' as const,channelId:'voice',participants:[{identity:'alice',name:'alice',local:true,speaking:false,muted:false,camera:false,screen:false}],videoTracks:[],muted:false,deafened:false,cameraEnabled:false,screenSharing:false,canSpeak:true,
    inputDevices:[],outputDevices:[],cameraDevices:[],inputDeviceId:'',outputDeviceId:'',cameraDeviceId:'',
    inputMode:'voice_activity' as const,pushToTalkKey:'Backquote',pushToTalkActive:false,participantVolumes:{},locallyMutedParticipants:[],
    join:vi.fn(),leave:vi.fn(),toggleMute:vi.fn(),toggleDeafen:vi.fn(),toggleCamera:vi.fn(),toggleScreenShare:vi.fn(),switchInput:vi.fn(),switchOutput:vi.fn(),switchCamera:vi.fn(),setParticipantVolume:vi.fn(),toggleParticipantLocalMute:vi.fn(),
    ...overrides,
  };
}

afterEach(()=>{cleanup();document.querySelectorAll('[data-test-voice-host]').forEach(node=>node.remove())});

it('offers camera and screen-share controls in an active voice channel',async()=>{
  const user=userEvent.setup();
  const voice=voiceState();
  render(<VoicePanel channelId="voice" channelName="General" voice={voice as any}/>);
  await user.click(screen.getByRole('button',{name:'Kamerayı aç'}));
  await user.click(screen.getByRole('button',{name:'Ekran paylaş'}));
  expect(voice.toggleCamera).toHaveBeenCalledTimes(1);
  expect(voice.toggleScreenShare).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Kamera cihazı')).toBeTruthy();
});

it('disables publishing controls without SPEAK permission',()=>{
  const voice=voiceState({canSpeak:false});
  render(<VoicePanel channelId="voice" channelName="General" voice={voice as any}/>);
  expect((screen.getByRole('button',{name:'Kamerayı aç'}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Ekran paylaş'}) as HTMLButtonElement).disabled).toBe(true);
});

it('treats a muted camera publication as disabled so the tile and icon reset',()=>{
  expect(publicationIsActive({track:{},isMuted:false} as any)).toBe(true);
  expect(publicationIsActive({track:{},isMuted:true} as any)).toBe(false);
  expect(publicationIsActive({track:undefined,isMuted:false} as any)).toBe(false);
});

it('shows push-to-talk state with the configured key',()=>{
  const voice=voiceState({inputMode:'push_to_talk',pushToTalkKey:'KeyV',muted:true});
  render(<VoicePanel channelId="voice" channelName="General" voice={voice as any}/>);
  expect(screen.getByRole('button',{name:'Bas-konuş · V'})).toBeTruthy();
  expect(screen.getByText('V tuşunu basılı tutarak konuş')).toBeTruthy();
});

it('offers local volume and mute controls for remote participants',async()=>{
  const user=userEvent.setup();
  const remote={identity:'bob',name:'Bob',local:false,speaking:false,muted:false,camera:false,screen:false};
  const voice=voiceState({participants:[...voiceState().participants,remote],participantVolumes:{bob:65}});
  render(<VoicePanel channelId="voice" channelName="General" voice={voice as any}/>);
  const slider=screen.getByRole('slider',{name:'Bob ses seviyesi'}) as HTMLInputElement;
  expect(slider.value).toBe('65');
  await user.click(screen.getByRole('button',{name:'Bob sesini kapat'}));
  expect(voice.toggleParticipantLocalMute).toHaveBeenCalledWith('bob');
});

it('shows connected voice members and live stream state in the sidebar dock',()=>{
  const voice=voiceState({participants:[
    {identity:'alice',name:'Alice',local:true,speaking:true,muted:false,camera:false,screen:false},
    {identity:'bob',name:'Bob',local:false,speaking:false,muted:false,camera:false,screen:true},
  ]});
  render(<VoiceDock channelName="General" voice={voice as any}/>);
  expect(screen.getByLabelText('Ses kanalındaki kullanıcılar')).toBeTruthy();
  expect(screen.getByText('Alice · Sen')).toBeTruthy();
  expect(screen.getByText('Bob')).toBeTruthy();
  expect(screen.getByText('LIVE')).toBeTruthy();
  expect(screen.getByText('Konuşuyor')).toBeTruthy();
});

it('embeds voice members directly beneath the connected channel when its channel row exists',async()=>{
  const host=document.createElement('div');
  host.dataset.testVoiceHost='1';
  host.innerHTML='<aside class="channels"><section class="flow-group"><button class="channel voice-connected">General</button></section></aside>';
  document.body.appendChild(host);
  const voice=voiceState({participants:[{identity:'alice',name:'Alice',local:true,speaking:true,muted:false,camera:false,screen:false}]});
  render(<VoiceDock channelName="General" voice={voice as any}/>);
  await waitFor(()=>expect(host.querySelector('.voice-channel-members-slot')).toBeTruthy());
  const slot=host.querySelector('.voice-channel-members-slot') as HTMLElement;
  expect(slot.textContent).toContain('Alice · Sen');
  expect(slot.textContent).toContain('Konuşuyor');
});

it('lets a viewer focus a stream and return to the grid',async()=>{
  const user=userEvent.setup();
  const voice=voiceState({
    participants:[{identity:'bob',name:'Bob',local:false,speaking:false,muted:false,camera:false,screen:true}],
    videoTracks:[{id:'bob:screen:1',identity:'bob',name:'Bob',local:false,source:'screen',publication:{videoTrack:undefined}}],
  });
  render(<VoicePanel channelId="voice" channelName="General" voice={voice as any}/>);
  expect(screen.getByText('CANLI YAYINLAR')).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Bob görüntüsünü öne çıkar'}));
  expect(screen.getByRole('button',{name:'Izgaraya dön'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Bob görüntüsünü ızgaraya döndür'})).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Izgaraya dön'}));
  expect(screen.getByRole('button',{name:'Bob görüntüsünü öne çıkar'})).toBeTruthy();
});

it('clamps per-user playback volume to browser-safe limits',()=>{
  expect(clampVoiceVolume(-10)).toBe(0);
  expect(clampVoiceVolume(55.4)).toBe(55);
  expect(clampVoiceVolume(140)).toBe(100);
});