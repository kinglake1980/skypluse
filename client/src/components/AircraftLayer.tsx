import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Aircraft } from '@shared/types';
import { deadReckon, lerpAngle } from '../lib/interpolate';

// ── 调参 ──
const CORRECTION_MS = 800; // 新快照到达后,位置偏移在这段时间内平滑收敛(避免瞬移)
const HEADING_TAU = 250; // 航向平滑时间常数(ms),越大转向越柔
const STALE_MS = 15_000; // 超过此时长未更新 → 开始淡出(约 1.5 个轮询周期)
const FADE_MS = 5_000; // 淡出过渡时长
const REMOVE_MS = STALE_MS + FADE_MS; // 彻底移除

/** 按高度分级着色:高=青、中=绿、低=琥珀;地面/未知=灰 */
function colorFor(altitude: number | null, onGround: boolean): string {
  if (onGround) return '#64748b';
  if (altitude == null) return '#94a3b8';
  if (altitude >= 9000) return '#22d3ee';
  if (altitude >= 3000) return '#4ade80';
  return '#f59e0b';
}

const EMERGENCY_SQUAWKS = new Set(['7500', '7600', '7700']);
const isEmergency = (squawk: string | null) => squawk != null && EMERGENCY_SQUAWKS.has(squawk);

function makeIcon(color: string, heading: number, opacity: number): L.DivIcon {
  const html =
    `<div class="plane-wrap">` +
    `<div class="plane-ring"></div>` +
    `<div class="plane-body" style="transform: rotate(${heading}deg); opacity:${opacity}; will-change: transform;">` +
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="${color}" stroke="rgba(0,0,0,0.6)" stroke-width="0.6">` +
    `<path d="M21 16v-2l-8-5V3.5C13 2.67 12.33 2 11.5 2S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>` +
    `</svg></div>` +
    `</div>`;
  return L.divIcon({ html, className: 'plane-icon', iconSize: [28, 28], iconAnchor: [14, 14] });
}

interface Entry {
  marker: L.Marker;
  // 航位推算原点(来自最近快照)
  baseLat: number;
  baseLng: number;
  velocity: number;
  heading: number;
  baseTime: number;
  // 新快照时的残余偏移(渲染位 - 新基准位),在 CORRECTION_MS 内衰减到 0
  offLat: number;
  offLng: number;
  offStart: number;
  // 当前渲染位(每帧写入,供下次快照计算偏移)
  renderLat: number;
  renderLng: number;
  // 航向平滑
  dispHeading: number;
  targetHeading: number;
  // 外观
  color: string;
  onGround: boolean;
  emergency: boolean;
  lastSeen: number;
}

interface Props {
  aircraft: Aircraft[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}

/**
 * 飞机渲染层:在两次 SSE 快照之间用 requestAnimationFrame 持续推进位置,
 * 直接操作 Leaflet marker(绕过 React 重渲染),保证 ~60fps 平滑。
 * 点击 marker 触发 onSelect;选中目标高亮。
 */
export default function AircraftLayer({ aircraft, onSelect, selectedId }: Props) {
  const map = useMap();
  const storeRef = useRef<Map<string, Entry>>(new Map());
  // 用 ref 持有最新回调/选中态,避免重建 marker 监听
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  // 快照到达:更新各飞机的航位推算基准 + 平滑校正偏移
  useEffect(() => {
    const now = Date.now();
    const store = storeRef.current;

    for (const a of aircraft) {
      const color = colorFor(a.altitude, a.onGround);
      const heading = a.heading ?? null;
      const velocity = a.velocity ?? 0;
      let e = store.get(a.icao24);

      if (!e) {
        const h = heading ?? 0;
        const marker = L.marker([a.lat, a.lng], {
          icon: makeIcon(color, h, a.onGround ? 0.4 : 1),
          keyboard: false,
        }).addTo(map);
        marker.on('click', () => onSelectRef.current(a.icao24));
        store.set(a.icao24, {
          marker,
          baseLat: a.lat,
          baseLng: a.lng,
          velocity,
          heading: h,
          baseTime: now,
          offLat: 0,
          offLng: 0,
          offStart: now,
          renderLat: a.lat,
          renderLng: a.lng,
          dispHeading: h,
          targetHeading: h,
          color,
          onGround: a.onGround,
          emergency: isEmergency(a.squawk),
          lastSeen: now,
        });
      } else {
        // 以当前渲染位为起点,平滑过渡到新的权威位置
        e.offLat = e.renderLat - a.lat;
        e.offLng = e.renderLng - a.lng;
        e.offStart = now;
        e.baseLat = a.lat;
        e.baseLng = a.lng;
        e.velocity = velocity;
        if (heading != null) {
          e.heading = heading;
          e.targetHeading = heading;
        }
        e.baseTime = now;
        e.lastSeen = now;
        e.onGround = a.onGround;
        e.emergency = isEmergency(a.squawk);
        if (color !== e.color) {
          e.color = color;
          e.marker.setIcon(makeIcon(color, e.dispHeading, a.onGround ? 0.4 : 1));
        }
      }
    }
    // 未在本快照中的飞机:不更新 lastSeen,交由动画循环淡出/移除
  }, [aircraft, map]);

  // 动画循环
  useEffect(() => {
    let raf = 0;
    let lastFrame = Date.now();
    const store = storeRef.current;

    const tick = () => {
      const now = Date.now();
      const dt = now - lastFrame;
      lastFrame = now;

      for (const [id, e] of store) {
        const pred = deadReckon({
          lat: e.baseLat,
          lng: e.baseLng,
          velocity: e.velocity,
          heading: e.heading,
          elapsedMs: now - e.baseTime,
        });
        const corr = Math.min(1, (now - e.offStart) / CORRECTION_MS);
        const f = 1 - corr; // 偏移衰减系数
        e.renderLat = pred.lat + e.offLat * f;
        e.renderLng = pred.lng + e.offLng * f;
        e.marker.setLatLng([e.renderLat, e.renderLng]);

        // 航向指数平滑
        const k = 1 - Math.exp(-dt / HEADING_TAU);
        e.dispHeading = lerpAngle(e.dispHeading, e.targetHeading, k);

        // 淡出 / 移除
        const age = now - e.lastSeen;
        if (age > REMOVE_MS) {
          map.removeLayer(e.marker);
          store.delete(id);
          continue;
        }
        let opacity = e.onGround ? 0.4 : 1;
        if (age > STALE_MS) {
          opacity *= 1 - Math.min(1, (age - STALE_MS) / FADE_MS);
        }

        const wrap = e.marker.getElement()?.firstElementChild as HTMLElement | null;
        if (wrap) {
          const body = wrap.querySelector('.plane-body') as HTMLElement | null;
          if (body) {
            body.style.transform = `rotate(${e.dispHeading}deg)`;
            body.style.opacity = String(opacity);
            body.style.filter =
              id === selectedRef.current ? 'drop-shadow(0 0 5px rgba(163,230,53,0.95))' : '';
          }
          wrap.classList.toggle('is-emergency', e.emergency);
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      for (const [, e] of store) map.removeLayer(e.marker);
      store.clear();
    };
  }, [map]);

  return null;
}
