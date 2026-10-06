import { useState } from 'react';
import {
  ArrowDownToLine,
  CircleCheck,
  Cog,
  PackageCheck,
  Workflow as WorkflowIcon,
} from 'lucide-react';
import { Guidelines, Stack } from '../parts';
import { MainPanel, Panel, StatRow, StatTile } from '../../components/layout';
import {
  AgentAutonomyChip,
  AgentAvatar,
  AgentCard,
  AgentDirectory,
  AgentProfile,
  AgentStatusStrip,
  DecisionBar,
  DecisionTrail,
  DemoBanner,
  DemoReference,
  InboxFilters,
  InboxItem,
  InboxLayout,
  InboxList,
  InboxReader,
  InboxTabs,
  OutputCard,
  PersonaSwitcher,
  ProvenanceChip,
  ProvenanceNote,
  ReaderSection,
  ScenarioCard,
  ScenarioRunner,
  SettingsGroup,
  SettingsLayout,
  SettingsNavItem,
  SettingsRow,
  TrailEntry,
  WorkItemCard,
  WorkflowCard,
  WorkflowCatalog,
  WorkflowStep,
  WorkflowWalkthrough,
  WorkspaceHeader,
  WorkspaceLane,
  WorkspaceLanes,
  WorkspaceLayout,
  type Agent,
  type Persona,
} from '../../components/archetypes';

/**
 * The archetypes rendered with a fictional field-operations prototype, so the
 * shapes can be judged without a client's data. Nothing here names a client;
 * the fixtures are deliberately generic.
 */

const AGENTS: Agent[] = [
  {
    id: 'intake',
    name: 'Mira',
    role: 'Intake Coordinator',
    initials: 'MI',
    purpose: 'Reads every incoming report, classifies it and opens the case.',
    autonomy: 'supervised',
    activity: 'working',
  },
  {
    id: 'triage',
    name: 'Rafi',
    role: 'Severity Assessor',
    initials: 'RA',
    purpose: 'Scores impact and urgency against the operating thresholds.',
    autonomy: 'recommend',
    activity: 'waiting',
  },
  {
    id: 'dispatch',
    name: 'Nadia',
    role: 'Dispatch Planner',
    initials: 'NA',
    purpose: 'Builds the crew and parts plan, and holds the slot until approved.',
    autonomy: 'assisted',
    activity: 'idle',
  },
  {
    id: 'comms',
    name: 'Tomas',
    role: 'Customer Notifier',
    initials: 'TO',
    purpose: 'Drafts and sends affected-customer messaging in the right language.',
    autonomy: 'assisted',
    activity: 'blocked',
  },
];

const PERSONAS: Persona[] = [
  {
    id: 'planner',
    name: 'Leyla Demir',
    role: 'Operations Planner',
    initials: 'LD',
    remit: 'Runs the daily plan and clears the attention queue.',
    authority: 'Dispatch up to 4 crews; spend to 25,000 per case',
    restrictions: 'Contract pricing, HR records',
  },
  {
    id: 'supervisor',
    name: 'Arjun Rao',
    role: 'Regional Supervisor',
    initials: 'AR',
    remit: 'Owns the region and approves anything the planner cannot.',
    authority: 'Any dispatch; spend to 250,000 per case',
    restrictions: 'Other regions',
  },
  {
    id: 'auditor',
    name: 'Sofia Marchetti',
    role: 'Compliance Reviewer',
    initials: 'SM',
    remit: 'Reads the decision trail after the fact. Approves nothing.',
    authority: 'Read-only',
    restrictions: 'Customer contact details',
  },
];

const CASES = [
  {
    id: 'DEMO-CASE-004182',
    title: 'Sustained voltage dip — Sector 12 feeder',
    preview: 'Nine premises affected. Rafi scored it High; awaiting dispatch approval.',
    state: 'Needs approval',
    unread: true,
  },
  {
    id: 'DEMO-CASE-004179',
    title: 'Repeat fault at the same transformer',
    preview: 'Third report in eleven days. Nadia proposes replacement over repair.',
    state: 'Needs approval',
    unread: true,
  },
  {
    id: 'DEMO-CASE-004175',
    title: 'Customer-reported outage, no telemetry match',
    preview: 'Tomas is holding the notification until the fault is confirmed.',
    state: 'Blocked',
    unread: false,
  },
];

