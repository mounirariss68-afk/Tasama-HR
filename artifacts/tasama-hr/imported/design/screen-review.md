# Screen review: the work surfaces lost the system's vocabulary, and the proof now sits one click down

Run on 21 October 2026 against `SCREEN-DISCIPLINE.md` of the Cognirise Prototype Canon v1. It covers every view: each screen, the case reader, inbox rows, the assistant's answers and confirm card, the Tasama screens and the Demo Director bar.

The seed, the engine and the HRMS connector are unchanged. The Audit trail (Evidence) and Integration log (HRMS connector) screens are unchanged; that is where the proof lives.

Checked by `npm run check:screens` (the screen lint, `tools/check-screens.mjs`) on the production build: every persona, every screen, every inbox's first case.

## The shared pieces

| View | Job, as the person would say it | For | Removed |
|---|---|---|---|
| Case reader (every decision: leave, advance, letter, settlement, payroll pre-run, promotion, offer, position, probation, shortlist, requisition, calibration, termination) | "Approve or decline Karim's leave" | The person the case waits on; the requester, read-only | Ref, status and priority chips row · `WF-15 · Leave` chip · Download PDF · the About / Raised by / Opened / Waiting on grid (now the meta line) · "Agent recommendation:" label · "The agent recommends; the decision is yours…" · Steps, Decision trail and HRMS calls sections (now inside "How this was checked", collapsed) · the Return button · the always-open reason box and decline-reason list (they appear when you press Decline, or go against the recommendation) · "Your decision as Line manager:" · rule codes on payroll findings · candidate numbers · sentences about the trail and about Hessa in the editors · the recommendation line for the requester |
| Inbox row (all inboxes) | "See what waits on me, oldest first" | Every decider | Case reference · the agent's summary as a preview · the time stamp (the due chip is the one status) · the list count that repeated the hero |
| Assistant answer (Rafeeq, Murshid) | "Answer my question" | Everyone | Clause chips under every answer (now behind "Sources") · clause codes in brackets inside the sentence · the tool-name footer ("Read: my_leave, search_policy · offline") · the paragraph explaining offline matching |
| Assistant confirm card | "Confirm my four days of leave" | Employee, manager | The two-sentence reply with the policy explanation (now one sentence) · the payload line (`WF-15 · type_code: ANNUAL · start: …`) · "Nothing is submitted until you confirm." · the card's title line. Added: the balance after, and a Change link |
| Every screen | — | — | The "Synthetic data" banner on each screen; provenance is now "demo" after the product name, once |
| Demo Director bar | "Show the room what just happened" | The presenter | Autonomy codes on each line · raw case and pattern references (now case titles and "open") · the engine's result string in monospace. Added: the closing card, which is the one place outside the Agents screen where governance is explained |
| Notifications | "What changed for me" | Everyone | Record references in the text |

## My HR

| Screen | Job | For | Removed |
|---|---|---|---|
| Home | "See what I asked for and what changed" | Employee | Lifecycle ring (repeated the open count) · "Open requests" tile · End of service panel (lives on Pay) · Quick requests panel (same catalogue as New request) · case references on the request cards |
| Requests | "See where each of my requests is" | Employee | Case reference and workflow name on every row · "and every step taken" |
| Leave | "Check my balance and ask for leave" | Employee | Hero feature and the annual tile (both repeated the balance, now the headline) · clause codes and Art. numbers on the rules · absence numbers · "Source: HRMS · absences" stamp · the sentence about Ajaza |
| Pay and documents | "Check my pay and get a letter" | Employee | Hero feature with the grade code · four stat tiles (now one lede line) · the rule strings under end of service and GOSI · advance numbers · letter numbers and language codes · three source stamps · the payslip provenance note |
| Growth | "See how my goals stand" | Employee | "Mezan prepares your check-ins; your manager rates." · the year in the panel title (in the headline) · requisition numbers · source stamp · empty panels |
| Onboarding | "Get ready for my first day" | New joiner | Journey number · source stamp · "Illustrative day-one plan prepared by Dalil." |
| New request | "Ask HR for something" | Employee | "No HR touch" (now "Issued straight away") · "Ajaza:" · Art. 92 · rule codes in the leave check |

## My Team

| Screen | Job | For | Removed |
|---|---|---|---|
| Team | "See who is away and what waits on me" | Line manager | Lifecycle ring · "Every decision arrives prepared, with the evidence and the rule." · case references · "Saeed checks it against…" and "Submit to Saeed" in the position dialog |
| Approvals | "Decide what waits on me" | Line manager | "Each arrives with the agent's check and the policy clause behind it." |
| Hiring | "Agree the shortlist for my vacancy" | Line manager | "Hessa never ranks or rejects anyone." · requisition numbers |
| Performance | "Rate my team" | Line manager | The Mezan sentence · the HR-09 code |

## HR Workspace

