import type { PresetInfo } from '../lib/api';

interface Props {
  presets: PresetInfo[];
  mode: 'preset' | 'viewport' | 'global';
  region: string | null;
  follow: boolean;
  onPreset: (key: string) => void;
  onGlobal: () => void;
  onToggleFollow: () => void;
}

const base =
  'rounded px-2 py-1 text-xs font-medium border transition tracking-wide';

export default function RegionSwitcher({
  presets,
  mode,
  region,
  follow,
  onPreset,
  onGlobal,
  onToggleFollow,
}: Props) {
  const cls = (activeFlag: boolean) =>
    `${base} ${
      activeFlag
        ? 'border-lime-400/70 bg-lime-400/15 text-lime-200'
        : 'border-slate-700 bg-[#0a0f15]/80 text-slate-300 hover:border-slate-500'
    }`;

  return (
    <div className="absolute left-3 top-3 z-[1000] flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-700/70 bg-[#070b10]/80 p-1.5 backdrop-blur">
      {presets.map((p) => (
        <button
          key={p.key}
          onClick={() => onPreset(p.key)}
          className={cls(mode === 'preset' && region === p.key)}
        >
          {p.name}
        </button>
      ))}
      <span className="mx-0.5 h-4 w-px bg-slate-700" />
      <button onClick={onToggleFollow} className={cls(mode === 'viewport' && follow)}>
        跟随视野
      </button>
      <button onClick={onGlobal} className={cls(mode === 'global')}>
        全球
      </button>
    </div>
  );
}