export function InboxArchetypeDemo() {
  const [tab, setTab] = useState('attention');
  const [selected, setSelected] = useState(CASES[0].id);
  const active = CASES.find((entry) => entry.id === selected) ?? CASES[0];

  return (
    <div className="space-y-10">
      <Stack label="Inbox — list and reader inside the main panel">
        <MainPanel>
          <div className="h-[560px]">
            <InboxLayout
              className="h-full"
              tabs={
                <InboxTabs
                  value={tab}
                  onChange={setTab}
                  items={[
                    { id: 'attention', label: 'Needs attention', count: 2, tone: 'attention' },
                    { id: 'waiting', label: 'Waiting on agents', count: 1 },
                    { id: 'all', label: 'All cases', count: 34 },
                  ]}
                />
              }
              filters={
                <InboxFilters
                  action={
                    <span className="font-mono text-xs text-muted-foreground">
                      Sorted by urgency
                    </span>
                  }
                >
                  <FilterPill>Region: North</FilterPill>
                  <FilterPill>Severity: High</FilterPill>
                  <FilterPill>Agent: Any</FilterPill>
                  <FilterPill>Last 48 hours</FilterPill>
                </InboxFilters>
              }
              list={
                <InboxList label="Cases needing attention" count={CASES.length}>
                  {CASES.map((entry) => (
                    <InboxItem
                      key={entry.id}
                      selected={entry.id === selected}
                      onSelect={() => setSelected(entry.id)}
                      unread={entry.unread}
                      reference={<DemoReference>{entry.id}</DemoReference>}
                      state={
                        <span className="font-mono text-[11px] uppercase tracking-wider text-warn">
                          {entry.state}
                        </span>
                      }
                      title={entry.title}
                      preview={entry.preview}
                      meta={
                        <>
                          <AgentAvatar agent={AGENTS[0]} size={20} showActivity={false} />
                          <span className="text-xs text-muted-foreground">
                            Mira · 14 min ago
                          </span>
                        </>
                      }
                    />
                  ))}
                </InboxList>
              }
              reader={
                <InboxReader
                  header={
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <DemoReference>{active.id}</DemoReference>
                        <ProvenanceChip kind="simulated" />
                      </div>
                      <h3 className="text-lg font-semibold leading-tight">
                        {active.title}
                      </h3>
                    </div>
                  }
                  actions={
                    <DecisionBar prompt="Leyla Demir approves dispatch up to 4 crews.">
                      <GhostAction>Send back to Rafi</GhostAction>
                      <GhostAction>Escalate</GhostAction>
                      <PrimaryAction>Approve the dispatch plan</PrimaryAction>
                    </DecisionBar>
                  }
                >
                  <DemoBanner kind="simulated">
                    This case was injected by the “Feeder fault” scenario. The
                    telemetry, the premises and the crew roster are fabricated.
                  </DemoBanner>

                  <ReaderSection label="Who is on this case">
                    <AgentStatusStrip agents={AGENTS} />
                  </ReaderSection>

                  <ReaderSection label="What the agents found">
                    <p className="text-sm leading-relaxed">
                      Voltage on the Sector 12 feeder has been below tolerance for
                      41 minutes. Nine premises are affected, two of them on the
                      medical-priority register.
                    </p>
                    <ProvenanceNote>
                      Synthetic telemetry — not a reading from any live network.
                    </ProvenanceNote>
                  </ReaderSection>

                  <ReaderSection label="Decision trail">
                    <DecisionTrail>
                      <TrailEntry
                        actor={<AgentAvatar agent={AGENTS[0]} size={24} showActivity={false} />}
                        kind="acted"
                        at="09:14"
                        autonomy={<AgentAutonomyChip level="supervised" showCode={false} />}
                        summary="Opened the case and classified it as a feeder fault."
                      />
                      <TrailEntry
                        actor={<AgentAvatar agent={AGENTS[1]} size={24} showActivity={false} />}
                        kind="proposed"
                        at="09:16"
                        autonomy={<AgentAutonomyChip level="recommend" showCode={false} />}
                        summary="Scored severity High on premises count and priority register."
                        override={{
                          from: 'Severity: High',
                          to: 'Severity: Critical',
                          reason:
                            'Leyla raised it — two medical-priority premises outrank the count threshold.',
                        }}
                      />
                    </DecisionTrail>
                  </ReaderSection>
                </InboxReader>
              }
            />
          </div>
        </MainPanel>
      </Stack>

      <Guidelines
        items={[
          { kind: 'do', text: 'End the reader in a decision bar that names the actual decision and the authority making it.' },
          { kind: 'do', text: 'Put the first tab on the attention queue, and show its count.' },
          { kind: 'do', text: 'Label injected events with a demo banner, and fabricated identifiers with a DEMO- prefix.' },
          { kind: 'dont', text: 'Ship an inbox whose items cannot be resolved — that is a report with extra steps.' },
          { kind: 'dont', text: 'Put more than six controls in the filter row; a seventh means the list is wrong.' },
        ]}
      />
    </div>
  );
}

