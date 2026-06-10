import { describe, it, expect } from 'vitest';
import { buildSnapshotSummary } from './buildSnapshotSummary';
import type { Aircraft } from '../../../shared/types';

const BBOX: [number, number, number, number] = [38.0, 114.0, 41.5, 119.0];

function ac(partial: Partial<Aircraft>): Aircraft {
  return {
    icao24: 'x',
    callsign: null,
    country: null,
    lng: 116.5,
    lat: 39.75,
    altitude: null,
    velocity: null,
    heading: null,
    verticalRate: null,
    squawk: null,
    onGround: false,
    ...partial,
  };
}

describe('buildSnapshotSummary', () => {
  it('空集合:计数为 0,均值为 null,态势 light', () => {
    const s = buildSnapshotSummary([], BBOX);
    expect(s.count).toBe(0);
    expect(s.avgAltitudeM).toBeNull();
    expect(s.avgSpeedMs).toBeNull();
    expect(s.densestArea).toBeNull();
    expect(s.stance).toBe('light');
  });

  it('垂直速率分类与高度分档', () => {
    const s = buildSnapshotSummary(
      [
        ac({ verticalRate: 5, altitude: 1000 }), // 爬升, low
        ac({ verticalRate: -5, altitude: 5000 }), // 下降, mid
        ac({ verticalRate: 0, altitude: 11000 }), // 巡航, high
        ac({ verticalRate: 0, altitude: 2000, onGround: true }), // 地面不计高度
      ],
      BBOX,
    );
    expect(s.count).toBe(4);
    expect(s.climbing).toBe(1);
    expect(s.descending).toBe(1);
    expect(s.cruising).toBe(2);
    expect(s.altBands).toEqual({ low: 1, mid: 1, high: 1 });
  });

  it('态势随架数升级', () => {
    const mk = (n: number) => buildSnapshotSummary(Array.from({ length: n }, () => ac({})), BBOX).stance;
    expect(mk(5)).toBe('light');
    expect(mk(20)).toBe('moderate');
    expect(mk(45)).toBe('busy');
    expect(mk(80)).toBe('heavy');
  });

  it('主要流向取数量最多的扇区(中文方位)', () => {
    const s = buildSnapshotSummary(
      [ac({ heading: 90 }), ac({ heading: 88 }), ac({ heading: 270 })],
      BBOX,
    );
    expect(s.dominantHeadings[0]).toBe('东'); // 90° 最多
    expect(s.dominantHeadings).toContain('西');
  });

  it('最密集区域定位到东北部', () => {
    // 放几架到 bbox 东北角
    const s = buildSnapshotSummary(
      [
        ac({ lat: 41.3, lng: 118.5 }),
        ac({ lat: 41.2, lng: 118.6 }),
        ac({ lat: 41.4, lng: 118.7 }),
        ac({ lat: 38.2, lng: 114.2 }), // 西南角一架
      ],
      BBOX,
    );
    expect(s.densestArea?.label).toBe('东北部');
    expect(s.densestArea?.count).toBe(3);
  });
});
