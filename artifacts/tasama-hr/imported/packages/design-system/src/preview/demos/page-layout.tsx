import { useState } from 'react';
import { Activity, Bell, Boxes, LayoutDashboard, Radar, Settings } from 'lucide-react';
import { Guidelines, Stack } from '../parts';
import {
  useAppChrome,
  ChatAssistantTurn,
  ChatComposer,
  ChatUserTurn,
  ContextNav,
  FeedCard,
  LensPicker,
  MainPanel,
  PageColumns,
  Panel,
  PanelAction,
  StatRow,
  StatTile,
  StatusRow,
  ThemeModeToggle,
  UserBadge,
  Wordmark,
} from '../../components/layout';

const LENSES = [
  { id: 'clients', label: 'Clients' },
  { id: 'people', label: 'People' },
  { id: 'finance', label: 'Finance' },
];

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'radar', label: 'Radar', icon: <Radar className="h-4 w-4" /> },
  { id: 'portfolio', label: 'Portfolio', icon: <Boxes className="h-4 w-4" /> },
  { id: 'activity', label: 'Activity', icon: <Activity className="h-4 w-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
];

/**
 * A bounded rendering of the default layout. The real thing is <AppShell>,
 * which pins the rail and the header block to the window; this renders the
 * same pieces, at the same glass levels, inside a frame the style guide can
 * show.
 *
 * What it is here to prove:
 *   - the menu is CHROME, outside the display area
 *   - <MainPanel> is the L1 display shell, and the page's panels sit inside it
 *   - the header block is one sticky unit; in vertical mode the menu
 *     top-aligns with the chat rail and the display shell, BELOW the title bar
 */
