# Addendum, 23 October 2026 (built 24 October; Q2 answered, the rest on defaults): Tasama's HR Operations team takes the month's intake, the Master File and the HR administration; Sharifa and Nasser keep the run, the bank, WPS, payslips and the ledger

**Status.** Built on 24 October 2026 with Tasama's answer to Q2 and the default answer to the others, except the Phase B items below (seed version 14). The answers Tasama sends may change Q1–Q8; each change is a dated line here.
- **Built:** Lama's persona and HR Operations lens; WF-27's handover step (seed version 13); the returned salary routed to Tasama HR operations; attendance upload; scenarios D2, D3, D4, D5 (with a fifth step), D7 and D10 steps 2 and 4; Present audiences and rule card; rehearsal script; README; menu review; checks.
- **Phase B, built 24 October with `design/payroll-ops-addendum.md`:** at R2 clients, WF-19 and WF-20 gain a `check` step for Tasama HR operations before the client's approver; seeded history decides it; D9 step 3 names Lama.
- **Checked against:** the documents Tasama has already shared.
- **Next:** check it against the process and responsibility data Tasama sends on 24 October, then the owner approves.
- **Precedence:** once approved, it overrides `design/payroll-addendum.md` §2 (roles and routing) and §3 (the Payroll lens), and the role lines in §8, §9 and §17–§21 that it names.

**Answers from Tasama, 24 October 2026** (more expected at the meeting on Monday 26 October):

| # | Answer | What changed |
|---|---|---|
| Q1 | Not known. Tasama HR Ops keeps the Leave Tracker; Payroll applies the deductions | Default kept: Lama maps and uploads; the client confirms |
| Q2 | The client's HR operations signs the payroll approval | Built: the client's HR operations approves every run, not the CHRO |
| Q3–Q6 | Not known | Defaults kept |
| Q7 | Not known today. The BRD's future design has "Tasama Operations and Payroll teams" adding clients, limited to roles it does not name | Default kept: Lama and Sharifa share D10 |
| Q8 | Requests come through the client's HR; Tasama produces the certificate from the Master File; the documents do not say which team | Unchanged |

**Why.** The prototype gives Sharifa AlMousa (payroll lead) and Nasser AlFarraj (payroll specialist) work that Tasama's own documents give to **Tasama HR Operations**. Tasama HR Operations has no persona today. Its specialists exist only as delivery staff: Lama Al Dossary, Yousef Al Ghamdi and Dalia Haddad.

**Sources:**

| Code | Source | What it settles |
|---|---|---|
| PM | Tasama Payroll Process Manual v1.0, Aug 2025, section 2 and steps 1.1–3.8 | The four parties and who does each payroll step |
| HP | Tasama HR process maps, Nov 2025, slides 17–27 | Who does leave, overtime, promotions, trips, exits, end of service and transfers |
| PA | D&T Payroll Automation Process deck, slide 6 and the step-by-step slides | The same split, and the hand-offs between HR Ops and Payroll |
| DT | Payroll Digitalization BRD v1.2, the step table | The steps, each with its owner |
| BC | Payroll Business Case | Three payroll FTEs. PA says four |

## 1. Tasama's documents define four parties, and the prototype merges two of them

| Party (PM §2) | What Tasama's documents give it | In the prototype today |
|---|---|---|
| Client employee | Gives personal data at onboarding; submits leave | Employee persona. Correct |
| Client HR operations | Issues contracts; sends the month's changes; approves payroll and payments | The per-client "HR operations" persona. It also does some of Tasama HR Ops' work: the new IBAN, attendance confirmation. The CHRO, not this persona, approves the run |
| **Tasama HR Operations** | Sends the cut-off reminder; receives the client's documents; creates employee folders; enters and validates the Master File; hands it to payroll; keeps the leave tracker. For HR-outsourcing clients it also handles overtime, promotions, trips, exits, end-of-service calculation, GOSI changes and transfers (HP slides 20–27) | **Missing.** Its work is split between Nasser, Sharifa, the client's HR operations and the agents |
| Tasama Payroll | Prepares the payroll file; proration; GOSI deductions; checks against the Master File and last month; reconciliation; client approval pack; bank file as initiator; WPS and Mudad; payslips; finance and provision reports | Sharifa and Nasser. Correct, plus the extra work listed in Pass 1 |

