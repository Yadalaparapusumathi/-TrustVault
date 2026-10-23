import { useMemo, useState } from 'react';
import type { ActivityDay } from '@/api/types';
import { cn } from '@/lib/cn';
import { parseIsoDate } from '@/lib/format';

const SERIES = [
  { key: 'uploads', label: 'Uploads', color: '#18795e' },
  { key: 'downloads', label: 'Downloads', color: '#a9cd5a' },
  { key: 'permissionChanges', label: 'Permission changes', color: '#a78bfa' },
  { key: 'denied', label: 'Denied', color: '#f43f5e' },
] as const;

type SeriesKey = (typeof SERIES)[number]['key'];

const W = 720;
const H = 270;
const PAD = { top: 12, right: 8, bottom: 28, left: 36 };

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Stacked bar chart drawn with plain SVG (no chart library). */
export function ActivityChart({ data }: { data: ActivityDay[] }) {
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const visible = SERIES.filter((s) => !hidden.has(s.key));

  const { max, ticks } = useMemo(() => {
    const totals = data.map((d) => visible.reduce((sum, s) => sum + (d[s.key] ?? 0), 0));
    const m = niceMax(Math.max(0, ...totals));
    return { max: m, ticks: [0, m / 4, m / 2, (3 * m) / 4, m] };
  }, [data, visible]);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = data.length ? innerW / data.length : innerW;
  const barW = Math.max(4, Math.min(28, slot * 0.6));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const dayLabel = (iso: string) => {
    const d = parseIsoDate(iso);
    return d ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d) : iso;
  };
  const hovered = hover !== null ? data[hover] : undefined;

  const toggle = (key: SeriesKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Chart series">
        {SERIES.map((s) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={!off}
              onClick={() => toggle(s.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                off ? 'border-slate-200 text-slate-400' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: off ? '#cbd5e1' : s.color }} aria-hidden />
              {s.label}
            </button>
          );
        })}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Activity over the last 14 days" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeDasharray={t === 0 ? undefined : '3 4'} />
              <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400" fontSize="10">
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            let acc = 0;
            return (
              <g key={d.date} onMouseEnter={() => setHover(i)}>
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} fill={hover === i ? '#f1f5f9' : 'transparent'} />
                {visible.map((s, si) => {
                  const v = d[s.key] ?? 0;
                  if (v <= 0) return null;
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  const isTop = visible.slice(si + 1).every((o) => (d[o.key] ?? 0) <= 0);
                  return (
                    <rect key={s.key} x={cx - barW / 2} y={y1} width={barW} height={Math.max(0, y0 - y1)} fill={s.color} rx={isTop ? 3 : 0}>
                      <title>{`${s.label}: ${v}`}</title>
                    </rect>
                  );
                })}
                {(i % 2 === 0 || data.length <= 8) && (
                  <text x={cx} y={H - 8} textAnchor="middle" className="fill-slate-400" fontSize="10">
                    {dayLabel(d.date)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hovered && hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[10rem] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-pop backdrop-blur"
            style={{
              left: `${((PAD.left + slot * hover + slot / 2) / W) * 100}%`,
              transform: hover > data.length / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
            }}
          >
            <p className="mb-1 font-semibold text-slate-900">{dayLabel(hovered.date)}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-4 text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                  {s.label}
                </span>
                <span className="font-medium tabular-nums text-slate-900">{hovered[s.key]}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Daily activity</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {SERIES.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.date}</th>
              {SERIES.map((s) => (
                <td key={s.key}>{d[s.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
