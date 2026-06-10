import { describe, it, expect } from 'vitest';
import { detectEvents, DEFAULT_THRESHOLDS, type TrackPoint } from './detectEvents';
import type { Aircraft } from '../../../shared/types';

function ac(partial: Partial<Aircraft>): Aircraft {
  return {
    icao24: 'a1',
    callsign: 'TEST1',
    country: null,
    lng: 116,
    lat: 40,
    altitude: 8000,
    velocity: 200,
    heading: 90,
    verticalRate: 0,
    squawk: null,
    onGround: false,
    ...partial,
  };
}

const NO_TRACKS = new Map<string, TrackPoint[]>();

describe('detectEvents', () => {
  it('紧急代码 7500/7600/7700 触发,普通 squawk 不触发', () => {
    for (const code of ['7500', '7600', '7700']) {
      const ev = detectEvents([ac({ squawk: code })], NO_TRACKS);
      expect(ev).toHaveLength(1);
      expect(ev[0].kind).toBe('emergency_code');
      expect(ev[0].severity).toBe('notice');
      expect(ev[0].evidence.squawk).toBe(code);
    }
    expect(detectEvents([ac({ squawk: '2000' })], NO_TRACKS)).toHaveLength(0);
  });

  it('快速下降:垂直速率≤阈值且在空中才触发', () => {
    expect(detectEvents([ac({ verticalRate: -12 })], NO_TRACKS)[0].kind).toBe('rapid_descent');
    // 未达阈值
    expect(detectEvents([ac({ verticalRate: -5 })], NO_TRACKS)).toHaveLength(0);
    // 在地面
    expect(detectEvents([ac({ verticalRate: -12, onGround: true })], NO_TRACKS)).toHaveLength(0);
    // 缺失
    expect(detectEvents([ac({ verticalRate: null })], NO_TRACKS)).toHaveLength(0);
  });

  it('疑似盘旋:窗口内累计航向变化≥阈值触发', () => {
    const now = 1_000_000;
    const tracks = new Map<string, TrackPoint[]>();
    // 4 点,累计变化 90+90+90=270 ≥ 270
    tracks.set('a1', [
      { ts: now - 60_000, heading: 0, lat: 40, lng: 116 },
      { ts: now - 40_000, heading: 90, lat: 40, lng: 116 },
      { ts: now - 20_000, heading: 180, lat: 40, lng: 116 },
      { ts: now - 1_000, heading: 270, lat: 40, lng: 116 },
    ]);
    const ev = detectEvents([ac({ verticalRate: 0 })], tracks, DEFAULT_THRESHOLDS, now);
    const holding = ev.find((e) => e.kind === 'suspected_holding');
    expect(holding).toBeTruthy();
    expect(holding!.evidence.headingChangeDeg).toBe(270);
  });

  it('航向几乎不变时不判定盘旋', () => {
    const now = 1_000_000;
    const tracks = new Map<string, TrackPoint[]>();
    tracks.set('a1', [
      { ts: now - 60_000, heading: 90, lat: 40, lng: 116 },
      { ts: now - 30_000, heading: 92, lat: 40, lng: 116 },
      { ts: now - 1_000, heading: 91, lat: 40, lng: 116 },
    ]);
    const ev = detectEvents([ac({})], tracks, DEFAULT_THRESHOLDS, now);
    expect(ev.find((e) => e.kind === 'suspected_holding')).toBeFalsy();
  });

  it('窗口外的旧点被忽略', () => {
    const now = 1_000_000;
    const tracks = new Map<string, TrackPoint[]>();
    tracks.set('a1', [
      { ts: now - 200_000, heading: 0, lat: 40, lng: 116 }, // 超出 90s 窗口
      { ts: now - 1_000, heading: 270, lat: 40, lng: 116 },
    ]);
    const ev = detectEvents([ac({})], tracks, DEFAULT_THRESHOLDS, now);
    expect(ev.find((e) => e.kind === 'suspected_holding')).toBeFalsy(); // 仅 1 个有效点
  });

  it('同机可同时命中多类(紧急+快速下降)', () => {
    const ev = detectEvents([ac({ squawk: '7700', verticalRate: -15 })], NO_TRACKS);
    const kinds = ev.map((e) => e.kind).sort();
    expect(kinds).toEqual(['emergency_code', 'rapid_descent']);
  });
});