## 2. Decisions this addendum makes

| # | Decision | Reason |
|---|---|---|
| R1 | **A third Tasama persona: Lama Al Dossary, HR operations specialist, Tasama.** Key `tasama-hrops`, role `TASAMA_HR_OPS`. She works across every client, like the payroll team. Cases waiting on her carry `waiting_on_role='TASAMA_HR_OPS'` and no person | She is already on the delivery team (ROSHN, 0.45 FTE) and is fictional, so no consent is needed. One persona plays the team, as Nasser plays the four payroll specialists |
| R2 | **The client's contract decides who does HR administration.** Intake (reminder, documents, Master File, handover) is Tasama HR Ops for **every** payroll client, because PM puts it inside the payroll service. Overtime approval, promotions, exits, end of service and GOSI changes are Tasama HR Ops only where the contract includes `HR_OPS`: ROSHN, Riyadh Air and SEVEN. Red Sea Global and Saudi Coffee do them in their own HR team | `clients.ts` contracts. Saudi Coffee is a payroll-only managed service, and no HR Ops specialist is allocated to it |
| R3 | **A new lens, HR Operations (العمليات), for Lama: five items, all existing screens.** Inbox · Months · Inputs · Attendance · Client policies. She lands on Inbox | MENU-DISCIPLINE: five to eight items, workers land on their inbox. No new screen is built |
| R4 | **The Payroll lens drops to six items.** Months · Inbox · Runs · Payments · Journals · Client policies. Inputs and Attendance move to HR Operations | Each job sits in one lens |
| R5 | **Master File four-eyes.** HR Ops enters and checks each change against its document. Payroll validates it against the run. A change HR Ops entered is never validated by HR Ops (PA slide 6) | It keeps the control Tasama runs today, on the platform |
| R6 | **Sharifa's four-eyes on the run stays** (the lead never validates a run she prepared) | Not in Tasama's documents ("control checkpoints vary"). It is a control the platform adds, labelled as such on How it works › Rules |
| R7 | **Open until the 24 October data:** Q1–Q8 below. Each has a default the build uses if the data is silent | — |

**Open questions, with the default used if Tasama's data does not answer them:**

| # | Question | Default |
|---|---|---|
| Q1 | Who maps attendance files and turns them into deductions: Tasama HR Ops or Tasama Payroll? | Tasama HR Ops (it keeps the leave tracker, PM §6) |
| Q2 | Who signs the client's payroll approval: the client's HR operations (PM 2.9) or the CHRO? | **Answered 24 October: the client's HR operations signs it.** Built: WF-30's approve step is the client's HR operations |
| Q3 | Does payroll have a lead who validates the specialist's run? | Keep R6 |
| Q4 | Who registers and excludes employees with GOSI? | Tasama HR Ops for HR-outsourcing clients; the client otherwise |
| Q5 | Who approves the account mapping for the journals: Tasama's payroll lead or the client's finance? | Keep Sharifa approving, with client finance informed |
| Q6 | Who decides a policy reading: Tasama's payroll lead, or Tasama's HR team? | Keep Sharifa recommending |
| Q7 | Who takes a new client on (D10)? | Lama checks the roster, contracts and letters lanes. Sharifa checks history and policy, and decides go-live |
| Q8 | Who handles one-off letters such as employment certificates (PA says payroll)? | Unchanged: Wathiqa, through client HR |

## 3. Pass 1: every responsibility, where it goes

