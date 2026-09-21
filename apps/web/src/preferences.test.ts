// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clampNoiseGateThreshold, loadPreferences, screenCaptureFor, screenPublishFor, screenQualityLabel, screenReceiveFor } from './preferences';

describe('screen share quality profiles',()=>{
  it('maps Ultra to 1440p144 at 14 Mbps',()=>{
    expect(screenCaptureFor('ultra')).toEqual({width:2560,height:1440,frameRate:144});
    expect(screenPublishFor('ultra')).toEqual(expect.objectContaining({
      degradationPreference:'maintain-framerate',
      screenShareEncoding:expect.objectContaining({maxBitrate:14_000_000,maxFramerate:144,priority:'high'}),
    }));
    expect(screenReceiveFor('ultra')).toEqual({width:2560,height:1440,fps:144});
    expect(screenQualityLabel('ultra')).toContain('14 Mbps');
  });

  it('uses the requested Low/Medium/High bitrate targets',()=>{
    expect(screenPublishFor('low').screenShareEncoding.maxBitrate).toBe(1_500_000);
    expect(screenPublishFor('medium').screenShareEncoding.maxBitrate).toBe(3_500_000);
    expect(screenPublishFor('high').screenShareEncoding.maxBitrate).toBe(6_000_000);
  });

  it('migrates legacy 2K144 preference to Ultra',()=>{
    localStorage.setItem('shakechat.preferences.v10',JSON.stringify({screenQuality:'1440p144'}));
    expect(loadPreferences().screenQuality).toBe('ultra');
  });
});

describe('noise gate preferences',()=>{
  it('clamps threshold to a safe UI range',()=>{
    expect(clampNoiseGateThreshold(-90)).toBe(-70);
    expect(clampNoiseGateThreshold(-48)).toBe(-48);
    expect(clampNoiseGateThreshold(-10)).toBe(-25);
  });
});
