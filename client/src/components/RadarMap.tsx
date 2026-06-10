import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import type { Aircraft } from '@shared/types';
import AircraftLayer from './AircraftLayer';
import { postRegion } from '../lib/api';

// 京津冀中心(默认初始视野)
const CENTER: [number, number] = [39.75, 116.5];
const WORLD_FIT: [number, number, number, number] = [-55, -150, 70, 160];

interface Props {
  aircraft: Aircraft[];
  selectedId: string | null;
  trail: [number, number][];
  onSelect: (id: string) => void;
  /** 目标视野(预设/全球切换时把地图飞过去);viewport 模式不移动 */
  focus: { bbox: [number, number, number, number] | null; key: string };
  /** 跟随视野开关:开启时把当前地图范围(防抖)上报为活动 bbox */
  follow: boolean;
  /** 切换范围时重置 marker(预设/全球切换);viewport 拖动时保持不变 */
  resetKey: string;
}

/** 预设/全球切换时把地图飞到目标 bbox(每个 key 只触发一次) */
function MapController({ focus }: { focus: Props['focus'] }) {
  const map = useMap();
  const lastKey = useRef<string>('');
  useEffect(() => {
    if (focus.key === lastKey.current) return;
    lastKey.current = focus.key;
    const b = focus.bbox ?? WORLD_FIT;
    map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { animate: true, padding: [24, 24] },
    );
  }, [focus, map]);
  return null;
}

/** 跟随视野:启用后监听 moveend,防抖 ≥500ms 上报当前可视范围 */
function ViewportReporter({ enabled }: { enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const report = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const b = map.getBounds();
        postRegion({
          mode: 'viewport',
          bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()],
        });
      }, 600);
    };
    map.on('moveend', report);
    report(); // 启用时立即上报一次
    return () => {
      clearTimeout(timer);
      map.off('moveend', report);
    };
  }, [enabled, map]);
  return null;
}

export default function RadarMap({ aircraft, selectedId, trail, onSelect, focus, follow, resetKey }: Props) {
  return (
    <MapContainer
      center={CENTER}
      zoom={7}
      className="h-full w-full"
      zoomControl={false}
      style={{ background: '#070b10' }}
      worldCopyJump
    >
      <TileLayer
        // 高德中文路网瓦片(lang=zh_cn);用 CSS 滤镜反相为深色,保留中文标注
        url="https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
        subdomains={['1', '2', '3', '4']}
        attribution="&copy; 高德地图 AutoNavi"
        maxZoom={18}
        className="cn-dark-tiles"
      />
      {trail.length > 1 && (
        <Polyline positions={trail} pathOptions={{ color: '#e2e8f0', weight: 2, opacity: 0.6 }} />
      )}
      <AircraftLayer key={resetKey} aircraft={aircraft} onSelect={onSelect} selectedId={selectedId} />
      <MapController focus={focus} />
      <ViewportReporter enabled={follow} />
    </MapContainer>
  );
}