export function WorkspaceArchetypeDemo() {
  return (
    <div className="space-y-10">
      <Stack label="Workspace — one job, intake to output">
        <MainPanel>
          <WorkspaceLayout
            header={
              <WorkspaceHeader
                job="Field operations workspace"
                owner="Leyla Demir · Operations Planner"
                period="Today"
                actions={<GhostAction>Open the plan</GhostAction>}
              />
            }
            summary={
              <StatRow>
                <StatTile label="Open cases" value="34" state={<span className="mono-chip">Live</span>} trend={{ direction: 'down', label: '−6 vs yesterday', sentiment: 'good' }} />
                <StatTile label="Awaiting approval" value="2" trend={{ direction: 'flat', label: 'unchanged' }} />
                <StatTile label="Crews committed" value="11" trend={{ direction: 'up', label: '+2', sentiment: 'neutral' }} />
                <StatTile label="Handled without a human" value="78%" trend={{ direction: 'up', label: '+4 pts', sentiment: 'good' }} />
              </StatRow>
            }
          >
            <WorkspaceLanes>
              <WorkspaceLane
                icon={<ArrowDownToLine className="h-4 w-4" />}
                title="Intake"
                count={12}
                caption="Reports and telemetry that arrived since the shift opened."
              >
                <WorkItemCard
                  reference={<DemoReference>DEMO-CASE-004182</DemoReference>}
                  title="Sustained voltage dip — Sector 12"
                  state={<span className="mono-chip is-warn">New</span>}
                  handler={<AgentAvatar agent={AGENTS[0]} size={22} showActivity={false} />}
                  meta={<span className="text-xs text-muted-foreground">Mira · classified</span>}
                />
                <WorkItemCard
                  reference={<DemoReference>DEMO-CASE-004181</DemoReference>}
                  title="Customer report — flickering supply"
                  handler={<AgentAvatar agent={AGENTS[0]} size={22} showActivity={false} />}
                  meta={<span className="text-xs text-muted-foreground">Awaiting telemetry match</span>}
                />
              </WorkspaceLane>

              <WorkspaceLane
                icon={<Cog className="h-4 w-4" />}
                title="In flight"
                count={5}
                caption="Being worked right now, and by whom."
                tone="accent"
              >
                <WorkItemCard
                  reference={<DemoReference>DEMO-CASE-004179</DemoReference>}
                  title="Transformer replacement plan"
                  progress={64}
                  handler={<AgentAvatar agent={AGENTS[2]} size={22} showActivity={false} />}
                  meta={<AgentAutonomyChip level="assisted" showCode={false} />}
                />
                <WorkItemCard
                  reference={<DemoReference>DEMO-CASE-004175</DemoReference>}
                  title="Customer notification draft"
                  progress={30}
                  state={<span className="mono-chip is-danger">Blocked</span>}
                  handler={<AgentAvatar agent={AGENTS[3]} size={22} showActivity={false} />}
                  meta={<span className="text-xs text-muted-foreground">Waiting on fault confirmation</span>}
                />
              </WorkspaceLane>

              <WorkspaceLane
                icon={<PackageCheck className="h-4 w-4" />}
                title="Output"
                count={9}
                caption="What left the workspace, and where it went."
              >
                <OutputCard
                  format="Dispatch order"
                  title="Crew 7 to Sector 12, 11:00–14:00"
                  destination="Sent to the scheduling system"
                  provenance={<ProvenanceChip kind="synthetic" />}
                />
                <OutputCard
                  format="Customer SMS"
                  title="Nine premises notified, two languages"
                  destination="Held — awaiting supervisor approval"
                  provenance={<ProvenanceChip kind="synthetic" />}
                />
              </WorkspaceLane>
            </WorkspaceLanes>
          </WorkspaceLayout>
        </MainPanel>
      </Stack>

      <Guidelines
        items={[
          { kind: 'do', text: 'Name the owner of the workspace; it changes when the persona changes.' },
          { kind: 'do', text: 'Show a handler on every item in flight — unowned work is what clients distrust.' },
          { kind: 'do', text: 'Give every output a destination. An output with nowhere to go is not an output.' },
          { kind: 'dont', text: 'Put two jobs in one workspace and separate them with a filter.' },
        ]}
      />
    </div>
  );
}

