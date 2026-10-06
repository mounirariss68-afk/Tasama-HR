# Screen archetypes

## Five questions, then screens

An agentic prototype is credible when a person can answer five questions by
looking at it. The questions are the invariant. The screens below are one good
way to answer them, and the one most prototypes should start from — but they
are a starting point, not a template to be applied unchanged.

| The question | Answered by | Module |
| --- | --- | --- |
| What is still waiting on me? | **Inbox** | `inbox.tsx` |
| What is the work, end to end? | **Workspace** | `workspace.tsx` |
| Who is doing it, and what may they do? | **Agents** | `agents.tsx` |
| How does it actually work? | **Workflows** | `workflows.tsx` |
| Who am I, and what may I approve? | **Settings** | `settings.tsx` |

Plus one that is not a question the client asks, but the one that makes a demo
land: **show me it happening** — the `scenarios.tsx` runner.

And two cross-cutting layers used inside the others rather than as menu items:

| Layer | What it does | Module |
| --- | --- | --- |
| **Provenance** | Labels what is synthetic, simulated, illustrative or verified | `provenance.tsx` |
| **Decision trail** | Who did what, at what authority, and what a human changed | `trail.tsx` |

### Merging, splitting and dropping

Design the menu around the five questions, not around the five file names.

**Merge two** when one screen answers both questions for this product. In the
CogniCode Console itself, "who is doing it" and "how does it work" are the same
answer — the installed Kit — so they became one **Kit** screen. That is correct,
not a shortcut.

**Split one** when a client's job needs it. Two distinct jobs are two
Workspaces, each its own menu item. A regulated sector usually wants the
decision trail promoted out of the record and onto its own **Evidence** screen,
filterable and exportable.

**Add one** when the product's own object has no home. A console that manages
engagements needs a **Portfolio**; a product built around documents needs a
library. This is normal — the spine is five answers, not a ceiling of five
items.

**Drop one** only when the question genuinely does not arise, and say so out
loud. No Inbox means nothing waits on a human, which is rare enough to be worth
challenging with the client before building it that way.

### What does not vary

- **Provenance labelling.** Every prototype runs on synthetic data and must say
  so at the screen, the record and the claim.
- **The autonomy ladder.** A0–A4, the same five rungs, every time.
- **Every inbox item can be resolved.** Whatever the screen is called, a queue
  whose items have no decision attached is a report with extra steps.

```tsx
import {
  InboxLayout, InboxList, InboxItem, InboxReader, DecisionBar,
  WorkspaceLayout, WorkspaceLanes, WorkspaceLane,
  AgentDirectory, AgentCard, AgentProfile, AgentAutonomyChip,
  WorkflowCatalog, WorkflowCard, WorkflowWalkthrough, WorkflowStep,
  ScenarioRunner, ScenarioCard,
  SettingsLayout, SettingsGroup, PersonaSwitcher,
  ProvenanceChip, DemoBanner, DecisionTrail, TrailEntry,
} from "@cognirise/atelier/archetypes";
```

All of it sits **inside `<MainPanel>`**. The archetype layouts are L1 content;
their panels are L2; their cards are L3. Nothing here introduces a fourth level
or a second page frame.

---

## 1. Inbox

Outlook's shape, because nobody should spend demo time learning navigation.

```
┌ tabs ─────────────────────────────────────────────┐
│  2 Needs attention   1 Waiting   34 All           │
├ filters ──────────────────────────────────────────┤
├────────────────┬──────────────────────────────────┤
│ InboxList      │ InboxReader                      │
│  InboxItem ×n  │   header (pinned)                │
│  (scrolls)     │   body (scrolls)                 │
│                │   DecisionBar (pinned)           │
└────────────────┴──────────────────────────────────┘
```

**The first tab is always the attention queue, and it shows its count.** That
number is the sentence the client repeats afterwards.

**The reader ends in a `<DecisionBar>`.** This is the rule that matters. An
inbox whose items cannot be resolved is a report with extra steps. Name the
actual decision — "Approve the dispatch plan", never "Submit" — and state
whose authority is making it. Put reversible options to the left of the
irreversible one.

Six filter controls at most. A seventh means the list is wrong.

## 2. Workspace

One job, in three lanes, because this is the shape clients recognise as their
own process:

**Intake** — what arrived, and from where.
**In flight** — what is being worked, by whom, right now.
**Output** — what came out, and where it went.

Two rules earn their keep:

- **Every item in flight shows a handler.** Unowned work is the single thing
  clients most often name when they say they do not trust an agentic system.
- **Every output has a destination.** An output with nowhere to go is not an
  output; it is a file.

One workspace per job. A second job is a second workspace and usually a second
menu item — not a filter on the first.

## 3. Agents

A client who can name the agents has bought the idea. An unnamed "AI" doing
unspecified things reads as a black box and gets argued with; a named colleague
with a stated remit gets negotiated with, which is the conversation worth
having.

