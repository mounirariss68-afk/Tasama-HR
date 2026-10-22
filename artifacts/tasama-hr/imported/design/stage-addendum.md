# Addendum, 22 October 2026: the demo runs in Present mode, and every scenario plays on the Stage

The scenarios played on the app's own screens: the Director switched persona, lens and screen at every step, and the room followed the navigation instead of the story. The canon's stage 5 (`stages/05-demo.md`, QIB Jahiz, 18–19 October) replaces that with Present mode and the three-pane Stage. This addendum maps them to Tasama HR. It adds to the design; it changes no screen, no seed, no engine and no connector.

## Present mode carries the introduction, the scenarios and the close

| Piece | In Tasama HR |
|---|---|
| Entry | Demo › Present, or `#/present/<storyline>`. The menu and the assistant rail are hidden; a slim bar shows the scenario, the step, Back / Next / Play, the speed and the Stage / App toggle |
| Cards | Statement, steps, columns and agenda, with live numbers from the five client accounts: `{clients} {employees} {openCases} {cases30d} {noTouchPct} {slaMet} {slaScored} {today}` |
| Interlude | After each scenario: steps, the people's decisions, the minutes, and what the agents did, counted from the step results the room just saw, then the question for the room |
| Storylines | Two ship. **Tasama leadership** plays the certificate, the advance exception and the service level rescue. **Compliance and Legal** plays the screening refusal, the termination stop and the payroll pre-run. Both can be edited in Settings › Demo, and the edits are stored on the server |
| Keys | → or space for next, ← for back, F for full screen, Esc to leave. The place in the storyline survives a reload |

## The Stage has three panes on one screen and the room never navigates

| Pane | What it shows | Tasama HR mapping |
|---|---|---|
| Journey (top) | Every step of the scenario; the current one lit, the past ones ticked | As in QIB |
| **01 The request** | The channel of whoever starts the work, turned to what the step is about; never blank | The employee or manager in Rafeeq; the hiring manager's message to Hessa; the payroll calendar's schedule; Raqeeb's reminder in the manager's Teams; Faisal asking Murshid. The prototype owner's idea of 22 October ("employees ask on the left, the system shows on the right") is this pane plus pane 03 |
| **02 The agents** | Step title, narration, trigger → result, "Your move" when a person in the room can act, and the log in plain words, one line per event | The engine's trail entries for the step, through `plain()`, with the agent's name |
| **03 The client's system** | A representative record, labelled as such, whose changed fields flash "agent wrote"; under it one idea: the decision card without its disclosure, else the one record the step is about | Client scenarios show the worker record as the client's HRMS holds it (Oracle HCM or Odoo, per client), or the requisition. Tasama scenarios show Tasama's own record: the escalation, the invoice, the pattern. The decision is the app's one decision card (`CaseView`, with a `bare` frame: no "How this was checked", no editor) |

Why pane 03 is not the full product screen: a pane that carries the inbox list, tabs and the trail is the product screen, which is what the Stage exists to avoid (canon stage 5, rule 3). "Open this step in the app" and the App toggle show the full screen when the room asks.

## An action in the room moves the story

When the next step is a decision the persona on screen may take, pane 02 says "Your move" and pane 03 carries the buttons. The presenter or the client decides; the Stage sees the case leave its waiting state and moves on by itself. The server's decide step then finds the case already decided, records "decided in the room" and the narration says so. → still lets the Director decide, and the trail says "(decided by the scenario)".

## Changes this needs

| Where | Change |
|---|---|
| `apps/server/src/director.ts` | Each step may carry the channel lines for pane 01; every step result carries the record for pane 03 and the focus (case, pattern, invoice or one fact); a decide step that finds the case decided reports "decided in the room" |
| `apps/server/src/api/director.ts` | `GET /director/numbers` for the card tokens; `GET` and `PUT /director/storylines`, stored in `tasama.meta` |
| `apps/web/src/app/present.tsx`, `stage.tsx` (new) | Ported from QIB Jahiz, Present build 1.0 |
| `apps/web/src/app/case.tsx` | `CaseView` frame `stage`: the decision card without the disclosure and the editor |
| `App.tsx`, `state.tsx`, `demo-control.tsx`, `screens/control.tsx`, `index.css`, `lib/ar.ts` | The Present entry, the shell while presenting, the speed, the storyline editor under Settings, the room's type size, the Arabic strings |

The Director bar stays for playing a scenario outside Present mode.
