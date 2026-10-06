# The default page layout

Every Atelier app uses this frame. It is not a starting suggestion — it is the
layout, and an app departs from it only for a stated reason. It ships as real
components under `src/components/layout/`, exported from
`@cognirise/atelier/layout`, so apps compose it rather than rebuild it.

## The frame

```
.cog-backdrop  (app root)        fixed brand gradient, painted behind everything
  <AppBackdrop />                fixed wallpaper layer over the gradient
  <ChatRail />                   optional; fixed left, pinned to window height
  main column                    padded left by the live rail width
    <TitleBar />                 56px sticky glass card
    <ContextNav />               optional 44px glass card
    <PageHero />                 the dark island — once, at the top of a page
    <PageContainer>              the body measure
      <PageSection />            divider + label + content, repeated
    footer                       optional
```

The page scrolls. The rail, the title bar and the chat composer do not.
Content never sits directly on the backdrop — it sits on glass surfaces
(`Card`, `.glass-panel`, `.page-hero`) that blur over it.

## Minimum wiring

```tsx
// main.tsx
import "@cognirise/atelier/styles.css";
import { ThemeProvider } from "@cognirise/atelier/layout";

createRoot(root).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
```

```html
<!-- index.html <head> — before paint, or the page flashes the wrong theme -->
<script>
  (function () {
    try {
      var m = localStorage.getItem("atelier-theme") || "system";
      var d = m === "dark" || (m === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", d);
      document.documentElement.style.colorScheme = d ? "dark" : "light";
    } catch (e) {}
  })();
</script>
```

`themeInitScript()` returns exactly that string for frameworks that inject the
script from JS (Next.js `app/layout.tsx`, for instance).

```tsx
// App.tsx
import {
  AppShell, ChatComposer, ChatRail, ContextNav, LensPicker,
  PageContainer, PageHero, PageSection, TitleBar, Wordmark, useChatRail,
} from "@cognirise/atelier/layout";

export default function App() {
  const rail = useChatRail();
  const [draft, setDraft] = useState("");

  return (
    <AppShell
      rail={rail}
      chatRail={
        <ChatRail
          rail={rail}
          brand={<Wordmark className="text-base">Acme</Wordmark>}
          transcript={transcript}
          composer={
            <ChatComposer value={draft} onChange={setDraft} onSend={send} />
          }
        />
      }
      titleBar={
        <TitleBar
          brand={<Wordmark>Acme</Wordmark>}
          lens={<LensPicker lenses={LENSES} value={lens} onChange={setLens} />}
          user={<UserMenu />}
        />
      }
      contextNav={<ContextNav items={SECTIONS} value={section} />}
    >
      <PageHero
        eyebrow="Clients"
        title="Renewals"
        lede="What is closing this quarter and who owns it."
        actions={<button className="pill-btn pill-btn-primary">New renewal</button>}
      />
      <PageContainer className="space-y-10 py-10">
        <PageSection label="This quarter">{/* … */}</PageSection>
      </PageContainer>
    </AppShell>
  );
}
```

## The pieces

### Title bar — `<TitleBar />`

56px, sticky, `rounded-xl`, glass. Wordmark or lockup on the left, then a
flexible spacer, then the right cluster in this order: **lens drop-down →
theme mode selector → icon utilities → user menu** (32px avatar with a 1px
primary-tinted ring). The order is fixed; the contents are the app's.

### Lens drop-down — `<LensPicker />`

Lenses are top-level workspaces (Clients, People, Finance…). When an app has
them they live in the title bar — never as sidebar sections, never as a
separate page. Render it even with one lens: it doubles as the "where am I"
label. Hide it only for guest roles with no lenses. Selecting a lens navigates
to that lens's home and persists the choice.

### Theme mode — `<ThemeModeToggle />`

Icon-only ghost button whose icon shows the resolved mode (sun / moon /
monitor), opening Light / Dark / System with the active one checked. System
follows the OS live and is the default for first-time visitors. The mode
itself persists, not its resolved value. Themes apply as the `dark` class on
`<html>` plus `style.colorScheme` — there is no `data-theme` support. A
two-state light/dark toggle is not an acceptable substitute.

### Context nav — `<ContextNav />`

