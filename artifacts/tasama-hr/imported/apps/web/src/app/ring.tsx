/**
 * The signature visual: the lifecycle ring.
 *
 * A ring resting on a base line, with
 * the eight hire-to-retire stages placed around it and the live count of open
 * cases at each. Decorative and aria-hidden: every number in it is also stated
 * in text on the page.
 */
import { useLang } from '../lib/i18n';

export const STAGES: { key: string; en: string; ar: string; wfs: string[] }[] = [
  { key: 'plan', en: 'Plan', ar: 'التخطيط', wfs: ['WF-01'] },
  { key: 'attract', en: 'Attract', ar: 'الاستقطاب', wfs: ['WF-02'] },
  { key: 'select', en: 'Select', ar: 'الاختيار', wfs: ['WF-03', 'WF-04'] },
  { key: 'hire', en: 'Hire', ar: 'التعيين', wfs: ['WF-05'] },
  { key: 'onboard', en: 'Onboard', ar: 'التهيئة', wfs: ['WF-06', 'WF-07', 'WF-08'] },
  { key: 'perform', en: 'Perform', ar: 'الأداء', wfs: ['WF-09', 'WF-10', 'WF-11', 'WF-12'] },
  { key: 'pay', en: 'Pay', ar: 'الأجور', wfs: ['WF-13', 'WF-16', 'WF-14', 'WF-15'] },
  { key: 'exit', en: 'Exit', ar: 'المغادرة', wfs: ['WF-19', 'WF-20', 'WF-18'] },
];

export function stageCounts(cases: { workflow_id: string }[]) {
  return STAGES.map((s) => cases.filter((c) => s.wfs.includes(c.workflow_id)).length);
}

export function LifecycleRing({ counts, center, centerLabel, highlight }: { counts: number[]; center: string | number; centerLabel: string; highlight?: string[] }) {
  const { bi, dir } = useLang();
  const W = 560, H = 440, cx = 300, cy = 205, R = 150;
  const max = Math.max(1, ...counts);
  const pos = (i: number) => {
    const a = (-90 + i * (360 / STAGES.length)) * (Math.PI / 180) * (dir === 'rtl' ? -1 : 1);
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a };
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="ring-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.22" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R + 70} fill="url(#ring-glow)" />
      {/* the mark: an open ring on a base line */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.85" strokeWidth="5" strokeDasharray={`${2 * Math.PI * R * 0.93} ${2 * Math.PI * R}`} transform={`rotate(${dir === 'rtl' ? -70 : 110} ${cx} ${cy})`} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={R - 22} fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.18" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={R + 26} fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.12" strokeWidth="1" strokeDasharray="2 6" />
      <rect x={cx - R - 20} y={cy + R + 18} width={(R + 20) * 2} height="6" rx="3" fill="hsl(var(--primary))" fillOpacity="0.85" />
      {STAGES.map((s, i) => {
        const p = pos(i);
        const n = counts[i] ?? 0;
        const r = 9 + 12 * Math.sqrt(n / max);
        const on = n > 0 || highlight?.includes(s.key);
        const lx = cx + (R + 52) * Math.cos(p.a), ly = cy + (R + 52) * Math.sin(p.a);
        return (
          <g key={s.key}>
            <circle cx={p.x} cy={p.y} r={r + 6} fill="hsl(var(--primary))" fillOpacity={on ? 0.16 : 0.05} />
            <circle cx={p.x} cy={p.y} r={r} fill={on ? 'hsl(var(--primary))' : 'hsl(var(--card))'} stroke="hsl(var(--primary))" strokeWidth="1.5" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={on ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))'} style={{ fontFamily: 'Inter, sans-serif' }}>{n}</text>
            <text x={lx} y={ly + 4} textAnchor={Math.abs(Math.cos(p.a)) < 0.3 ? 'middle' : Math.cos(p.a) > 0 ? 'start' : 'end'} fontSize="13" fill="hsl(var(--foreground))" fillOpacity="0.85">{bi(s.en, s.ar)}</text>
          </g>
        );
      })}
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="54" fontWeight="700" fill="hsl(var(--foreground))" style={{ fontFamily: 'Alexandria, sans-serif' }}>{center}</text>
      <text x={cx} y={cy + 34} textAnchor="middle" fontSize="13" fill="hsl(var(--muted-foreground))">{centerLabel}</text>
    </svg>
  );
}
