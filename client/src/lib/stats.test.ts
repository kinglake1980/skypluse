import { describe, it, expect } from 'vitest';
import { computeRegionStats } from './stats';
import type { Aircraft } from '@shared/types';

function ac(partial: Partial<Aircraft>): Aircraft {
  return {
    icao24: 'x',
    callsign: null,
    country: null,
    lng: 0,
    lat: 0,
    altitude: null,
    velocity: null,
    heading: null,
    verticalRate: null,
    squawk: null,
    onGround: false,
    ...partial,
  };
}

describe('computeRegionStats', () => {
  it('空列表:全 0,平均高度为 null', () => {
    expect(computeRegionStats([])).toEqual({
      count: 0,
      climbing: 0,
      cruising: 0,
      descending: 0,
      avgAltitudeM: null,
    });
  });

  it('按垂直速率分类爬升/巡航/下降', () => {
    const list = [
      ac({ verticalRate: 5 }), // 爬升
      ac({ verticalRate: -5 }), // 下降
      ac({ verticalRate: 0 }), // 巡航
      ac({ verticalRate: 0.5 }), // 阈值内 → 巡航
      ac({ verticalRate: null }), // 缺失 → 巡航
    ];
    const s = computeRegionStats(list);
    expect(s.count).toBe(5);
    expect(s.climbing).toBe(1);
    expect(s.descending).toBe(1);
    expect(s.cruising).toBe(3);
  });

  it('平均高度:排除地面与缺失高度', () => {
    const list = [
      ac({ altitude: 10000 }),
      ac({ altitude: 8000 }),
      ac({ altitude: 5000, onGround: true }), // 地面,排除
      ac({ altitude: null }), // 缺失,排除
    ];
    const s = computeRegionStats(list);
    expect(s.avgAltitudeM).toBe(9000); // (10000+8000)/2
    expect(s.count).toBe(4);
  });

  it('全部地面/缺失高度时平均为 null', () => {
    const list = [ac({ altitude: 100, onGround: true }), ac({ altitude: null })];
    expect(computeRegionStats(list).avgAltitudeM).toBeNull();
  });
});