export function AgentsArchetypeDemo() {
  const [open, setOpen] = useState<string | null>('dispatch');
  const profile = AGENTS.find((agent) => agent.id === open);

  return (
    <div className="space-y-10">
      <Stack label="Agents team — directory and profile">
        <MainPanel>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel title="The team" icon={<CircleCheck className="h-4 w-4" />}>
              <AgentDirectory>
                {AGENTS.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onOpen={() => setOpen(agent.id)}
                  />
                ))}
              </AgentDirectory>
            </Panel>
            <Panel title="Profile">
              {profile ? (
                <AgentProfile
                  agent={profile}
                  onClose={() => setOpen(null)}
                  functions={[
                    'Reads the fault, the affected premises and the parts catalogue.',
                    'Builds a crew and parts plan against the current roster.',
                    'Holds the dispatch slot for twenty minutes while a planner reviews.',
                    'Rebuilds the plan when the planner changes a constraint.',
                    'Releases the slot and records the reason if the plan is rejected.',
                  ]}
                  superpower="Re-plans the whole region in seconds when one crew drops out — the version a person would need an hour to redo."
                  impact="Cuts the gap between a confirmed fault and a committed crew from hours to minutes, without removing the planner's sign-off."
                  stats={[
                    { label: 'Plans built', value: '412' },
                    { label: 'Approved as-is', value: '87%' },
                    { label: 'Median build', value: '9s' },
                    { label: 'Slots released', value: '18' },
                    { label: 'Escalations', value: '6' },
                  ]}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Choose an agent to read their remit.
                </p>
              )}
            </Panel>
          </div>
        </MainPanel>
      </Stack>

      <Guidelines
        items={[
          { kind: 'do', text: 'Give every agent a name, a job title in the client vocabulary, and a declared autonomy level.' },
          { kind: 'do', text: 'Write the four profile blocks in order: functions, superpower, impact, stats.' },
          { kind: 'dont', text: 'Label an agent autonomous because that is the roadmap. Label the level it actually runs at.' },
        ]}
      />
    </div>
  );
}

