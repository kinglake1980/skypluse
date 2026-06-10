import type { Alert } from '@shared/types';

interface Props {
  items: Alert[];
  selectedId: string | null;
  onSelect: (icao24: string) => void;
}

const KIND_META: Record<Alert['kind'], { label: string; cls: string; dot: string }> = {
  emergency_code: {
    label: '紧急代码',
    cls: 'border-rose-700/70 bg-rose-950/30',
    dot: 'bg-rose-400',
  },
  rapid_descent: {
    label: '快速下降',
    cls: 'border-amber-700/70 bg-amber-950/25',
    dot: 'bg-amber-400',
  },
  suspected_holding: {
    label: '疑似盘旋',
    cls: 'border-cyan-700/70 bg-cyan-950/25',
    dot: 'bg-cyan-400',
  },
};

function timeStr(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function evidenceStr(a: Alert): string {
  const e = a.evidence;
  if (a.kind === 'emergency_code') return `squawk ${e.squawk}`;
  if (a.kind === 'rapid_descent') return `垂直速率 ${e.verticalRate} m/s`;
  if (a.kind === 'suspected_holding') return `~${e.windowSec}s 航向变化 ${e.headingChangeDeg}°`;
  return '';
}

export default function AlertFeed({ items, selectedId, onSelect }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-lime-300">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-lime-400" />
          异动告警
        </div>
        <div className="text-xs text-slate-500">{items.length} 条</div>
      </div>

      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-3">
        {items.length === 0 && (
          <div className="text-sm text-slate-500">
            暂无异动。检测到紧急代码 / 快速下降 / 疑似盘旋时,会在此显示客观说明。
          </div>
        )}

        {items.map((a) => {
          const meta = KIND_META[a.kind];
          const active = selectedId === a.icao24;
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.icao24)}
              className={`card-in w-full rounded-lg border p-2.5 text-left transition ${meta.cls} ${
                active ? 'ring-2 ring-lime-300/70' : 'hover:brightness-125'
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-100">
                  <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
                  {meta.label}
                </span>
                <span className="tabular-nums text-[11px] text-slate-500">{timeStr(a.ts)}</span>
              </div>
              <div className="mb-1 text-xs text-slate-400">
                {(a.callsign?.trim() || a.icao24)} · {evidenceStr(a)}
              </div>
              <div className="text-sm leading-relaxed text-slate-200">{a.text}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
