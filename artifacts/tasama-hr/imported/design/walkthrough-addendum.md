# Addendum, 26 October 2026: the month runs on each client's calendar, the run goes back through HR operations, and the client's approval chain is its own

**Status.** Approved by the prototype owner on 26 October 2026 ("implement what can be implemented now while waiting for the documents"), then narrowed the same day to the people-and-process part ("do session 2 until we receive their documents"). **Built on 26 October:** items 2, 3, 4, 5 and 38 (§1, the first four rows), with the data in §2 except the two policy dimensions, which exist as fields and are not read yet. **Waiting for Tasama's files:** items 10, 16, 31, 28, 23, 25 and 26. WF-39 is defined and marked *designed*; nothing starts it. The engine check against Ahmed's Excel, the element catalogue, the bank templates, the cost-centre summary and the bank reconciliation wait for the files and get their own addendum.

**Sources.** The payroll walkthrough with Sharifa, Ahmed (payroll manager) and Zeyad (HR operations manager) on 26 October 2026: the recording, the transcript and the screens shown (the process map, the 2026 payroll calendar, the payroll Excel with its Elements, Payslip, EOS and Leave 365 and 360 tabs, the offboarding slide). The gap tables of the same day (items 1 to 38).

**Precedence.** Overrides `design/payroll-addendum.md` §8 (the calendar) and §18 (the run's steps) and `design/hr-ops-addendum.md` Q2 where they differ.

## 1. What is built now

| Item | What Tasama described | What changes |
|---|---|---|
| 2 | Ahmed reviews every run; Yasser and Ahmad calculate; Zeyad runs HR operations | The role titles change: "Payroll manager, Tasama" reviews, "Payroll specialist, Tasama" calculates. The names stay Sharifa and Nasser until Tasama confirms whose names the demo should carry; nothing else is renamed |
| 3 | Payroll hands the calculated run back to HR operations, who delivers it to the client and fields its questions | WF-30 gains a `deliver` step for Tasama HR operations between the lead's validation and the client's approval. Lama sees Mutabaqa's explanation and sends the run to the client; a run returned by the client comes back to her first |
| 4 | The client's approval runs through a chain (CHRO, administrative manager, up to the CEO) and is where the time goes | Each client's contract names its approval chain. ROSHN and Riyadh Air: HR operations then the CHRO. The others: HR operations only. WF-30 gains an `approve_chro` step that the chain switches on. The client's Payroll › Approval and Tasama's Runs › Approval show each link, who holds it, and since when |
| 5, 38 | A payroll calendar per client, agreed each January: cut-off, calculation, review, delivery, client approval, bank upload, payment date; weekends and holidays; who is responsible for each. Tasama wants the client to see it and be reminded | The calendar gets seven stages per month, offset from the cut-off; a stage that lands on a weekend or a holiday moves to the working day after, the payment date to the working day before. The client's HR Workspace › Payroll gains a **Calendar** tab with the year, the stage each month is at, and **Approve the calendar** (WF-38). Tasama's Months shows every client's stages for the open month. Wared reminds the client the day before its cut-off and its approval date, and tells the Tasama team the day before each stage it owns |
| 10 | GOSI does not accept a wage increase above 10% a year for an employee over 50 | A new check on the draft run, `GOSI_WAGE_CAP`: the contributory wage is held at last year's plus 10%, the difference is shown, and the check names Tasama HR operations |
| 16, 31 | The leave provision divides the salary by 22 at this client, by other numbers elsewhere; the month cost nets the days used | The leave-day divisor becomes a policy dimension with three readings: 22 working days, 30, or the annual entitlement. The seeded clients keep 30, so the golden run is unchanged |
| 28 | GOSI is prorated by the days worked in a partial month | A policy dimension, off by default (GOSI itself charges the full month). Switched on, the month's contribution is × pay days ÷ month days |
| 23 | The client sends a summary of approved deductions, not the raw device file | Attendance accepts a summary sheet (employee, late minutes, absent days, approved by) as well as the device export. Hudoor skips the matching and prices the summary |
| 25 | A woman who resigns within six months of marriage receives the full award; the medical insurance exit is part of leaving | Wadaa's settlement gains the Art. 87 reason "marriage" with the full award; WF-19 and WF-20 `terminate` also ends the medical insurance and says so on the trail |
| 26 | Taking a client off: Tasama shares the payroll files, the client signs the handover, Tasama deletes its files; a 20-item checklist; SLA 7 working days | A new workflow WF-39 and a screen, Tasama Services › **Handover**: the checklist, the client's sign-off, the deletion. A scenario, "Handing a client back" |

## 2. Data, with this addendum

| Change | Why |
|---|---|
| `contract.approvalChain: ('PAYROLL' \| 'CHRO')[]` on each client | Item 4 |
| `STAGES` in `domain/calendar.ts`: the seven stages as offsets from the cut-off, with their owners; the cut-off stays on its day; the payment date moves to the working day before a weekend or a holiday, the stages between them to the working day after. `policy.leaveDayDivisor` and `policy.gosiProrate` are fields only until the files arrive | Items 5, 16, 28 |
| `layer.payroll_calendar` (client, year, stages per month, status, approved by, approved at) | Item 5 |
| WF-30 steps: check, prepare, freeze, validate, explain, **deliver**, approve, **approve_chro**, write, payslips | Items 3, 4 |
| WF-38 Payroll calendar approval; WF-39 Client handover | Items 5, 26 |
| Seed: each client's 2026 calendar, approved in January except Saudi Coffee's, which waits on its HR operations; Riyadh Air's run delivered by Lama and approved by both links; Red Sea Global's waiting on Lama's delivery | Items 3, 4, 5 |
| `SEED_VERSION` 15 → 16 | — |
| The run's `prepared_at`, `validated_at` and `approved_at` take the replay clock, not the database clock, so the seeded sign-offs carry the dates they happened | Item 4's sign-off cards |

## 3. Scenarios

| Scenario | Change |
|---|---|
| Run, explain, approve (Red Sea Global) | New step after Sharifa's validation: Lama delivers the run to Red Sea Global. The client's approval stays one link there |
| Payroll pre-run finds blockers (ROSHN) | Unchanged |
| New: **The year's calendar, approved once** (Saudi Coffee) | The client's HR operations sees the 2026 calendar, approves it; Wared's reminders follow it; the Tasama team is nudged before the cut-off |
| New: **Handing a client back** (Tasama level) | The checklist fills, the client signs, Tasama deletes its files inside the SLA. *Waits for the checklist file* |

## 4. Checks

`npm run check` gains checks for: each client's calendar and its approval state, and Tasama's Months showing the next stage (built); the `deliver` step and the approval chain on the seeded runs (built); the leave-divisor and GOSI-proration dimensions leaving the golden run unchanged, the over-50 check and the handover case (with the files). The Director plays twenty scenarios; the Q2 check now allows the CHRO at the chain's own step.

**Effort:** about 1.5 Claude sessions.

## 5. Session 3, 26 October 2026: everything else the recording holds, built without the files

**Status.** Approved by the prototype owner on 26 October 2026 ("proceed to implement the full requirements; make sure everything mentioned in the video or shown is captured"). **Built the same day**, every row of §5.1 marked "built in session 3". What still waits for Tasama's files: the bank templates (R5, R12), the master-data sample (R17), the element amounts per client (R6, values), the full golden check against Ahmed's October Excel (R31). The two slides that were only summarised in §1 (the onboarding phase and the offboarding phase) were read again at full resolution: every item is legible, so nothing in them waits for a file.

### 5.1 The register: every requirement in the recording, where it stands

| # | Said or shown (minute) | Status before | Built in session 3 |
|---|---|---|---|
| R1 | The 10th: the client's changes reach HR operations (allowances, deductions, leavers, joiners, attendance); HR operations keeps the master daily (1:41, 48:20) | Built (Wared, This month, Documents, WF-37) | — |
| R2 | The cut-off (15th or 16th): HR operations finalises the changes and hands them to payroll in the "payroll attachment", a log of every change (6:10, 49:37) | Built (WF-27 handover with each change and its source) | — |
| R3 | Two payroll members: one calculates, the other reviews; the clients are split between the specialists (1:41, 49:16) | Built (prepare, validate) | Each client names its payroll specialist and its HR operations specialist on Tasama's Months |
| R4 | ERP clients and manual clients; today every client is on an ERP (1:41, 50:30) | Built (HRMS per client) | — |
| R5 | After approval, the bank file in the bank's own format; Tasama uploads with the client's credentials, the client approves; the WPS file from the bank goes to Mudad (3:00, 58:40) | Built (§20, payroll-ops addendum §2) | Bank templates still wait for the files |
| R6 | Earnings: overtime, promotions, bonuses, air tickets, additional benefits; deductions: loan, no-show, disciplinary; the Elements tab: recurring basic, housing, transport, mobile; non-recurring retro ×4, business trip, bonuses, education, relocation, ticket, vacation, wellness; deductions advance housing recovery, COC, disciplinary, loan; advance housing itself as a non-recurring earning; a deduction can recur for 3 or 6 months (4:00, 27:28, 28:24, frame 31:00) | Partly | The element catalogue as data per client: kind, recurring or not, in the GOSI and EOS wage or not; shown on Client policies › Elements |
| R7 | The leave tracker: annual, sick and unpaid leave move the payroll (4:30) | Built (balances, unpaid days, Art. 117 sick pay) | — |
| R8 | The attendance sheet comes from the client as a summary of approved deductions, not the device file (4:40, 54:08) | Gap (item 23) | Attendance accepts the summary sheet: employee, late minutes, absent days, approved by; Hudoor prices it without matching |
| R9 | Leave tracking and attendance sit with HR operations (5:49) | Built (HR Operations lens) | — |
| R10 | The cut-off is mid-month because the client's approvals take the time, not the calculation (one or two days); the bank upload is two days before the 25th; the chain runs CHRO, administrative manager, CEO (7:23, 8:26) | Built (calendar stages, chain of two links) | A third link (CEO) is not in the prototype: no client persona for it. Noted |
| R11 | A client inbox with the agent's recommendation would speed approvals (8:53) | Built | — |
| R12 | Three banks: Al Rajhi, SNB and one more; their templates (11:13) | Waits for the files | — |
| R13 | The pain: the client's response time, and manual work; a new contract read into the master so Tasama only validates (12:06, 12:36) | Built (WF-37) | — |
| R14 | The year's calendar, shared each January, with weekends; pay on the 25th or before; the client approves or moves dates (13:25); shown to the client on login, with reminders; the team nudged before each client's deadline (14:39, 15:34) | Built in session 2 | — |
| R15 | The calendar sheet's columns: payroll, HR and finance responsible; bank file status; manual or system; the bank; the company; the headcount (frame 13:40) | Partly | Tasama's Months table gains the bank, the three responsible people (payroll, HR operations, the client's finance) and the bank file's state |
| R16 | After the prototype: synthetic data, then Tasama's GCP through D&T, a year replayed, two parallel months, cut-over (16:41) | Not prototype scope | — |
| R17 | The master data: name, ID, nationality, start date, position, updated from contracts (18:12) | Built | A sample file still welcome |
| R18 | The month's days (28, 30, 31) follow the month; payroll days 365 or 360 per client (19:30) | Built (day rate per client) | End of service at 360 (30-day months, a flat monthly cost) as a client policy, next to 365 |
| R19 | A joiner after the cut-off is paid the missed days as retro in the next month, with GOSI on it; a promotion's retro likewise; retro by element (22:00, frame 23:00) | Partly (back pay as one line, GOSI arrears) | Back pay split by element (basic, housing, transport, other) with the GOSI line |
| R20 | GOSI: 9.75% if registered before 3 July 2024, otherwise rising 0.5 a year to +2; a new rule can be added to the tool (24:09, 26:24) | Built | — |
| R21 | GOSI prorated by the days worked in a partial month (formula bar) | Gap (item 28) | A client policy switch; on at Saudi Coffee |
| R22 | GOSI does not accept more than 10% a year of wage increase for an employee over 50 (26:43) | Gap (item 10) | A check on the draft run: the contributory wage held at last year's plus 10%, the difference shown, Tasama HR operations named |
| R23 | Totals, net; EOS provision accrued with the monthly difference; previous months frozen; the increase lands in the month of the promotion (29:04, 35:35) | Built | — |
| R24 | The monthly reconciliation between the current and the previous month, the net difference explained (30:00) | Built (Mutabaqa) | — |
| R25 | Annual leave: entitlement, monthly accrual, carry-over, used, net balance to date (30:30, 32:30) | Built | — |
| R26 | Reports to finance after closing: the payroll summary (totals, no employee detail) by department and cost centre, and the provisions report (EOS and leave) (33:11, 56:27) | Partly (reports, Payroll costs) | Payroll › Reports and Payroll costs gain the summary by department and cost centre (a cost centre per department, from the client's finance) and the provisions report with the month's change; both download as Excel |
| R27 | The leave provision divides by 22 at this client; the month's cost nets the days used; the formula differs per client (34:56) | Gap (items 16, 31) | The divisor and the netting are client policy; 22 and netting at Saudi Coffee |
| R28 | EOS: half a month for the first five years (1,825 days), a full month after; the 360 formula gives a flat monthly cost (37:47, 39:26) | Built (365) | See R18 |
| R29 | Settlement by reason: under 2 years nothing, 2 to 5 a third, 5 to 10 two thirds, then full; finance provisions the full award (40:24, 41:37) | Built | — |
| R30 | Payslips generated for every employee from the approved sheet, in their layout: employer and location, person number and position, period and payment date, earnings and deductions by element, then IBAN, bank, currency and amount; employees ask for a payslip or a certificate in chat (42:44, 44:48, frames 43:30 to 46:00) | Built | The employee's payslip and its PDF carry the period, the payment date and the bank block (IBAN masked, bank, amount) |
| R31 | The files to come: bank templates, the master file, the payroll file with provisions, the elements list (45:33) | Waits | — |
| R32 | Roles: HR operations is the single point of contact and keeps the master; payroll calculates and reviews; the run goes back through HR operations, who uploads it to the client's system; the client's questions go to HR operations (48:20, 52:53) | Built in session 2 | — |
| R33 | Clients change hierarchy, approval cycle and formulas (a new CHRO changes the leave provision); HR operations carries the change to the system (50:30) | Built (policy versions, chain per contract) | — |
| R34 | Recruitment depends on the bundle (53:31) | Built (contract services) | — |
| R35 | Attendance deductions approved in the platform by the client's HR operations; a weekly lateness report to the manager before the cut-off (55:37) | Built monthly (Hudoor) | The weekly report is noted, not built |
| R36 | The ledger: the summary by department and cost centre; the transfer to the GL after the client's approval (56:27, 57:04) | Built (journals) | See R26 |
| R37 | Bank reconciliation before the GL: the bank's paid amount against the payroll, line by line, from the file Ahmed extracts; drag-and-drop in the tool (58:15, 1:00:21) | Partly (the return file is read line by line) | Payments shows the reconciliation: the bank's paid total against the payroll's net, each line matched, the differences named; the journals wait until it reconciles |
| R38 | Offboarding starts at the client (resignation, termination, end of contract); EOS by reason; HR operations tells payroll of the settlement, exits the employee from the medical insurance, prepares the letters, records the separation in the HRMS, which updates GOSI (1:04:31) | Partly | WF-19 and WF-20 `terminate` also end the medical insurance and GOSI and say so; the exit letters are listed |
| R39 | A woman who resigns within six months of marriage receives the full award (1:06:30) | Gap (item 25) | Wadaa's settlement gains the reason, with the full award (Art. 87) |
| R40 | The onboarding phase: activation request, Tasama shares the requirements, the client shares them, Tasama starts the onboarding in the system; 26 requirements in seven categories; SLA 9 working days; before the first cut-off (frame 1:40) | Gap | The activation checklist on the client onboarding: the 26 items, the ones the files cover ticked by Intiqal, the rest for Tasama HR operations to collect; the SLA counted |
| R41 | The offboarding phase: Tasama shares the payroll files and secures the sign-off; the client receives them through a shared folder and signs; Tasama deletes its files; the 20-item checklist; SLA 7 working days (frame 1:04:31) | Gap (item 26) | WF-39, Tasama Services › Handover, the scenario "Handing a client back" |

### 5.2 Data, with session 3

| Change | Why |
|---|---|
| `policy.eosYearDays` (365 or 360), `policy.leaveNetMonth`; `leaveDayDivisor` and `gosiProrate` now read by the engine through the client's terms | R18, R21, R27 |
| The engine: GOSI × pay days ÷ month days when the policy says so; the over-50 cap as a check; 30/360 service days for EOS at 360; the leave month cost net of the month's days used | R21, R22, R18, R27 |
| `hcm.element_types` seeded from the element catalogue per client; `domain/elements.ts` | R6 |
| Back pay written by element with the GOSI line | R19 |
| `hcm.departments.cost_centre` seeded per department | R26 |
| `layer.payments` gains the reconciliation (bank total, payroll net, matched lines, differences) | R37 |
| `layer.handovers` (client, checklist state, shared at, signed by, closed at); WF-39 | R41 |
| `tasama.activation_checklist` on the client onboarding; the activation request date starts the SLA | R40 |
| `clients.ts`: `team.payrollSpecialist`, `team.hrOps` (Nasser and Lama at every client). Confirmed 27 October: Ahmed's two specialists are Yasser and Imad; adding them as personas with the clients split between them is left for later in the project | R3, R15 |
| Seed: one Saudi employee over 50 at Red Sea Global with a 12% raise two months ago; Saudi Coffee's approved attendance summary beside its device export; no handover on the demo day, the scenario opens one at SEVEN | R22, R8, R41 |
| `SEED_VERSION` 16 → 17 | — |

### 5.3 Scenarios and checks

New scenario **Handing a client back** (Tasama level): the checklist shared, the client signs, Tasama closes inside the SLA. `npm run check` gains checks for the element catalogue, the over-50 check on the draft, the 360 EOS, the proration, the reconciliation, the handover and the activation checklist. The Director plays 21 scenarios.

**Effort:** about 2.5 Claude sessions.

**Added 27 October** after the owner's review: the bank file and the WPS file also download as a workbook for review (the lines in columns, the file as sent on a second sheet; the bank and Mudad still get the text file); the reminder editor in a case's pinned footer scrolls inside itself, it was unreachable below the fold.

**Not built, on purpose:** a third approval link (CEO) has no client persona; the weekly lateness report to the client's manager (R35) is noted, Hudoor runs monthly; GOSI's rates stay a table in `domain/payroll/gosi.ts` that a new rule extends (R20).
