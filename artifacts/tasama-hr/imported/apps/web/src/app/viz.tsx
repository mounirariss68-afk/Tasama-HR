/**
 * The decision visuals. Built once, used wherever the same decision appears:
 * in the case reader, in list rows, on the landing pages.
 *
 *   ClockBar     a case's clock: opened → due, now marked, red when overdue
 *   SegmentBar   parts of a whole (leave balance, settlement lines, severities)
 *   CapBar       an amount against a limit, the limit marked
 *   RangeBar     a value inside a range (grade min–max, peer median, proposal)
 *   CoverStrip   who is away across the days of a leave request
 *   Columns      a short series as columns (net pay, gross, cases)
 *   Progress     done out of total
 *
 * All colours are Atelier tokens. Every figure the visual shows is also in
 * its label or tooltip, so colour never carries meaning alone.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@cognirise/atelier/lib/utils';

type Tone = 'primary' | 'success' | 'warn' | 'danger' | 'muted' | 'chart1' | 'chart2' | 'chart3' | 'chart4' | 'chart5';
const BG: Record<Tone, string> = {
  primary: 'bg-primary', success: 'bg-success', warn: 'bg-warn', danger: 'bg-danger', muted: 'bg-muted-foreground/25',
  chart1: 'bg-chart-1', chart2: 'bg-chart-2', chart3: 'bg-chart-3', chart4: 'bg-chart-4', chart5: 'bg-chart-5',
};
const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / (max || 1)) * 100))}%`;

/** Bars grow in once, on first paint. Respects reduced motion. */
function useGrow() {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id); }, []);
  return on;
}
const GROW = 'transition-[width,height] duration-700 ease-out motion-reduce:transition-none';