Optional 44px glass card directly below the title bar, holding Home plus
section tabs as small `rounded-full` pills in mono uppercase. Use it for
sections within a lens; do not use it as the primary navigation.

### Page hero — `<PageHero />`

One per page, at the top. Never a second, never nested, never for ordinary
sections. Two tones:

- `tone="island"` (default) — the dark brand surface, in **both** themes. For
  section landing pages and record headers, where the page should feel like it
  sits on the brand.
- `tone="surface"` — a glass hero over the backdrop. For dashboards and daily
  views, and whenever the hero carries `media`.

A hero that is only eyebrow + headline + lede is the most common way an
Atelier app ends up looking thin. Two slots fix that:

- **`media`** — the product's signature visual, bleeding to the right edge and
  hidden below `lg`. Build one per app: a radar sweep, a map, a network, an
  instrument. It is the single strongest thing on the page.
- **`feature`** — a `<HeroFeature label value support />` floated over the
  media: the one number that answers "how are we doing right now".

### Container and sections — `<PageContainer />`, `<PageSection />`

| width | max | for |
| --- | --- | --- |
| `default` | 1200px | dashboards, tables, dense app pages |
| `wide` | 1440px | boards, canvases, wide data grids |
| `prose` | 760px | documents, settings forms, long-form reading |

`<PageSection label="…">` renders the 48×3 gradient divider and the mono
section label above its content. Stacking sections at `space-y-10` inside the
container is the standard page rhythm.

### Chat rail — `<ChatRail />`, `<ChatComposer />`

Fixed left, pinned to the window height, collapsed to 48px or expanded and
drag-resizable between 320 and 720px, never past 60% of the window. Main
content pads left by the live width. The rail stacks a 56px logo card and the
glass chat panel below it.

Below 1024px (`CHAT_RAIL_DOCK_BREAKPOINT`) the rail cannot be docked without
taking more of the window than it leaves for content, so `useChatRail` starts
it collapsed, collapses it if the window is resized down, and — if the user
opens it there — lets it overlay the content rather than squeezing it. Nothing
in the app has to handle this.

Inside the panel the transcript is the **only** scrolling region
(`flex-1 min-h-0 overflow-y-auto`); the composer is `shrink-0` at the bottom
and never moves. The page never scrolls the chat.

Composer anatomy, left to right — these sizes are part of the system and are
not re-scaled per app:

1. **"+" attach** — 36×36px circle, 1px border, translucent fill, 16px icon.
   Uploads render as `rounded-md` mono chips above the composer, truncated at
   160px, danger-tinted on failure.
2. **Input pill** — fills the width, `rounded-[22px]`, `focus-within:ring-1`
   in the accent. Inside: a borderless transparent textarea, `rows={1}`,
   auto-growing to 160px, dimmed to 60% while a reply streams.
3. **Send** — 32×32px circle, accent fill, 16px icon. Disabled when the input
   is empty, over-limit, streaming, or an upload is in flight.

Inputs cap at 4000 characters. The counter appears only within 200 characters
of the cap and turns danger-colored — along with the pill border and ring —
when over, which also disables send.

Apps without an assistant omit `chatRail` and `rail`; nothing else changes.

## The glass scale

Glassmorphism is not "a translucent card". It is a **depth system**, and it
only reads when three things are true at once: the backdrop has real contrast
to refract, the fills are low enough to see through, and neighbouring surfaces
sit at *different* levels.

| Level | Where | Fill | Blur |
| --- | --- | --- | --- |
| **L0** clear | the page — the gutters around and between the shell, the rail and the menu | — | — |
| **L1** display shell | `<MainPanel>` — the working area of the page | `--glass-l1-alpha` (16% light / 12% dark) | 22px |
| **L2** section panel | `<Panel>`, `<StatRow>`, a `tone="surface"` hero | `--glass-l2-alpha` (34% / 26%) | 12px |
| **L3** card | `<FeedCard>`, `<RecordCard>`, `<StatTile>`, `<HeroFeature>` | `--glass-l3-alpha` (62% / 54%) | 6px |
| **chrome** | the title bar, the menu and the chat rail | `--glass-chrome-alpha` (76% / 72%) | 20px |

Rules:

