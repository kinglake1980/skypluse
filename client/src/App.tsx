import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Aircraft, Alert } from '@shared/types';
import RadarMap from './components/RadarMap';
import TopBar, { type ConnState } from './components/TopBar';
import InfoCard from './components/InfoCard';
import Commentary, { type CommentaryItem } from './components/Commentary';
import AlertFeed from './components/AlertFeed';
import RegionSwitcher from './components/RegionSwitcher';
import { computeRegionStats } from './lib/stats';
import { fetchPresets, postRegion, type PresetInfo } from './lib/api';

const TRAIL_MAX = 20; // 每架保留的尾迹点数(约 20 个快照 ≈ 200s)

type Mode = 'preset' | 'viewport' | 'global';

export default function App() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [conn, setConn] = useState<ConnState>('connecting');
  const [region, setRegion] = useState('京津冀');
  const [dataAge, setDataAge] = useState<number | null>(null);
  const [upstream, setUpstream] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [commentaries, setCommentaries] = useState<CommentaryItem[]>([]);
  const [streaming, setStreaming] = useState<{ id: string; text: string } | null>(null);
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // 多区域 / 全球
  const [mode, setMode] = useState<Mode>('preset');
  const [regionKey, setRegionKey] = useState<string | null>('bj');
  const [activeBbox, setActiveBbox] = useState<[number, number, number, number] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [follow, setFollow] = useState(false);

  const historyRef = useRef<Map<string, [number, number][]>>(new Map());
  const lastSelectedRef = useRef<Aircraft | null>(null);

  useEffect(() => {
    fetchPresets().then(setPresets);
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onopen = () => setConn('live');
    es.onerror = () => setConn('error');
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type: string; payload: any };
        if (msg.type === 'snapshot') {
          const p = msg.payload;
          const list: Aircraft[] = p.aircraft ?? [];
          // 更新尾迹历史:仅对位置变化追加点,按上限裁剪,清理已离开目标
          const h = historyRef.current;
          const seen = new Set<string>();
          for (const a of list) {
            seen.add(a.icao24);
            const arr = h.get(a.icao24) ?? [];
            const last = arr[arr.length - 1];
            if (!last || last[0] !== a.lat || last[1] !== a.lng) arr.push([a.lat, a.lng]);
            if (arr.length > TRAIL_MAX) arr.splice(0, arr.length - TRAIL_MAX);
            h.set(a.icao24, arr);
          }
          for (const key of h.keys()) if (!seen.has(key)) h.delete(key);

          setAircraft(list);
          setDataAge(p.dataAgeSec ?? null);
          if (p.regionName) setRegion(p.regionName);
          if (p.mode) setMode(p.mode);
          setRegionKey(p.region ?? null);
          setActiveBbox(p.bbox ?? null);
          if (typeof p.total === 'number') setTotal(p.total);
        } else if (msg.type === 'status') {
          const p = msg.payload;
          if (p.regionName) setRegion(p.regionName);
          if (p.mode) setMode(p.mode);
          setRegionKey(p.region ?? null);
          setActiveBbox(p.bbox ?? null);
          setUpstream(p.message ?? '');
        } else if (msg.type === 'narration_start') {
          setStreaming({ id: msg.payload.id, text: '' });
          setNextAt(null);
        } else if (msg.type === 'narration_delta') {
          setStreaming((s) =>
            s && s.id === msg.payload.id ? { ...s, text: s.text + msg.payload.delta } : s,
          );
        } else if (msg.type === 'narration_done') {
          const p = msg.payload;
          setCommentaries((prev) =>
            [
              { id: p.id, text: p.text, stance: p.stance, stanceLabel: p.stanceLabel, ts: p.ts },
              ...prev,
            ].slice(0, 12),
          );
          setStreaming(null);
          setNextAt(Date.now() + (p.intervalMs ?? 30000));
        } else if (msg.type === 'narration_error') {
          setStreaming(null);
        } else if (msg.type === 'alert') {
          setAlerts((prev) => [msg.payload as Alert, ...prev].slice(0, 30));
        }
      } catch {
        /* 忽略心跳/非 JSON 行 */
      }
    };
    return () => es.close();
  }, []);

  const onSelect = useCallback((id: string) => setSelectedId(id), []);
  const regionStats = useMemo(() => computeRegionStats(aircraft), [aircraft]);

  // 选中目标:本帧存在则取最新,否则沿用最近已知并标记 stale
  const fresh = selectedId ? aircraft.find((a) => a.icao24 === selectedId) ?? null : null;
  if (fresh) lastSelectedRef.current = fresh;
  const selectedData = fresh ?? (selectedId ? lastSelectedRef.current : null);
  const trail = selectedId ? historyRef.current.get(selectedId) ?? [] : [];

  // 切换范围:清选中,关闭/开启跟随,通知后端
  const choosePreset = useCallback((key: string) => {
    setSelectedId(null);
    setFollow(false);
    postRegion({ mode: 'preset', region: key });
  }, []);
  const chooseGlobal = useCallback(() => {
    setSelectedId(null);
    setFollow(false);
    postRegion({ mode: 'global' });
  }, []);
  const toggleFollow = useCallback(() => {
    setSelectedId(null);
    setFollow((f) => !f); // 开启后由 ViewportReporter 上报当前视野
  }, []);

  // 预设/全球切换时把地图飞过去并重置 marker;viewport 拖动时保持视野与 marker
  const focusKey = mode === 'viewport' ? 'viewport-frozen' : `${mode}:${regionKey ?? ''}`;
  const resetKey = mode === 'preset' ? `preset:${regionKey ?? ''}` : mode;
  const tracked = total ?? regionStats.count;

  return (
    <div className="flex h-full w-full flex-col bg-[#070b10] text-slate-200">
      <TopBar
        region={region}
        mode={mode}
        tracked={tracked}
        conn={conn}
        stats={regionStats}
        dataAge={dataAge}
        upstream={upstream}
      />
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="relative h-[55vh] min-h-0 lg:h-auto lg:flex-1">
          <RadarMap
            aircraft={aircraft}
            selectedId={selectedId}
            trail={trail}
            onSelect={onSelect}
            focus={{ bbox: activeBbox, key: focusKey }}
            follow={follow}
            resetKey={resetKey}
          />
          {/* 装饰层:细网格 + 距离环/准线 + 缓慢雷达扫描 + 角落微辉光(不拦截交互) */}
          <div className="grid-overlay" />
          <div className="corner-glow" />
          <div className="radar-rings" />
          <div className="radar-sweep" />
          <RegionSwitcher
            presets={presets}
            mode={mode}
            region={regionKey}
            follow={follow}
            onPreset={choosePreset}
            onGlobal={chooseGlobal}
            onToggleFollow={toggleFollow}
          />
          {selectedId && (
            <InfoCard
              aircraft={selectedData}
              stale={!fresh}
              onClose={() => {
                setSelectedId(null);
                lastSelectedRef.current = null;
              }}
            />
          )}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1000] bg-gradient-to-t from-black/85 to-transparent px-4 py-2 text-center text-[11px] tracking-wide text-amber-300/90">
            数据可能延迟 / 不完整,仅供学习,不用于实际航行或调度
          </div>
        </div>
        <aside className="flex min-h-0 flex-1 flex-col border-t border-slate-800 bg-[#0a0f15] lg:w-80 lg:flex-none lg:border-l lg:border-t-0">
          <div className="min-h-0 flex-1">
            <Commentary items={commentaries} streaming={streaming} nextAt={nextAt} />
          </div>
          <div className="min-h-0 flex-1 border-t border-slate-800">
            <AlertFeed items={alerts} selectedId={selectedId} onSelect={onSelect} />
          </div>
        </aside>
      </div>
    </div>
  );
}
