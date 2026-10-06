/**
 * SCREEN ARCHETYPES — the standard menu of a Cognirise prototype.
 *
 * The layout system says how a page is framed. These say what the pages ARE.
 * Every prototype ships the same spine, because the spine is what makes a
 * two-week build read as a product:
 *
 *   Inbox       what is waiting on the human          → inbox.tsx
 *   Workspace   one job, end to end                   → workspace.tsx
 *   Agents      the team, their remit and autonomy    → agents.tsx
 *   Workflows   what is automated, and exactly how    → workflows.tsx
 *   Scenarios   the demo's remote control             → scenarios.tsx
 *   Settings    app settings and the persona switcher → settings.tsx
 *
 * Plus two cross-cutting layers used inside the others:
 *
 *   Provenance  what is synthetic and what is not     → provenance.tsx
 *   Trail       who did what, at what authority       → trail.tsx
 *
 * Drop one, or add one, when the engagement needs it — but say so out loud.
 * See docs/ARCHETYPES.md.
 */
export {
  DecisionBar,
  InboxFilters,
  InboxItem,
  InboxLayout,
  InboxList,
  InboxReader,
  InboxTabs,
  ReaderSection,
} from './inbox';
export {
  OutputCard,
  WorkItemCard,
  WorkspaceHeader,
  WorkspaceLane,
  WorkspaceLanes,
  WorkspaceLayout,
} from './workspace';
export {
  AgentActivityChip,
  AgentAutonomyChip,
  AgentAvatar,
  AgentCard,
  AgentDirectory,
  AgentProfile,
  AgentStatusStrip,
  autonomyDetail,
  type Agent,
  type AgentActivity,
  type AgentAutonomy,
} from './agents';
export {
  WorkflowCard,
  WorkflowCatalog,
  WorkflowCoverageChip,
  WorkflowStep,
  WorkflowWalkthrough,
  type WorkflowCoverage,
} from './workflows';
export {
  ScenarioCard,
  ScenarioRunner,
  type ScenarioState,
} from './scenarios';
export {
  PersonaCard,
  PersonaSwitcher,
  SettingsGroup,
  SettingsLayout,
  SettingsNavItem,
  SettingsRow,
  type Persona,
} from './settings';
export {
  DemoBanner,
  DemoReference,
  ProvenanceChip,
  ProvenanceNote,
  type ProvenanceKind,
} from './provenance';
export { DecisionTrail, TrailEntry, type TrailKind } from './trail';