- **The order is fixed.** An L3 sits on an L2, an L2 sits on the L1 shell, the
  shell sits on the page. A card placed straight on the page flattens the
  scale — it ends up at the same apparent level as every panel around it. This
  is why a row of stat tiles goes inside `<StatRow>`, and why every section
  panel goes inside `<MainPanel>`.
- **Never nest a level inside itself.** The levels stop meaning anything.
- **The menu is chrome, not content.** It sits beside the display area, never
  inside it — that separation is what lets the shell read as one surface.
- **Leave L0 visible.** If every pixel is covered by a panel there is no glass,
  only cards. The gutters are load-bearing.
- **Chrome is its own level.** The page scrolls underneath the pinned bars, and
  content that stays readable through a fixed bar looks like a rendering bug,
  not like glass. The bars also sit on `.app-header-scrim`, which blurs the
  gutters between and above them.

### The menu

`<ContextNav>` takes the `chrome` state from `useAppChrome()` and carries two
controls at its far end, in both orientations:

- **labels** (`Type` icon) — items as icon + label, or icons alone. With labels
  off the icon is the only affordance, so every item needs one and gets a
  `title`/`aria-label`.
- **orientation** (`PanelLeft` / `PanelTop`) — dock the menu down the side or
  back at the top. Vertical is 236px expanded, 60px icons-only, docked between
  the chat rail and the display shell; `<AppShell>` handles the geometry.

Both persist. Below 1024px the vertical dock would eat the content column, so
the nav falls back to horizontal without discarding the preference.

#### What goes in it

Design the menu around the five questions every agentic prototype has to
answer — what is waiting on me, what is the work, who is doing it, how does it
work, who am I and what may I approve — not around a fixed list of labels. The
components that answer them live in `@cognirise/atelier/archetypes`.

**Read `docs/ARCHETYPES.md` before designing a menu.** It gives the default
screens, and says when to merge two of them, split one, or add the product's own
object as a sixth. Merging and adding are normal. What is not negotiable is that
each of the five questions is answered somewhere.
- Each pane carries a 1px top sheen (`--glass-sheen`). It is what separates
  "translucent rectangle" from "sheet of glass".

Reduced-transparency and no-`backdrop-filter` fallbacks re-opaque every level
automatically; nothing in an app needs to handle that.

### Verify it, do not assume it

`npm run contrast` checks token pairs. That is not sufficient here: a palette
can pass every pair and still put a headline on a bright ribbon. `npm run
legibility` loads the running app, hides the text to photograph the surface
underneath, and reports the worst pixel under each text block in both themes.
Run it after changing backdrops or glass alphas.

## The pinned header

`<AppShell>` sticks the **header block**, not the title bar. A `sticky` element
only travels within its own parent's box, so a sticky `<TitleBar>` inside a
short auto-height wrapper scrolls away the moment that wrapper leaves the
viewport — it looks pinned until you scroll, which is the worst kind of bug.

The 12px gutter lives *inside* the sticky element, so the title bar's top edge
stays aligned with the rail's brand card at every scroll position. Do not add
`sticky` or `top-0` to `<TitleBar>` itself.

## Composing a page

Everything above is the frame. This section is what goes inside it, and it
matters more: an app built only from the frame comes out correct and empty.
The components here live in `@cognirise/atelier/layout` alongside the shell.

### The anatomy of a product page

```
<PageHero>                 eyebrow, headline, lede, actions
                           + media (the product's signature visual)
                           + feature (the one number that matters now)
<PageContainer>
  <PageSection>            stat row — four <StatTile>s
  <PageColumns>            primary column + secondary column
    primary:   <Panel> holding a feed of <FeedCard>s, or a table
    secondary: <Panel> queues of <RecordCard>s
               <Panel tone="accent"> a status list of <StatusRow>s
```

A page that is a stat row, then a chart, then a full-width table is a
**report**. A page with a hero that carries a visual, a primary feed and a
secondary column of live queues is a **product**. Build the second one.

### The secondary column

`<PageColumns primary aside>` splits the body roughly 2:1. Most product pages
want it. The secondary column is where work queues, related records, system
health and "what changed" live — the things a user glances at rather than
works in. Going full-width for a single table is usually a sign the page has
not been thought through.

### Panels

