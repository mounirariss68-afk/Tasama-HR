# Tasama HR Payroll: Requirements and Implementation Plan

> **Snapshot for the build, taken 22 October 2026** from the Claude Doc of the same name, which stays the living version: https://claude.ai/artifact/18BJTkhkc6hFkHqddrSaLk. The build reads this file and `design/payroll-addendum.md`; where they differ, the addendum decides.


Oct 22, 2026 · @Mounir Ariss

## The decision and what it covers

Tasama HR becomes the payroll system for the clients whose payroll Tasama runs, end to end: from the client's first input to the posted journal in Oracle Finance. Excel is retired for those clients. Odoo stays a fallback only.

- **Scope:** the payroll Tasama runs for its clients. Tasama's own staff come later, on the same platform, as one more client. Every requirement in Tasama's payroll documents, the HR process maps and the five problem areas raised by Tasama's payroll managers is included. The Arrow Odoo HR BRD, written for Tasama's own staff, is kept for that extension; its rules that any client payroll needs are included now. Each requirement below carries an id and its source.
- **Two kinds of client, one platform:**
  - Clients with no HR system (8 to 10 of Tasama's clients today): the platform holds the employee master and runs payroll. In the demo: Red Sea Global, SEVEN and Saudi Coffee.
  - Clients on an ERP (Oracle): the platform sits on top through its connector, and the same agents prepare, check and post. In the demo: ROSHN and Riyadh Air.
- **The rule behind it is unchanged:** agents prepare, check and recommend; the calculation is a deterministic engine driven by law and client policy, never a model's guess; a person approves every run, every payment file and every journal.
- **Two outputs:** a working prototype on synthetic data that demos every requirement, and the specification Bülent's team can build the production version from.

What the prototype cannot prove is listed in the open questions: real bank files, the real Mudad upload, Oracle Finance posting in Tasama's tenant, and hosting in Saudi Arabia.

## Today a payroll for a client with no system takes about 19.5 hours a month, mostly by hand

Tasama's own baseline puts a client without an ERP at 1,168 minutes a month against 105 minutes for an ERP client; the payroll step alone is 688 minutes. Three payroll staff run 17 to 20 clients of about 46 employees each.

| Stage | What happens today | Time today | Main problem |
| --- | --- | --- | --- |
| Inputs | HR Ops emails a cut-off reminder before the 15th; the client replies with contracts, allowance letters and resignations as PDFs | 5 min a client for the reminder; the reply has no deadline anyone enforces | Clients are late, Tasama chases, the 15th is missed |
| Master file | HR Ops keys each contract into the Excel master file and checks every field against the documents; payroll checks it again | about 50 + 30 min a contract, up to a day when data is missing | Re-keying, two checks of the same data, no audit trail |
| Leave and changes | Leave tracker in Excel; allowances, overtime, promotions, trips and exits arrive on paper forms (T.1 to T.15) signed manager, client HR, client CEO, finance | 12 min a client for leave | Forms and signatures by email; the salary sheet is updated by hand |
| Calculation | Last month's payroll file copied, changes applied, proration, GOSI, provisions by formula | 3 to 5 hours a client | Formulas differ by client; GOSI is set at the rate for Saudis insured before July 2024 |
| Reconciliation | Net pay compared with last month; every difference explained by hand | inside the 3 to 5 hours | Visual comparison only |
| Client approval | Payroll and summary exported to PDF, signed by the client | about 3 days | Email and wet signatures |
| Payment | A bank file per client in that bank's format, uploaded on the 20th or 21st; client finance approves in the portal; paid on the 24th to 26th | about 2 days for all clients | 6, 7 or 17 bank formats (the documents disagree) |
| Compliance | WPS file downloaded from the bank and uploaded to Mudad, often by the client | 15 to 30 min | Credentials sit with the client |
| Finance | Payroll summary, end-of-service and leave provisions sent to the client, then to finance; accounts mapped by hand in spreadsheets for Oracle Finance | about 5 days | Manual mapping, no direct finance access |

The payroll managers added five problems the documents do not cover: every client has its own HR policy, attendance deductions come from fingerprint data, clients enter changes late in the shared intake platform, the Oracle Finance upload is prepared by hand, and each bank has its own file format.

## Every requirement traces back to one of fourteen sources

Each requirement has an id (POL, ATT, INT, CAL, REC, PAY, FIN, AGT, PLT, DEM) and the code of the source it comes from. A requirement found in several sources lists them all.

| Code | Source | Date | What it contributes |
| --- | --- | --- | --- |
| MGR | Tasama client payroll managers' input | Oct 2026 | The five problem areas: policies, attendance, late intake, Oracle mapping, bank formats |
| PM | Tasama Payroll Process Manual | Aug 2025 | The three phases, steps, times, exceptions, naming conventions |
| DT | Payroll Digitalization BRD v1.2 (D&T) | Aug 2025 | MVP and future scope, acceptance criteria, Appendix A calculation logic |
| PA | D&T Payroll Automation Process deck | Aug 2025 | Current state, challenges, maturity, client counts |
| Q | D&T Payroll Automation Questionnaire | Oct 2025 | Banks, reports, tools in use |
| ROI | D&T Payroll Automation ROI deck | Aug 2025 | Task baselines, ROI method |
| BC | Payroll Business Case | Jan 2026 | Clients, staff, minutes per task |
| TPL | Payroll Templates and the July 2025 runs | Jan 2026 | Master data fields, payroll, bank sheet, provisions, as Tasama computes them |
| F | Forms T.1 to T.15, payslip, salary fixation letter, employment certificate | 2025 | Inputs, approval chains, output documents |
| HP | Tasama HR process maps | Nov 2025 | Leave, overtime, promotions, trips, exits, EOSB, transfers, allowances |
| HRU | HR Use Cases and HR Automation Opportunities | Nov 2025 | Volumes and times for HR Ops tasks |
| H1 | TASAMA × HUMAIN ONE deck | Oct 2025 | Data residency, system of record versus system of interaction |
| AR | Arrow BRD, Odoo Human Resources V4 | 2026 | Leave types, EOSB cases, GOSI by registration, retro pay, grade benefits, self-service, education deduction, entitlements report |
| LAW | Saudi Labor Law, GOSI, WPS rules (research) | Oct 2026 | Statutory rules and limits, linked in the sections below |

The Magrabi ERP payroll requirements (another client) were used as a completeness checklist; items they add are tagged MG. Form T.4 is missing from the set. The Arrow BRD's recruitment steps (hiring request, job post, applications, interviews) are already covered by the platform's hiring workflows; only the offer-to-contract step is new and sits under intake.

## Client HR policy becomes 27 rule sets the engine reads, one version per client

Each client's handbook sets the rules above the legal minimum, and those rules drive payroll, attendance, leave, bonuses, exits and approvals. The platform stores a policy as itemised rules with effective dates, never as free text the engine has to interpret. Where a client's policy is silent, the legal default applies and is marked as a default.

### The policy dimensions and what each one drives

| # | Dimension | What varies between clients | Legal floor or limit | What it drives |
| --- | --- | --- | --- | --- |
| 1 | Working week | 40, 45 or 48 hours; days; shifts; Ramadan hours | Max 48 hours a week, 8 a day; 6 a day in Ramadan for Muslims ([Labor Law Art. 98](https://www.hrsd.gov.sa/sites/default/files/2023-02/Labor.pdf)) | Hourly rate, overtime threshold, lateness |
| 2 | Attendance and lateness | Grace minutes, rounding, penalty table or minute-based deduction, repeat window | Fine for one violation max 5 days' wage; fines max 5 days' wage a month (Art. 70) | Attendance deductions |
| 3 | Overtime | Who is eligible, pre-approval, rate, weekend and holiday rate, time off instead, monthly cap | Hourly wage plus 50% of basic hourly wage (Art. 107); time off by agreement since Feb 2025 | Overtime pay |
| 4 | Day rate | Monthly ÷ 30, ÷ calendar days, or ÷ working days | None set | Proration, deductions, leave encashment |
| 5 | Pay elements | Housing, transport, mobile, other; fixed amounts or % of basic | GOSI base = basic + housing | Gross pay, GOSI wage, EOSB wage |
| 6 | Housing paid in advance | Monthly, or a year in advance recovered monthly | Deduction limits (Art. 92, 93) | The template's advance-housing deduction |
| 7 | Probation | 90 or 180 days, extension rules | Max 180 days since Feb 2025 ([Al Tamimi](https://www.tamimi.com/news/key-amendments-to-saudi-arabias-labour-law/)) | Alerts, exit terms |
| 8 | Annual leave | 21 to 30+ days, when it rises, accrual, carry-forward cap, negative balance | 21 days, 30 after 5 years; unused leave paid at exit (Art. 109, 111) | Leave balance, leave provision, final settlement |
| 9 | Sick leave | Company top-up above the statutory bands | 30 days full, 60 days at 75%, 30 unpaid in a year (Art. 117) | Pay during sickness |
| 10 | Other leave | Marriage, bereavement, paternity, Hajj, maternity, Iddah, exams, unpaid | Marriage 5, bereavement 5 (3 for a sibling), paternity 3, Hajj 10 to 15 once, maternity 12 weeks | Paid or unpaid days; unpaid over 20 days stops service counting (Art. 116) |
| 11 | Holidays | Eid and national days, work on a holiday | Holiday work counts as overtime (Art. 107) | Overtime |
| 12 | Salary advances and loans | Multiple, basis, minimum service, term, committee | Instalment max 10% of wage (Art. 92) | Deductions |
| 13 | Education allowance | Amount, children, paid monthly or paid up front and recovered | None | Allowance or recovery schedule |
| 14 | Air tickets | Annual, every two years, none; family; class; cash instead | None | Ticket accrual, provision, payment |
| 15 | Business trips | Per diem by grade and destination | None | Off-cycle payments |
| 16 | Bonus | Target % by grade, rating multiplier, proration for joiners and leavers, eligibility date, payment month | None | Bonus run |
| 17 | Performance and increments | Merit matrix by rating, effective date | None | Salary changes, back pay |
| 18 | Grades | Benefits tied to grade (leave, tickets, allowances) | None | Entitlements change when the grade changes |
| 19 | Promotions | Minimum increase, effective date | None | Mid-month salary change |
| 20 | End-of-service wage | Which regular allowances count; commissions and variable pay may be excluded (Art. 86); more generous terms allowed. A basic-only clause is below the law and is flagged | Last actual wage, basic plus regular allowances (Art. 2, 84); half a month a year for 5 years, a month after; resignation fractions (Art. 85, 87) | EOSB, EOSB provision |
| 21 | Notice | Notice days by grade, pay in lieu | 60 days employer, 30 employee (indefinite contracts) | Final settlement |
| 22 | Discipline | The client's internal penalty regulation | HRSD table of violations; fines capped (Art. 66, 70) | Fines as deductions |
| 23 | Payroll calendar | Cut-off day, pay day, approval deadline | Wages paid monthly (Art. 90) | Reminders, chasing, run dates |
| 24 | Approval matrix | Who approves what, limits, delegates | None | Workflows, the delegated approver |
| 25 | GOSI handling | Company absorbs the employee share or not | Rates by insured status ([GOSI rates](https://hrflare.com/blog/gosi-2024-new-law/)) | Net pay |
| 26 | Medical insurance | Class, dependants, employee share | CCHI cover | Deduction if the employee pays |
| 27 | Final pay timing | Paid on the last working day, or within the legal deadline | 1 week after termination, 2 after resignation (Art. 88) | Settlement deadline |

### Synthetic policies for the five demo clients

The current demo clients keep the policy values they already have. The remaining dimensions are set so that each client differs.

| Dimension | ROSHN | Riyadh Air | Red Sea Global | SEVEN | Saudi Coffee |
| --- | --- | --- | --- | --- | --- |
| Working week | 40 h, Sun to Thu | 40 h office; crew and ground on rosters | 48 h on site, 6 days | 40 h; venue staff on shifts | 48 h, plants and cafés on shifts |
| Lateness | 10 min grace, HRSD penalty table | 5 min grace, minute-based deduction | 15 min grace, penalty table, site supervisors approve | 10 min grace, 3 lates = 1 day's deduction | No grace, minute-based deduction, rounded to 15 min |
| Overtime | Grades G01 to G08, pre-approved, cap 30 h a month | Rostered staff; holiday work at 2× the hourly wage | All site staff; time off instead by agreement | Event weekends at legal rate | Legal rate, cap 40 h a month |
| Day rate | ÷ 30 | Calendar days | ÷ 30 | Calendar days | ÷ 30 |
| Allowances | Housing 25%, transport 10%, mobile fixed | Housing 25%, transport 10%, staff travel | Housing 30% or company housing on site, transport 10%, remote-site 15% | Housing 25%, transport 10% | Housing 20%, transport 10%, shift 5% |
| Housing in advance | Annual, recovered monthly | Monthly | Company housing, none | Monthly | Monthly |
| Probation | 90 days | 180 days | 90 days | 90 days | 90 days |
| Annual leave | 25, then 30 after 5 years; carry 10 | 30, then 35; carry 15 | 26, then 30; carry 10 | 22, then 30; carry 5 | 21, then 30; no carry-forward |
| Sick leave top-up | 30 days at full pay in the 75% band | 60 days | None | 15 days | None |
| Advances | 2 months' basic, 18 months | 1 month's gross, 12 months | 1 month's basic, 12 months | 1 month's gross, 12 months | Half a month's gross, 6 months, 12 months' service |
| Education | SAR 20,000 per child, 2 children, paid monthly | SAR 25,000, 3 children, paid up front, recovered over 10 months | SAR 30,000, 3 children, paid by term | None | None |
| Tickets | Annual, economy, family | Staff travel, no cash | Annual, cash in lieu allowed | Every two years | None |
| Bonus | 15% of basic at rating 3, prorated | 10%, paid in March | 10%, site bonus quarterly | 12%, paid in two halves | Fixed half-month, paid before Ramadan |
| EOSB wage | Basic + fixed allowances; sales commission excluded (Art. 86) | Basic + all fixed allowances, plus one month's basic after 10 years (more generous) | Basic + fixed allowances, remote-site allowance included | Handbook says basic only; flagged as below the law, paid on the full wage | Total, legal formula |
| Notice | 60 days for G11+, else legal | 90 days for pilots and G11+ | Legal | Legal | Legal |
| Cut-off and pay day | 15th, paid 25th | 12th, paid 24th | 15th, paid 26th | 15th, paid 25th | 10th, paid 27th |
| GOSI | Employee share deducted | Employee share deducted | Employee share deducted | Company absorbs the share for grades G01 to G04 | Employee share deducted |
| Final pay | On the last working day | Legal deadline | On the last working day | Legal deadline | On the last working day |

Each synthetic policy is generated as a readable handbook in Arabic and English, so the ingestion tool can be demoed on it.

### Requirements

| Id | Requirement | Source |
| --- | --- | --- |
| POL-01 | Hold a policy per client as itemised rules on the 27 dimensions, each with a value, an effective date and the clause it came from | MGR, DT, HP |
| POL-02 | Ingest a client handbook (PDF or Word, Arabic or English): split it into clauses, map each clause to a dimension, extract the values | MGR |
| POL-03 | Flag any rule below the legal floor, with the article, and block it from use until a person decides | MGR, LAW |
| POL-04 | List the dimensions the handbook does not cover and apply the legal default, marked as a default | MGR |
| POL-05 | A person reviews and approves the itemised policy before the engine uses it; every value shows its source clause | MGR, DT |
| POL-06 | Version policies with effective dates; a change applies to runs after its date; show the difference between versions | DT, MG |
| POL-07 | Compare policies across clients on any dimension | MGR |
| POL-08 | Answer questions from the client's policy with the clause cited (Rafeeq, Murshid) | Platform |
| POL-09 | Grade tables per client: benefits by grade change automatically when the grade changes | AR |
| POL-10 | Approval matrix per client, including the client's delegated approver for each change type | HP, F |
| POL-11 | Payroll calendar per client: cut-off day, pay day, approval deadline, public holidays | PM, MGR |
| POL-12 | Five synthetic handbooks, one per demo client, differing as in the table above, ingested in the demo | MGR |
| POL-13 | Benefit matrix per client for business trips, per diem and allowances by grade, checked on every request | HP, HRU |

## Attendance data becomes deductions only after the client's approver confirms them

Clients export fingerprint or face-recognition punches. The platform reads the export, matches each punch to the employee's schedule, removes what leave, business trips and approved permissions explain, and prices what is left with the client's own penalty rules. Nothing is deducted until the employee has had the chance to justify an absence and the client's delegated approver has confirmed the list.

**The legal frame.** A deduction for absence or lateness is a fine under the client's approved internal regulation. One violation may cost at most 5 days' wage, and fines in a month at most 5 days' wage ([Labor Law Art. 66, 70](https://www.hrsd.gov.sa/sites/default/files/2023-02/Labor.pdf)). All deductions together stay within half the wage (Art. 92, 93). The HRSD table of violations sets escalating penalties by occurrence: for example, lateness under 15 minutes is a written warning first, then 5%, 10% and 20% of a day's wage, plus the minutes lost ([table of violations](https://mulem.com.sa/en/schedule-of-violations-and-penalties/violations-related-to-working-hours/)). Absence of more than 15 consecutive days, or more than 30 days in a contract year, allows dismissal under Article 80 after a written warning.

**How the agent prices one day.** The day rate and hourly rate follow the client's policy: for example, SAR 24,000 ÷ 30 = SAR 800 a day, ÷ 8 hours = SAR 100 an hour ([worked example](https://www.qoyod.com/en/blog/labor-market/deduct-absences-and-delays-from-the-salary/)).

| Id | Requirement | Source |
| --- | --- | --- |
| ATT-01 | Upload attendance exports per client (CSV or Excel from fingerprint or face devices) with a column map saved per client and device | MGR, AR |
| ATT-02 | Validate the file: unknown employee numbers, duplicate punches, missing punch-outs, dates outside the period; show what was rejected and why | MGR |
| ATT-03 | Assign each employee to a working schedule (fixed, shift, roster, Ramadan hours) and compute late minutes, early leaves, missing hours and absent days against it | AR, MGR |
| ATT-04 | Remove what approved leave, business trips, public holidays, permissions and remote days explain | HP, AR |
| ATT-05 | Apply the client's rules: grace minutes, rounding, minute-based or penalty-table method, repeat window, first-occurrence warning | MGR, LAW |
| ATT-06 | Enforce the legal caps: 5 days' wage per violation, 5 days' wage of fines a month, half the wage for all deductions; carry the excess forward | LAW |
| ATT-07 | Send each affected employee their exceptions through Rafeeq to justify (absence approval with an attachment), and their manager to accept or reject | AR, HP |
| ATT-08 | Send the priced list to the client's delegated approver; only approved lines reach the payroll run | HP |
| ATT-09 | Warn the client and HR Ops at 10 consecutive or 20 scattered absence days (the written warning that Article 80 requires) | LAW |
| ATT-10 | Also count overtime hours worked beyond the schedule, for the overtime approval flow | HP, HRU |
| ATT-11 | Report per client and month: late minutes, absent days, deductions, warnings, trend | MGR, MG |
| ATT-12 | Demo: upload a month of punches for one client and watch the agent price it under that client's rules | MGR |

## Clients confirm changes the agents already prepared, instead of typing them before the 15th

Most of what a client sends each month can be known or drafted in advance: a hire the client approved in the hiring module, a probation ending, a contract expiring, a leaver whose last day is set, leave already approved in the platform. The intake agent prepares each expected change and asks the client to confirm it; the client only adds what the platform could not know. A hire is entered once, when the offer is accepted, and the same record feeds the contract, onboarding, GOSI registration and payroll.

**How the cut-off stops being missed:**

1. **Day 1 of the cycle:** the agent opens the month's change list for each client, pre-filled with every expected change.
2. **Reminders at 7, 3 and 1 day before the cut-off**, to the client HR contact and the delegated approver, in Teams or e-mail, each naming what is still unconfirmed.
3. **At the cut-off:** "no other changes" is one click. Anything still unconfirmed escalates to the client sponsor and to Tasama's account owner; Raqeeb counts it against the client's cut-off service level.
4. **After the cut-off:** a late change is not lost. It goes into next month as back pay, or into an off-cycle run if the client's policy says so. The client sees the effect before deciding.
5. **Basira** spots clients who are late month after month, and the cause.

| Id | Requirement | Source |
| --- | --- | --- |
| INT-01 | Client portal inside Tasama HR replacing the email and the separate intake platform: client HR and managers submit joiners, changes, leavers, terminations, allowances, overtime, trips, promotions, transfers | MGR, PM, HP |
| INT-02 | Hiring module: when an offer is approved and accepted, the contract agent drafts the employment contract from the client's template and policy (salary, allowances, hours, probation, notice, confidentiality and other clauses, contract type, start date) for e-signature | MGR, AR |
| INT-03 | The signed contract's data creates the employee record once, which then feeds onboarding (Dalil: Qiwa contract, GOSI, Muqeem, medical insurance), the first payroll (prorated) and the master file | MGR, DT, HP |
| INT-04 | Read contracts that clients send (PDF, Arabic or English): extract the fields, keep the extracted values, a person reviews before saving | DT, PA |
| INT-05 | Pre-fill expected changes each month: joiners, probation ends, contract expiries, approved leave, promotions, leavers, Iqama and ID expiries | MGR, DT |
| INT-06 | Payroll calendar per client with reminders at D-7, D-3, D-1, escalation at the cut-off, "no other changes" in one click | PM, MGR |
| INT-07 | Late changes after the cut-off are routed to next month as back pay or to an off-cycle run, per policy, with the effect shown to the client | PM, DT |
| INT-08 | Upload in any form: a form, a PDF, an Excel list, a chat message; bulk upload for many employees | DT, MGR |
| INT-09 | Validation at entry: unique employee number per client, National ID or Iqama format (1 or 2 first), IBAN checksum and bank, duplicate ID or IBAN across clients warned, manager must be active in the same client, mandatory fields | DT, TPL |
| INT-10 | The same person may work for several clients under separate employee numbers | DT |
| INT-11 | Status changes (active, inactive, terminated) need a reason and a date | DT |
| INT-12 | Master data fields as in Tasama's template: names in Arabic and English, ID, nationality, gender, marital status, dependants, hire date, probation, birth date, Saudi or expat, passport, contacts, manager, position, location, organisation, grade, acting role, salary elements, bank, IBAN, education, contract dates, leave entitlement, project | TPL, AR |
| INT-13 | Religion is not held on the employee record; it is asked only when an Iddah leave is requested (personal data law) | AR, LAW |
| INT-14 | Documents stored per employee (contract, ID, IBAN certificate, forms) with Tasama's naming conventions and retention | PM |
| INT-15 | Employee self-service through Rafeeq: leave, advances, absence justification, salary letters in Arabic and English, bank account change, personal data update, experience certificate, ticket, allowance, resignation | AR |
| INT-16 | Requests from employees without an account are raised by their manager | AR |
| INT-17 | For ERP clients, changes arrive as events from the client's HRMS through the connector, with no re-keying | Platform, H1 |
| INT-18 | Migration before go-live: clients, employees, and history loaded from the client's current Excel payroll file and rebuilt from past WPS files; invalid data flagged and fixed first; each record traceable to its source | DT |
| INT-19 | Contract expiry and probation-end alerts to the client a set period ahead | AR, DT |
| INT-20 | Month-end leave reconciliation: the leave tracker is sent to the client to reconcile and approve before the run, and feeds the leave provision | HP, PM |
| INT-21 | Exit tasks from one approved resignation or termination: resignation before the cut-off, Labor Law check of a termination, clearance form, medical insurance cancelled, GOSI exclusion, payroll profile closed, file archived, end-of-employment certificate | HP, F, AR |
| INT-22 | The paper forms become screens with the same fields and the client's approval chain (T.1 allowances, T.2 trips, T.3 overtime, T.5 residency, T.6 resignation, T.7 information, T.8 start of work, T.9 probation, T.10 salary change, T.11 termination, T.12 clearance, T.13 to T.15 for the CEO) | F |

## The engine reproduces Tasama's Excel to the riyal and goes further only where the law has moved

The first acceptance test is Tasama's own template: the July 2025 sample run must come out identical. Every formula in the template was read; it is sound for the cases it was built for. Three points need the engine to go further or need Tasama to confirm, and one claim in the D&T BRD does not match the template:

- **GOSI for Saudis first insured on or after 3 July 2024.** The template applies 9.75% employee and 11.75% employer to every Saudi. That is right for everyone insured before that date, and it was right for every Saudi in the July 2025 sample. Saudis first insured after it pay 10.25% / 12.25% from July 2025 and 10.75% / 12.75% from July 2026, so the engine reads each employee's first registration date. The template also treats GCC nationals as expats (2% employer); the engine applies their home-country scheme.
- **End of service in the payroll calculation sheet.** The provisions sheet switches to a full month a year after five years, as Article 84 requires, and its monthly provision is right. The end-of-service columns of the payroll calculation sheet stay at half a month throughout. The engine uses one end-of-service calculation for both.
- **Leave provision per day.** The provisions sheet values a leave day at monthly salary ÷ annual entitlement days, not ÷ 30. For a 25-day entitlement that books about 20% more than ÷ 30 would. This may be Tasama's chosen method; it is asked before the engine copies it. Separately, the D&T BRD says the day rate is "fixed at 31"; the template does not do that. It lets each client choose calendar days or 30, and the engine keeps that choice.

**GOSI rates the engine applies** (contribution wage = basic + housing, at most SAR 45,000 a month; rates confirmed by [GOSI's schedule as reported by Okaz](https://www.okaz.com.sa/local/na/2251973), [Fragomen](https://www.fragomen.com/insights/saudi-arabia-amended-social-security-contributions-for-saudi-nationals.html) and [hrflare](https://hrflare.com/blog/gosi-2024-new-law/)):

| Insured group | From | Employee | Employer |
| --- | --- | --- | --- |
| Saudi, insured before 3 Jul 2024 | Unchanged | 9.75% | 11.75% |
| Saudi, first insured on or after 3 Jul 2024 | 3 Jul 2024 | 9.75% | 11.75% |
|  | 1 Jul 2025 | 10.25% | 12.25% |
|  | 1 Jul 2026 | 10.75% | 12.75% |
|  | 1 Jul 2027 | 11.25% | 13.25% |
|  | 1 Jul 2028 | 11.75% | 13.75% |
| Non-Saudi | All | 0% | 2% (occupational hazards) |
| GCC national | Home-country scheme | per scheme | per scheme |

What decides the group is the person's first insured date anywhere, not the hire date at the client. Rates are confirmed with GOSI before go-live.

| Id | Requirement | Source |
| --- | --- | --- |
| CAL-01 | Pay elements configurable per client: earnings, allowances, deductions, recurring or one-off, fixed or % or formula, GOSI-able, EOSB-able, GL account, cost centre; new elements can be created and reused | DT, MG, TPL |
| CAL-02 | Gross to net per employee per month: prorated components, earlier-period components, other earnings, GOSI, advance housing, other deductions, net | TPL, DT |
| CAL-03 | Proration from the later of start date and month start to the earlier of end date, contract end and month end, on the client's day-rate rule | TPL, DT |
| CAL-04 | Mid-month salary change: split the month at the effective date (old rate ÷ 30 × 14 days + new rate ÷ 30 × 16 days in the BRD's example) | AR |
| CAL-05 | Back pay: a change entered with a past effective date recalculates every closed month since then and pays the difference; EOSB is recalculated from the effective date; closed runs are never rewritten | AR, MG, PM |
| CAL-06 | GOSI by insured group and dated rate table, capped wage, employee and employer shares, company-absorbed share where the policy says so | AR, PM, LAW |
| CAL-07 | Overtime at the client's rule, never below the legal rate; holiday work as overtime; time off in lieu by agreement | HP, F, LAW |
| CAL-08 | Attendance deductions from approved attendance lines (section above) | MGR |
| CAL-09 | Sick leave pay by the legal bands over a rolling year, plus the client's top-up | AR, LAW |
| CAL-10 | Unpaid leave: no pay for the days; over 20 days stops service counting and is reflected in GOSI | AR, LAW |
| CAL-11 | Annual leave accrual by years of service and grade; balance, carry-forward cap, encashment at exit | AR, TPL |
| CAL-12 | Deductions in the legal order, within the 10% loan instalment and 50% overall limits; the excess carried to next month | LAW, AR |
| CAL-13 | Advances and loans: amount, instalments, schedule, remaining balance, stop when repaid | AR, Platform |
| CAL-14 | Education allowance recovered monthly: amount, months, instalment, stop when recovered, remaining balance shown | AR |
| CAL-15 | Housing paid in advance and recovered monthly | TPL |
| CAL-16 | Grade change updates leave entitlement, tickets, housing, transport and grade-linked components automatically | AR |
| CAL-17 | Air ticket entitlement accrued by policy, paid as a ticket or cash | AR, Platform |
| CAL-18 | Bonus run: target by grade, rating multiplier, proration for joiners and leavers, eligibility date | MGR |
| CAL-19 | Off-cycle runs for one or many employees: bonuses, allowances, tickets, business trips, relocation, school fees, end of service; same bank templates and approvals; no GOSI or loan deductions; no WPS file | DT |
| CAL-20 | Trainees: fixed amount for a fixed period, paid off-cycle, no allowances, overtime or EOSB, stops at the end date, reported separately | DT |
| CAL-21 | EOSB at exit: half a month a year for five years, a month after; resignation one third (2 to 5 years), two thirds (5 to 10), full (10+), none under 2; full for Article 87 cases; none under Article 80; service counted in years, months and days from the joining date | AR, LAW |
| CAL-22 | Final settlement: salary to the last working day, leave encashment, EOSB, other entitlements, minus advances, loans and other debts; blocked until clearance is complete | AR, HP |
| CAL-23 | Monthly EOSB provision per employee at the correct rate for years 6 onwards, with accumulated balance | TPL, DT, LAW |
| CAL-24 | Monthly annual-leave provision per employee: balance × daily cost, and the month's leave cost | TPL, DT |
| CAL-25 | Ticket provision where the policy grants tickets | AR |
| CAL-26 | Every figure explains itself: inputs, rule, clause and law article behind each line | DT, Platform |
| CAL-27 | Calculation rules and policies versioned; a change applies only to runs after its approval | DT |
| CAL-28 | SAR only; amounts rounded to 2 decimals, totals summed consistently | DT |
| CAL-29 | Acceptance: the July 2025 template run reproduced exactly, then a parallel run of at least one real month per pilot client against Tasama's Excel | TPL, H1 |
| CAL-30 | A raise or promotion during the year re-measures the accumulated end-of-service and leave provisions at the new wage from its effective date; the catch-up is booked as its own line, back-dated changes included, and shown to the payroll manager before the run | MGR meeting |
| CAL-31 | Performance results reach payroll without re-keying: each rating gives the merit increase from the client's matrix and the bonus multiplier; the client approves them as dated changes, and a passed effective date becomes back pay | MGR meeting, POL |

## Every difference from last month arrives explained, and the client approves in the platform

Today the payroll team compares each net pay with last month by eye and writes a note for every difference. The reconciliation agent does the comparison, traces each difference to the change that caused it (a joiner, a raise, an overtime line, a deduction), writes the reason, and leaves only the unexplained ones for a person. The client then approves the register on screen, which replaces the signed PDF and its three days of email.

| Id | Requirement | Source |
| --- | --- | --- |
| REC-01 | Pre-run checks block missing required fields, duplicate employee numbers, invalid IBAN or ID, leavers still paid, changes not reflected, deductions over the cap, missing GOSI lines (Hisab today) | DT, Platform |
| REC-02 | A visible calculation step: every pay element confirmed before reconciliation | DT |
| REC-03 | Compare gross, deductions and net with the last approved run per employee and in total; also EOS balances and provisions | DT, PM |
| REC-04 | Explain each difference by tracing it to its source change; only unexplained differences go to a person | PM, PA |
| REC-05 | A run cannot be marked ready while any difference is unexplained and has no justification | DT |
| REC-06 | Thresholds per client for which variances need a person's attention | DT |
| REC-07 | Reconcile the payroll with the master data, and the bank file with the payroll (totals and per employee) | PM, PA |
| REC-08 | Tasama review: preparer and validator are different people (the template's "prepared by, validated by, approved by") | TPL |
| REC-09 | Client approval in the portal: summary and detail, approve or return with a reason; the approval is recorded with who and when; PDF and Excel exports still available | PM, DT |
| REC-10 | Chase the client's approval with reminders and escalation, with the payment date in view | PM, MGR |
| REC-11 | Errors found after approval are corrected in the next run with a reconciliation note; never by reopening the approved run | PM |
| REC-12 | Payslips per employee from Tasama's template (income, deductions, hours, bank, net), bilingual, delivered to employees through the platform instead of bulk email to client HR | F, DT, PM |
| REC-13 | Salary fixation letter and employment certificate generated from the master data on request (Wathiqa) | F |
| REC-14 | Leave, tickets and end-of-service entitlements report per employee: accrued, used, remaining leave; ticket value; years of service, wage used and EOSB to date; exportable | AR |
| REC-15 | Archive each month's run, approvals, bank files, WPS files and reports per client, retained 5 years | PM, DT |
| REC-16 | Notifications in the portal and by email: payroll ready for approval, generated, errors | DT |
| REC-17 | Exports with the naming convention ClientCode\_FileType\_YYYYMM\_vN | DT |

## Bank formats become a setting, built on the one layout that is public: the WPS wages file

Saudi banks do not publish their corporate payroll upload templates; Al Rajhi's payroll page, for example, offers "upload of bulk payroll files" and feedback files but no layout ([Al Rajhi payroll](https://www.alrajhibank.com.sa/en/Business/Cash-Management/payroll)). Each bank gives its template to the corporate customer. What is public is the Ministry's WPS wages file specification, which every bank's output must follow ([WPS specification](https://www.hrsd.gov.sa/sites/default/files/2017-06/WPS%20Wages%20File%20Technical%20Specification.pdf)). So the platform holds a bank format registry: the WPS layout and Tasama's own bank sheet ship as built-in formats, and each bank's template is added as a definition from the file Tasama already uses with that bank.

**The WPS layout in short:** a tab-separated text file in UTF-8. A header carries the establishment's bank (SARIE id), establishment id, debit account, currency SAR, value date, total, a unique file reference and the Ministry establishment id. One line per employee carries net amount, IBAN, name, beneficiary bank, basic, housing, other earnings, deductions and ID number (1 for Saudis, 2 for Iqama). The total must equal the sum of lines, or the bank rejects the whole file. The bank returns a signed file about five business days after the value date, with a status and return code per line (invalid account, closed account, expired ID, name mismatch).

**Banks in the registry at the start** (codes to confirm with each bank): Saudi National Bank, Al Rajhi Bank, Riyad Bank, SAB, Banque Saudi Fransi, Arab National Bank, Alinma Bank, Bank Albilad, Bank AlJazira, Saudi Investment Bank, Gulf International Bank Saudi Arabia ([list of Saudi banks](https://en.wikipedia.org/wiki/List_of_banks_in_Saudi_Arabia)). Tasama's documents mention 6, 7 and 17 banks in use; Tasama confirms the list and supplies each template.

| Id | Requirement | Source |
| --- | --- | --- |
| PAY-01 | Bank registry: name, SARIE and SWIFT codes, IBAN bank code, file format, channel, cut-off times | MGR |
| PAY-02 | Format definitions as data, not code: file type (CSV, tab, fixed-width, Excel), encoding, header, line and footer fields, order, length, padding, decimal and date formats, Arabic or English names | MGR, Q |
| PAY-03 | Built-in formats: the WPS wages file and Tasama's current bank sheet; new formats added by mapping a sample file Tasama uploads | MGR, TPL, LAW |
| PAY-04 | Each client has its paying bank and template; a change applies to future runs only | DT |
| PAY-05 | Generate the transfer file per client from the approved run; employees paid at other banks carry their bank code | PM, DT, LAW |
| PAY-06 | Validate before release: total equals the sum of lines, unique file reference, valid IBANs, no duplicate lines, value date rules | PM, LAW |
| PAY-07 | Tasama initiates the upload; the client's finance team gives the second and third approvals in the bank portal and picks the date; the platform tracks those approvals | PM |
| PAY-08 | Read the bank's feedback and WPS return files: mark each payment paid or failed with its reason; failed lines corrected and paid in a new file after client approval | PM, DT, LAW |
| PAY-09 | Store the signed WPS file as the bank's receipt for the run | DT |
| PAY-10 | Reconcile the WPS file with the transfer file automatically | Q, PA |
| PAY-11 | Mudad: upload the WPS file (or confirm the bank's automatic upload, as Al Rajhi offers), track status, store the acknowledgement, track the client's Mudad compliance | PM, DT |
| PAY-12 | Hold the client's Mudad and bank portal access in the platform's credential vault instead of chasing the client every month; when the client keeps them, chase with the run's deadline | PM |
| PAY-13 | Payment status visible per run: pending, in progress, completed, failed | DT |
| PAY-14 | Production: bank host-to-host or API links where the bank offers them (future scope in the D&T BRD) | DT |

## The approved run becomes a balanced Oracle Finance journal without a spreadsheet in between

Today someone maps every payroll line to the client's chart of accounts in a spreadsheet and shapes it for upload. The platform keeps one mapping per client (pay element and cost centre to account segments), builds the journal from the approved run, checks that it balances, and produces Oracle's journal import file. Oracle Fusion loads journals through its File-Based Data Import template into the GL\_INTERFACE table, then runs Load Interface File for Import and Import Journals; rejected rows are corrected and reloaded ([Oracle journal import](https://docs.oracle.com/en/cloud/saas/financials/25d/faugl/how-journal-import-data-is-processed.html)).

**The journals a month produces:**

| Journal | Debit | Credit |
| --- | --- | --- |
| Payroll accrual | Salary and each allowance expense, by cost centre and project; GOSI employer expense | Salaries payable (net); GOSI payable (employee + employer); advances and loans receivable; other deductions |
| Provisions | EOSB expense; annual leave expense; ticket expense | EOSB provision; leave provision; ticket provision |
| Payment | Salaries payable | Bank (by the client's paying account) |
| Final settlement | EOSB provision used; leave provision used; salaries payable | Bank |

| Id | Requirement | Source |
| --- | --- | --- |
| FIN-01 | Chart of accounts per client: segments, values, cost centres, projects, GL accounts | MGR, HP |
| FIN-02 | Mapping per client: pay element × cost centre (or department, project) → account combination; versioned; changes approved | MGR, MG |
| FIN-03 | The finance agent proposes the mapping from the client's past manual mapping spreadsheets; a person approves it | MGR |
| FIN-04 | Build the four journals each month from the approved run and the provisions; reject a journal that does not balance | MGR, MG |
| FIN-05 | Produce the Oracle journal import file (GL\_INTERFACE layout: ledger, accounting date, source, category, currency, segments, entered debit and credit, group id, line descriptions) as CSV in the zip Oracle expects | MGR, LAW |
| FIN-06 | Production: load directly through Oracle's integration services, read back the import status, and show rejected rows for correction | MGR |
| FIN-07 | When a department or position is created or an employee transfers, the new cost centre is mapped to the right chart-of-accounts segment and GL accounts before payroll runs | HP |
| FIN-08 | Allocate one employee's cost to several cost centres by percentage | MG |
| FIN-09 | A project field on the employee record, carried into the journal for project costing | AR |
| FIN-10 | Finance reports per client: payroll summary, EOSB and leave provisions (as in the July 2025 samples), approved by the client, then sent to finance; finance gets read access in the platform | PM, TPL, PA |
| FIN-11 | Reports for regulators and audit: GOSI, WPS compliance, payroll register, audit trail export | DT |
| FIN-12 | Clients not on Oracle get the same journals as an Excel or CSV file for their accounting system | MGR |

## Eight new agents join the existing ones, and none of them can release money

An agent reads, prepares, checks, explains and chases. The payroll arithmetic is done by the rules engine, so the same inputs always give the same pay. People approve the policy, the run, the payment file and the journal. Autonomy follows the platform's rungs: A1 recommends, A2 prepares for a person to approve, A3 acts and a person can reverse.

| Agent | New or existing | What it does in payroll | Rung | What it may never do |
| --- | --- | --- | --- | --- |
| Nizam, policy reader | New | Reads a client handbook, itemises it on the 27 dimensions, flags rules below the law and gaps | A1 | Activate a policy |
| Aqd, contracts | New | Drafts the employment contract from an accepted offer; reads contracts clients send | A2 | Send a contract for signature without HR's approval |
| Wared, intake and cut-off | New | Pre-fills each month's expected changes, reminds, escalates, routes late changes | A3 | Submit a change on the client's behalf |
| Hudoor, attendance | New | Reads punches, applies schedules and the client's penalty rules, collects justifications | A2 | Deduct before the client's approver confirms |
| Hisab, payroll run | Existing, extended | Runs the engine and the pre-run checks, calculates the EOSB, leave and ticket provisions, explains every line | A2 | Approve its own run |
| Tamin, GOSI | New | Insured group and rate per person, registration and exclusion tasks, checks the monthly GOSI bill against payroll | A2 | Register or exclude without the person's approval |
| Mutabaqa, reconciliation | New | Explains every difference from last month and between payroll, bank file and WPS file | A2 | Mark a run ready with an unexplained difference |
| Tahweel, payments | New | Builds bank files, reads feedback and WPS files, handles Mudad, follows up failed payments | A2 | Release a payment (Tasama initiates, the client approves in the bank) |
| Qaid, finance | New | Proposes the chart-of-accounts mapping, builds journals and the Oracle file | A2 | Post a journal without approval |
| Ajaza, leave | Existing | Leave balances, sick bands, unpaid leave, Hajj once, overlaps | A2 | Approve leave above balance unless policy allows |
| Tarqiya, promotions | Existing, extended | Salary changes, grade benefits, back pay triggers | A2 | Change pay without approval |
| Wadaa, offboarding | Existing, extended | Final settlement, clearance, Art. 88 deadline or the client's last-day rule | A2 | Pay before clearance |
| Dalil, onboarding | Existing | Qiwa, GOSI, Muqeem, medical insurance for joiners | A2 | — |
| Wathiqa, letters | Existing | Salary letters, fixation letters, certificates; payslips and entitlement statements once the run is approved | A3 | — |
| Amin, compliance | Existing, extended | Mudad compliance, GOSI deadlines, settlement deadlines, Article 80 warnings | A1 | — |
| Raqeeb, service levels | Existing, extended | Cut-off, approval and payment-date service levels per client | A1 | Decide a case |
| Basira, patterns | Existing, extended | Clients late every month, repeated payroll errors, causes | A1 | — |

Rafeeq carries employee self-service and Murshid answers HR staff, both from the client's policy. Fatoora bills Tasama's clients from the payroll headcount.

| Id | Requirement | Source |
| --- | --- | --- |
| AGT-01 | Every agent's actions on the audit trail with the rule and clause it relied on | DT, Platform |
| AGT-02 | Every agent's limits set on the Agents screen per client | Platform |
| AGT-03 | A decision against an agent's recommendation needs a reason | Platform |
| AGT-04 | Agents never write to a client's HRMS or Oracle Finance before the person who owns the decision approves | Platform, H1 |

## The platform needs a client mode for "no HR system" and Saudi hosting in production

Today every demo client sits on its own HRMS (Oracle or Odoo). Three demo clients move to the new mode, in which the platform holds the employee master and the payroll itself: Red Sea Global, SEVEN and Saudi Coffee. ROSHN and Riyadh Air stay on Oracle through the connector. No demo client stays on Odoo, so the Odoo fallback is specified but not shown live. Moving the three changes the seed, so a dated design addendum comes first. The prototype keeps its current architecture: one schema per client, one connector for every system call, the audit trail, Arabic and English.

| Id | Requirement | Source |
| --- | --- | --- |
| PLT-01 | Client mode per client: platform of record (no HRMS) or HRMS of record (Oracle or Odoo through the connector). Demo: Red Sea Global, SEVEN and Saudi Coffee on the platform; ROSHN and Riyadh Air on Oracle | PA, BC |
| PLT-02 | Clients managed in the platform: code, names, policy, bank and template, payroll calendar, chart of accounts, contacts, delegated approvers, status; a client with employees or runs cannot be deleted, only deactivated | DT |
| PLT-03 | Roles: Tasama HR Ops, Tasama payroll preparer, Tasama payroll validator, Tasama finance, client HR, client delegated approver, client finance, employee; each sees only its client's data | DT, H1 |
| PLT-04 | Segregation of duties: no one prepares and approves the same run | MG, DT |
| PLT-05 | Single sign-on with Tasama's directory (Entra ID) and automated user provisioning; password rules to Tasama's standard until then; inactivity logout | DT, H1 |
| PLT-06 | Audit log of every change and access: who, what, when, before and after; searchable, filterable, exportable per employee; kept 5 years | DT, H1 |
| PLT-07 | Encryption in transit and at rest; personal data minimised in prompts to the AI model; no training on Tasama data | DT, H1 |
| PLT-08 | Production hosting in Saudi Arabia (personal data stays in the Kingdom); PDPL impact assessment | H1, DT |
| PLT-09 | Arabic and English interface throughout | DT, AR |
| PLT-10 | Save work in progress; a colleague can continue another's run | DT |
| PLT-11 | Availability 99.9% from 8:00 to 20:00 Saudi time; backups with set retention | DT |
| PLT-12 | Every integration logged on the integration log (HRMS, banks, Mudad, GOSI, Oracle Finance) with retries and failure alerts | Platform, H1 |
| PLT-13 | Dashboards per client and across clients: cycle status, cut-off compliance, errors, overtime and allowance costs, compliance rates | DT, PA |
| PLT-14 | Multi-country payroll is out of scope; the law pack design allows it later (CogniTeam already carries UAE, Türkiye and Netherlands packs) | DT |
| PLT-15 | Claude only through Replit AI Integrations in the prototype; PostgreSQL created by the Replit prompt | Canon |
| PLT-16 | Measure the baseline and the gain per client: minutes per task, cycle days, errors after approval, late inputs, hours saved, valued at the payroll team's hourly cost, as in the D&T ROI method | ROI, BC |
| PLT-17 | Saudization (Nitaqat) counts per client from the payroll and master data, with the counting rules for part-time and disabled employees (Amin) | LAW, Platform |
| PLT-18 | Tasama's own staff are out of scope now; Tasama is added later as one more platform-held client, with the Arrow BRD as its policy and its requirements as the checklist | You, AR |
| PLT-19 | View-only access for a client: Tasama invites named client users who see only their company's employees, payroll and reports, with no edit or approval rights; never an open link, because the data is personal and payroll | MGR meeting |
| PLT-20 | SAP connector is future scope, added when a client whose payroll Tasama runs is on SAP; the connector design takes it like Oracle and Odoo | You |

## Nine new scenarios on the Stage cover every problem the payroll managers raised

Each scenario runs through the real engine on the Stage: the request on the left, the agents in the middle, the client's system on the right. Three storylines of three scenarios each follow the order in which the payroll managers named their problems: "Every client's own rules" (D1, D2, D3), "Changes on time" (D5, D4, D9) and "From run to ledger" (D6, D7, D8). Features outside those problems stay off the Stage unless someone asks.

| # | Scenario | Shape | What the room sees | Covers |
| --- | --- | --- | --- | --- |
| D1 | A handbook becomes rules | Ingestion | Nizam reads Red Sea Global's handbook, itemises 27 dimensions, flags a 21-day leave clause written as "working days", and a person approves version 2 | MGR 1, POL |
| D2 | Two clients, same overtime, different pay | Policy effect | The same 10 overtime hours priced under Riyadh Air's and Saudi Coffee's policies, side by side, each line citing its clause | MGR 1, CAL |
| D3 | A month of fingerprints | Attendance | Saudi Coffee's punch export uploaded; Hudoor finds 37 late arrivals and 4 absences, removes 6 covered by approved leave, an employee justifies one, the approver confirms; the deductions stay inside the 5-day cap | MGR 2, ATT |
| D4 | From offer to first payslip | End to end | A hire approved in the hiring module; Aqd drafts the contract; the signed contract creates the record; Dalil registers GOSI; the first month is prorated | MGR 3, INT |
| D5 | The 15th without chasing | Cut-off | ROSHN's month opens pre-filled; reminders at D-7, D-3 and D-1; the client confirms in one click; one late promotion is routed to next month as back pay | MGR 3, INT |
| D6 | Run, explain, approve | Happy path | Hisab runs Red Sea Global's payroll; Mutabaqa explains 14 differences from last month; the client approves on screen; payslips go out | REC, CAL |
| D7 | Bank file, WPS and Mudad | Payment | Tahweel builds the file in the client's bank format; one IBAN fails on the bank's return file; it is corrected and paid; the WPS file goes to Mudad | MGR 5, PAY |
| D8 | The journal lands in Oracle | Finance | Qaid maps the run to ROSHN's chart of accounts, the four journals balance, the Oracle import file is produced; Oracle's import status comes back | MGR 4, FIN |
| D9 | Back pay and a leaver | Exception | A January raise entered in April recalculates three months and the EOSB; a resignation after 7 years pays two thirds of the award, with leave encashment and the advance balance deducted | AR, CAL |

The counts in D3 and D6 are illustrative and will come from the seed. The Stage's existing rules apply: the room can take each decision on screen, and the log reads like a colleague talking.

## The prototype takes about 21 Claude sessions; production needs Tasama's real inputs first

The estimate is Claude's own work, phase by phase, on the existing Tasama HR codebase. Each phase ends with its scenarios playing on the Stage, so progress can be seen as it happens. Phases 3 to 7 all depend on the engine in phase 2. The first gate is the design addendum, written before any code, as the canon requires.

The phases, their sessions and their gates are in `design/payroll-addendum.md`, section 10.

What each phase needs from Tasama before it can be finished with real data rather than synthetic data:

| Phase | Needed from Tasama |
| --- | --- |
| 1 Client policies | One or two real client handbooks, anonymised, to test the reader on |
| 2 Payroll engine | Confirmation of the day-rate rule, GOSI handling per client, the July 2025 template's formulas |
| 3 Attendance | A sample export from each attendance device in use; each client's penalty regulation |
| 4 Intake and contracts | The current intake platform's forms; the client contract templates; form T.4 |
| 6 Banks, WPS and Mudad | The banks in use and each bank's upload template; a returned WPS file |
| 7 Oracle Finance | Each client's chart of accounts and the current mapping spreadsheets; the ledger and journal source names |

## Open questions

**Decided with you on 22 October:**

- [x] Red Sea Global, SEVEN and Saudi Coffee hold their payroll in the platform; ROSHN and Riyadh Air stay on Oracle. If the Odoo fallback must be shown live, SEVEN can stay on Odoo instead.
- [x] The scope is the payroll Tasama runs for its clients. Tasama's own staff are added later; the Arrow BRD's requirements are kept for that.

**For Tasama's payroll managers:**

- [ ] Was the D&T payroll MVP (Payroll Digitalization BRD v1.2) built, and is anyone using it?
- [ ] Which banks are in use: 6, 7 or 17? Can we have each bank's upload template and one returned WPS file?
- [ ] Day rate: the template lets each client choose calendar days or 30, while the D&T BRD says a fixed 31. Which applies to each client?
- [ ] The template applies 9.75% / 11.75% to every Saudi. For Saudis first insured after 3 July 2024 (10.25% / 12.25% from July 2025, 10.75% / 12.75% from July 2026), is the rate corrected by hand today?
- [ ] The leave provision values a day at salary ÷ entitlement days, not ÷ 30: is that intended? And the payroll sheet's end-of-service columns stay at half a month after five years while the provisions sheet does not: which one feeds the journal?
- [ ] Which attendance devices do clients use, and can we have one export from each? Does each client have an approved penalty regulation?
- [ ] What is the current intake platform between Tasama and the clients, and what does it collect?
- [ ] Whose Oracle Finance receives the journals: each client's own ledger, or Tasama's? Can we have one client's chart of accounts and mapping spreadsheet?
- [ ] Who uploads the WPS file to Mudad today for each client, and does any paying bank upload it automatically?
- [ ] Can we have form T.4, and one or two real client handbooks, anonymised?
- [ ] "Do we have access to the client's Groq account?" in the onboarding maps: which portal is meant?

## Sources

Opened on 22 October 2026: [Saudi Labor Law, HRSD](https://www.hrsd.gov.sa/sites/default/files/2023-02/Labor.pdf) · [Labor Law amendments effective 18 Feb 2025, Al Tamimi](https://www.tamimi.com/news/key-amendments-to-saudi-arabias-labour-law/) · [GOSI rates after the July 2024 Social Insurance Law](https://hrflare.com/blog/gosi-2024-new-law/) · [Table of working-hours violations and penalties](https://mulem.com.sa/en/schedule-of-violations-and-penalties/violations-related-to-working-hours/) · [Deducting absence and delay from salary, Qoyod](https://www.qoyod.com/en/blog/labor-market/deduct-absences-and-delays-from-the-salary/) · [WPS wages file technical specification, HRSD](https://www.hrsd.gov.sa/sites/default/files/2017-06/WPS%20Wages%20File%20Technical%20Specification.pdf) · [Al Rajhi Bank payroll service](https://www.alrajhibank.com.sa/en/Business/Cash-Management/payroll) · [List of banks in Saudi Arabia](https://en.wikipedia.org/wiki/List_of_banks_in_Saudi_Arabia) · [Oracle Fusion journal import](https://docs.oracle.com/en/cloud/saas/financials/25d/faugl/how-journal-import-data-is-processed.html). Tasama's documents are listed in the sources section near the top. The legal points are general information to confirm with Tasama's legal team and GOSI before go-live.

Added after checking the template's formulas on 22 October: [GOSI contribution schedule to 2028, Okaz](https://www.okaz.com.sa/local/na/2251973) · [Amended social insurance contributions for Saudi nationals, Fragomen](https://www.fragomen.com/insights/saudi-arabia-amended-social-security-contributions-for-saudi-nationals.html) · [GOSI contribution rates from July 2025, ZenHR](https://zenhrsolutions.freshdesk.com/en/support/solutions/articles/43000760572-mandatory-gosi-update-new-contribution-rates-effective-july-2025) · [Saudi end-of-service award, Articles 84 to 88, Teamed](https://www.teamed.global/gulf-employment-law/saudi-end-of-service-award) · [Which allowances count for end of service](https://saudieosbcalculator.com/calculation/allowances/).