export function PageLayoutDemo() {
  const chrome = useAppChrome();
  const [lens, setLens] = useState('clients');
  const [section, setSection] = useState('overview');
  const [draft, setDraft] = useState('');
  const vertical = chrome.orientation === 'vertical';

  const items = SECTIONS.map((s) => ({ ...s, onSelect: () => setSection(s.id) }));

  return (
    <div className="space-y-10">
      <Stack label="Default layout — rail, title bar, menu, display shell">
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="flex h-[620px]">
            {/* Chat rail — glass-chrome, pinned, its own column */}
            <div className="flex w-[268px] shrink-0 flex-col gap-3 p-3">
              <div className="flex h-14 shrink-0 items-center rounded-xl glass-chrome px-4">
                <Wordmark className="text-base">Atelier</Wordmark>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl glass-chrome">
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                  <ChatUserTurn>Which clients renew this quarter?</ChatUserTurn>
                  <ChatAssistantTurn avatar="A">
                    Four do. The transcript is the only scrolling region — the
                    rail is pinned and the composer never moves.
                  </ChatAssistantTurn>
                </div>
                <ChatComposer
                  value={draft}
                  onChange={setDraft}
                  onSend={() => setDraft('')}
                  onAttach={() => undefined}
                />
              </div>
            </div>

            {/* The app column */}
            <div className="flex min-w-0 flex-1 flex-col">
              {/* The header block: title bar full width, and the horizontal
                  menu when the menu is horizontal. Sticks as ONE unit. */}
              <div className="shrink-0 space-y-3 p-3 pb-0">
                <div className="flex h-14 items-center gap-4 rounded-xl glass-chrome px-4">
                  <Wordmark>Atelier</Wordmark>
                  <div className="ms-auto flex items-center gap-4">
                    <LensPicker lenses={LENSES} value={lens} onChange={setLens} />
                    <ThemeModeToggle />
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <UserBadge name="Mounir Ariss" role="Operations" initials="MA" />
                  </div>
                </div>
                {vertical ? null : (
                  <ContextNav chrome={chrome} items={items} value={section} />
                )}
              </div>

              {/* Below the title bar: the vertical menu and the display shell,
                  top-aligned with each other and with the chat rail. */}
              <div className="flex min-h-0 flex-1 gap-3 p-3">
                {vertical ? (
                  <div className="shrink-0" style={{ width: chrome.navInset }}>
                    <ContextNav chrome={chrome} items={items} value={section} />
                  </div>
                ) : null}

                <main className="min-w-0 flex-1 overflow-y-auto">
                  <MainPanel className="space-y-3">
                    <StatRow>
                      <StatTile
                        label="Open renewals"
                        value="18"
                        state={<span className="mono-chip is-primary">Q4</span>}
                        trend={{ direction: 'up', label: '+3 this week', sentiment: 'good' }}
                      />
                      <StatTile
                        label="At risk"
                        value="4"
                        trend={{ direction: 'down', label: '−1', sentiment: 'good' }}
                      />
                      <StatTile label="Value" value="€2.4m" trend={{ direction: 'flat', label: 'unchanged' }} />
                      <StatTile label="Median cycle" value="21d" trend={{ direction: 'down', label: '−4d', sentiment: 'good' }} />
                    </StatRow>

                    <PageColumns
                      aside={
                        <Panel title="Feed health" icon={<Activity className="h-4 w-4" />}>
                          <StatusRow name="CRM sync" detail="every 15 min" status={<span className="mono-chip is-success">OK</span>} />
                          <StatusRow name="Billing export" detail="delayed 40 min" status={<span className="mono-chip is-warn">Lagging</span>} />
                          <StatusRow name="Support tickets" detail="every hour" status={<span className="mono-chip is-success">OK</span>} />
                        </Panel>
                      }
                    >
                      <Panel
                        title="What changed"
                        icon={<Radar className="h-4 w-4" />}
                        action={<PanelAction>Last 48 hours</PanelAction>}
                      >
                        <div className="space-y-2">
                          <FeedCard
                            tags={<span className="mono-chip is-warn">Risk</span>}
                            timestamp="2h ago"
                            headline="Northwind moved its renewal review to December"
                            consequence="The Q4 forecast loses €310k unless the review is pulled forward."
                            onOpen={() => undefined}
                          />
                          <FeedCard
                            tags={<span className="mono-chip is-primary">Signal</span>}
                            timestamp="5h ago"
                            headline="Acme Holdings opened three seats above contract"
                            consequence="An upsell conversation is available now, before the renewal."
                            onOpen={() => undefined}
                          />
                        </div>
                      </Panel>
                    </PageColumns>
                  </MainPanel>
                </main>
              </div>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Use the two controls at the end of the menu to collapse its labels and
          to move it between the top and the side. In vertical mode the menu
          top-aligns with the chat rail and the display shell, below the title
          bar — the geometry <code>AppShell</code> handles for real apps.
        </p>
      </Stack>

      <Stack label="The glass scale, in place">
        <div className="rounded-xl glass-l2 p-4 text-sm">
          <p>
            <strong>L0</strong> is the backdrop, visible in every gutter and
            gap. <strong>L1</strong> is the display shell,{' '}
            <code>MainPanel</code>. <strong>L2</strong> is a section panel —
            this box. <strong>L3</strong> is a card on it:
          </p>
          <div className="mt-3 rounded-xl glass-l3 p-4">
            <p className="text-sm">
              Three fills and three blurs, seen at once. That is where the depth
              comes from — not from any single surface.
            </p>
          </div>
          <p className="mt-3 text-muted-foreground">
            Pinned bars use <code>glass-chrome</code>: a much higher fill, so
            content scrolling underneath stays unreadable rather than smeared.
          </p>
        </div>
      </Stack>

      <Guidelines
        items={[
          { kind: 'do', text: 'Build every app on <AppShell>: backdrop, chat rail, sticky header block, menu, then <MainPanel> as the display shell.' },
          { kind: 'do', text: 'Keep the menu OUTSIDE the display area. The page’s panels go inside <MainPanel>, not beside the nav.' },
          { kind: 'do', text: 'Let all four glass levels be visible at once, and keep L0 showing in the gutters and between panels.' },
          { kind: 'do', text: 'Give the menu both controls — collapse labels, and switch orientation — and let the preference persist.' },
          { kind: 'dont', text: 'Do not nest a glass level inside itself, or put a bare row of cards directly on the display shell.' },
          { kind: 'dont', text: 'Do not add a second hero or a second page frame; extend the shell through its slots.' },
          { kind: 'dont', text: 'Do not put the menu inside <MainPanel>, or let the vertical menu start above the display shell.' },
        ]}
      />
    </div>
  );
}