| # | Responsibility | Today | After | Source | Depends on |
|---|---|---|---|---|---|
| 1 | Cut-off reminder to the client | Wared, shown to the payroll team on Inputs | Wared drafts it; it goes out in Tasama HR Ops' name; Lama follows it on Inputs | PM 1.1 | — |
| 2 | Receive the month's changes and documents | Wared lists them; Payroll › Inputs | Same agent; Lama's Inputs | PM 1.2–1.4; DT 2–3 | — |
| 3 | Enter and check the Master File, including IBAN and bank changes | System write after the client confirms; the client gives a new IBAN | Lama enters and checks; a new **validate** step in WF-27 hands the month to payroll | PM 1.5–1.7; DT 4–6 | R5 |
| 4 | Payroll validates the Master File against the run | Implicit in Hisab's checks | Run check "Master File changes validated by payroll", on Runs › Draft and checks | PA slide 6; DT 7–8 | R5 |
| 5 | Leave tracker and balances | Client side (Ajaza) | Unchanged on screen. The leave tracker's owner on the Agents screen becomes Tasama HR Ops for R2 clients | PM §6; HP 20 | R2 |
| 6 | Overtime hours entered and approved | Nasser enters the hours (D2) | Lama enters the hours from the clients' overtime forms; the engine prices them by each policy | HP 21 | R2 (intake for every client) |
| 7 | Attendance: map the file, read it, confirm deductions | Nasser maps and uploads (D3); the client's HR operations confirms | Lama maps and uploads; the client's HR operations confirms | MGR; PM §6 | Q1 |
| 8 | Promotion processing: new salary, letter, Master File, GOSI | The client enters it in Oracle; nothing at Tasama | Oracle clients: unchanged. Platform clients: the HR Ops entry check of row 3 | HP 22 | R2 |
| 9 | Back pay for closed months in the run | Nasser (WF-35) | Unchanged: payroll | PM 2.3 (retro tab) | — |
| 10 | End-of-service and final settlement calculation | Wadaa and the engine; WF-19 approved by the client's HR operations | R2 clients: Lama works it out and checks it with payroll, the client's delegated approver approves, payroll pays it in the run. Others: unchanged | HP 25–26 | R2 |
| 11 | GOSI registration and exclusion | Tamin, owned by the payroll specialist | Tamin, owned by Tasama HR Ops (R2 clients) | HP 22, 25 | Q4 |
| 12 | Payroll file, proration, GOSI deductions, checks, reconciliation | Nasser | Unchanged | PM 2.1–2.7 | — |
| 13 | Lead validates the run | Sharifa | Unchanged | — | Q3 |
| 14 | Client approval of the run | Client CHRO | The client's HR operations approves the run (answered 24 October) | PM 2.9 | Q2 |
| 15 | Bank file: prepare, check, upload as initiator | Sharifa | Unchanged | PM 3.1–3.3 | — |
| 16 | Client finance approves in the bank | Client finance | Unchanged | PM 3.4 | — |
| 17 | Returned salary: the new IBAN | The client's HR operations enters it (WF-36) | The client sends the bank letter; **Lama** enters and checks the IBAN; Sharifa sends the follow-up | PA (bank changes are HR Ops input); PM 8.3 | — |
| 18 | WPS download and Mudad | Payroll | Unchanged | PM 3.5–3.6 | — |
| 19 | Payslips | Payroll (Wathiqa) | Unchanged | DT 7 | — |
| 20 | Finance reports, provisions, journals | Qaid; Sharifa approves | Unchanged | PM 3.7 | Q5 |
| 21 | Policy reading | Sharifa recommends; the CHRO activates | Unchanged | — | Q6 |
| 22 | Taking on a new client (D10) | Sharifa, every step | Lama checks the roster, contracts and letters lanes; Sharifa the history and policy lanes and the go-live decision | — | Q7 |
| 23 | Reminding whoever holds a case | Any Tasama staff | Unchanged for staff. Cut-off reminders are Lama's | PM 1.1 | — |
| 24 | Transfers (department, position, cost centre) | Not built | Not built; recorded as out of scope | HP 27 | — |
| 25 | Business trips and per diem | Not built | Not built | HP 23 | — |

## 4. Pass 2: every artifact that changes

### 4a. Personas, roles and routing (server)

