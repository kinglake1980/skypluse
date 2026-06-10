import type { Aircraft, AlertKind, AlertSeverity, AlertEvidence } from '../../../shared/types';

/** 轨迹采样点(由后端按轮询维护) */
export interface TrackPoint {
  ts: number;
  heading: number | null;
  lat: number;
  lng: number;
}

/** 可配置阈值 */
export interface DetectThresholds {
  /** 快速下降的垂直速率阈值(米/秒,负值);≤ 此值且在空中判定 */
  rapidDescentMps: number;
  /** 疑似盘旋的判定窗口(毫秒) */
  holdingWindowMs: number;
  /** 窗口内累计航向变化达到该角度(度)判定盘旋 */
  holdingTurnDeg: number;
}

export const DEFAULT_THRESHOLDS: DetectThresholds = {
  rapidDescentMps: -10,
  holdingWindowMs: 90_000,
  holdingTurnDeg: 270,
};

export interface DetectedEvent {
  icao24: string;
  callsign: string | null;
  kind: AlertKind;
  severity: AlertSeverity;
  evidence: AlertEvidence;
}

const EMERGENCY_SQUAWKS = new Set(['7500', '7600', '7700']);

/** 最短带符号航向差 [-180,180) */
function headingDelta(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/**
 * 纯函数:按规则识别异动。
 * - 紧急代码:squawk ∈ {7500,7600,7700}
 * - 快速下降:verticalRate ≤ 阈值 且 在空中
 * - 疑似盘旋:窗口内累计航向变化 ≥ 阈值(短时间内多次大幅转向)
 * 同一航空器可能命中多类,各自返回一条。
 */
export function detectEvents(
  aircraft: Aircraft[],
  tracks: Map<string, TrackPoint[]>,
  thresholds: DetectThresholds = DEFAULT_THRESHOLDS,
  now: number = Date.now(),
): DetectedEvent[] {
  const out: DetectedEvent[] = [];

  for (const a of aircraft) {
    // 1) 紧急代码
    if (a.squawk && EMERGENCY_SQUAWKS.has(a.squawk)) {
      out.push({
        icao24: a.icao24,
        callsign: a.callsign,
        kind: 'emergency_code',
        severity: 'notice',
        evidence: { squawk: a.squawk },
      });
    }

    // 2) 快速下降
    if (!a.onGround && a.verticalRate != null && a.verticalRate <= thresholds.rapidDescentMps) {
      out.push({
        icao24: a.icao24,
        callsign: a.callsign,
        kind: 'rapid_descent',
        severity: 'info',
        evidence: { verticalRate: a.verticalRate },
      });
    }

    // 3) 疑似盘旋(需轨迹窗口)
    if (!a.onGround) {
      const pts = (tracks.get(a.icao24) ?? []).filter(
        (p) => p.ts >= now - thresholds.holdingWindowMs && p.heading != null,
      );
      if (pts.length >= 3) {
        let sum = 0;
        for (let i = 1; i < pts.length; i++) {
          sum += Math.abs(headingDelta(pts[i - 1].heading as number, pts[i].heading as number));
        }
        if (sum >= thresholds.holdingTurnDeg) {
          out.push({
            icao24: a.icao24,
            callsign: a.callsign,
            kind: 'suspected_holding',
            severity: 'info',
            evidence: {
              headingChangeDeg: Math.round(sum),
              windowSec: Math.round(thresholds.holdingWindowMs / 1000),
            },
          });
        }
      }
    }
  }

  return out;
}
