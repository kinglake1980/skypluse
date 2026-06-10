import express, { type Response } from 'express';
import cors from 'cors';
import { config } from './config';
import { getStates } from './opensky/client';
import { startCommentary } from './agents/commentary';
import { explainEvent } from './agents/alert';
import { detectEvents, type TrackPoint } from './lib/detectEvents';
import { PRESETS, DEFAULT_REGION, WORLD_BBOX } from './regions';
import type { Aircraft, Alert, SnapshotStats } from '../../shared/types';

const app = express();
app.use(cors());
app.use(express.json());

// ── SSE 扇出中心 ──
const clients = new Set<Response>();
function send(res: Response, obj: unknown) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}
function broadcast(obj: unknown) {
  for (const res of clients) send(res, obj);
}

// ── 活动范围(全局单例:任一时刻只有一个取数范围) ──
type Mode = 'preset' | 'viewport' | 'global';
interface Active {
  mode: Mode;
  region: string | null; // 预设 key;viewport/global 为 null
  name: string; // 展示名
  bbox: [number, number, number, number] | null; // null = 全球
}
let active: Active = {
  mode: 'preset',
  region: DEFAULT_REGION,
  name: PRESETS[DEFAULT_REGION].name,
  bbox: PRESETS[DEFAULT_REGION].bbox,
};
const currentInterval = () =>
  active.mode === 'global' ? config.globalPollIntervalMs : config.pollIntervalMs;

// ── 轮询/检测状态 ──
let latestSnapshot: { type: 'snapshot'; payload: unknown } | null = null;
let latestAircraft: Aircraft[] = [];
let status = {
  mode: active.mode,
  region: active.region,
  regionName: active.name,
  bbox: active.bbox,
  upstreamOk: false,
  message: '启动中…',
};

const trackWindow = new Map<string, TrackPoint[]>();
const alertCooldown = new Map<string, number>();
const TRACK_RETAIN_MS = Math.max(config.events.holdingWindowMs, 120_000);

function updateTracks(aircraft: Aircraft[], now: number) {
  const seen = new Set<string>();
  for (const a of aircraft) {
    seen.add(a.icao24);
    const arr = trackWindow.get(a.icao24) ?? [];
    arr.push({ ts: now, heading: a.heading, lat: a.lat, lng: a.lng });
    while (arr.length && arr[0].ts < now - TRACK_RETAIN_MS) arr.shift();
    trackWindow.set(a.icao24, arr);
  }
  for (const key of trackWindow.keys()) if (!seen.has(key)) trackWindow.delete(key);
}

async function handleDetection(aircraft: Aircraft[], now: number) {
  const events = detectEvents(aircraft, trackWindow, config.events, now);
  for (const ev of events) {
    const key = `${ev.icao24}:${ev.kind}`;
    const last = alertCooldown.get(key) ?? 0;
    if (now - last < config.events.cooldownMs) continue;
    alertCooldown.set(key, now);

    const text = await explainEvent(ev);
    const alert: Alert = {
      id: `a_${ev.icao24}_${ev.kind}_${now}`,
      icao24: ev.icao24,
      callsign: ev.callsign,
      kind: ev.kind,
      severity: ev.severity,
      text,
      evidence: ev.evidence,
      ts: Date.now(),
    };
    broadcast({ type: 'alert', payload: alert });
    console.log(`[alert] ${ev.kind} ${ev.callsign ?? ev.icao24}`);
  }
}

function computeStats(aircraft: Aircraft[]): SnapshotStats {
  let climbing = 0;
  let descending = 0;
  let cruising = 0;
  for (const a of aircraft) {
    const vr = a.verticalRate;
    if (vr != null && vr > 1) climbing++;
    else if (vr != null && vr < -1) descending++;
    else cruising++;
  }
  return { count: aircraft.length, climbing, descending, cruising };
}