| File | Change |
|---|---|
| `api/session.ts` | Add the `HR_OPS_SPECIALIST` persona: Lama Al Dossary (لمى الدوسري), "HR operations specialist, Tasama", person number `TASAMA-0031`, lenses `['hrops']`, roles `['TASAMA_STAFF','TASAMA_HR_OPS']`, scope all, approval limits "Enter and check the month's changes; returned-salary bank details; settlements for HR-outsourcing clients". Add her to `TASAMA_STAFF`. `caseScope` gives `TASAMA_HR_OPS` every case. Export `isHrOpsTeam` |
| `api/me.ts` | The session's persona list includes her, with her inbox count of cases waiting on `TASAMA_HR_OPS`. `/names` gains her name |
| `api/cases.ts` | The `waiting_on_name` CASE gains `TASAMA_HR_OPS → Lama Al Dossary` (and the Arabic). The decide route already accepts a role match |
| `engine/payroll-handlers.ts` | The `WHO` map gains `TASAMA_HR_OPS` |
| `api/payroll.ts` | `/payroll/inbox` takes the persona's role: `TASAMA_HR_OPS` for Lama. The `allowed()` guard on Inputs, Attendance, Months and Policies accepts her |
| `api/onboarding.ts` | Q7 default: Lama may check lanes; go-live stays the lead's |

### 4b. Workflows and agents (engine, with this addendum)

| Workflow | Change |
|---|---|
| WF-27 Monthly inputs | After the client's confirm, a new human step **validate** (`TASAMA_HR_OPS`): "Tasama HR operations checks each change against its document and hands the month to payroll". The run's preparation reads only handed-over changes |
| WF-29 Attendance | The upload and column map belong to `TASAMA_HR_OPS` (Q1). The confirm stays with the client's HR operations |
| WF-36 Returned salary | The step **answer** becomes `TASAMA_HR_OPS`: "Tasama HR operations enters the new IBAN from the client's bank letter". The kinds that ask the client (GOSI date and others) stay with the client |
| WF-19 / WF-20 Exits | R2 clients: a new step **work out** (`TASAMA_HR_OPS`) before the approver. The settlement approval goes to the client's delegated approver (the CHRO). Others: unchanged |
| WF-28 Offer to payroll | Unchanged steps. Aqd's note says the signed contract goes to Tasama HR Ops |
| WF-30, 33, 34, 35, 26 | Unchanged |

Agent owners (`domain/agents.ts`), as the Agents screen shows them:

| Agent | Owner today | After |
|---|---|---|
| Wared, Hudoor, Aqd, Tamin | `payroll` (client HR operations) | `tasama-hrops` |
| Mutabaqa, Tahweel, Qaid | `payroll` (client) | `tasama-lead` |
| Hisab | `payroll` (client) | `tasama-specialist` |
| Wadaa | `payroll` (client) | `tasama-hrops` |
| Ajaza, Wathiqa, Dalil | `payroll` (client) | Unchanged: client HR services |

`api/control.ts` shows Tasama owners by name.

### 4c. Screens and lenses (web)

| File | Change |
|---|---|
| `app/state.tsx` | LensId gains `'hrops'`; `LENS_HOME.hrops = 'payroll-inbox'`; `homeLens` includes it. `LENS_OF` becomes persona-aware: Months, Inputs, Attendance and Client policies belong to `hrops` for Lama and to `payroll` for Sharifa and Nasser |
| `App.tsx` | `MENUS.hrops`: Inbox · Months · Inputs · Attendance · Client policies. `MENUS.payroll` loses Inputs and Attendance. `LENSES` gains "HR Operations" |
| `screens/payroll.tsx` | Months: the hero box "Waiting on the payroll team" reads "Waiting on HR operations" for Lama. Attendance: the upload is offered to `TASAMA_HR_OPS` (it is `TASAMA_PAYROLL` today); the empty state names HR operations. Inputs: a **Handed to payroll** state in the per-client bar and the table |
| `app/inputs.tsx` | The state chips gain "Handed to payroll" |
| `screens/onboard.tsx` | Q7: Lama sees "Check the roster, contracts and letters"; the decision line keeps Sharifa |
| `app/stage.tsx`, `app/director.tsx`, `app/case.tsx` | The persona label and role maps gain `tasama-hrops` and `TASAMA_HR_OPS`, in English and Arabic |
| `lib/ar.ts` | Her label, title and approval limits; the lens name; the new step titles; "Handed to payroll" |

