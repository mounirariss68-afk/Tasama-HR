# Addendum, 22 October 2026: Tasama runs its clients' payroll end to end on the platform, and three demo clients hold their payroll in it

This addendum is the design gate (phase 0) for the payroll build. The requirements are in `design/payroll-requirements.md`:

- it is a snapshot, taken on 22 October 2026, of the Claude Doc *Tasama HR Payroll: Requirements and Implementation Plan*;
- the build reads that file, not the live doc;
- the requirement ids cited here (POL, ATT, INT, CAL, REC, PAY, FIN, AGT, PLT) are its ids.

This addendum decides how the build meets those requirements. It changes the seed, the engine, the HRMS connector, the personas and the menu. The canon allows each of these only with a dated addendum, so nothing here is built before the prototype owner approves it. Where it differs from `design/screen-review.md`, `design/menu-review.md` or `design/stage-addendum.md`, it overrides them.

**What the tags mean:**

- **[D]** our design decision.
- **[R]** law or published practice, with the source in the requirements file.
- **[Q]** stated by Tasama's documents or payroll managers.
- **[A]** an assumption Tasama must confirm. A default ships until Tasama's answer arrives.

**Scope.** The build covers the payroll Tasama runs for its clients. It leaves out, for now:

- Tasama's own staff (PLT-18);
- an SAP connector (PLT-20);
- payroll outside Saudi Arabia (PLT-14).

The fresh-eyes review the canon requires before a build was run on the first draft. Its 20 findings are resolved in this version.

## 1. Tasama HR becomes the system of record for three clients and sits on Oracle for two

| Client | Mode | Employee master | Finance system | What changes from today |
|---|---|---|---|---|
| ROSHN | HRMS of record | Oracle Fusion HCM | Oracle Fusion Financials | The engine calculates. A SYSTEM step writes the approved run back to Oracle through the connector |
| Riyadh Air | HRMS of record | Oracle Fusion HCM | Oracle Fusion Financials | Same as ROSHN |
| Red Sea Global | Platform of record | Tasama HR | Oracle Fusion Financials [A] | Was Oracle HCM |
| SEVEN | Platform of record | Tasama HR | Odoo Accounting [A] | Was Odoo |
| Saudi Coffee | Platform of record | Tasama HR | Odoo Accounting [A] | Was Odoo (payroll-only contract) |

**How a platform-held client works in the code [D]**

- The client's `hcm_<key>` schema stays, as the Tasama HR employee master. Its tables and the agents' queries do not change.
- The connector gains a third dialect, `PLATFORM`, next to `ORACLE` and `ODOO`. It stays the only writer to the master: every write is a SYSTEM step after a person approved, logged as a Tasama HR API call (`/api/v1/employees/…`). That includes the approved payroll run, written into `hcm.payroll_results` after the client CHRO approves.
- Qiwa, GOSI, Mudad and the banks still go through `external()`.
- `Hrms` becomes `'ORACLE' | 'ODOO' | 'PLATFORM'`. An SAP dialect (PLT-20) would be one more branch in the same file.
- In the Stage, pane 03 is labelled "Tasama HR employee record" for these three clients and "Oracle HCM" for the other two.
- `ClientConfig` gains `finance: 'ORACLE_FIN' | 'ODOO_ACC'`.
  - Oracle Finance clients get the Oracle journal import file.
  - Odoo Accounting clients get the same four journals as a CSV (FIN). That file is labelled illustrative until Tasama confirms their ledgers.

**What this costs [D].** Odoo is no longer shown on a live client. Its dialect stays in the connector, and the Integration log describes it as the fallback. If the owner wants Odoo live, SEVEN stays on Odoo, and only Red Sea Global and Saudi Coffee move.

**One open point about the Oracle clients [A].** The default is that the platform's engine calculates and writes back to Oracle. If Tasama runs Oracle Payroll inside the client's Oracle, the engine becomes a shadow calculation that checks Oracle's results line by line, and the screens stay the same (section 11).

The README's client table and first paragraph change with this section.

## 2. The client CHRO approves every run, and Tasama's lead never validates a run she prepared

| Persona | Who | Where it lives in code | Lenses | Lands on | Decides |
|---|---|---|---|---|---|
| Payroll specialist | Nasser AlFarraj (Tasama payroll team) | `api/session.ts`, like `TASAMA_PERSONA` | Payroll | Inbox | Prepares runs, back pay and off-cycle runs; applies fixes; maps accounts; registers with GOSI |
| Payroll lead | Sharifa AlMousa (Tasama payroll team) | `api/session.ts` | Payroll | Months | Validates runs she did not prepare (PLT-04); initiates the bank file; approves journals for posting; recommends policy readings |
| HR Operations Manager | Faisal Al Harbi (exists) | `api/session.ts` | Unchanged | Overview | Unchanged. Payroll status per client appears in Overview and on the client record |
| CHRO (exists, per client) | Client | `layer.personas` | Unchanged | Unchanged | Approves the payroll run, activates a policy version, decides a policy reading, approves exceptions |
| HR operations (exists as "Payroll and HR operations", per client) | Client | `layer.personas`, key `payroll` kept | Unchanged | Unchanged | Confirms the month's inputs, confirms attendance deductions, sends contracts for signature. **Renamed "HR operations" for all five clients, and "Payroll release" removed from its approval limits**, because Tasama runs every client's payroll. Hisab's header comment changes to match |
| Finance controller (new, per client) | Client | `layer.personas` | My HR, Payroll costs | Payroll reports | Nothing. View only, own company (PLT-19) |
| Employee, line manager (exist) | Client | `layer.personas` | Unchanged | Unchanged | Justifies a lateness or absence; receives payslips |

**The two Tasama personas carry the real names of the payroll managers who met us on 22 October**, at Mounir's request. The canon allows real names only for people who have agreed to appear, so both are asked before the prototype is shown to anyone outside that team; until then the README says the rest of the cast is fictional. The owner confirmed the names and roles on 22 October.

**Routing work to Tasama people [D].** A case waiting on Tasama's payroll team carries `waiting_on_role` = `TASAMA_PAYROLL` or `TASAMA_PAYROLL_LEAD` and no `waiting_on_person_id`. The Payroll lens lists cases across every client's layer, the same way `tasama/service.ts` already reads across clients. Every Payroll screen has a client filter (All · ROSHN · …); a record opens in its client.

| Action | Prepared by | Decided by |
|---|---|---|
| Read a handbook and propose rules | Nizam | Payroll lead recommends |
| Activate a policy version, or settle a reading the handbook leaves open | — | Client CHRO |
| Confirm the month's inputs | Wared pre-fills | Client HR operations |
| Confirm attendance deductions | Hudoor | Client HR operations, after the employee's justification window |
| Validate a run | Hisab, prepared by the Payroll specialist | Payroll lead, never the preparer |
| Approve a run | Mutabaqa explains the differences | Client CHRO |
| Write the approved run to the master (Oracle or Tasama HR) | SYSTEM step | After the client CHRO's approval |
| Initiate the bank file | Tahweel | Payroll lead. The client approves the payment in its bank portal, outside the platform; the platform tracks it |
| Post the journal | Qaid | Payroll lead |
| Send a contract for signature | Aqd | Client HR operations |
| Register with or exclude from GOSI | Tamin | Payroll specialist |

## 3. Tasama's payroll team works in one Payroll lens; the client keeps one Payroll item

**Payroll lens (الرواتب)**, for the two Tasama payroll personas: eight items.

| Item | Job, as the person would say it | Hero figure (it can move) | The one visual |
|---|---|---|---|
| Months | "See where every client's month stands against its cut-off and pay day" | Clients behind plan this month | Calendar strip per client: cut-off, approval and pay day, today marked |
| Inbox | "Decide what waits on me" | Cases waiting on me | Clock bar per row (existing) |
| Inputs | "See which changes each client has sent and which are still expected" | Changes still expected before the cut-off | Segment bar per client: confirmed, expected, late |
| Attendance | "Turn a month of attendance into confirmed deductions" | Deductions waiting for confirmation | Heat strip per employee across the month |
| Runs | "Run, check and explain a client's payroll" | Blockers left in open runs | Findings by severity as one stacked bar |
| Payments | "Send the bank and WPS files and follow every failed line" | Lines not yet paid | Funnel: sent, accepted by the bank, paid, accepted in WPS |
| Journals | "Post the month to the client's ledger" | Journals waiting to post | Bullet per journal: debit against credit, mapping coverage |
| Client policies | "Read and approve the rules each client's payroll follows" | Rules waiting for the client's decision | Rule tiles by dimension, flags marked "below the law" or "unclear" |