/** 均匀抽稀到至多 cap 架(全球模式用,避免前端渲染上万 marker) */
function thin<T>(arr: T[], cap: number): T[] {
  if (arr.length <= cap) return arr;
  const out: T[] = [];
  const step = arr.length / cap;
  for (let i = 0; i < cap; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

async function poll() {
  try {
    const { time, aircraft } = await getStates(active.bbox);
    latestAircraft = aircraft;
    const now = Date.now();
    updateTracks(aircraft, now);
    void handleDetection(aircraft, now); // 不阻塞轮询节奏
    const stats = computeStats(aircraft); // 基于全量
    const rendered = active.mode === 'global' ? thin(aircraft, config.maxGlobalRender) : aircraft;
    const dataAgeSec = Math.max(0, Math.round(now / 1000 - time));
    latestSnapshot = {
      type: 'snapshot',
      payload: {
        aircraft: rendered,
        stats,
        total: aircraft.length,
        serverTime: now,
        dataAgeSec,
        mode: active.mode,
        region: active.region,
        regionName: active.name,
        bbox: active.bbox,
      },
    };
    status = {
      mode: active.mode,
      region: active.region,
      regionName: active.name,
      bbox: active.bbox,
      upstreamOk: true,
      message: `ok · ${aircraft.length} 架`,
    };
    broadcast(latestSnapshot);
    broadcast({ type: 'status', payload: status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    status = {
      mode: active.mode,
      region: active.region,
      regionName: active.name,
      bbox: active.bbox,
      upstreamOk: false,
      message: msg,
    };
    broadcast({ type: 'status', payload: status });
    console.error('[poll] 取数失败:', msg);
  }
}

// ── 自调度轮询(支持随模式切换变更间隔) ──
let pollTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleNext() {
  pollTimer = setTimeout(loop, currentInterval());
}
async function loop() {
  await poll();
  scheduleNext();
}
async function repoll() {
  if (pollTimer) clearTimeout(pollTimer);
  await poll();
  scheduleNext();
}

function setActive(next: Active) {
  active = next;
  status = { ...status, mode: active.mode, region: active.region, regionName: active.name, bbox: active.bbox };
  broadcast({ type: 'status', payload: status });
  console.log(`[region] → ${active.mode} ${active.name} bbox=${active.bbox ? active.bbox.join(',') : '全球'}`);
}

/** 视野护栏:跨度超过上限则围绕中心夹取,并限制在世界范围内 */
function clampViewport(b: [number, number, number, number]): [number, number, number, number] {
  let [lamin, lomin, lamax, lomax] = b;
  if (lamin > lamax) [lamin, lamax] = [lamax, lamin];
  if (lomin > lomax) [lomin, lomax] = [lomax, lomin];
  const max = config.maxViewportDeg;
  const latC = (lamin + lamax) / 2;
  const lngC = (lomin + lomax) / 2;
  if (lamax - lamin > max) {
    lamin = latC - max / 2;
    lamax = latC + max / 2;
  }
  if (lomax - lomin > max) {
    lomin = lngC - max / 2;
    lomax = lngC + max / 2;
  }
  return [
    Math.max(-90, lamin),
    Math.max(-180, lomin),
    Math.min(90, lamax),
    Math.min(180, lomax),
  ];
}

// ── 路由 ──
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: active.mode, regionName: active.name, bbox: active.bbox, clients: clients.size });
});

app.get('/api/regions', (_req, res) => {
  res.json({
    presets: Object.entries(PRESETS).map(([key, p]) => ({ key, name: p.name, bbox: p.bbox })),
    active: { mode: active.mode, region: active.region, regionName: active.name, bbox: active.bbox },
  });
});

// 切换活动范围(全局生效):preset | viewport | global
app.post('/api/region', (req, res) => {
  const body = req.body ?? {};
  if (body.mode === 'global') {
    setActive({ mode: 'global', region: null, name: '全球', bbox: null });
  } else if (body.mode === 'preset') {
    const p = PRESETS[body.region];
    if (!p) return res.status(400).json({ error: 'unknown region' });
    setActive({ mode: 'preset', region: body.region, name: p.name, bbox: p.bbox });
  } else if (body.mode === 'viewport') {
    const b = body.bbox;
    if (!Array.isArray(b) || b.length !== 4 || !b.every((n: unknown) => Number.isFinite(n))) {
      return res.status(400).json({ error: 'bad bbox' });
    }
    setActive({
      mode: 'viewport',
      region: null,
      name: '跟随视野',
      bbox: clampViewport(b as [number, number, number, number]),
    });
  } else {
    return res.status(400).json({ error: 'bad mode' });
  }
  res.json({ mode: active.mode, region: active.region, regionName: active.name, bbox: active.bbox, pollIntervalMs: currentInterval() });
  void repoll(); // 立即按新范围取一帧
});

app.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  clients.add(res);
  send(res, { type: 'status', payload: status });
  if (latestSnapshot) send(res, latestSnapshot);
  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 15_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});

app.listen(config.port, () => {
  console.log(`[server] SkyPulse 后端已启动 http://localhost:${config.port}`);
  console.log(`[server] 默认区域 ${active.name} bbox=${active.bbox?.join(',')} 轮询 ${config.pollIntervalMs}ms / 全球 ${config.globalPollIntervalMs}ms`);
  void repoll();

  startCommentary({
    getAircraft: () => latestAircraft,
    getContext: () => ({ regionName: active.name, bbox: active.bbox ?? WORLD_BBOX }),
    intervalMs: config.narrationIntervalMs,
    broadcast,
  });
  console.log(`[server] 解说间隔 ${config.narrationIntervalMs}ms 模型 ${config.deepseek.model}`);
});
