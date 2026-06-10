// 纯函数:航位推算(dead reckoning)与角度/数值插值。无副作用,便于单测。

const R_EARTH = 6_378_137; // 地球半径(米,WGS84 长半轴)
const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

export interface DeadReckonInput {
  /** 上一已知纬度(度) */
  lat: number;
  /** 上一已知经度(度) */
  lng: number;
  /** 地速(米/秒);null/<=0 视为不动 */
  velocity: number | null;
  /** 航向(度,正北为 0,顺时针);null 视为不动 */
  heading: number | null;
  /** 经过的毫秒数;<=0 返回原位 */
  elapsedMs: number;
}

/**
 * 用航位推算估算当前经纬度。
 * 采用等距圆柱(flat-earth)近似:短时间、短距离下误差可忽略。
 * 经度步长按所在纬度做收敛修正(除以 cos(lat)),高纬度同样的东向位移对应更大的经度变化。
 */
export function deadReckon(i: DeadReckonInput): { lat: number; lng: number } {
  const { lat, lng, velocity, heading, elapsedMs } = i;
  if (velocity == null || heading == null || velocity <= 0 || elapsedMs <= 0) {
    return { lat, lng };
  }
  const dist = velocity * (elapsedMs / 1000); // 位移(米)
  const hr = heading * DEG2RAD;
  const dNorth = dist * Math.cos(hr); // 北向分量(米)
  const dEast = dist * Math.sin(hr); // 东向分量(米)

  const dLat = (dNorth / R_EARTH) * RAD2DEG;
  const cosLat = Math.cos(lat * DEG2RAD);
  const dLng = (dEast / (R_EARTH * (Math.abs(cosLat) < 1e-6 ? 1e-6 : cosLat))) * RAD2DEG;

  return { lat: lat + dLat, lng: lng + dLng };
}

/** 区间限制到 [0,1] */
export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** 线性插值 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/**
 * 角度插值(度),走最短路径,结果规整到 [0,360)。
 * 例:lerpAngle(350, 10, 0.5) === 0(经 360 过渡,而非反向掉头到 180)。
 */
export function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((((b - a) % 360) + 540) % 360) - 180; // 最短带符号差 [-180,180)
  const r = a + diff * clamp01(t);
  return ((r % 360) + 360) % 360;
}