**Runs record tabs:**

| Tab | Job | The one visual |
|---|---|---|
| Draft and checks | "Clear the blockers before validation" | Findings by severity |
| Differences | "Know why this month differs from last" | Waterfall from last month's net to this month's |
| Approval | "See who validated and who approved, and send it to the client" | Clock to the approval deadline |
| Payslips | "See that every employee got a payslip" | Progress bar |
| Provisions | "See this month's provision charge and any catch-up" | Columns: end of service and leave charge, last six months |

**Client policies record tabs:** Rules · Versions · Handbook.

**Other lenses [D]**

| Where | Change |
|---|---|
| Tasama Services › Client handbooks | Renamed **Client policies**. It is the same screen as the Payroll lens item: one name for one thing |
| HR Workspace › Payroll (client CHRO and HR operations) | Becomes the client's view of its payroll, with route tabs. **This month:** inputs to confirm, cut-off clock as the visual. **Approval:** the run's differences as a waterfall, Approve or Return. **Reports:** net pay by month as columns. Today's Hisab pre-run content moves to Payroll › Runs › Draft and checks |
| Client HR operations, Inbox | Attendance confirmations and late changes arrive as cases here, not as a new item |
| Payroll costs lens (Finance controller) | **Payroll reports:** net and employer cost by month as columns. **Provisions:** end-of-service and leave balance as a slope. **Journals:** posted journals by month. Three items is below the canon's floor of five; **this is for the owner to decide** (section 11) |
| My HR › Pay and documents | Payslips from approved runs; no new item |

The title bar stays at five elements. The Demo control's persona list gains three people: Nasser, Sharifa and the client finance controller.

## 4. Each client gains a payroll layer, and banks and calendars become shared settings

No migrations: `db/schema.sql` and `db/tasama.sql` gain the tables below, and `SEED_VERSION` goes from 2 to 3, so a stale database reseeds.

| Table or column | Schema | Holds | Requirements |
|---|---|---|---|
| `policy_versions` | layer | Version, status (draft, approved, superseded), source handbook, effective date, approver and time | POL |
| `policy_rules` | layer | One row per rule: dimension (1 to 27), key, value, basis (law, handbook, default), clause, the handbook's words, flag (below the law, unclear, missing). The merit matrix and bonus multipliers are values here (dimensions 16, 17) | POL, CAL-31 |
| `work_schedules` | layer | Shift patterns: days, start, end, grace minutes, Ramadan hours. Each assignment points to one | ATT |
| `pay_inputs` | layer | The month's changes per employee: kind, amount or days, effective date, source (portal, attendance, hiring, HRMS event, pre-filled, off-cycle request), state (expected, confirmed, late, routed to next month), who and when | INT, CAL-19 |
| `contracts` | layer | Drafted from an accepted offer: template, fields, status, signed date | INT |
| `attendance_punches` | layer | Device, employee, time, direction, as uploaded | ATT |
| `attendance_days` | layer | Per employee per day: schedule, first in, last out, minutes late, absent, covered by leave, justification, decision, and two separate amounts: unpaid absence days, and the fine under the penalty regulation | ATT |
| `pay_runs` | layer | Period, kind (regular, off-cycle), state, preparer, validator, client approver, totals | CAL, REC |
| `pay_lines` | layer | Per employee per element: amount, quantity, and the basis (rule, clause, law article) behind "How this was calculated" | CAL |
| `provisions` | layer | Per employee per month: end-of-service balance and charge, leave balance value and charge, ticket provision, catch-up line | CAL-23 to 25, 30 |
| `gosi_registrations` | layer | Person, first registration date, insured group (legacy, new system, GCC, non-Saudi), status, tasks | CAL, Tamin |
| `payments`, `payment_lines` | layer | Bank file per run: format version, file, lines, return status, WPS and Mudad status | PAY |
| `account_map` | layer | Element or provision → the client's account segments; proposed by, approved by | FIN |
| `journals` | layer | Four journals per run (accrual, payment, provisions, provision use): lines, balanced, import file, import status | FIN |
| `bank_formats` | tasama | Bank file definitions as data: file type, encoding, header, line and footer fields, order, length, padding, number and date formats, Arabic or English names | PAY |
| `payroll_calendar` | tasama | Per client per month: cut-off, approval deadline, upload day, pay day, from the policy | INT |
| `hcm.persons.iban` | hcm | The full synthetic IBAN (with the `DEMO` bank code) the bank file needs; `iban_masked` stays for screens | PAY |
| `hcm.persons.gcc_scheme` | hcm | Home-country scheme for GCC nationals | CAL |

**Data that today is authored becomes derived [D]**

- `seed/base.ts` stops authoring `hcm.payroll_results`. The engine's replay of the history writes them.
- `tasama.payroll_runs` is derived from `pay_runs`:
  - `findings_before` = pre-run findings that were resolved;
  - `errors_after` = back-pay corrections raised for that month;
  - `gross` = the run's gross.

**Leftovers from the National Bonds build are cleaned up:**

- SAR in place of AED;
- Saudization in place of Emiratisation;
- `hcm.end_of_service.basis` loses `SAVINGS_SCHEME` and `GPSSA`;
- national IDs are masked in the Saudi format (`1XXXXXXXX7`, `2XXXXXXXX3`).

## 5. The engine is pure arithmetic over the approved policy, and every line names its rule

The engine is in `apps/server/src/domain/payroll/`, with no I/O.

- **Input:** the employee master as of the period, the approved policy version, confirmed inputs and attendance, leave and advances.
- **Output:** pay lines, totals and provisions.

Claude never calculates.

| Step | Rule |
|---|---|
| Days and proration | The client's day rate: ÷ 30, ÷ calendar days, or ÷ working days (dimension 4). Joiners and leavers are prorated |
| Earnings | Each element from the policy, fixed or a % of basic; grade benefits (dimension 18). Overtime at the hourly wage plus 50% of the basic hourly wage, or the client's higher rate (Art. 107) |
| Leave | Sick-pay bands (Art. 117) with the client's top-up. Unpaid leave. Unpaid leave beyond 20 days in a year is excluded from service (Art. 116): `gratuity()` changes to exclude only the days beyond 20 |
| Absence and lateness | Days of unexcused absence are not paid; that is not a fine and has no cap. Lateness and absence penalties under the client's approved penalty regulation are fines, after the employee is heard (Art. 71), capped at five days' wage a month (Art. 70) |
| Other deductions | An advance instalment is at most 10% of the wage (Art. 92); all deductions together at most 50% (Art. 93). A breach blocks the run and proposes a new schedule |
| GOSI | `gosi()` becomes a dated rate table keyed on `gosi_registrations` (section 7, edge 3). The contribution wage is basic plus housing, at most SAR 45,000 [R]; the SAR 1,500 floor is to be verified [A]. Non-Saudis pay 2% employer only; GCC nationals by home-country scheme; the company absorbs the employee share where the policy says so |
| End of service | The actual wage as the policy defines it, never below basic plus regular allowances (Art. 2, 84, 86). Half a month a year for five years, a month a year after. Resignation fractions (Art. 85); full award in Art. 87 cases; none under Art. 80 |
| Final settlement | Salary to the last day, leave encashment, end of service, notice, less the outstanding advance as the handbook provides. Whether the 50% cap applies to a final settlement is confirmed with Tasama's legal team [A]; the default recovers the full balance and shows it as its own line |
| Provisions | The monthly charge is the change in the accumulated balance. A raise or promotion re-measures both provisions from its effective date, with the catch-up as its own line (CAL-30) |
| Back pay | A late or backdated change is recalculated for each closed month and paid in the open run. An approved run is never reopened (REC) |
| Off-cycle | Bonus, tickets, trips, relocation, school fees: no GOSI, no loan deductions, no WPS file (CAL-19). End of service is paid in the final settlement, not off-cycle |
| Performance | Ratings give the merit increase from the client's matrix and the bonus multiplier, entered as dated changes the client approves (CAL-31) |

