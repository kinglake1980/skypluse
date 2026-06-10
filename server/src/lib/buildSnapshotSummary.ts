import type { Aircraft } from '../../../shared/types';

/** 态势等级(由密度粗分,确定性计算,便于测试与避免臆断) */
export type Stance = 'light' | 'moderate' | 'busy' | 'heavy';

export interface SnapshotSummary {
  count: number;
  climbing: number;
  cruising: number;
  descending: number;
  /** 高度分布(米,仅在空且高度有效):low<3000,3000≤mid<9000,high≥9000 */
  altBands: { low: number; mid: number; high: number };
  avgAltitudeM: number | null;
  avgSpeedMs: number | null;
  /** 主要流向(航空器朝向的中文方位,按数量取前若干) */
  dominantHeadings: string[];
  /** 最密集的粗略区域(3×3 网格)中文标签与数量;无目标时 null */
  densestArea: { label: string; count: number } | null;
  /** 态势标签 */
  stance: Stance;
}

const VR_THRESHOLD = 1; // m/s
const SECTOR_CN = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

function headingSector(h: number): number {
  return Math.round((((h % 360) + 360) % 360) / 45) % 8;
}

function stanceOf(count: number): Stance {
  if (count <= 10) return 'light';
  if (count <= 30) return 'moderate';
  if (count <= 60) return 'busy';
  return 'heavy';
}

/** 3×3 网格中文方位:纬度高=北,经度高=东 */
function cellLabel(row: number, col: number): string {
  const vert = row === 2 ? '北' : row === 0 ? '南' : '中';
  const horiz = col === 0 ? '西' : col === 2 ? '东' : '中';
  if (vert === '中' && horiz === '中') return '中部';
  if (vert === '中') return `${horiz}部`;
  if (horiz === '中') return `${vert}部`;
  return `${horiz}${vert}部`; // 东+北 → 东北部
}

/**
 * 纯函数:把当前飞机集合聚合成紧凑摘要,供解说 agent 作为客观依据。
 * 不含任何对具体航班的判断。
 */
export function buildSnapshotSummary(
  aircraft: Aircraft[],
  bbox: [number, number, number, number],
): SnapshotSummary {
  const [lamin, lomin, lamax, lomax] = bbox;
  let climbing = 0;
  let cruising = 0;
  let descending = 0;
  let low = 0;
  let mid = 0;
  let high = 0;
  let altSum = 0;
  let altN = 0;
  let spdSum = 0;
  let spdN = 0;
  const sectors = new Array(8).fill(0) as number[];
  const grid = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  const latSpan = lamax - lamin || 1;
  const lngSpan = lomax - lomin || 1;

  for (const a of aircraft) {
    const vr = a.verticalRate;
    if (vr != null && vr > VR_THRESHOLD) climbing++;
    else if (vr != null && vr < -VR_THRESHOLD) descending++;
    else cruising++;

    if (a.altitude != null && !a.onGround) {
      if (a.altitude < 3000) low++;
      else if (a.altitude < 9000) mid++;
      else high++;
      altSum += a.altitude;
      altN++;
    }

    if (a.velocity != null) {
      spdSum += a.velocity;
      spdN++;
    }

    if (a.heading != null) sectors[headingSector(a.heading)]++;

    // 网格归属(限制在 0..2)
    const row = Math.min(2, Math.max(0, Math.floor(((a.lat - lamin) / latSpan) * 3)));
    const col = Math.min(2, Math.max(0, Math.floor(((a.lng - lomin) / lngSpan) * 3)));
    grid[row][col]++;
  }

  // 主要流向:取数量前二且非空的扇区
  const dominantHeadings = sectors
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c > 0)
    .sort((a, b) => b.c - a.c)
    .slice(0, 2)
    .map((x) => SECTOR_CN[x.i]);

  // 最密集网格
  let densestArea: SnapshotSummary['densestArea'] = null;
  let best = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (grid[r][c] > best) {
        best = grid[r][c];
        densestArea = { label: cellLabel(r, c), count: grid[r][c] };
      }
    }
  }

  return {
    count: aircraft.length,
    climbing,
    cruising,
    descending,
    altBands: { low, mid, high },
    avgAltitudeM: altN > 0 ? altSum / altN : null,
    avgSpeedMs: spdN > 0 ? spdSum / spdN : null,
    dominantHeadings,
    densestArea,
    stance: stanceOf(aircraft.length),
  };
}

export const STANCE_LABEL: Record<Stance, string> = {
  light: '清淡',
  moderate: '平稳',
  busy: '流量偏高',
  heavy: '繁忙',
};
