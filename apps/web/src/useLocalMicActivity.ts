import { useEffect, useState } from 'react';

/** Observe the already-published microphone; never open a second capture device. */
export function useLocalMicActivity(track:MediaStreamTrack|null,thresholdDb:number){
  const [activity,setActivity]=useState({speaking:false,available:false});
  useEffect(()=>{
    setActivity({speaking:false,available:false});
    if(!track||track.readyState==='ended')return;
    let disposed=false;
    let context:AudioContext|undefined;
    let source:MediaStreamAudioSourceNode|undefined;
    let timer:number|undefined;
    const stop=()=>{
      if(timer!==undefined)window.clearInterval(timer);
      source?.disconnect();
      if(context&&context.state!=='closed')void context.close().catch(()=>undefined);
      // The LiveKit track owns capture. Do not stop it here.
    };
    const ended=()=>{stop();if(!disposed)setActivity({speaking:false,available:false})};
    track.addEventListener('ended',ended);
    void (async()=>{
      try{
        context=new AudioContext({latencyHint:'interactive'});
        if(context.state==='suspended')await context.resume();
        if(disposed||track.readyState==='ended'){stop();return}
        if(context.state!=='running')throw new Error('Microphone meter AudioContext is not running');
        source=context.createMediaStreamSource(new MediaStream([track]));
        const analyser=context.createAnalyser();
        analyser.fftSize=256;
        analyser.smoothingTimeConstant=0;
        source.connect(analyser);
        const samples=new Float32Array(analyser.fftSize);
        let speaking=false;
        let lastAbove=-Infinity;
        let available=true;
        setActivity({speaking:false,available:true});
        timer=window.setInterval(()=>{
          if(disposed)return;
          if(context?.state!=='running'){
            if(available){available=false;setActivity({speaking:false,available:false})}
            return;
          }
          analyser.getFloatTimeDomainData(samples);
          let sum=0;
          for(const sample of samples)sum+=sample*sample;
          const db=20*Math.log10(Math.max(Math.sqrt(sum/samples.length),1e-7));
          const now=performance.now();
          if(track.enabled&&!track.muted&&db>=thresholdDb)lastAbove=now;
          const next=track.enabled&&!track.muted&&now-lastAbove<70;
          if(next!==speaking||!available){speaking=next;available=true;setActivity({speaking,available:true})}
        },15);
      }catch(error){
        stop();
        if(!disposed){
          console.warn('[voice] local meter unavailable; using LiveKit activity',error);
          setActivity({speaking:false,available:false});
        }
      }
    })();
    return()=>{disposed=true;track.removeEventListener('ended',ended);stop()};
  },[track,thresholdDb]);
  return activity;
}
