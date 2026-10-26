# Rehearsal script: three payroll storylines of about twenty minutes each, played from Present mode with no slides

This is for whoever presents the Tasama HR payroll demo: the prototype owner, or Bülent at handover. Each storyline plays three scenarios on the Stage. The cards around them are drawn by the app with live numbers. Nothing is pre-recorded: every step runs the same engine a click would run.

## Before the room

The canon's `checks/before-demo.md` is the full list, about thirty minutes on the deployed app the day before. For this demo:

| Check | How |
|---|---|
| The latest commit is running | Pull in Replit's Git pane and restart the Project workflow. The console ends `AI: Claude via Replit AI Integrations`, and no screen shows "Offline". |
| The demo data is fresh | Demo › Reset the demo data, about 20 seconds. A scenario played twice without a reset finds the first run's records. |
| The opening card is right | Its paid people and gross match Payroll costs › Payroll reports and Payroll › Months. Numbers that differ mean a token reads the wrong field: fix it before the room. |
| Every scenario lands | Step each scenario chosen for the room on the Stage once, and one of them twice. On each hand step, decide once in pane 03 and let → decide once. |
| The language and the theme are right | Light theme. English or Arabic from the title bar. The Stage narration is English in both languages, so say so if the room is in Arabic. |
| The next-step cards say what Tasama agreed | Settings › Present mode, the last card of each storyline. They are proposals until you change them. |
| The hard-question screens are ready | How it works › Agents, Audit trail and Rules; Payroll › Client policies with a version compared; Payroll › Journals with the import file. |
| Full screen | Demo › Present, pick the storyline, press F. |

Keys: → or space moves on, ← goes back, F toggles full screen, Esc leaves. The mouse is only needed when the room wants to decide a step itself in pane 03.

## Every client's own rules, for Tasama's payroll managers

The question this storyline answers: "Can one platform pay every client by its own handbook, and take on a new client fast?"

| # | On screen | Say, in one sentence | Point at |
|---|---|---|---|
| 1 | Card: the month in numbers | "This is last month, across your five clients, from one engine." | The paid people and the gross: they are live, not typed |
| 2 | Card: the five problems | "These are the five problems your payroll managers named that the process documents don't cover. This storyline takes the first two." | Policy and attendance |
| 3 | Card: the rule behind it | "No agent can approve a run or release a payment." | The last line: every line names its rule |
| 4 | Card: the agenda | "Three scenarios, about five minutes each." | — |
| 5 | **A new client from its files** (8 steps) | Step 1: "Soudah keeps its payroll in spreadsheets; this is the folder they handed over." Steps 2 to 5: let the lanes fill without talking over them; Lama, Tasama HR operations, checks the roster, contracts and letters. Step 6: "Fifteen issues; seven are for the client." Step 7: "One decision, Sharifa's." | Pane 03: the lanes filling, then the two refused rules; the six months recalculated against what Soudah paid |
| 6 | Interlude | Read the room's answer to the question on the card. | — |
| 7 | **Same overtime, different pay** (4 steps) | "The same 48 hours at two clients; Lama in Tasama HR operations entered them once each, from the clients' overtime forms." Step 4: "Each pay line cites the clause it used." | The two pay lines side by side: SAR 5,160 at Red Sea Global, SAR 3,745.83 at Saudi Coffee for 40 of the 48 hours, with the other 8 held for the client |
| 8 | Interlude | — | — |
| 9 | **A month of attendance** (4 steps) | Step 1: "Lama, Tasama HR operations, confirmed how the device file maps." Step 2: "The employee explains a late morning in chat, not on a form." Step 4: "The fine stops at the legal cap; the absent day is unpaid on its own line." | The fine against the cap of five days' wage |
| 10 | Interlude | — | — |
| 11 | **Handing a client back** (4 steps) | Step 1: "The contract ends: Faisal opens the handover, twenty items, seven working days." Step 2: "Lama shares the files and the access through the folder; nothing is emailed." Step 3: "The client signs." Step 4: "Faisal closes; every access is revoked and Tasama's copies are deleted, with a trail." | The client account's Handover tab: four steps, the checklist all green |
| 12 | Interlude | — | — |
| 13 | Card: real, Claude, simulated | "The pay is calculated, not generated. Claude only reads the handbook." | The middle column |
| 14 | Card: next step | Say what Tasama agreed to, and the date. | — |

## Changes on time, for Tasama's payroll team and the clients' HR operations

The question this storyline answers: "What happens when a change arrives late, a person joins, or a person leaves?"