Every panel uses `<Panel>`, which fixes the header shape: a 16px icon, the
title, and an optional right-aligned `<PanelAction>` carrying the scope or a
"see all" link. Consistent panel headers are most of what lets a dense page
stay scannable. Do not hand-roll one.

`tone="accent"` tints a panel with the brand accent. At most one per page, for
the panel that is different in kind from its neighbours.

### Feed or table?

Use a **feed** of `<FeedCard>`s when the rows are things that *happened* —
alerts, signals, events, activity. Use a **table** when the rows are records
being *compared* on shared columns — balances, accounts, line items.

A `<FeedCard>` has three parts, and the third is the one people skip:

- **tags** — one or two chips: kind, then priority. Build a real taxonomy
  (see below) rather than a single severity.
- **headline** — what happened.
- **consequence** — why it matters or what to do about it. Not a restatement
  of the headline. This line is the difference between an intelligence feed
  and a log.

### Stat tiles

`<StatTile>` fixes the anatomy: label with a state chip pushed right, value at
display size, then a trend with a direction arrow. Give the trend a
`sentiment` — "at-risk exposure up 21%" is bad news and should be red, while
"signals cleared up 21%" is good news, and the arrow direction alone cannot
tell them apart.

### Icons

Every `ContextNavItem` takes an `icon`. `<Panel>` takes one. Use them — give
every item in a group an icon or none, never half. A text-only nav and
text-only panel headers are the fastest way to make a well-built app look
cheap.

Icons come from `lucide-react`, 14px in nav, 16px in panel headers.

### Brand placement

The **client's** lockup goes in the chat rail's `<RailBrandCard>`. The
**product's** wordmark goes in the title bar. Keeping the two identities apart
stops them competing, and the rail card is a light surface in both themes, so a
client who has only supplied a positive lockup still has a correct place for
it.

### The title bar carries more than a wordmark

Any app with more than one collection of records gets `<TitleBarSearch>` — it
is the fastest route to anything, and its absence is most of why a title bar
feels empty. Use `<UserBadge name role initials />` rather than a bare avatar:
in an app where what you see depends on who you are, show who you are.

### The assistant rail is a product surface

A rail with a transcript and an empty composer gets ignored. It needs:

- `<RailBrandCard>` at the top,
- a header with the assistant's name and a `<ChatStatusBadge>` reflecting its
  *actual* state,
- `<ChatSuggestions>` above the composer — three or four short, concrete
  prompts phrased as the work ("Weekly summary", "Compare competitors"). These
  are what tell a first-time user what the assistant can do.

### Design the vocabulary before the screen

The richness of a page comes from its information architecture, not its
styling. Before building, decide and write down:

- the **taxonomy** — what kinds of thing the feed carries (regulation,
  competitor, event, customer, social) crossed with priority;
- the **workflow states** records move through (new → in review → actioned),
  each with its own chip;
- the **identifiers** people will say out loud (`FK-2026-018`);
- the **failure states** — what a degraded data source looks like, named
  specifically ("partial — API rate limit"), never a silent green.

Placeholder data with one severity level and no identifiers produces a page
that looks like a wireframe no matter how good the components are.

## Do and don't

**Do** build on `<AppShell>` and extend it through its slots.
**Do** open every page with exactly one `<PageHero>`.
**Do** keep body content on glass surfaces inside a `<PageContainer>`.
**Do** keep the rail, title bar and composer pinned while the page scrolls.

**Do** keep all three glass levels present and visible on every page.
**Do** give the hero a `media` visual and a `feature` figure.
**Do** split the body with `<PageColumns>` and give panels icons and actions.
**Do** write the taxonomy, workflow states and failure states before the UI.

**Don't** add a second hero, nest heroes, or use the island for body sections.
**Don't** replace the lens drop-down with a sidebar or a separate page.
**Don't** re-scale the composer controls or drop the System theme option.
**Don't** invent a new page frame per app.
**Don't** ship a text-only nav, a bare avatar, or an assistant with no
suggestions — each one reads as unfinished.
**Don't** place a card straight on the page, nest a level inside itself, or
cover every gutter — each one flattens the glass scale.
**Don't** make `<TitleBar>` sticky; the header block already is.
**Don't** hard-code a brand color, font, radius or asset path in a page — every
one of those already exists as a token or a `/brand/*` asset.
