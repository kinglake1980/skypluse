import { useEffect, useState } from 'react';

export interface CommentaryItem {
  id: string;
  text: string;
  stance: 'light' | 'moderate' | 'busy' | 'heavy';
  stanceLabel: string;
  ts: number;
}

interface Props {
  items: CommentaryItem[];
  streaming: { id: string; text: string } | null;
  /** 下一段解说的预计时间(ms epoch);流式进行中为 null */
  nextAt: number | null;
}

const STANCE_STYLE: Record<CommentaryItem['stance'], string> = {
  light: 'bg-slate-700/60 text-slate-200',
  moderate: 'bg-emerald-700/50 text-emerald-100',
  busy: 'bg-amber-700/50 text-amber-100',
  heavy: 'bg-rose-700/50 text-rose-100',
};

function StanceChip({ stance, label }: { stance: CommentaryItem['stance']; label: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STANCE_STYLE[stance]}`}>
      {label}
    </span>
  );
}

function timeStr(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export default function Commentary({ items, streaming, nextAt }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const countdown =
    streaming != null
      ? '生成中…'
      : nextAt != null
        ? `下次解说 ${Math.max(0, Math.ceil((nextAt - now) / 1000))}s`
        : '等待首段解说…';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-lime-300">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-lime-400" />
          AI 区域态势解说
        </div>
        <div className="tabular-nums text-xs text-slate-400">{countdown}</div>
      </div>

      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-3">
        {streaming && (
          <div className="card-in rounded-lg border border-lime-600/50 bg-lime-950/20 p-2.5">
            <div className="mb-1 text-[11px] text-lime-300">正在生成…</div>
            <div className="text-sm leading-relaxed text-slate-100">
              {streaming.text}
              <span className="ml-0.5 inline-block h-3.5 w-1 animate-pulse bg-lime-300 align-middle" />
            </div>
          </div>
        )}

        {items.length === 0 && !streaming && (
          <div className="text-sm text-slate-500">尚无解说。系统每约 30 秒生成一段中性的区域态势解说。</div>
        )}

        {items.map((it) => (
          <div key={it.id} className="card-in rounded-lg border border-slate-800 bg-[#0d1320] p-2.5">
            <div className="mb-1 flex items-center justify-between">
              <StanceChip stance={it.stance} label={it.stanceLabel} />
              <span className="tabular-nums text-[11px] text-slate-500">{timeStr(it.ts)}</span>
            </div>
            <div className="text-sm leading-relaxed text-slate-200">{it.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