| # | On screen | Say, in one sentence | Point at |
|---|---|---|---|
| 1 to 3 | Cards: numbers, the rule, the agenda | As above. Keep them short; the room has seen them if they saw the first storyline. | — |
| 4 | **The year's calendar, approved once** (3 steps) | Step 1: "Wared laid out Saudi Coffee's year from two numbers: the cut-off day and the pay day; seven dates a month, off weekends and holidays, each with its owner." Step 2: "The client approves it once, on its own Calendar tab." Step 3: "From then on Wared reminds whoever owns the next date, client or Tasama; nobody keeps the calendar in a spreadsheet." | The client's Payroll › Calendar; the Tasama team's notification |
| 5 | Interlude | — | — |
| 6 | **The cut-off without chasing** (5 steps) | Step 1: "Wared listed Riyadh Air's changes and reminded HR operations in the app; nobody chased by email." Step 2: "A promotion arrives two days after the cut-off." Step 3: "HR operations agrees to move it to next month as back pay." Step 5: "Payroll receives the month already checked by Lama; it calculates, it does not enter." | Pane 03: the change on Oracle HCM's worker record; the effect on next month shown to the client |
| 7 | Interlude | — | — |
| 8 | **From offer to first payslip** (4 steps) | Step 2: "The contract is drafted from the accepted offer." Step 3: "The signed contract reaches Tasama HR operations; the same record becomes the employee and is registered with GOSI." Step 4: "The days worked this month are paid, and nobody typed the salary twice." | The one employee record, created once |
| 9 | Interlude | — | — |
| 10 | **A contract from the client** (4 steps) | Step 1: "ROSHN emailed a signed contract; Aqd read it against ROSHN's policy." Step 2: "Housing is below the policy and the IBAN letter is missing, so Lama sends it back instead of entering it." Step 4: "Entered once: the record, the pay, the documents and the joiner in the month." | The two differences, then the joiner on Inputs |
| 11 | Interlude | — | — |
| 12 | **Back pay and a leaver** (4 steps) | Step 1: "A raise dated three months back." Step 3: "A colleague resigns after seven years; Lama checked the settlement against the record." Step 4: "Both are in this month's run, and no closed month is reopened." | The three recalculated months; two thirds of the award (Art. 85), the advance recovered |
| 13 | Interlude | — | — |
| 14 and 15 | Cards: real, Claude, simulated; next step | As above. | — |

## From run to ledger, for payroll leads, the client's HR operations and finance

The question this storyline answers: "Can one month go from the run to the bank, WPS and the ledger without a spreadsheet in between?"

| # | On screen | Say, in one sentence | Point at |
|---|---|---|---|
| 1 to 3 | Cards: numbers, the rule, the agenda | As above. | — |
| 4 | **Run, explain, approve** (6 steps) | Step 1: "Two checks stopped Red Sea Global's run, and Nasser has cleared them." Step 3: "Sharifa validates; she never validates a run she prepared." Step 4: "Lama in Tasama HR operations reads Mutabaqa's explanation and delivers the run to the client; the client's questions come to her." Step 5: "The client's HR operations approves, knowing why every riyal moved; where the contract names the CHRO too, the CHRO signs last." | The waterfall of differences; the sign-off cards, Tasama's three then the client's chain |
| 5 | Interlude | — | — |
| 6 | **Bank file, WPS and Mudad** (7 steps) | Step 1: "Five release checks pass, and the value date moves off a Saturday." Step 2: "Sharifa uploads the file to the bank portal herself; no bank is connected." Step 3: "The client's finance controller approves it in the bank and records it on Payments." Step 4: "Nasser reads the bank's return file: one salary came back, the account is closed." Step 5: "Lama enters the new IBAN from the bank letter." Step 6: "A follow-up file pays it." Step 7: "Nasser files the signed WPS file and records Mudad." | The bank file and the failed line; the follow-up's value date |
| 7 | Interlude | — | — |
| 8 | **The journal lands in Oracle** (6 steps) | Step 1: "September's accrual is short by the new remote-site allowance." Step 2: "Qaid proposes an account." Step 3: "Sharifa approves it once." Step 5: "October maps it without asking anyone." | The SAR 21,000 gap, then the four journals balanced |
| 9 | Interlude | — | — |
| 10 | Card: bank files and journals since each history began | "This is every client, every month, not one demo month." | The counts are live |
| 11 and 12 | Cards: real, Claude, simulated; next step | As above. | — |

## When something goes wrong in the room

| What happens | What to do |
|---|---|
| A step shows an error in pane 02 | Press ← then → to replay the step. If it repeats: Esc, Demo › Reset the demo data, and start the storyline again. Rehearsal found no failing step, two passes of all 18 scenarios. |
| The room wants to decide a step themselves | When pane 02 says "Your move", decide in pane 03; the scenario moves on by itself. |
| Someone asks to see the product, not the Stage | The App toggle in the Present bar shows the same step on the product's screens. |
| The page reloads | Present mode lands on the card before the scenario. Press → to start that scenario again. |
| Someone asks "is this real data?" | "Every person and figure is synthetic. The engine reproduces every figure of your July 2025 template run." |
