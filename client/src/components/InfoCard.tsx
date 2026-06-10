import type { Aircraft } from '@shared/types';

interface Props {
  aircraft: Aircraft | null;
  /** 选中目标本帧不在视野/无更新时为 true(展示最近已知并提示) */
  stale: boolean;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="tabular-nums text-slate-100">{value}</span>
    </div>
  );
}

const fmt = (n: number | null, digits = 0, unit = '') =>
  n == null ? '—' : `${n.toLocaleString(undefined, { maximumFractionDigits: digits })}${unit}`;

export default function InfoCard({ aircraft, stale, onClose }: Props) {
  return (
    <div className="card-in absolute right-3 top-3 z-[1000] w-64 rounded-lg border border-lime-500/30 bg-[#0a0f15]/95 p-3 text-sm shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-semibold tracking-wide text-lime-300">
          {aircraft?.callsign?.trim() || aircraft?.icao24 || '—'}
        </div>
        <button
          onClick={onClose}
          className="rounded px-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      {aircraft ? (
        <div>
          <Row label="呼号" value={aircraft.callsign?.trim() || '—'} />
          <Row label="注册国" value={aircraft.country || '—'} />
          <Row label="气压高度" value={fmt(aircraft.altitude, 0, ' m')} />
          <Row
            label="速度"
            value={
              aircraft.velocity == null
                ? '—'
                : `${Math.round(aircraft.velocity)} m/s · ${Math.round(aircraft.velocity * 3.6)} km/h`
            }
          />
          <Row label="航向" value={fmt(aircraft.heading, 0, '°')} />
          <Row label="垂直速率" value={fmt(aircraft.verticalRate, 1, ' m/s')} />
          <Row label="Squawk" value={aircraft.squawk || '—'} />
          <Row label="是否在地面" value={aircraft.onGround ? '是' : '否'} />
          <div className="mt-1 font-mono text-[11px] text-slate-600">{aircraft.icao24}</div>
        </div>
      ) : (
        <div className="py-2 text-slate-400">目标已离开当前视野或暂无更新。</div>
      )}

      {stale && aircraft && (
        <div className="mt-1 text-[11px] text-amber-400/80">本帧无更新,显示最近已知数据。</div>
      )}
    </div>
  );
}