**GOSI rates in the new table** (contribution wage = basic + housing):

| Group | From | Employee | Employer |
|---|---|---|---|
| Saudi, first registered before 3 Jul 2024 | Unchanged | 9.75% | 11.75% |
| Saudi, first registered on or after 3 Jul 2024 | 3 Jul 2024 | 9.75% | 11.75% |
| | 1 Jul 2025 | 10.25% | 12.25% |
| | 1 Jul 2026 | 10.75% | 12.75% |
| | 1 Jul 2027 | 11.25% | 13.25% |
| | 1 Jul 2028 | 11.75% | 13.75% |
| Non-Saudi | All dates | 0% | 2% |

The current code applies 10.25% to every new-system Saudi before July 2026, including those between July 2024 and June 2025. It also keys on the hire date with the current employer, not on the first registration date. Both are fixed here.

**Acceptance [Q].** The engine reproduces the July 2025 template run under a sixth, fixture-only policy version: "Tasama template". That version uses:

- the template's day rate (calendar days);
- the template's end-of-service and leave-provision methods;
- GOSI by registration date.

The fixture `tools/golden/july-2025.json` holds the template's inputs and outputs, with names, ID numbers and IBANs replaced; the source files are never copied into the repo. Every line must match to the riyal, except lines the fixture lists with their legal reason. For this sample, all of whom were registered before July 2024 and served under five years, that list is expected to be empty; the fixture says so when it is built.