/** A case's clock. `compact` is the 4px version for list rows. */
export function ClockBar({ start, due, compact, label }: { start: string | Date; due: string | Date | null | undefined; compact?: boolean; label?: ReactNode }) {
  if (!due) return null;
  const s = new Date(start).getTime(), d = new Date(due).getTime(), n = Date.now();
  const span = Math.max(1, d - s);
  const used = (n - s) / span;
  const over = n > d;
  const tone = over ? 'bg-danger' : used > 0.75 ? 'bg-warn' : 'bg-primary';
  const on = useGrow();
  return (
    <div className="w-full" title={typeof label === 'string' ? label : undefined}>
      <div className={cn('relative w-full overflow-hidden rounded-full bg-muted', compact ? 'h-1' : 'h-2')}>
        <div className={cn('h-full rounded-full', tone, GROW)} style={{ width: on ? (over ? '100%' : pct(n - s, span)) : '0%' }} />
      </div>
      {label && !compact ? <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">{label}</div> : null}
    </div>
  );
}

export type Segment = { label: string; value: number; tone: Tone; hatch?: boolean };

/** Parts of a whole, with a 2px gap between parts and a legend under it. */
export function SegmentBar({ segments, total, legend = true, format = (v: number) => String(v), height = 10 }: { segments: Segment[]; total?: number; legend?: boolean; format?: (v: number) => string; height?: number }) {
  const sum = total ?? segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  const on = useGrow();
  return (
    <div className="w-full">
      <div className="flex w-full gap-[2px] overflow-hidden rounded-full bg-muted" style={{ height }}>
        {segments.filter((s) => s.value > 0).map((s) => (
          <div key={s.label} title={`${s.label}: ${format(s.value)}`} className={cn('h-full first:rounded-s-full last:rounded-e-full', BG[s.tone], s.hatch && 'bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgba(255,255,255,.55)_3px_6px)]', GROW)} style={{ width: on ? pct(s.value, sum) : '0%' }} />
        ))}
      </div>
      {legend ? (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {segments.map((s) => <span key={s.label} className="inline-flex items-center gap-1"><span className={cn('h-2 w-2 rounded-sm', BG[s.tone])} />{s.label} <span className="font-medium text-foreground">{format(s.value)}</span></span>)}
        </div>
      ) : null}
    </div>
  );
}

/** An amount against a limit. The limit is a line; the part beyond it is red. */
export function CapBar({ value, cap, max, capLabel, tone = 'primary', format = (v: number) => String(v) }: { value: number; cap: number; max?: number; capLabel?: string; tone?: Tone; format?: (v: number) => string }) {
  const top = Math.max(max ?? 0, cap * 1.15, value * 1.05, 1);
  const within = Math.min(value, cap), beyond = Math.max(0, value - cap);
  const on = useGrow();
  return (
    <div className="w-full">
      <div className="relative h-2.5 w-full rounded-full bg-muted">
        <div className={cn('absolute inset-y-0 start-0 rounded-s-full', BG[tone], !beyond && 'rounded-e-full', GROW)} style={{ width: on ? pct(within, top) : '0%' }} title={format(value)} />
        {beyond ? <div className="absolute inset-y-0 rounded-e-full bg-danger" style={{ insetInlineStart: pct(cap, top), width: pct(beyond, top) }} /> : null}
        <div className="absolute -inset-y-1 w-0.5 rounded bg-foreground/70" style={{ insetInlineStart: pct(cap, top) }} title={capLabel} />
      </div>
      {capLabel ? <div className="relative mt-1 h-4 text-[11px] text-muted-foreground"><span className="absolute -translate-x-1/2 whitespace-nowrap rtl:translate-x-1/2" style={{ insetInlineStart: pct(cap, top) }}>{capLabel}</span></div> : null}
    </div>
  );
}

export type Marker = { value: number; label: string; tone: Tone };

/** A value inside a range: the track is min–max, markers sit on it. */
export function RangeBar({ min, max, markers, format = (v: number) => String(v) }: { min: number; max: number; markers: Marker[]; format?: (v: number) => string }) {
  const lo = Math.min(min, ...markers.map((m) => m.value)), hi = Math.max(max, ...markers.map((m) => m.value));
  const pad = (hi - lo) * 0.06 || 1;
  const a = lo - pad, b = hi + pad;
  const at = (v: number) => pct(v - a, b - a);
  return (
    <div className="w-full pt-1">
      <div className="relative h-2.5 w-full rounded-full bg-muted">
        <div className="absolute inset-y-0 rounded-full bg-primary/20" style={{ insetInlineStart: at(min), width: pct(max - min, b - a) }} />
        {markers.map((m) => <div key={m.label} title={`${m.label}: ${format(m.value)}`} className={cn('absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card rtl:translate-x-1/2', BG[m.tone])} style={{ insetInlineStart: at(m.value) }} />)}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground"><span>{format(min)}</span><span>{format(max)}</span></div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {markers.map((m) => <span key={m.label} className="inline-flex items-center gap-1"><span className={cn('h-2 w-2 rounded-full', BG[m.tone])} />{m.label} <span className="font-medium text-foreground">{format(m.value)}</span></span>)}
      </div>
    </div>
  );
}

export type CoverRow = { name: string; ranges: { start: string; end: string; pending?: boolean; self?: boolean }[] };

/** People as rows, days as columns; leave as bars, the request highlighted, weekends shaded. */
export function CoverStrip({ from, days, rows, today, size = 'sm' }: { from: string; days: number; rows: CoverRow[]; today?: string; size?: 'sm' | 'lg' }) {
  const d0 = new Date(`${from}T00:00:00Z`).getTime();
  const iso = (i: number) => new Date(d0 + i * 86400000).toISOString().slice(0, 10);
  const cols = Array.from({ length: days }, (_, i) => iso(i));
  return (
    <div className={cn('w-full', size === 'lg' ? 'text-[13px]' : 'text-[11px]')}>
      <div className={cn('grid items-center', size === 'lg' ? 'gap-y-1.5' : 'gap-y-1')} style={{ gridTemplateColumns: `minmax(${size === 'lg' ? '7rem' : '5.5rem'},auto) repeat(${days}, minmax(0,1fr))` }}>
        <span />
        {cols.map((c) => { const w = new Date(`${c}T00:00:00Z`).getUTCDay(); return <span key={c} className={cn('text-center tabular-nums text-muted-foreground', size === 'lg' ? 'text-[11px]' : 'text-[10px]', (w === 5 || w === 6) && 'opacity-50', c === today && 'font-bold text-primary')}>{Number(c.slice(8))}</span>; })}
        {rows.map((r) => (
          <CoverLine key={r.name} r={r} cols={cols} size={size} />
        ))}
      </div>
    </div>
  );
}
function CoverLine({ r, cols, size }: { r: CoverRow; cols: string[]; size: 'sm' | 'lg' }) {
  return (
    <>
      <span className={cn('truncate pe-2', r.ranges.some((x) => x.self) ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{r.name}</span>
      {cols.map((c) => {
        const w = new Date(`${c}T00:00:00Z`).getUTCDay();
        const hit = r.ranges.find((x) => x.start <= c && x.end >= c);
        return <span key={c} className={cn('mx-[1px] rounded-[3px]', size === 'lg' ? 'h-6' : 'h-3.5', hit ? (hit.self ? 'bg-primary' : hit.pending ? 'bg-primary/35 ring-1 ring-inset ring-primary' : 'bg-warn') : (w === 5 || w === 6) ? 'bg-muted/60' : 'bg-muted')} title={hit ? `${r.name}: ${hit.start} – ${hit.end}` : undefined} />;
      })}
    </>
  );
}

/** A short series as columns; the last one can be marked. */
export function Columns({ values, labels, height = 64, tone = 'chart1', format = (v: number) => String(v), markLast }: { values: number[]; labels?: string[]; height?: number; tone?: Tone; format?: (v: number) => string; markLast?: boolean }) {
  const max = Math.max(1, ...values);
  const on = useGrow();
  return (
    <div className="w-full">
      <div className="flex items-end gap-1.5" style={{ height }}>
        {values.map((v, i) => <div key={i} title={`${labels?.[i] ?? ''} ${format(v)}`.trim()} className={cn('flex-1 rounded-t-[4px]', markLast && i === values.length - 1 ? 'bg-primary' : BG[tone], GROW)} style={{ height: on ? `${Math.max(3, (v / max) * 100)}%` : '0%', transitionDelay: `${i * 30}ms` }} />)}
      </div>
      {labels ? <div className="mt-1 flex gap-1.5 text-[10px] text-muted-foreground">{labels.map((l, i) => <span key={i} className="flex-1 truncate text-center">{l}</span>)}</div> : null}
    </div>
  );
}

export function Progress({ done, total, tone = 'success' }: { done: number; total: number; tone?: Tone }) {
  const on = useGrow();
  return <div className="h-2 w-full overflow-hidden rounded-full bg-muted" title={`${done} / ${total}`}><div className={cn('h-full rounded-full', BG[tone], GROW)} style={{ width: on ? pct(done, total) : '0%' }} /></div>;
}


/** A radial gauge: value against a target on a 0–max arc. */
export function RadialGauge({ value, target, max = 100, label, tone = 'primary', size = 132 }: { value: number; target?: number; max?: number; label?: string; tone?: 'primary' | 'success' | 'warn' | 'danger'; size?: number }) {
  const on = useGrow();
  const r = 52, c = Math.PI * r; // half circle
  const frac = Math.max(0, Math.min(1, value / max));
  const col = { primary: 'hsl(var(--primary))', success: 'var(--success)', warn: 'var(--warn)', danger: 'var(--danger)' }[tone];
  const ta = target !== undefined ? Math.PI * (1 - Math.min(1, target / max)) : null;
  return (
    <svg viewBox="0 0 132 78" width={size} height={size * 78 / 132} role="img" aria-label={`${label ?? ''} ${value}${target !== undefined ? ` against ${target}` : ''}`}>
      <path d="M 14 70 A 52 52 0 0 1 118 70" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" strokeLinecap="round" />
      <path d="M 14 70 A 52 52 0 0 1 118 70" fill="none" stroke={col} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${c}`} strokeDashoffset={on ? c * (1 - frac) : c} style={{ transition: 'stroke-dashoffset 900ms ease-out' }} />
      {ta !== null ? <line x1={66 + 40 * Math.cos(ta)} y1={70 - 40 * Math.sin(ta)} x2={66 + 64 * Math.cos(ta)} y2={70 - 64 * Math.sin(ta)} stroke="hsl(var(--foreground))" strokeWidth="2.5" strokeLinecap="round" /> : null}
      <text x="66" y="66" textAnchor="middle" fontSize="20" fontWeight="700" fill="hsl(var(--foreground))">{value}{max === 100 ? '%' : ''}</text>
    </svg>
  );
}

export type Step = { label: string; value: number; tone?: Tone };

/** A waterfall: each line adds to the running total; the last bar is the total. */
export function Waterfall({ steps, totalLabel, format = (v: number) => String(v), height = 120 }: { steps: Step[]; totalLabel: string; format?: (v: number) => string; height?: number }) {
  const on = useGrow();
  const total = steps.reduce((a, s) => a + s.value, 0);
  let run = 0;
  const bars = steps.map((s) => { const b = { ...s, from: run, to: run + s.value }; run += s.value; return b; });
  const H = (v: number) => (v / Math.max(1, total)) * 100;
  return (
    <div className="w-full">
      <div className="flex items-end gap-2" style={{ height }}>
        {bars.map((b, i) => (
          <div key={b.label} className="relative h-full flex-1" title={`${b.label}: ${format(b.value)}`}>
            <div className={cn('absolute inset-x-0 rounded-[4px]', BG[b.tone ?? 'chart1'], 'transition-[bottom,height] duration-700 ease-out motion-reduce:transition-none')} style={{ bottom: `${H(Math.min(b.from, b.to))}%`, height: on ? `${Math.max(2, H(Math.abs(b.value)))}%` : '0%', transitionDelay: `${i * 120}ms` }} />
          </div>
        ))}
        <div className="relative h-full flex-1" title={`${totalLabel}: ${format(total)}`}>
          <div className={cn('absolute inset-x-0 bottom-0 rounded-[4px] bg-primary', GROW)} style={{ height: on ? '100%' : '0%', transitionDelay: `${bars.length * 120}ms` }} />
        </div>
      </div>
      <div className="mt-1.5 flex gap-2 text-[10.5px] leading-tight text-muted-foreground">
        {bars.map((b) => <span key={b.label} className="flex-1 text-center"><span className="block">{b.label}</span><span className="font-medium text-foreground">{format(b.value)}</span></span>)}
        <span className="flex-1 text-center"><span className="block">{totalLabel}</span><span className="font-semibold text-foreground">{format(total)}</span></span>
      </div>
    </div>
  );
}

/** A bullet chart: the result as a bar, the target as a tick. */
export function Bullet({ value, target, max = 100, label }: { value: number | null; target: number; max?: number; label?: string }) {
  const on = useGrow();
  if (value === null) return <span className="text-[11px] text-muted-foreground">—</span>;
  const tone = value >= target ? 'bg-success' : value >= target - 2 ? 'bg-warn' : 'bg-danger';
  const lo = Math.min(target - 10, value - 2), span = max - lo;
  const at = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / span) * 100))}%`;
  return (
    <div className="relative h-3 w-full rounded-sm bg-muted" title={`${label ?? ''} ${value}% (target ${target}%)`}>
      <div className={cn('absolute inset-y-[3px] start-0 rounded-sm', tone, GROW)} style={{ width: on ? at(value) : '0%' }} />
      <div className="absolute -inset-y-0.5 w-0.5 bg-foreground/80" style={{ insetInlineStart: at(target) }} />
    </div>
  );
}

/** A funnel: each stage narrower than the last, centred. */
export function Funnel({ stages, format = (v: number) => String(v) }: { stages: { label: string; value: number }[]; format?: (v: number) => string }) {
  const on = useGrow();
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-1.5">
      {stages.map((s, i) => (
        <div key={s.label} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-xs">
          <span className="text-muted-foreground">{s.label}</span>
          <div className="flex justify-center"><div className={cn('h-6 rounded-md', GROW)} style={{ width: on && s.value ? `${Math.max(3, (s.value / max) * 100)}%` : '0%', background: `hsl(var(--primary) / ${0.95 - i * 0.1})`, transitionDelay: `${i * 80}ms` }} /></div>
          <span className="text-end font-semibold tabular-nums">{format(s.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** A year as a calendar heatmap: one cell per day, weeks as columns. */
export function YearHeatmap({ year, ranges, today }: { year: number; ranges: { start: string; end: string; tone: 'taken' | 'booked' }[]; today?: string }) {
  const start = new Date(Date.UTC(year, 0, 1));
  const offset = (start.getUTCDay() + 1) % 7; // weeks start on Saturday so Fri/Sat sit together
  const days = (Date.UTC(year + 1, 0, 1) - start.getTime()) / 86400000;
  const iso = (i: number) => new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
  const cells = Array.from({ length: offset + days }, (_, i) => (i < offset ? null : iso(i - offset)));
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const kind = (d: string) => ranges.find((r) => r.start <= d && r.end >= d)?.tone;
  const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  return (
    <div className="w-full overflow-x-auto scroll-thin">
      <div className="flex gap-[3px]">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            <span className="h-3 text-[9px] leading-3 text-muted-foreground">{w.find((d) => d && d.slice(8) === '01') ? months[Number(w.find((d) => d && d.slice(8) === '01')!.slice(5, 7)) - 1] : ''}</span>
            {w.map((d, di) => {
              if (!d) return <span key={di} className="h-3 w-3" />;
              const k = kind(d); const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
              return <span key={d} title={d} className={cn('h-3 w-3 rounded-[3px]', k === 'taken' ? 'bg-primary' : k === 'booked' ? 'bg-chart-2' : (wd === 5 || wd === 6) ? 'bg-muted/50' : 'bg-muted', d === today && 'ring-2 ring-foreground/70')} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A slope: last period to this one, the change labelled. */
export function Slope({ from, to, fromLabel, toLabel, format = (v: number) => String(v) }: { from: number; to: number; fromLabel: string; toLabel: string; format?: (v: number) => string }) {
  const up = to >= from;
  const lo = Math.min(from, to), hi = Math.max(from, to), span = hi - lo || 1;
  const y = (v: number) => 34 - ((v - lo) / span) * 26;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 120 40" className="h-10 w-28" aria-hidden="true">
        <line x1="10" y1={y(from)} x2="110" y2={y(to)} stroke={up ? 'var(--success)' : 'var(--danger)'} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="10" cy={y(from)} r="4" fill="hsl(var(--muted-foreground))" /><circle cx="110" cy={y(to)} r="4.5" fill="hsl(var(--primary))" />
      </svg>
      <span className="text-[11px] leading-tight text-muted-foreground"><span className="block">{fromLabel} {format(from)}</span><span className="block font-medium text-foreground">{toLabel} {format(to)}</span></span>
    </div>
  );
}