| Screen | Job | For | Removed |
|---|---|---|---|
| Inbox | "Decide the cases that wait on me" | HRBP, TA, Payroll, CHRO | "The agents have done the checking; what is left is the decision." · the ring of cases in flight (Lifecycle's figure) |
| Lifecycle | "See what is in flight and who holds it" | HRBP, CHRO | Ring (repeated the headline) · references on every card · the synthetic chip on every output card · resource names in destinations |
| Workforce | "Find a person; see where Saudization stands" | HR | "read through the connector" · hero feature (Saudization is now the headline) · person numbers on rows · source stamp |
| Person | "See one person's record" | HR | "Identifiers are masked by role (Saudi PDPL; HR-13 §13.1)." · case references · four source stamps · action codes and the `RAFEEQ` source code (now words) |
| Positions and hiring | "Move requisitions and offers forward" | TA, HRBP, CHRO | The agent-explaining lede · hero feature · "Synthetic applications. Hessa never scores, ranks or rejects…" · requisition, candidate and offer numbers · autonomy chips on Hessa and Tamkeen · source stamp |
| Onboarding and probation | "Unblock joiners and close probations" | HR | The Dalil and Amin lede · hero feature · journey numbers · autonomy chip · source stamp · "Amin will open one" · `HR_OPS` owner codes |
| Performance and talent | "Resolve the rating flags before ratings are shared" | HRBP, CHRO | The Mezan lede sentence · hero feature · the HR-09 code · case references on promotion rows · source stamp |
| Payroll and rewards | "Clear this month's payroll for release" | Payroll | The Hisab lede sentence · hero feature (now the headline) · Rule column · person numbers · "Planted in the synthetic data on purpose…" · "(Art. 84)" · advance numbers · entry numbers and case references in pay changes · "through the connector" · autonomy chip · source stamp · type codes and ids inside findings |
| Exits and relations | "Settle and clear every leaver" | Payroll, HRBP | The Wadaa and Sanad lede · hero feature · case references · journey numbers · "Run the involuntary-exit scenario…" · termination action codes · source stamp |
| Compliance | "Act on what a regulator would check" | Payroll, HRBP, CHRO | "Amin … observes and alerts; it never acts." · hero feature · autonomy chip · role codes as owners |

## Tasama Services

| Screen | Job | For | Removed |
|---|---|---|---|
| Portfolio | "See how the portfolio did last month" | Tasama HR Operations Manager | The lede about the agentic layer · hero feature · "Client names are real PIF portfolio companies…" note · the Tasama agents panel with autonomy chips (Agents screen) · references in recent activity |
| Client account | "See one client's health" | Same | HRMS connector button · hero feature · the computed-from note · case references · workflow ids in volumes · invoice numbers · autonomy chip · `ORACLE_HCM` system code |
| Service levels | "See which targets were missed" | Same | Hero feature · the computed-from clause |
| Escalations | "Clear what is past its service level" | Same | The Raqeeb lede · hero feature · case references · service-level keys · autonomy chip |
| Patterns | "Find what is rising and give the cause an owner" | Same | The 90-word lede · hero feature · pattern reference · scope chip · workflow id chip · autonomy chip · "Written by Claude from the facts… hypotheses for a person to test" · workflow ids on the not-flagged rows · the synthetic-history note |
| Finance | "Approve this month's invoices" | Same | "Nothing is issued to a client until a person approves it." · hero feature with the autonomy chip · invoice number column (now in the opened row) · Download PDF · the cost-to-serve note |
| Delivery team | "Rebalance the people who are over capacity" | Same | The Tawzee lede · hero feature · autonomy chip · the estimates note |
| HR policies | "Compare one rule across clients" | Same | Lede sentences about Rafeeq and the fictional handbooks · hero feature · clause numbers on the compare chips |

## How it works (Agent Control)

| Screen | Job | For | Removed or changed |
|---|---|---|---|
| Agents | "See who the agents are and what they may do" | The sceptic, the technical session | Hero feature (now the headline). The lede now carries the governance statement, once: an agent recommends, a person decides, an override needs a reason, nothing reaches the HRMS before approval. Autonomy rungs, tools and HRMS resources stay. |
| Workflows | "See how each workflow runs" | Same | Hero feature (now the headline) |
| Policies | "Read the clause behind an answer" | Same | The fictional-handbook note |
| Value | "See what the layer saved" | Same | Workflow ids · the tile that repeated the headline |
| Evidence (Audit trail) | "See who did what, and every override" | Same | Nothing: kept as it is |
| HRMS connector (Integration log) | "See every call to the client's system" | Same | Nothing: kept as it is |
| Scenarios, Settings | The rig | Presenter | Headline made a claim; otherwise unchanged (they move to the Demo control with the menu change) |

## The redesign that followed the subtraction

Removing content was not enough: the cards and screens had to be laid out again. These are the layout rules now in the code:

| Piece | Layout |
|---|---|
| Hero | The same island, sized for work: a heading-size headline (22–28px, not 48px), a short claim, and less vertical padding. Greetings move to the eyebrow. |
| Case reader | Three zones of the Atelier `InboxReader`. **Header** (pinned): kind, reference, due chip, headline, one line saying who asked and who has it. **Body:** a tiled fact grid, where each tile holds a label, a value and an optional note, and exceptions are marked with an icon instead of coloured text; then the recommendation, attributed to the agent that made it, with a verdict chip; then "How this was checked", collapsed. **Footer** (pinned): the `DecisionBar`. The reader sticks to the viewport, so its actions stay visible. In the drawer it has the same three zones. |
| Inbox row | Outlook's shape: initials, the kind of request, who, what, and one due chip |
| Confirm card | Kind with an icon, one sentence, the fact line, then Confirm and Change in a footer strip |
| Stat tiles | Figures at heading size; unit chips folded into the value ("8 days"); always a full row of four, or none |
| Tables | Money never wraps; long action rows collapse into a "More" menu (Escalations) |

## Known gaps

- Arabic: the new sentences (headlines, decision cards, confirm card) fall back to English when the interface is in Arabic. I will add the Arabic once the English wording is approved.
- The rendered text is checked by the lint; repeated facts are not. I checked those by eye on the screenshots of the leave case reader, the inbox and the chat confirmation.