export function WorkflowsArchetypeDemo() {
  return (
    <div className="space-y-10">
      <Stack label="Workflows — catalog and walkthrough">
        <MainPanel>
          <div className="space-y-3">
            <Panel title="Implemented workflows" icon={<WorkflowIcon className="h-4 w-4" />}>
              <WorkflowCatalog>
                <WorkflowCard
                  name="Fault to dispatch"
                  purpose="Turns a confirmed fault into a committed crew and parts plan."
                  trigger="Telemetry threshold breach, or a customer report that matches one"
                  outcome="An approved dispatch order and a notified customer set"
                  coverage="implemented"
                  autonomy={<AgentAutonomyChip level="assisted" />}
                  agents={
                    <span className="flex -space-x-2">
                      {AGENTS.slice(0, 3).map((agent) => (
                        <AgentAvatar key={agent.id} agent={agent} size={22} showActivity={false} />
                      ))}
                    </span>
                  }
                  stepCount={6}
                  onOpen={() => undefined}
                />
                <WorkflowCard
                  name="Repeat-fault escalation"
                  purpose="Spots the same asset failing repeatedly and proposes replacement."
                  trigger="Third fault on one asset inside 30 days"
                  outcome="A capital request with the repair-vs-replace comparison"
                  coverage="partial"
                  autonomy={<AgentAutonomyChip level="recommend" />}
                  stepCount={5}
                  onOpen={() => undefined}
                />
                <WorkflowCard
                  name="Planned-outage notification"
                  purpose="Notifies affected customers ahead of scheduled work."
                  trigger="Work order scheduled more than 48 hours out"
                  outcome="Messages queued in each customer's language"
                  coverage="designed"
                  stepCount={4}
                />
                <WorkflowCard
                  name="Safety incident review"
                  purpose="Reviews any incident involving a crew on site."
                  trigger="Incident logged by a crew lead"
                  outcome="A reviewed report with named accountability"
                  coverage="manual"
                  stepCount={3}
                />
              </WorkflowCatalog>
            </Panel>

            <Panel title="Fault to dispatch — walkthrough">
              <WorkflowWalkthrough>
                <WorkflowStep
                  index={1}
                  title="Detect and classify"
                  actor={<AgentAvatar agent={AGENTS[0]} size={22} showActivity={false} />}
                  autonomy={<AgentAutonomyChip level="supervised" showCode={false} />}
                  coverage="implemented"
                  detail="Reads the telemetry stream and any customer reports in the window, and opens one case per distinct fault."
                  inputs={['Feeder telemetry', 'Customer reports', 'Asset register']}
                  outputs={['An open case with a fault class']}
                  decision="Is this one fault or several? Mira merges; a planner can split."
                />
                <WorkflowStep
                  index={2}
                  title="Score severity"
                  actor={<AgentAvatar agent={AGENTS[1]} size={22} showActivity={false} />}
                  autonomy={<AgentAutonomyChip level="recommend" showCode={false} />}
                  coverage="implemented"
                  detail="Scores impact and urgency against the operating thresholds and the medical-priority register."
                  inputs={['Affected premises', 'Priority register', 'Operating thresholds']}
                  outputs={['A severity score with its reasoning']}
                  decision="The planner owns the final severity. Rafi only proposes."
                />
                <WorkflowStep
                  index={3}
                  title="Build the dispatch plan"
                  actor={<AgentAvatar agent={AGENTS[2]} size={22} showActivity={false} />}
                  autonomy={<AgentAutonomyChip level="assisted" showCode={false} />}
                  coverage="implemented"
                  inputs={['Crew roster', 'Parts inventory', 'Travel times']}
                  outputs={['A crew and parts plan', 'A held dispatch slot']}
                  decision="Dispatch executes only on planner approval, inside their crew and spend limits."
                />
                <WorkflowStep
                  index={4}
                  title="Notify affected customers"
                  actor={<AgentAvatar agent={AGENTS[3]} size={22} showActivity={false} />}
                  autonomy={<AgentAutonomyChip level="assisted" showCode={false} />}
                  coverage="partial"
                  detail="Drafts in each customer's registered language. Sending is blocked until the fault is confirmed."
                  inputs={['Affected premises', 'Language preferences']}
                  outputs={['Draft messages, held']}
                  decision="Nobody is told about an unconfirmed fault. The block is deliberate."
                />
              </WorkflowWalkthrough>
            </Panel>
          </div>
        </MainPanel>
      </Stack>

      <Guidelines
        items={[
          { kind: 'do', text: 'Leave designed-but-unbuilt workflows in the catalog, marked. It is the scope conversation.' },
          { kind: 'do', text: 'Give every step its actor, inputs, outputs and the decision it makes.' },
          { kind: 'dont', text: 'Let a step be one sentence with no named actor.' },
        ]}
      />
    </div>
  );
}