**Result, 22 October 2026 (phase 2, session 1).** `npm run check:golden` runs the engine on `tools/golden/july-2025.json`: 43 of 43 template figures match to the halala (pay days, the four elements, gross, GOSI wage and both shares, deductions, net, both provisions and their totals, and the bank file's other earnings), with no exceptions. Fourteen hand-worked cases cover rules the two-person sample does not reach: GOSI for new-system Saudis across July 2025 and July 2026, the 45,000 cap, a joiner, the 30-day rate, overtime at both rates, the advance cap, end of service after five years and Art. 116. Three things the template does were found while building the fixture:

| Finding | What the fixture does | Platform default |
|---|---|---|
| A day of leave is valued at the month ÷ the person's annual entitlement (÷ 25 for a 25-day employee), so the provision grows by one month's salary a year whatever the entitlement | Reproduces it (`leaveDayDivisor: "ENTITLEMENT"`) | The month ÷ 30. For the 25-day employee: 5,867.24 instead of 7,040.55. Asked of Tasama's payroll team (section 11) |
| Year-to-date leave entitlement is rounded to three decimals | Reproduces it (`leaveDaysPlaces: 3`) | Unrounded |
| The Master Data sheet gives one employee a 2025 hire date; the payroll and provision sheets use 2024 | Uses 2024, the date the provisions reconcile with | Not applicable |

**Built, 22 October 2026 (phase 2, sessions 2 and 3).**

| What | How |
|---|---|
| GOSI by first registration | `hcm.gosi_registrations`; about half of the Saudis hired since 3 Jul 2024 registered with an earlier employer and stay on the legacy rates. The pre-run check, promotions and the employee's own page read it |
| History from the engine | The closed months of Red Sea Global, SEVEN and Saudi Coffee are the engine's results under each client's version 1.0, with every line's rule and a row in `hcm.payroll_provisions`. ROSHN and Riyadh Air keep their HRMS's results |
| A full February under ÷ 30 | Paid in full; the earlier seed paid 28/30 of it |
| Runs (Payroll lens) | The open month's draft for each client held in Tasama HR: who is paid differently from last month and why, the checks that stop the run, and the provisions by month. Recalculated on every view; nothing is written until the client approves (phase 5) |

**Built, 22 October 2026 (phase 2, session 4).** The engine adds the overtime cap (hours above it are held as a check, not dropped), back pay for closed months, off-cycle payments and the final settlement; each has hand-worked cases in `npm run check:golden` (21 in all). Scenario D2 is on the Stage.

**D2 changed from Riyadh Air to Red Sea Global (22 October 2026).** Riyadh Air runs its payroll in Oracle HCM, so the platform does not price its pay. Red Sea Global after D1 (overtime at 1.5 × the full hourly wage, clause 5.3) against Saudi Coffee (the law's rate, capped at 40 hours) shows two different rules on the same 48 hours and continues the storyline from D1. If D1 has not run, D2's first step activates Red Sea Global's revised policy as D1 would.

**Built, 22 October 2026 (phase 3, attendance).**

| What | How |
|---|---|
| Schedules | `layer.work_schedules` and `layer.schedule_members` for every client: a shift pattern for site, coffee-house and production staff, office hours for the rest, with each client's grace period |
| The attendance file | Saudi Coffee's file is generated from the seed as the device would write it (`Emp No., Att. Date, Att. Time, In/Out, Terminal`, dd/mm/yyyy). Hudoor proposes the column map from the file's own headers; a person confirms it before anything is read |
| Hudoor (A2) and WF-29 | Each scheduled day becomes on time, late, absent or approved leave. Unpaid absence and fines are kept apart. The employee explains on My HR (or through Rafeeq); client HR operations confirms; the confirmed amounts become entries in the open payroll month, and the engine stops fines at five days' wage as a last guard |
| Attendance (Payroll lens) | Upload with the column map; a heat strip per person across the month, with the fine against the five-day cap |
| D3 | Four steps: the export arrives, an employee explains a 52-minute late morning, HR operations confirms, the barista's fines stop at the cap |

**Words (22 October 2026, the owner's instruction):** screens, cases and narration say "attendance" and "attendance file", never "punches" or "fingerprints". Internal table names keep `attendance_punches`.

**Changed to make D3 true (22 October 2026):**

- Saudi Coffee's lateness rule is now its work regulation's penalty table, not a minute deduction. A minute deduction at the minute rate could never reach five days' wage, so edge 7 could not happen under it. The synthetic table: written warnings for the first two late arrivals in a month, 25% of a day's wage for the third to fifth, 50% from the sixth. Grace period 5 minutes.
- The attendance month is the month before the open payroll month; its confirmed amounts are paid in the open month.
- In the seed data, most scheduled days with no attendance recorded are approved leave, so the file shows many more than six; four are absences, as planned.

## 6. Eight new agents each do one job, and none of them can approve or release anything

The first draft listed ten. Two jobs are folded into agents that already do the same work:

- the provisions agent (Mukhassas) into Hisab, because provisions come out of the same engine run;
- the payslips agent (Kashf) into Wathiqa, which already issues the employee's documents.

| Agent | Role | One job | Reads | Writes (after approval) | Owner | Rung | Claude used for |
|---|---|---|---|---|---|---|---|
| Nizam (نظام) | Policy reader | Itemises a handbook on the 27 dimensions and flags rules below the law or unclear | Handbook, law table | Draft policy version | Payroll lead | A1 | Reading the handbook; the offline resolver reads the handbook's structured source |
| Aqd (عقد) | Contract drafter | Drafts the contract from an accepted offer and reads contracts a client sends | Offer, policy, template | Contract draft | Client HR operations | A2 | Reading a client's contract |
| Wared (وارد) | Inputs and cut-off | Pre-fills each month's expected changes, reminds, escalates, routes late changes | Master, leave, hiring, exits, calendar | Expected inputs, reminders (A3 inside the contact rules) | Payroll specialist | A3 | — |
| Hudoor (حضور) | Attendance | Turns the month's attendance into late, absent and covered days, and proposes deductions | Attendance file, schedules, leave, penalty rules | Proposed deductions | Client HR operations | A2 | — |
| Tamin (تأمين) | GOSI | Sets each person's insured group and rate, raises registration and exclusion tasks, checks the GOSI bill against payroll | Master, `gosi_registrations` | GOSI tasks (`external()`) | Payroll specialist | A2 | — |
| Mutabaqa (مطابقة) | Reconciliation | Explains every difference from last month and between payroll, bank file and WPS file | Runs, payments | Explanations on the run | Payroll lead | A2 | Wording an explanation |
| Tahweel (تحويل) | Payments | Builds the bank and WPS files, reads return files, follows failed lines | Approved run, bank formats | Files, Mudad upload (`external()`) | Payroll lead | A2 | — |
| Qaid (قيد) | Journals | Proposes account mapping and builds the journals and the import file | Approved run, provisions, account map | Journals, import file | Payroll lead | A2 | — |

**Existing agents extended:**

| Agent | Adds |
|---|---|
| Hisab | Runs the engine and the provisions |
| Wathiqa | Payslips, A3 after approval |
| Tarqiya | Salary changes and back-pay triggers |
| Wadaa | Final settlement and the Art. 88 deadline |
| Amin | Mudad, GOSI and settlement deadlines |
| Raqeeb | Cut-off and pay-day service levels |
| Basira | Clients late every month |

No agent runs at A4. Every write to a master or a ledger is a SYSTEM step after a person approved.

**A deviation from the canon to record in the README.** The canon asks for six to ten agents per prototype. Tasama HR already had 19 for the full HR lifecycle and Tasama's own services; it will have 27. Each payroll agent has one job a payroll manager would name.

## 7. Ten payroll workflows replace the spreadsheet month

| Workflow | Trigger | Agents | Decided by | Coverage |
|---|---|---|---|---|
| WF-26 Client policy | A handbook is uploaded or changed | Nizam | Lead recommends, client CHRO activates | Full |
| WF-27 Monthly inputs and cut-off | The month opens (cut-off − 10 days) | Wared | Client HR operations | Full |
| WF-28 Offer to contract to payroll | Offer accepted (WF-05 creates the pending worker, as today) | Aqd, Dalil, Tamin | Client HR operations sends the contract; signing turns the pending worker into an employee. The record is not re-entered | Full |
| WF-29 Attendance month | Attendance file uploaded | Hudoor | Employee justifies, client HR operations confirms | Full |
| WF-30 Payroll run | Cut-off passed | Hisab, Tamin | Specialist prepares, lead validates | Full. WF-13 (the pre-run check) becomes its first step and keeps its id |
| WF-31 Differences and client approval | Run validated | Mutabaqa | Client CHRO | Full |
| WF-32 Payslips | Run approved | Wathiqa | — (A3) | Full |
| WF-33 Bank file, WPS and Mudad | Run approved | Tahweel | Lead initiates; client approves in the bank | Full; bank and Mudad simulated |
| WF-34 Journals | Run paid | Qaid | Lead | Full; ledgers simulated |
| WF-35 Back pay and off-cycle | A late change, or an off-cycle request | Hisab | As WF-30 | Full |

## 8. The demo day is the 17th, so every client's month is at a different stage

The seed anchor today is the day the seed runs, so a client's position against its cut-off would change from one rehearsal to the next. **The virtual clock is set to the 17th of the month the seed runs [D].**

| Client | Cut-off | Pay day | State on the 17th |
|---|---|---|---|
| Riyadh Air | 15th | 25th | Cut-off passed two days ago; run validated and approved by the client; bank file not yet sent |
| Red Sea Global | 16th | 26th | Cut-off passed yesterday; run prepared, blockers open |
| ROSHN | 18th | 27th | Cut-off tomorrow; inputs mostly confirmed; last month paid, its journal not yet posted |
| SEVEN | 18th | 27th | Cut-off tomorrow; a joiner starting on the 19th |
| Saudi Coffee | 20th | 28th | Last month's attendance file waiting for review |

**History.** Six months of runs, provisions, payments and journals for each client, calculated by the engine. Each client's history starts at the later of its contract start and six months back; Saudi Coffee's starts in June 2026.

**Policies.**

- The five synthetic policies in the requirements file become `policy_rules`, version 1, approved.
- `domain/policies.ts` generates each handbook from the same rules, so Nizam's reading can be checked against the truth.
- `PolicyParams` grows to cover the 27 dimensions.
- A sixth version, "Tasama template", exists only for the golden fixture.

**Banks.** Six banks get format definitions: the five on the client records (Al Rajhi, SNB, Riyad, Alinma, Albilad) plus SAB. Each is labelled "illustrative layout until Tasama sends the bank's template".

**Charts of accounts.** One synthetic chart per client: Oracle segments for the three Oracle Finance clients, Odoo accounts for the other two.

**Each planted case has a fixed id, is excluded from random draws, and is restored when its scenario starts:**

| # | Who and what | What the room sees |
|---|---|---|
| 1 | Red Sea Global's handbook says overtime is paid "at time and a half", without saying of which wage | Nizam marks the clause unclear: 1.5 × the gross hourly wage, or the legal hourly wage plus 50% of basic. Sharifa recommends the reading; the client CHRO decides; version 2 is activated (D1) |
| 2 | SEVEN's handbook pays end of service on basic only | The clause is refused as below the law (Art. 2, 84). The engine uses the actual wage and says why (D1) |
| 3 | A Saudi at Red Sea Global, first registered with GOSI in September 2025 | 10.75% / 12.75% applied, where the template would apply 9.75% / 11.75% (D6) |
| 4 | A Bahraini national at SEVEN | Home-country scheme instead of the 2% non-Saudi line |
| 5 | A Riyadh Air promotion entered on the 17th, after the 15th cut-off | Routed to next month as back pay, with the effect shown to the client (D5) |
| 6 | Saudi Coffee's attendance file: 37 late arrivals and the scheduled days with no attendance recorded, most of them approved leave, leaving 4 absences | Hudoor sets the leave days aside, one employee explains a lateness, client HR operations confirms (D3) |
| 7 | A Saudi Coffee barista whose lateness fines would pass five days' wage | The fine stops at the Art. 70 cap. The barista's one unexcused absence day is unpaid and is not counted against the cap (D3) |
| 8 | An offer accepted at SEVEN on the 14th, starting on the 19th | Contract drafted and signed, the same record becomes the employee, GOSI registered, 13 days paid this month (D4) |
| 9 | Red Sea Global's open run | 14 differences from last month, each explained (D6) |
| 10 | One Riyadh Air IBAN rejected on the bank's return file | Corrected and paid in a follow-up file; the WPS file still matches (D7) |
| 11 | A new remote-site allowance at ROSHN with no account mapped | Qaid proposes the account and Sharifa approves it before last month's journal balances (D8) |
| 12 | A ROSHN raise effective three months ago, entered before tomorrow's cut-off | Three months recalculated as back pay; both provisions re-measured (D9) |
| 13 | A resignation at ROSHN after 7 years | Two thirds of the award, leave paid out, the advance balance recovered (D9) |
| 14 | An employee with 25 days of unpaid leave this year | The 5 days beyond 20 come off the service counted for end of service (Art. 116) |
| 15 | A woman at SEVEN resigning within six months of her marriage | Full award (Art. 87) |
| 16 | A leaver still on the payroll; deductions above 50% | Kept from today's seed, now found in Runs › Draft and checks |

**`npm run check` asserts** that:

- every run and every journal balances;
- the bank file total equals net pay;
- the WPS file matches the bank file;
- no deduction breaks Art. 70, 92 or 93;
- every planted case is in its designed state;
- the golden run matches.

## 9. Three payroll storylines answer the payroll managers' problems in the order they named them

Each scenario has a different shape and answers one question for the room. Each storyline plays three scenarios, so the client stays with it.

| Storyline | # | Scenario | Shape | Client | The question it answers | Starts from | Personas, in order | Pane 03 shows |
|---|---|---|---|---|---|---|---|---|
| **Every client's own rules** | D10 | A new client moves in from Excel | End to end | Soudah Development (new) | "How fast can you take on a client whose payroll lives in spreadsheets?" | The shared folder (section 13) | Payroll lead | The roster, history and policy filling in, then the go-live decision |
| | D1 | A handbook becomes rules | Governance, with a refusal | Red Sea Global, then SEVEN | "Can it read our client's handbook, and will it catch a rule that breaks the law?" | Edges 1, 2 | Payroll lead, client CHRO | The rule tiles, the unclear clause, the refused clause |
| | D2 | Same overtime, different pay | Policy effect | Red Sea Global and Saudi Coffee | "Will each client really be paid by its own rules?" | Approved policies | Payroll specialist | Two pay lines side by side, each citing its rule |
| | D3 | A month of attendance | Exception | Saudi Coffee | "Can attendance reach payroll without anyone typing?" | Edges 6, 7 | Employee, client HR operations | One employee's month and the fine against the cap |
| **Changes on time** | D5 | The 15th without chasing | Real time | Riyadh Air | "What happens when the client is late?" | Edge 5 | Client HR operations | The Oracle HCM worker record; the change routed to next month |
| | D4 | From offer to first payslip | End to end | SEVEN | "Is a hire entered once?" | Edge 8 | Client HR operations, Payroll specialist | The Tasama HR employee record, created once |
| | D9 | Back pay and a leaver | Exception | ROSHN | "Can it correct the past without reopening a closed month?" | Edges 12, 13 | Payroll specialist | The recalculated months and the settlement |
| **From run to ledger** | D6 | Run, explain, approve | Happy path | Red Sea Global | "Will I understand every difference before I approve?" | Edges 3, 9 | Specialist, lead, client CHRO | The waterfall of differences |
| | D7 | Bank file, WPS and Mudad | Failure handled | Riyadh Air | "What happens when a payment fails?" | Edge 10 | Payroll lead | The bank file and the failed line |
| | D8 | The journal lands in Oracle | The loop: the mapping is learned once | ROSHN | "Does finance still need the mapping spreadsheet?" | Edge 11 | Payroll lead | The four journals and the import status |

D1 is played on its own when the room wants the policy reading in detail; inside the storyline, D10 shows the policy step.

**What happens to existing scenarios**

- `hire-to-onboard` becomes D4. It keeps its key, and its steps extend to the contract and the first payslip.
- `payroll-escalation` becomes a Tasama-level scenario with a fixed client (ROSHN):
  - its persona is the Payroll specialist;
  - its target is Payroll › Runs › Draft and checks;
  - its closing step's text changes from "release" to "send for validation".
- The Compliance and Legal storyline keeps `payroll-escalation`.

## 10. Twenty-five sessions build it, and the engine gate comes before any payment or ledger work

Each phase ends with its scenarios playing twice through the Director from a Reset, and `npm run typecheck` and `npm run check` clean.

| Phase | Builds (files) | Sessions | Verified by |
|---|---|---|---|
| 0 Design (this file) | `design/payroll-addendum.md`, `design/payroll-requirements.md` | 1 | The owner's approval |
| 1 Clients and policies | Client modes and the `PLATFORM` dialect (`clients.ts`, `connector.ts`); the three clients moved; Tasama payroll personas (`session.ts`), the persona rename and the finance controller (`seed/layer.ts`); the 27 dimensions and policy tables; handbooks from rules (`policies.ts`); Nizam; the Payroll lens shell with Months and Inbox; Client policies screen; each client's calendar around the demo date; Stage records for D1 | 3 | D1; the integration log shows Tasama HR calls for the three clients |
| 1b Client skins (§14) | `lib/brand.ts`, the skin switch in `App.tsx`, the title bar and assistant rail brand, the Stage person chip | 1 | Screen lint per skin; contrast; screenshots |
| 2 Payroll engine | `domain/payroll/*`; GOSI table and `gosi_registrations`; `gratuity()` change; provisions; back pay; off-cycle; six months of history replacing the authored results; `tasama.payroll_runs` derived; golden fixture; Runs › Draft and checks and Provisions; Stage records for D2 | 4 | **July 2025 matches**; D2; balances and caps asserted |
| 3 Attendance | Schedules, upload with column map, Hudoor, justification and confirmation, the cap; Attendance screen; Stage records for D3 | 2 | D3 |
| 4 Intake and contracts | Wared, Aqd, `contracts`, Inputs screen, the client's This month tab, WF-28 on `hire-to-onboard`; Stage records for D4, D5 | 3 | D4, D5 |
| 5 Reconciliation and approval | Mutabaqa; Runs › Approval and Payslips (Runs › Draft, Checks and Provisions came with phase 2); the client's Approval and Reports tabs; Wathiqa payslips; back pay and settlement for D9; re-pointed `payroll-escalation` | 2 | D6, D9; `payroll-escalation` |
| 5b A new client from Excel | The Soudah shared folder generator and files (`tools/new-client/`, `demo-files/soudah/`); the client registry; the Add a payroll client screen; Intiqal (WF-24) with its seven lanes; staging and go-live; Reset and scenario start remove the client; Stage records for D10 | 3 | D10 twice in a row, with a Reset between and without one |
| 6 Banks, WPS and Mudad | `bank_formats`, Tahweel, Payments screen, return files, WPS; Stage records for D7 | 2 | D7 |
| 7 Finance | Account map, Qaid, four journals, Oracle import file and Odoo CSV, Journals screen; the Payroll costs lens; Stage records for D8 | 2 | D8 |
| 8 Demo and checks | The three storylines, Arabic in `lib/ar.ts`, screen lint, menu review, README, Replit | 2 | The owner's rehearsal |

**The owner reviews five times:**

1. This addendum.
2. The phase 1 screens.
3. The engine's July 2025 result.
4. The Soudah shared folder: the Excel files and the PDFs, before the ingestion is built on them.
5. The rehearsal.

## 11. Five questions are open with Tasama, and none of them stops the build

| Question | For | What ships meanwhile |
|---|---|---|
| Does Tasama run Oracle Payroll inside its Oracle clients' systems, or calculate outside them? | Tasama | The engine calculates and writes back |
| Which ledgers receive the journals for clients not on Oracle? | Tasama | Odoo Accounting CSV for SEVEN and Saudi Coffee, labelled illustrative |
| Does the 50% deduction cap apply to a final settlement? | Tasama legal | The full advance balance is recovered, shown as its own line |
| Leave provision per day: salary ÷ entitlement, or ÷ 30? | Tasama | ÷ 30; the template's method in the fixture-only version |
| Is the GOSI contribution floor SAR 1,500? | Research, then Tasama | Not applied until verified |

The remaining questions for Tasama are in the requirements file. None of them blocks a phase.

**The owner decided on 22 October:**

- The addendum is approved.
- Odoo stays as the fallback, not live.
- The three-item Payroll costs lens is accepted.
- The July 2025 employees are treated as real people: anonymised in the fixture, never in the seed.
- The two Tasama personas are Sharifa AlMousa (lead) and Nasser AlFarraj (specialist).
- Taking on a new client from Excel becomes a demo (section 13).

**Added 22 October 2026:** does Tasama intend a day of leave in the provision to be worth the month ÷ 30, or the month ÷ the employee's annual entitlement as the July 2025 template computes it (section 5, result)? The engine supports both; the platform's default is ÷ 30.

## 12. What the prototype will not prove

- That the engine matches Tasama's real runs beyond the July 2025 sample. The parallel run in production proves that (CAL-29).
- That the bank layouts are the banks' real templates.
- The real Mudad upload, the real GOSI bill, or posting to a real Oracle or Odoo ledger.
- That Nizam reads a real client handbook as well as it reads ours.
- Hosting in Saudi Arabia, single sign-on, or the load of every Tasama client in the same week.

## 13. Taking on a new client: Soudah Development moves from Excel to the platform in one screen

Added on 22 October 2026 at the owner's request. The demo shows Tasama taking on a client whose payroll today lives in spreadsheets and a shared folder. The team drops the folder on one screen. The platform then creates the client and fills in its roster, its history, its policy and its documents. A person decides when it goes live.

The workflow is WF-24, New client transition. It was designed and not built; this section builds it, with the agent Intiqal (انتقال) that was already named.

**The client [D].** Soudah Development, a PIF portfolio company: tourism in Asir, 64 employees.

- Everything about it is fictional, like the other five: its staff, its pay, its policy, its contract with Tasama, and the fact that its payroll is in Excel.
- Its contract is a payroll managed service starting next month.
- It becomes a platform-of-record client.

### The shared folder holds what a real client hands over, with the problems real files have

A generator, `tools/new-client/make.ts`, writes the files from a fixed seed. They are committed under `demo-files/soudah/` and can be downloaded as one zip from Demo control › Demo files, so the presenter can drag them from the laptop.

| File | What it holds | What is wrong in it, on purpose |
|---|---|---|
| `Soudah - Master Data.xlsx` | Tasama's Master Data layout, 64 rows, Arabic and English names | One employee number used twice. Two IBANs that fail the check digits. One Saudi with no GOSI registration date. One housing allowance that does not match the policy |
| `Soudah - Payroll 2026-04.xlsx` to `2026-09.xlsx` | Six months in Tasama's payroll calculation layout, with totals | A May joiner paid without housing for two months. GOSI at 9.75% for a Saudi first registered in 2025. A leaver paid for a month after the last day |
| `Soudah - EOSB and Leave Provisions 2026-09.xlsx` | The provisions sheet | Balances to compare with the platform's own calculation |
| `Soudah - Leave Tracker 2026.xlsx` | Leave balances | One negative balance |
| `Soudah HR Policy Manual v3.pdf` | A 12-page handbook | Probation of 200 days, above the legal maximum of 180 (Art. 53). Lateness deductions of up to 10 days' wage a month, above the 5-day cap (Art. 70) |
| `Contracts/` | 62 employment contracts, one PDF each | Three salaries that differ from the master data; two of them are explained by a promotion letter. Two employees with no contract in the folder. One fixed-term contract that has expired |
| `Letters/` | 18 PDFs: promotion letters, salary certificates, salary transfer letters, one warning | Each one is attached to its employee; the two promotion letters explain two of the contract differences |

### The screen shows seven lanes filling in, then one decision

**Add a payroll client** is an action, not a menu item. It opens from a button on Tasama Services › Overview and on Payroll › Months.

- **Job:** "Take a new client on from its files."
- **Hero:** a drop zone that accepts files and whole folders.
- **Visual:** seven lanes, each filling as its files are read, with a count and the number of issues found.

| Lane | What Intiqal and the other agents do | What the lane shows when done |
|---|---|---|
| Client | Reads the client's name, legal entity, GOSI establishment number and main bank from the policy cover and the master data. Pay day and cut-off come from the policy | The new client's card |
| Roster | Maps the master data's columns to the platform's fields; the map is shown and can be corrected. Builds employees, departments, positions, grades and managers. Holds back invalid rows | 64 employees: 61 ready, 3 held (the duplicate number and the two IBANs) |
| Policy | Nizam itemises the handbook on the 27 dimensions | 27 dimensions, 2 rules refused as below the law |
| Contracts | Aqd matches each contract to an employee and reads salary, start date, probation and contract type | 62 matched, 3 differences (2 explained), 2 missing, 1 expired |
| Letters | Classifies each letter and attaches it to its employee | 18 attached |
| History | Imports the six months as they were paid. The engine then recalculates each month under the new policy and lists every difference | 6 months, 3 differences: SAR amounts and the employees concerned |
| Leave and provisions | Loads leave balances. Compares the September provisions with the platform's own calculation | Balances loaded, 1 negative; the provision difference |

**The decision card:** "Take Soudah on from November: 15 issues, 7 need the client." The seven are the duplicate number, the two IBANs, the two missing contracts, the expired contract and the unexplained salary difference. The generator asserts both counts.

- **Payroll lead approves:**
  - the client's staged data is written to its Tasama HR master through the connector;
  - the issues become cases for the client's HR operations;
  - the November month opens with Wared's pre-filled changes.
- **Payroll lead returns it:** the staged client stays as a draft.

Until approval, nothing is written to a master. The lanes fill a staging area.

The new client gets the same personas as the others: CHRO (from the master data's head of HR), HR operations, an employee and a finance controller. The room can switch into Soudah straight after go-live.

### Reset and replay remove the client, so the demo can be shown again

- **Reset the demo data** drops every client that is not one of the five in the seed: its schemas, its `tasama.clients` row and its Tasama rows.
- **Starting D10** does the same for Soudah only, so the scenario plays twice without a Reset.

### What this needs in the code

| Area | Change |
|---|---|
| Client registry | `domain/clients.ts` keeps the five. Onboarded clients are stored in `tasama.clients` with their config and loaded into the same lookup, so `clientByKey` finds them |
| Upload | The browser reads dropped files and folders and posts them in parts to `/api/onboarding/files`. They are kept in `tasama.onboarding_files` until go-live or removal |
| Parsing | `exceljs` reads the workbooks and `unpdf` reads the PDFs' text. Claude classifies letters and reads contracts and the policy; the offline resolver reads the generator's known layout |
| Generation | `tools/new-client/make.ts` with `exceljs` and `pdfkit`, as development tools only |
| Director | D10's steps can upload the folder themselves when the presenter presses →, or wait while the presenter drags it ("Your move") |

**Scenario D10, step by step:**

1. The folder is dropped.
2. The client lane and the roster lane fill.
3. The policy lane fills, and Nizam's two refusals show.
4. Contracts and letters are matched.
5. History is recalculated, and its three differences are explained.
6. The decision card appears.
7. Sharifa approves.
8. The room switches to Soudah's HR and sees the November month opened.

**Question for the room:** "How fast can you take on a client whose payroll lives in spreadsheets?"

## 14. Each person sees their employer's brand, and the client's screens say "Powered by Tasama"

*Added 22 October 2026, at the prototype owner's request.*

Switching personas today changes the menu and the data but not the look, so the room loses track of whose screen it is. From this addendum the platform takes the skin of the person's employer.

### The skin follows who the person works for, not the client being viewed

| Person | Skin | Why |
|---|---|---|
| Tasama staff: the Operations Manager, Sharifa AlMousa, Nasser AlFarraj | Tasama | They work for Tasama, in every client they open |
| Everyone inside a client: employee, line manager, HR business partner, talent acquisition, HR operations, CHRO, new joiner, finance controller | That client | It is their company's HR system |

Sharifa opening Red Sea Global's policy stays in the Tasama skin. Hessa, Red Sea Global's CHRO, always sees Red Sea Global's skin.

### What changes and what stays

| Changes with the skin | Stays the same for everyone |
|---|---|
| The brand in the title bar | Layout, menus, lenses and the decision card |
| | Status colours: warning, danger, success |
| The primary colour: buttons, links, focus rings, selected chips, active menu item | Chart colours, except bars drawn in the primary colour |
| | Fonts and spacing |

### The title bar carries the client's logo; the assistant rail stays Tasama's

*Revised 22 October 2026 at the owner's request: the first version, with logos in both places, was too crowded.*

| Place | Client skin | Tasama skin |
|---|---|---|
| Title bar, left | The client's full logo, then **HR** in bold, then "powered by Tasama" small and grey (بدعم من تسامى) | The T, "Tasama HR", "demo" |
| Assistant rail brand card (top left) | Tasama's logo | Tasama's logo |
| Assistant rail, collapsed | Tasama's T | Tasama's T |

The five logo files were supplied by the prototype owner on 22 October 2026, with only their empty margins trimmed; the demo letters use the same files (`apps/web/public/brands`, sources in `SOURCES.md`).

### Each client's primary colour comes from its brand colour

The primary colour keeps the brand's hue and is set light enough or dark enough to pass contrast in each theme.

| Client | Logo | Primary, light theme | Primary, dark theme |
|---|---|---|---|
| Tasama | #FFFFFF, blue T | unchanged | unchanged |
| ROSHN | white, ROSHN Group logo | deep teal | mint |
| Riyadh Air | white, Riyadh Air logo | deep violet | light violet |
| Red Sea Global | white, Red Sea Global logo | bronze, from its gold emblem | light gold |
| SEVEN | white, SEVEN logo | SEVEN navy, from its wordmark | light blue |
| Saudi Coffee Company | white, Saudi Coffee Company logo | deep green | light green |
| A client onboarded in the demo (§13) | Its name in white on the colour picked at onboarding | From that colour | From that colour |

Red Sea Global's primary is its emblem's gold and SEVEN's is its wordmark's navy, so no two clients share a hue except ROSHN's teal and Saudi Coffee's green, which their logos tell apart. The colours are approximations of each brand, kept in one table in `apps/web/src/lib/brand.ts` so official values can replace them.

### The Stage and Present mode stay in Tasama's skin

The Stage is the presenter's frame, and the person on screen changes at almost every step. If the whole frame changed colour at every step, the room would watch colours instead of the work. So:

- The Stage frame and Present cards stay Tasama.
- The person chip in the Stage bar shows their employer's tile next to their name.
- **App** view, opened from the Stage, shows that person's skin.

### Checks

- Primary colour on white, and white text on the primary colour, is at least 4.5:1 in the light theme; the same against the dark background in the dark theme.
- The screen lint runs once per skin.
- Screenshots: one client persona and one Tasama persona per client, in light mode.

**Effort:** one Claude session.

## 15. HR operations can change each deduction, and Tasama can see who holds a case and remind them

*Added 22 October 2026, after the owner's review of the attendance month (D3).*

**Why.** HR operations could only approve or decline the attendance month without seeing who was being deducted. Tasama's payroll team could open a case waiting on the client but could not see where it was stuck or act on it.

**HR operations confirms each line, not only the month.** On the attendance decision, the person deciding sees "Who is deducted": one row per employee with a fine, unpaid days or an explanation. Each row lists the late days with minutes, the fine (and whether it stopped at the five-day cap), the absent days and their unpaid amount, each explanation, and the amount deducted after any change. The person can:

| Change | What it does |
|---|---|
| Waive the fine | That person's late days are excused; no fine this month |
| Excuse the absence | That person's absent days are excused; no unpaid days |
| Do not accept an explanation | The fine stands for that day (explained days are excused by default) |

The changes go with the confirm; Tasama HR writes only what is left. The trail names the person who confirmed and each change they made.

**Tasama staff see where a case is stuck, and can send a reminder.** When a Tasama person opens a case that waits on someone at the client, the reader names the person, their role and client, the step it is stuck at and since when. "Send a reminder" opens an email Raqeeb drafts from the case (Claude rewords it when connected; otherwise a template). The sender edits the subject and message and sends.

The email is a mock: nothing leaves the platform. On send:

- the message appears in the person's Tasama HR notifications, linked to the case;
- the case trail records the reminder, who sent it and to whom;
- an open SLA escalation for the case on Tasama's board is marked reminded, and Tasama's own trail records it;
- the case shows "Last reminder" with time and sender.

Only Tasama staff can draft or send a reminder.

**No change to the seed, the engine or the HRMS connector.**

**Effort:** within phase 3.

## 16. Every check on a draft run says what was found, who settles it, and how

*Added 22 October 2026, after the owner's review of Runs ("how to check? what to check? who acts?").*

**Why.** The Draft tab marked people "Check" or "Stops the run" with no explanation, owner or action. The "Check" marks were lines the client had already confirmed (unpaid days, a fine cut at the cap), so there was nothing to check.

**What changes on Runs.**

- "Check" is removed. A line the client already confirmed shows who confirmed it and when (for example "Attendance confirmed by Nikhil Thomas on 22 Oct 2026").
- "Stops the run" (red) and "Needs the client" (amber) open the Checks tab.
- Each check shows what was found, what it means, who settles it and the one action that settles it. Below the checks, "Done this month" lists what was done, by whom and when.

| Check | Stops the run? | Who settles it | Action on Runs | What happens |
|---|---|---|---|---|
| Advance instalment above 10% of the wage (Art. 92), usually with deductions above half the wage (Art. 93) | Yes | Tasama payroll. The law sets the answer | "Recover SAR x a month from <month>" | The same balance is recovered at the legal limit over more months. HR operations gets a notification |
| Not registered with GOSI | Yes | The client's HR operations. Only the employer can register | "Ask <name> to register <first name>" | A question goes to HR operations' inbox (WF-36). They give the registration date or answer "Not registered yet" |
| Overtime above the policy cap held | No | The client's HR operations | "Ask <name> whether to pay them" | WF-36 question: pay the held hours this month, or not |
| Deductions above half the wage, alone | Yes | Tasama payroll | None yet | Named on the check. Not in the demo data |

**Follow-up and reminders.** While a question is open, the check reads "Asked on <date>; waiting on <name>". "Open the question and send a reminder" opens the case, where the reminder from §15 is available. A "Not registered yet" answer shows on the check with the client's note, and Tasama can ask again.

**WF-36, Run question to the client.** It is numbered 36 because WF-30 to WF-35 are the payroll run workflows in section 7.

1. HR operations answers (date, or pay or not).
2. Tasama HR writes the entries in the open month: GOSI registration and contribution entries, or the held hours settled. The run recalculates.

A first GOSI registration with an earlier employer stands, because it decides the contribution rate.

**Recorded in** `layer.run_check_log`. The client's answer and Tasama's actions are also on Tasama's own trail.

**Who approves the run** is not part of this change: the Approval tab is phase 5.

**No change to the seed or the engine.** Fixes are written as element entries in the open month, as the connector does for any confirmed input.

**Effort:** within phase 3, about one Claude session.

## 17. Phase 4 as built: each client's month of changes, and a hire entered once

*Added 23 October 2026, at the start of phase 4. It fills in sections 3, 4, 6, 7 and 9 for intake and contracts.*

### The month's changes are listed for the client before the cut-off, and late ones move to next month

**Wared pre-fills each client's changes when the month opens (WF-27).** From the master it lists:

- joiners and leavers;
- salary changes;
- unpaid leave;
- advances;
- overtime already approved;
- for Saudi Coffee, the attendance month.

These came through approved cases or HR events, so they arrive confirmed. Wared also lists what only the client can send, with last month's figure as a suggestion: overtime hours from the shift departments. These stay **expected** until HR operations confirms them.

| State | Meaning |
|---|---|
| Expected | Wared is waiting on the client before the cut-off |
| Confirmed | In this month's payroll |
| Next month | Arrived after the cut-off; paid with next month as back pay |
| Dropped | The client said it does not apply this month |

**WF-27 steps:**

1. Wared lists the month's changes against the cut-off.
2. The client's HR operations confirms. They can change a suggested figure or drop a line.
3. Tasama HR enters the confirmed lines in the payroll month.

Wared reminds HR operations itself, three days and one day before the cut-off (A3, inside the contact rules), and the reminders are on the case.

**A change entered after the cut-off is a WF-27 case of its own.** Wared:

- works out what it is worth for the days of the closed month;
- moves it to next month as back pay;
- shows HR operations the effect.

HR operations agrees, or asks Tasama for an off-cycle payment. The off-cycle run itself is phase 5 (WF-35). Nothing in an approved run reopens.

**Seeded state on the demo day, following the calendar in section 8:**

| Client | Month's inputs |
|---|---|
| Riyadh Air, Red Sea Global | Cut-off passed; WF-27 confirmed the day before the cut-off, after Wared's reminders |
| ROSHN, SEVEN | Cut-off tomorrow; WF-27 waiting on HR operations with three overtime lines expected |
| Saudi Coffee | Cut-off in three days; WF-27 waiting, with three overtime lines and the attendance month expected |

`SEED_VERSION` goes to 6.

### Screens

**Payroll › Inputs** (Tasama), between Inbox and Attendance:

- Hero: changes still expected before the cut-off, across the five clients.
- One row per client: a segment bar of confirmed, expected and next month, with the cut-off.
- Opening a client lists its changes and links to its month case, where a reminder can be sent (section 15).

**HR Workspace › Payroll** (client) gains route tabs:

- **This month** (new, the default): the cut-off clock, the changes waiting on the client, the changes already confirmed, and any late change moved to next month.
- **Pre-run check**: today's Hisab content, kept as it is until phase 5 moves it to Runs and adds Approval and Reports.

### A hire is entered once: offer, contract, employee, GOSI, first pay (WF-28)

At a client whose payroll Tasama runs, an accepted offer starts WF-28 next to Dalil's pre-boarding.

**WF-28 steps:**

1. Aqd drafts the contract from the offer and the client's policy:
   - the parties, job, grade and start date;
   - basic and each allowance;
   - probation (Art. 53) and working hours;
   - annual leave and notice;
   - contract type: fixed term for a non-Saudi (Art. 37), indefinite for a Saudi.
2. The client's HR operations reads it and sends it for signature. They can correct the start date.
3. The employee accepts it on Qiwa (simulated).
4. Tasama HR turns the pending worker into the employee: the same record, with the pay elements from the signed contract.
5. Tamin registers the person with GOSI and sets the insured group and rate:
   - a Saudi: the new-system rate for a first registration from July 2024;
   - a non-Saudi: occupational hazards only.

The new hire then appears in the open month's draft run, paid from the start date. Wared's joiner line moves from expected to confirmed.

At these clients Dalil's pre-boarding no longer creates the Qiwa contract or registers GOSI itself, so neither is done twice. It keeps the work permit for a non-Saudi and the rest of the journey.

`layer.contracts` holds each contract: number, person, offer, contract type, fields, the text, status (drafted, sent, signed) and dates.

### New agents

| Agent | Job | Rung |
|---|---|---|
| Wared (وارد) | Lists the month's changes, reminds before the cut-off, moves late changes to next month | A3 |
| Aqd (عقد) | Drafts the contract from the accepted offer | A2 |
| Tamin (تأمين) | Registers a new employee with GOSI and sets the insured group and rate | A2 |

This brings the count to 24 agents. Tamin's other jobs (exclusions, checking the GOSI bill) come with phase 5.

### Scenarios

**D4, `hire-to-onboard`, fixed to SEVEN:**

1. The offer is drafted.
2. It is approved and accepted; Aqd drafts the contract.
3. HR operations sends it; it is signed; the same record becomes the employee; Tamin registers GOSI.
4. Nasser sees the new hire in SEVEN's draft run, paid from the start date.

The medical-test block is not played in D4; it stays possible for other runs of WF-06.

**D5, `late-change`, "The 15th without chasing", Riyadh Air:**

1. The month's changes were confirmed a day before the cut-off, after Wared's two reminders; nobody chased.
2. A promotion is entered in Oracle HCM after the cut-off.
3. Wared moves it to next month as back pay and shows HR operations what it is worth.
4. HR operations agrees.
5. Nasser sees it under Inputs as "next month".

**Effort:** three Claude sessions, as planned.

## 18. Phase 5 as built: a run is prepared, validated, explained and approved, and the engine runs for all five clients

*Added 23 October 2026, at the start of phase 5. It fills in sections 1, 2, 3, 7 and 9 for reconciliation and approval.*

### The engine now calculates for the two Oracle clients too

Section 1's default is that the platform's engine calculates for ROSHN and Riyadh Air, and the approved run is written back to Oracle through the connector. Until now, Runs showed only the three clients held in Tasama HR, and the Oracle clients' past months were authored in the seed.

From this phase:

- the engine replays every client's history (`SEED_VERSION` 7);
- Runs lists all five clients;
- the approved run is written to the master: Oracle HCM's payroll results for ROSHN and Riyadh Air, Tasama HR for the other three. Both writes appear in the Integration log.

### One case carries the run from preparation to payslips (WF-30)

Section 7 listed three workflows: WF-30 (run), WF-31 (differences and client approval) and WF-32 (payslips). They are built as the steps of one case, so the client, Tasama and the trail follow one record. WF-31 and WF-32 stay in the catalogue as the names of those steps.

| # | Step | Who | Rule |
|---|---|---|---|
| 1 | Hisab prepares the draft and runs the checks (the pre-run check, WF-13) | Agent | Section 16's checks, with who settles each |
| 2 | Send for validation | Payroll specialist | Refused while a check stops the run |
| 3 | The run is frozen | System | Every line kept as calculated; what the client approves is what is paid |
| 4 | Validate | Payroll lead | Never the person who prepared it (PLT-04): refused if it is |
| 5 | Mutabaqa explains every difference from last month | Agent | Each person's change is split into its causes, and they add up to the change |
| 6 | Approve, or return with a reason | The client's CHRO | A return goes back to the specialist; a new case prepares it again |
| 7 | The run is written to the master | System | Oracle HCM or Tasama HR, through the connector |
| 8 | Wathiqa issues the payslips | Agent, A3 | Each employee is told; My HR › Pay shows the payslip |

`layer.pay_runs` holds each run: period, state, preparer, validator, approver and totals. `layer.pay_lines` holds each person's frozen lines.

### Mutabaqa explains each difference by taking one change at a time

For each person, the engine starts from last month's inputs and replaces one input at a time with this month's, in a fixed order. The change in net pay at each step is that cause's share, so the causes add up to the difference exactly:

1. days in the month;
2. joining or leaving;
3. pay change;
4. unpaid days;
5. overtime;
6. lateness fines;
7. advances;
8. GOSI.

Nothing is left unexplained. If a residual ever appears, it is shown as "not explained" and stops the approval.

**The visual is a waterfall:** last month's net, each cause, this month's net. It appears in Runs › Differences, on the CHRO's approval card and in the client's Payroll › Approval tab.

### Screens

- **Payroll › Runs** (Tasama), one record per client with these tabs:
  - Draft and checks, as before;
  - **Differences**, the waterfall and each person's causes;
  - **Approval**: who prepared, validated and approved, with the clock to the approval deadline (four days before pay day);
  - **Payslips**: issued against the people paid;
  - Provisions, as before.
- **HR Workspace › Payroll** (client) gets three tabs:
  - This month;
  - **Approval**: the waterfall, and Approve or Return from the case;
  - **Reports**: net pay and employer cost by month.

  The Pre-run check tab goes: its content is Runs › Draft and checks.

### Seeded state on the demo day, following section 8

| Client | Run |
|---|---|
| Riyadh Air | Validated and approved by the client; written to Oracle HCM; payslips issued; the bank file is phase 6 |
| Red Sea Global | Prepared; two checks stop it (D6 clears them) |
| ROSHN, SEVEN, Saudi Coffee | Before their cut-off: the draft only |

### Scenarios

**D6, `run-approve`, "Run, explain, approve", Red Sea Global:**

1. Nasser clears the two checks.
2. He sends the run for validation.
3. Sharifa validates it.
4. Mutabaqa explains the differences.
5. The CHRO approves.
6. The run is written and payslips go out.

**`payroll-escalation`** becomes a Tasama-level scenario at ROSHN with the Payroll specialist:

1. Hisab prepares ROSHN's run and finds what stops it.
2. Nasser sends it for validation once it is clear.

### Back pay and the final settlement (WF-35, D9)

**WF-35 Back pay**, for a change dated in a closed month:

1. Hisab recalculates each closed month under the change with the engine's back-pay rule. It also works out the GOSI owed on the difference, and re-measures both provisions; the catch-up shows on its own line (CAL-30).
2. The payroll specialist adds it to this month's run.
3. Tasama HR enters one back-pay line per month, and the GOSI on them, in the open month.

The back pay is then validated and approved with the run like any other line. No closed month is reopened.

**The final settlement comes from the engine.** Wadaa's settlement (WF-19, WF-20) used to value the award and the leave on basic pay alone, which section 5 refuses (Art. 2, 84, 111). It now uses the engine's final settlement:

- salary to the last day;
- unused leave on the policy's wage;
- the award by the way the person left (Art. 84, 85, 87, 80);
- the outstanding advance recovered on its own line.

A leaver whose last day falls in the open month is paid this settlement in that month's run. Mutabaqa counts it under "Left or leaving".

**Last month is taken as paid.** Mutabaqa's waterfall starts from last month's payroll results as written. A change dated back into last month after it was paid shows as a pay change for that person.

**The seeded past now matches the master.** Advances from the case history and last month's overtime sheets are written after the history is first calculated. So the closed months are recalculated by the engine once every seeded entry is in.

**D9, `backpay-leaver`, "Back pay and a leaver", ROSHN:**

1. A raise dated three months back reaches three closed months.
2. Nasser adds the back pay to the run.
3. A colleague resigns after about seven years: two thirds of the award, unused leave, the advance recovered.
4. Mutabaqa splits the month's change.

Both people are set aside in the seed and restored each time the scenario starts.

**Effort:** two Claude sessions, as planned, plus one for the Oracle clients' runs, which the plan had not counted.
