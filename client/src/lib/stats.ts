import type { Aircraft } from '@shared/types';

/** 区域统计(供顶栏/侧边展示与后续解说使用) */
export interface RegionStats {
  /** 追踪架数 */
  count: number;
  /** 爬升中 */
  climbing: number;
  /** 巡航/平飞 */
  cruising: number;
  /** 下降中 */
  descending: number;
  /** 平均气压高度(米);无有效样本时为 null */
  avgAltitudeM: number | null;
}

/** 判定爬升/下降的垂直速率阈值(米/秒),与后端 computeStats 一致 */
const VR_THRESHOLD = 1;

/**
 * 纯函数:由当前飞机列表计算区域统计。
 * 平均高度仅统计「在空且高度有效」的目标(排除地面与缺失高度)。
 */
export function computeRegionStats(aircraft: Aircraft[]): RegionStats {
  let climbing = 0;
  let cruising = 0;
  let descending = 0;
  let altSum = 0;
  let altCount = 0;

  for (const a of aircraft) {
    const vr = a.verticalRate;
    if (vr != null && vr > VR_THRESHOLD) climbing++;
    else if (vr != null && vr < -VR_THRESHOLD) descending++;
    else cruising++;

    if (a.altitude != null && !a.onGround) {
      altSum += a.altitude;
      altCount++;
    }
  }

  return {
    count: aircraft.length,
    climbing,
    cruising,
    descending,
    avgAltitudeM: altCount > 0 ? altSum / altCount : null,
  };
}