export function ScenariosArchetypeDemo() {
  const [running, setRunning] = useState<string | null>(null);

  return (
    <div className="space-y-10">
      <Stack label="Scenarios — driving the demo">
        <MainPanel>
          <Panel title="Scenarios">
            <ScenarioRunner onReset={() => setRunning(null)}>
              <ScenarioCard
                name="Feeder fault, business hours"
                premise="A Sector 12 feeder drops below tolerance at 09:14 with nine premises affected."
                demonstrates="The happy path: classified, scored, planned and approved in under a minute."
                state={running === 'a' ? 'running' : 'idle'}
                onRun={() => setRunning('a')}
              />
              <ScenarioCard
                name="Third fault on one transformer"
                premise="The same asset fails for the third time in eleven days."
                demonstrates="The agent stops proposing repairs and builds a replacement case instead."
                state={running === 'b' ? 'running' : 'idle'}
                onRun={() => setRunning('b')}
              />
              <ScenarioCard
                name="Report with no telemetry match"
                premise="A customer reports an outage the network does not see."
                demonstrates="The refusal: notification is blocked rather than guessed at."
                state={running === 'c' ? 'running' : 'idle'}
                onRun={() => setRunning('c')}
              />
              <ScenarioCard
                name="Spend above the planner's limit"
                premise="The plan needs 310,000 of parts against a 25,000 limit."
                demonstrates="The escalation: the case moves to the supervisor's inbox, unchanged."
                state={running === 'd' ? 'running' : 'idle'}
                onRun={() => setRunning('d')}
              />
            </ScenarioRunner>
          </Panel>
        </MainPanel>
      </Stack>

      <Guidelines
        items={[
          { kind: 'do', text: 'Make each scenario a different shape of case: happy path, exception, refusal, escalation.' },
          { kind: 'do', text: 'Always offer a reset, and rehearse it — a demo that cannot be re-run gets run once.' },
          { kind: 'dont', text: 'Ship ten scenarios that differ only in names.' },
        ]}
      />
    </div>
  );
}

export function SettingsArchetypeDemo() {
  const [persona, setPersona] = useState('planner');
  const [section, setSection] = useState('personas');

  return (
    <div className="space-y-10">
      <Stack label="Settings — and the persona switcher">
        <MainPanel>
          <SettingsLayout
            nav={
              <div className="space-y-1">
                <SettingsNavItem active={section === 'personas'} onSelect={() => setSection('personas')}>
                  Personas
                </SettingsNavItem>
                <SettingsNavItem active={section === 'general'} onSelect={() => setSection('general')}>
                  General
                </SettingsNavItem>
                <SettingsNavItem active={section === 'data'} onSelect={() => setSection('data')}>
                  Demo data
                </SettingsNavItem>
              </div>
            }
          >
            <SettingsGroup
              title="Who you are"
              description="Switching persona changes the inbox, the workspace owner and what you may approve. It takes effect immediately."
            >
              <PersonaSwitcher
                personas={PERSONAS}
                value={persona}
                onChange={setPersona}
              />
            </SettingsGroup>

            <SettingsGroup title="Demo data">
              <SettingsRow
                label="Data set"
                hint="Every record in this prototype is generated. Nothing here came from a production system."
                control={<ProvenanceChip kind="synthetic" label="Synthetic — 340 cases" />}
              />
              <SettingsRow
                label="Reset on reload"
                hint="Returns the prototype to its opening state when the page is refreshed."
                control={<GhostAction>On</GhostAction>}
              />
            </SettingsGroup>
          </SettingsLayout>
        </MainPanel>
      </Stack>

      <Guidelines
        items={[
          { kind: 'do', text: 'State each persona’s approval limits in the client’s own units.' },
          { kind: 'do', text: 'Put the switcher in the title-bar user badge too — nobody wants to navigate mid-demo.' },
          { kind: 'dont', text: 'Ship a switcher that only changes a name. If nothing else changes, there is no authority model.' },
        ]}
      />
    </div>
  );
}

function FilterPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

function GhostAction({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
    >
      {children}
    </button>
  );
}

function PrimaryAction({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="rounded-full bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
    >
      {children}
    </button>
  );
}
