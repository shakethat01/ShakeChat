import { describe, expect, it } from 'vitest';
import { pushToTalkKeyLabel, screenCaptureFor, screenPublishFor, screenQualityLabel, screenReceiveFor } from './preferences';

describe('screen share quality profiles',()=>{
  it('maps 2K 144 FPS to capture, encoder and receiver targets',()=>{
    expect(screenCaptureFor('1440p144')).toEqual({width:2560,height:1440,frameRate:144});
    expect(screenPublishFor('1440p144')).toEqual(expect.objectContaining({screenShareEncoding:expect.objectContaining({maxBitrate:42_000_000,maxFramerate:144})}));
    expect(screenReceiveFor('1440p144')).toEqual({width:2560,height:1440,fps:144});
    expect(screenQualityLabel('1440p144')).toContain('2K');
  });
  it('source mode removes the old 1080p-class ceiling with a high native target',()=>{
    expect(screenCaptureFor('source')).toEqual({width:7680,height:4320,frameRate:144});
    expect(screenPublishFor('source')).toEqual(expect.objectContaining({screenShareEncoding:expect.objectContaining({maxBitrate:60_000_000,maxFramerate:144})}));
  });
});


describe('voice usability preferences',()=>{
  it('formats push-to-talk keys for the UI',()=>{
    expect(pushToTalkKeyLabel('Backquote')).toBe('`');
    expect(pushToTalkKeyLabel('KeyV')).toBe('V');
  });
});
