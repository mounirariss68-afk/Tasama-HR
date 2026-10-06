import { Guidelines, Stack } from '../parts';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';

const BASE = import.meta.env.BASE_URL;

export function AtelierPatternsDemo() {
  return (
    <div className="space-y-10">
      <Stack label="The glass scale — four levels, seen at once">
        <div
          className="relative overflow-hidden rounded-2xl border border-border p-4"
          style={{
            backgroundImage: `url(${BASE}brand/dark-backdrop.webp)`,
            backgroundSize: 'cover',
          }}
        >
          <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-white/70">
            L0 — the backdrop, visible in every gutter and gap
          </p>
          <div className="rounded-2xl glass-l1 p-4">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              L1 — the display shell (&lt;MainPanel&gt;), 16% fill, 22px blur
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl glass-l2 p-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  L2 — section panel, 34% fill, 12px blur
                </p>
                <div className="mt-3 rounded-xl glass-l3 p-4">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    L3 — card, 62% fill, 6px blur
                  </p>
                  <p className="mt-2 text-sm">
                    A nearer plate ON the panel. Nothing nests below this.
                  </p>
                </div>
              </div>
              <div className="rounded-xl glass-chrome p-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  chrome — pinned bars, 76% fill, 20px blur
                </p>
                <p className="mt-2 text-sm">
                  The title bar, the menu and the chat rail. A much higher fill,
                  so content scrolling underneath stays unreadable rather than
                  smeared. It is not part of the depth stack; it sits over it.
                </p>
              </div>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          The depth comes from seeing all four at once, so keep L0 showing in the
          gutters and never nest a level inside itself. Each pane carries a 1px
          top sheen (<code>--glass-sheen</code>) — that is what separates a
          translucent rectangle from a sheet of glass. Small chips inside a panel
          use plain alpha fills; do not nest backdrop blur below L3.
        </p>
        <p className="text-sm text-muted-foreground">
          The backdrop is the fuel. A quiet, low-contrast wash leaves the glass
          nothing to refract and the whole system reads flat — target a greyscale
          luminance spread of 150–220 across the frame, and verify legibility with{' '}
          <code>npm run legibility</code> rather than by lowering the contrast.
        </p>
      </Stack>

      <Stack label='Page hero — the navy "dark island"'>
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="page-hero px-8">
            <span className="eyebrow">Finance · Q3</span>
            <h2 className="headline mt-3">
              Quarterly <em className="accent">close</em>
            </h2>
            <p className="lede mt-4">
              The hero band stays on the deep navy brand surface in both
              themes; its tokens are re-declared inside the island so text
              stays legible.
            </p>
          </div>
          <div className="bg-background p-8 text-sm text-muted-foreground">
            Page content continues on the theme background below the band.
          </div>
        </div>
      </Stack>

      <Stack label="Editorial primitives">
        <span className="eyebrow">Eyebrow label</span>
        <h3 className="section-label">Section label</h3>
        <span className="section-divider" />
        <p className="lede">
          A 540px lede paragraph with the 2px magenta left rule, used to
          introduce major sections.
        </p>
      </Stack>

      <Stack label="Pills, chips and tab nav">
        <div className="flex flex-wrap items-center gap-3">
          <button className="pill-btn pill-btn-primary">Primary pill</button>
          <button className="pill-btn pill-btn-ghost">Ghost pill</button>
          <span className="accent-pill">Stage · Qualify</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono-chip">Neutral</span>
          <span className="mono-chip is-primary">Primary</span>
          <span className="mono-chip is-success">Success</span>
          <span className="mono-chip is-warn">Warn</span>
          <span className="mono-chip is-danger">Danger</span>
        </div>
        <nav className="tab-nav">
          <button className="tab-nav-item is-active">Overview</button>
          <button className="tab-nav-item">Activity</button>
          <button className="tab-nav-item">Documents</button>
        </nav>
        <div className="flex gap-3">
          <Button>Button (primary)</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
        </div>
      </Stack>

      <Guidelines
        items={[
          { kind: 'do', text: 'Apply .cog-backdrop to the body (plus a .cog-backdrop-art wallpaper layer) before using glass surfaces.' },
          { kind: 'do', text: 'Use the page-hero dark island for page headers so the navy brand carries into light mode.' },
          { kind: 'dont', text: 'Do not stack backdrop blur inside an already-blurred panel.' },
          { kind: 'dont', text: 'Do not hand-pick alphas — the --glass-*-alpha knobs keep every surface frosting in lockstep and power the reduced-transparency fallbacks.' },
        ]}
      />
    </div>
  );
}
