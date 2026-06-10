import { useEffect, useState } from 'react';
import type { RegionStats } from '../lib/stats';

export type ConnState = 'connecting' | 'live' | 'error';

interface Props {
  region: string;
  mode: 'preset' | 'viewport' | 'global';
  /** 追踪总数(全球模式为抽稀前的真实总量) */
  tracked: number;
  conn: ConnState;
  stats: RegionStats;
  dataAge: number | null;
  upstream: string;
}

const MODE_LABEL: Record<Props['mode'], string> = {
  preset: '预设',
  viewport: '跟随',
  global: '全球',
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function TopBar({ region, mode, tracked, conn, stats, dataAge, upstream }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const dot = conn === 'live' ? '#a3e635' : conn === 'connecting' ? '#eab308' : '#ef4444';
  const label = conn === 'live' ? '已连接' : conn === 'connecting' ? '连接中…' : '连接断开';
  const utc = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  const avg = stats.avgAltitudeM;
  const avgStr = avg == null ? '—' : `${Math.round(avg).toLocaleString()} m`;

  return (
    <header className="z-[1000] flex h-12 shrink-0 items-center gap-4 border-b border-lime-500/20 bg-[#0a0f15] px-4 text-sm shadow-[0_1px_0_0_rgba(163,230,53,0.08)]">
      <div className="flex items-center gap-2 font-semibold tracking-widest text-lime-300">
        <span className="inline-block h-2 w-2 rounded-full bg-lime-400 shadow-[0_0_8px_2px_rgba(163,230,53,0.7)]" />
        SKYPULSE
        <span className="text-slate-600">/</span>
        <span className="text-slate-200">{region}</span>
        <span className="rounded border border-slate-700 px-1 text-[10px] font-normal text-slate-400">
          {MODE_LABEL[mode]}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
        <span className="text-slate-300">{label}</span>
        {upstream && <span className="hidden max-w-[12rem] truncate text-slate-500 xl:inline">({upstream})</span>}
      </div>

      <div className="mx-1 h-5 w-px bg-slate-700" />

      <div className="hidden items-center gap-4 tabular-nums md:flex">
        <span>
          追踪 <span className="font-medium text-lime-300">{tracked}</span>
        </span>
        <span className="text-cyan-300">↑{stats.climbing}</span>
        <span className="text-emerald-300">→{stats.cruising}</span>
        <span className="text-amber-300">↓{stats.descending}</span>
        <span className="text-slate-400">均高 {avgStr}</span>
        {dataAge != null && <span className="text-slate-500">时延 ~{dataAge}s</span>}
      </div>

      {/* 非航行用途提示:常驻且明显 */}
      <div className="ml-auto flex items-center gap-4">
        <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium tracking-wide text-amber-300">
          ⚠ 非航行用途 · 数据或延迟
        </span>
        <span className="tabular-nums text-slate-300">
          UTC <span className="text-lime-300">{utc}</span>
        </span>
      </div>
    </header>
  );
}