Each agent needs four things: a name, a job title in the **client's**
vocabulary ("Dispatch Planner", not "Agent 3"), one sentence of purpose, and a
declared autonomy level.

The profile has four blocks, in this order, because this is the order a
sceptical reader takes them in:

1. **Functions** — numbered, three to six, in priority order
2. **Superpower** — the one thing it does that a person cannot do at this speed
3. **Business impact** — what changes if it works
4. **Stats** — the numbers it is accountable for

### The autonomy ladder

Five rungs, identical across every Cognirise prototype:

| | Level | Means |
| --- | --- | --- |
| A0 | `observe` | Reads and reports. Takes no action and proposes none. |
| A1 | `recommend` | Proposes an action. A person decides and executes. |
| A2 | `assisted` | Prepares the action in full. Executes only once approved. |
| A3 | `supervised` | Executes within its remit, then reports. Reversible. |
| A4 | `autonomous` | Executes and closes without review, inside stated boundaries. |

**Label the level the prototype actually runs at.** If it asks for approval it
is A2, even when A4 is the roadmap. The ladder is also the agenda for the
conversation about where the client is willing to move it.

## 4. Workflows

Two surfaces, both needed. The **catalog** is what a sponsor reads. The
**walkthrough** is what a process owner and an engineer read.

Every step states four things: its **actor**, its **inputs**, its **outputs**,
and the **decision** it makes. A step that is one sentence with no named actor
is not specified.

**Leave designed-but-unbuilt workflows in the catalog, marked.** Coverage is
`implemented`, `partial`, `designed` or `manual`. A catalog showing only what
was built lets a client assume the rest exists; a catalog showing the whole
process with three of nine steps implemented is a better conversation and a
better scope document.

## 5. Scenarios

The demo's remote control, and the archetype most prototypes are missing.

A prototype sitting at rest demos badly: the client sees a populated screen and
takes on faith that anything happens. Pick "Feeder fault at 09:14", press run,
and watch the case appear in the inbox, the agents pick it up, the trail fill
and the output land. That is the difference between showing a screen and
showing a system.

Four to six scenarios, each a different **shape** of case, not a different set
of names:

- the happy path
- the exception
- the one the agent refuses
- the one that escalates to a person

Always offer a reset, and rehearse it. A demo that cannot be re-run gets run
once.

## 6. Settings and personas

In production, settings are plumbing. In a prototype, the **persona switcher**
is the most-used control in the room: it is how one build shows the buyer, the
operator and the approver their own screen.

- Switching persona changes the inbox, the workspace owner, what is approvable
  and what the assistant will do. **If it only changes a name in the title bar,
  the prototype has no authority model** — fix the model, not the switcher.
- Every persona states its approval limits in the client's own units.
- The switch is instant and reversible. No reload, no login.

Put the switcher in the title bar's user badge as well as in Settings. Nobody
wants to navigate mid-demo.

---

## Provenance — labelling what is real

Every prototype runs on synthetic data. The failure mode is not the client
disbelieving the demo; it is the client believing it too much — screenshotting
a fabricated case and circulating it as a finding, or carrying an invented
number into a business case.

Label at three scales:

| Scale | Component | Where |
| --- | --- | --- |
| Screen | `<DemoBanner>` | once, at the top of a surface built on fabricated events |
| Record | `<ProvenanceChip>` | on the card, the row, the reader header |
| Claim | `<ProvenanceNote>` | under the sentence that would be mistaken for evidence |

Use the honest word: `synthetic` (we generated it), `simulated` (we injected
it), `illustrative` (chosen to make a point, not computed), `verified` (from a
real source the client supplied — name the source).

Prefix every fabricated identifier: `DEMO-CASE-004182`, never `CASE-004182`.
Render it with `<DemoReference>`.

## Decision trail — who did what

The archetype that wins the room. When a client asks "how do I know what it
did?", a trail is the answer; a confidence score is not.

Every entry names an actor, the kind of act, the autonomy it ran at, and —
when a person disagreed — the override and its reason. **Overrides are the most
valuable rows on the screen**: they are the evidence that the human is still in
charge, and in a real deployment they are the training data. Render them
prominently, never as an error.

Put the trail under the case in the reader, as recent activity in the agent
profile, and on its own screen when the client is in a regulated sector.

---

## Adapting the set

Drop one or add one when the engagement needs it — but say so out loud, and say
why. The common variations:

- **No Inbox** when nothing waits on a human. Rare, and worth challenging: if
  the client's process has no approval anywhere, check that with them before
  building it that way.
- **Several Workspaces** when the prototype spans two jobs. One menu item each.
- **An Evidence screen** in regulated sectors — the decision trail, promoted,
  filtered by case and exportable.
- **A Coverage screen** when the engagement's real question is scope: the
  workflow catalog, promoted, with the implemented / designed split as the
  headline.

What does not vary: provenance labelling, the autonomy ladder, and the rule
that every inbox item can be resolved.