### 4d. Scenarios on the Stage (`director.ts`)

| Scenario | Step | Persona today → after | Narration and chat change |
|---|---|---|---|
| D2 Same overtime | 1 | Nasser → **Lama**, on Inputs | "Lama entered the 48 hours from each client's overtime form…" |
| D2 | 2–4 | Nasser → unchanged (Runs) | — |
| D3 Attendance | 1 | Nasser → **Lama**, on Attendance | "Lama confirmed the column map Hudoor proposed…" |
| D3 | 4 | Nasser → unchanged | — |
| D4 Hire | 3 | Client HR operations → unchanged | "…the signed contract reached Tasama HR operations; Lama checked it into the employee master; Tamin registered GOSI." Tamin's chat label "To Tasama HR operations" |
| D5 Late change | 1 | Client HR operations → unchanged | "Wared reminded on behalf of Tasama HR operations" |
| D5 | 4 | Nasser → **Lama**, on Inputs | "Lama sees each client's changes against its cut-off" |
| D5 | new 5 | — → **Nasser**, Runs | The handed-over changes are in the draft. This adds one step |
| D6 Run | 1–3 | Unchanged | A check line names "Master File changes validated" |
| D7 Bank file | 5 | Client HR operations → **Lama** | "The client sent the bank letter; Lama entered the new IBAN and its check digits pass" |
| D8 Ledger | — | Unchanged | — |
| D9 Back pay and leaver | 3 | Nasser → **Lama** (ROSHN is an R2 client) | "Lama worked out the settlement with Wadaa and checked it with payroll; ROSHN's CHRO approves it; it is paid in the run". This adds a decide step for the CHRO |
| D10 New client | 2, 4 | Sharifa → **Lama** | Roster, contracts and letters are hers |
| D10 | 3, 5–7 | Sharifa → unchanged | — |
| Payroll escalation | — | Unchanged | — |

The scenario count stays 18. The step count goes from 79 to about 81.

### 4e. Seed and history (with this addendum)

| File | Change |
|---|---|
| `seed/runs.ts`, `payroll/inputs.ts` | The months already paid show their changes handed over by "Lama Al Dossary, Tasama" on the day before each run. The open month's handover waits on `TASAMA_HR_OPS` at ROSHN and SEVEN, and is done at Riyadh Air |
| `seed/history.ts` | Completed settlements at R2 clients carry Lama's work-out step |
| `seed/tasama.ts` | No change: Lama, Yousef and Dalia stay as delivery staff |

`SEED_VERSION` goes from 12 to 13.

### 4f. Present mode, scripts and documents

| File | Change |
|---|---|
| `app/present.tsx` | Storyline 1's agenda audience for D10 becomes "Tasama's HR operations and payroll teams". The rule card adds "HR operations enters every change and payroll validates it". Storyline 2's audiences name Tasama HR operations for D5 and D2 |
| `design/rehearsal-script.md` | The lines for D2, D3, D5, D7, D9 and D10 name Lama where she now acts |
| `README.md` | Tasama's payroll team paragraph becomes two teams; the persona list; the agents per team |
| `design/payroll-addendum.md` | §2 and §3 marked "superseded by `hr-ops-addendum.md` where they differ" |
| `design/menu-review.md` | A section for the HR Operations lens: five items, Inbox landing. The Payroll lens drops to six |
| `design/payroll-requirements.md` | The AGT requirements that name the payroll team for intake are re-tagged HR Ops, with PM as the source |

### 4g. Checks

| Check | Change |
|---|---|
| `tools/check-world.ts` | New checks: every open WF-27 at a client past its cut-off waits on `TASAMA_HR_OPS` or is handed over; no Payroll-lens menu lists Inputs; the returned-salary case waits on `TASAMA_HR_OPS`; Lama is a session persona. The existing checks that name Sharifa or Nasser are re-read (17 places) |
| `tools/check-screens.mjs` | `LENS_SCREENS.hrops` added; `payroll` loses Inputs and Attendance |
| Director | All 18 scenarios twice, after a reset and without one |
| Screens | Lama's five items screenshotted in English and Arabic |

## 5. Pass 3: a sweep of every reference, and what the first two passes missed

