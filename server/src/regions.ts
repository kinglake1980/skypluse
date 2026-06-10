/** 预设聚焦区域(bbox = [lamin, lomin, lamax, lomax]) */
export interface RegionPreset {
  name: string;
  bbox: [number, number, number, number];
}

export const PRESETS: Record<string, RegionPreset> = {
  bj: { name: '京津冀', bbox: [38.0, 114.0, 41.5, 119.0] },
  yrd: { name: '长三角', bbox: [29.0, 118.0, 33.0, 123.0] },
  gba: { name: '粤港澳', bbox: [21.5, 112.0, 23.8, 115.0] },
  ncn: { name: '华北', bbox: [35.0, 112.0, 42.0, 122.0] },
};

export const DEFAULT_REGION = 'bj';

/** 全球模式聚合/解说用的兜底 bbox(网格定位用) */
export const WORLD_BBOX: [number, number, number, number] = [-85, -180, 85, 180];
