export type RegionRequest =
  | { mode: 'preset'; region: string }
  | { mode: 'viewport'; bbox: [number, number, number, number] }
  | { mode: 'global' };

/** 切换后端活动范围(全局单例)。失败静默,不影响数据流。 */
export async function postRegion(body: RegionRequest): Promise<void> {
  try {
    await fetch('/api/region', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    /* 忽略:下一次操作可重试 */
  }
}

export interface PresetInfo {
  key: string;
  name: string;
  bbox: [number, number, number, number];
}

export async function fetchPresets(): Promise<PresetInfo[]> {
  try {
    const r = await fetch('/api/regions');
    const d = await r.json();
    return d.presets ?? [];
  } catch {
    return [];
  }
}