A search of the code for `tasama-specialist`, `tasama-lead`, `TASAMA_PAYROLL`, `PAYROLL_*`, Nasser and Sharifa found them in 23 files, 145 times. A second search for the client role `PAYROLL` found 61 uses in workflows, routes and screens. Each place is covered by an item above, or by one of the nine items below. The rest stay with the client's HR services: pre-boarding blockers, letters, advances, the client's own Payroll item and salary visibility.

| Found in pass 3 | Why it matters | Added |
|---|---|---|
| Seven payroll agents are owned by the **client's** HR operations persona (`owner: 'payroll'`) | The Agents screen would say a client employee is accountable for Tasama's agents | The owner table in 4b |
| `api/payroll.ts` routes 225–242 allow only the client roles `PAYROLL` and `CHRO` for the client's This month, Approval and Reports | Lama must not be locked out of the client's This month view when she follows up | Allow `TASAMA_HR_OPS` read-only on This month |
| `screens/payroll.tsx` line 647: the attendance upload is shown only to `TASAMA_PAYROLL` | D3 would break when Lama plays step 1 | 4c |
| `LENS_OF` maps one screen to one lens | Months and Client policies sit in two lenses | Persona-aware `LENS_OF` in 4c |
| The `api/control.ts` owner fallback names "Tasama payroll team" for every Tasama-owned agent | Wared and Tamin would show the wrong team | Owner by persona key |
| Saudi Coffee has no HR Ops specialist allocated, and its contract has no `HR_OPS` | A rule moving all HR administration to Tasama would be wrong for it | R2 |
| Amin's compliance alerts give `owner_role: 'PAYROLL'` (the client) to returned salaries, Mudad and WPS, and to iqama, passport and contract renewals | Returned salaries and Mudad are Tasama payroll work. Renewals are Tasama HR Ops work for R2 clients | Alert owners: `TASAMA_PAYROLL` for payment, Mudad and WPS; `TASAMA_HR_OPS` for renewals at R2 clients; the client otherwise |
| `tasama/service.ts` `SKILL_OF` books WF-19 settlements as PAYROLL work, and does not list WF-27 or WF-29 | Tawzee's workload view would count intake and settlements against the payroll specialists | `SKILL_OF`: WF-27 and WF-29 to `HR_OPS`; WF-19 to `HR_OPS` at R2 clients |
| `engine/handlers.ts` `WF-19:approve` sends settlements up to SAR 200,000 to the client's HR operations | For R2 clients the work-out is Tasama's, so the approval belongs with the client | The WF-19/20 row in 4b: the delegated approver approves |

Two names are left as they are, on purpose:
- `domain/names.ts` holds "Nasser" only as a generic first name.
- `seed/runs.ts` records historical decisions by Nasser and Sharifa, which stay theirs.

**Canon checks on the result:**
- **Menus:** the HR Operations lens has 5 items, the Payroll lens 6. One inbox per lens. Lama is a worker and lands on her inbox.
- **Title bar:** a one-lens persona gets no picker, so it stays at five elements.
- **Governance:** no agent approves. Every move is a person deciding, recorded on the trail.
- **Screens:** no new screens, so the screen budget is unchanged. The new lens reuses the screens it gives Lama.

## 6. Effort and order

Counted in Claude sessions.

| Step | Work | Sessions |
|---|---|---|
| 1 | Check this draft against the 24 October data; settle Q1–Q8; owner approves | 0.5 |
| 2 | Persona, role, routing, lens, menus, persona-aware lens map, Arabic (4a, 4c) | 1 |
| 3 | WF-27 handover, WF-29 and WF-36 moves, agent owners, seed handover state (4b, 4e) | 1 |
| 4 | WF-19/20 settlement work-out for R2 clients; D9 and D10 changes (4b, 4d) | 0.5 |
| 5 | Scenarios D2, D3, D4, D5 and D7; Present, rehearsal script, README, menu review; checks; screenshots (4d, 4f, 4g) | 1 |

**Total:** about four Claude sessions after approval. Steps 2 and 3 can start before Q1–Q8 are settled, because every default above is reversible.
