import { describe, it, expect } from 'vitest';
import { deadReckon, lerp, lerpAngle, clamp01 } from './interpolate';

describe('deadReckon', () => {
  it('航向 0(正北)只增加纬度,经度基本不变', () => {
    const r = deadReckon({ lat: 40, lng: 116, velocity: 100, heading: 0, elapsedMs: 1000 });
    expect(r.lat).toBeGreaterThan(40);
    expect(r.lng).toBeCloseTo(116, 9);
    // 100 m/s * 1s = 100m ≈ 0.000899 度纬度
    expect(r.lat - 40).toBeCloseTo(0.000899, 5);
  });

  it('航向 90(正东)只增加经度,纬度基本不变', () => {
    const r = deadReckon({ lat: 40, lng: 116, velocity: 100, heading: 90, elapsedMs: 1000 });
    expect(r.lng).toBeGreaterThan(116);
    expect(r.lat).toBeCloseTo(40, 9);
  });

  it('航向 180(正南)减少纬度', () => {
    const r = deadReckon({ lat: 40, lng: 116, velocity: 100, heading: 180, elapsedMs: 1000 });
    expect(r.lat).toBeLessThan(40);
  });

  it('经度随纬度收敛:同样东向位移在高纬度对应更大的经度变化', () => {
    const lowLat = deadReckon({ lat: 0, lng: 0, velocity: 100, heading: 90, elapsedMs: 1000 });
    const highLat = deadReckon({ lat: 60, lng: 0, velocity: 100, heading: 90, elapsedMs: 1000 });
    const dLow = lowLat.lng - 0;
    const dHigh = highLat.lng - 0;
    // 1/cos(60°) = 2,故高纬度经度变化约为低纬度的 2 倍
    expect(dHigh / dLow).toBeCloseTo(2, 2);
  });

  it('velocity 为 null 或 0、elapsed<=0 时原位返回', () => {
    const base = { lat: 40, lng: 116, heading: 90 };
    expect(deadReckon({ ...base, velocity: null, elapsedMs: 1000 })).toEqual({ lat: 40, lng: 116 });
    expect(deadReckon({ ...base, velocity: 0, elapsedMs: 1000 })).toEqual({ lat: 40, lng: 116 });
    expect(deadReckon({ ...base, velocity: 100, elapsedMs: 0 })).toEqual({ lat: 40, lng: 116 });
  });
});

describe('lerp / clamp01', () => {
  it('线性插值与限幅', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, -1)).toBe(0); // clamp
    expect(lerp(0, 10, 2)).toBe(10); // clamp
    expect(clamp01(0.3)).toBe(0.3);
  });
});

describe('lerpAngle', () => {
  it('走最短路径并跨 360 边界', () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0, 6); // 经 360,而非反向
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0, 6);
  });
  it('常规中点', () => {
    expect(lerpAngle(0, 90, 0.5)).toBeCloseTo(45, 6);
  });
  it('结果规整到 [0,360)', () => {
    const r = lerpAngle(350, 10, 1);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(360);
    expect(r).toBeCloseTo(10, 6);
  });
});
