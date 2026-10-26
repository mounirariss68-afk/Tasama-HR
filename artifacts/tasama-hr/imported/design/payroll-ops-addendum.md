# Addendum, 24 October 2026: Tasama HR Operations runs the intake and the questions, and the client's finance releases the payment by file

**Status.** Approved by the prototype owner on 24 October 2026 ("let's implement all of the changes"). Built the same day.

**Sources.**
- `Tasama Payroll Process Steps.xlsx`: columns A–F are the source of truth for how payroll runs at Tasama.
- Firat's prototype review: the workbook's columns G–H, plus his Word file of improvement areas. He reviewed the build from before v6.6.
- `design/hr-ops-addendum.md`, with Tasama's answer to Q2.

**Precedence.** This addendum overrides `design/payroll-addendum.md` §20 (the bank, WPS and Mudad) wherever they differ. `design/walkthrough-addendum.md` (26 October) overrides the run's steps here: after validation the run goes back through Tasama HR operations, and the client's approval runs through the chain its contract names.

## 1. What changes, step by step

| Step | Today (v6.6) | Change |
|---|---|---|
| 1.1 Cut-off reminder | Wared's automatic reminders say "Wared" | They are signed "Wared, for Tasama HR Operations" |
| 1.4 Contract against policy | Only contracts drafted from an offer exist | A contract the client sends is read by Aqd against the client's policy and the documents, and Lama decides: enter it in the master, or take it to the client (new workflow WF-37) |
| 1.5 Document set | Not in the prototype | Each employee has a document set: contract, national ID or iqama, IBAN letter. Lama's new **Documents** item shows each client's gaps and lets her ask for what is missing |
| 1.7 Validate master entries | Checks exist on the draft run only | WF-37 checks each field against its document: the ID format, IBAN check digits, the IBAN's bank against the letter, the pay against the policy. Documents shows the record checks per client |
| 1.9 Handover | Lama hands the month over with one button | Her card lists each change with its source (an approved case, the client's form, a contract) and whether it is checked |
| 1.11, 2.8 Questions | Nasser asks the client's HR operations directly | Every check gets **Raise to Tasama HR Ops**. It is the main action at clients whose contract includes HR operations (ROSHN, Riyadh Air, SEVEN). Lama either answers from the record or takes the question to the client (WF-36 gains a `triage` step) |
| HR Ops Manager | Faisal sees no payroll actions and no notifications | Faisal gains the HR Operations lens and its inbox. Tasama staff get their own notifications: a case waiting on a Tasama team notifies that team's people |
| 2.9, 2.11 Package and archive | No export; the approval lives on the case | The run's Approval tab offers the **payroll package**: a PDF summary with the three sign-offs, and an Excel detail. The month's documents are filed together: package, approval, bank file, WPS file, bank return and Mudad acknowledgement |
| 3.5 Upload | "The payroll lead sends the file to the bank" | Sharifa downloads the file, uploads it to the client's bank portal herself, and records it. No bank is connected |
| 3.6 Finance approval | Played by the Director only | The client's finance controller gets a **Payments** item: the file waiting for their approval in the bank, its checks, and "Approved in the bank" with the value date. Tahweel reminds them when the value date is near |
| 3.7 Bank return and WPS | Played by the Director only | Nasser reads the bank's return file, taken from the portal or uploaded. Each line is paid or returned, and a returned line goes to Lama for the new IBAN, as before. He then files the signed WPS file |
| 3.8 Mudad | Played by the Director only | Nasser records the Mudad upload and its acknowledgement, with Mudad's reference, or notes that the client uploaded it |
| 3.9 Financial reporting | The finance controller reads reports in the platform | Payroll reports also download as Excel |
| Exits | WF-19 waits on the client's HR operations | At clients with HR operations, Lama checks the settlement against the record before the client's HR operations approves it (WF-19 gains a `check` step) |
| UI | The Stage bar covers the bottom of the screen | The Stage bar can be hidden and shown again |

## 2. How bank payments run without a bank connection

This follows Tasama's process, steps 3.5–3.8. Saudi banks take their own payroll templates through their online channels. The one public format is the Ministry's WPS wages file. The bank's WPS return file is what goes to Mudad. The prototype already writes both files (§20).

| Who | Does | In the platform |
|---|---|---|
| Tahweel | Writes the paying bank's file and the WPS file, then checks them | Unchanged |
| Sharifa (Tasama payroll lead) | Downloads the file and uploads it to the client's bank portal as the initiator | "Uploaded to the bank portal" |
| The client's finance controller | Gives the second and third approvals in the bank portal and sets the value date | "Approved in the bank". A reminder goes out before the value date |
| Nasser (Tasama payroll specialist) | Downloads the bank's return file and the signed WPS file | Reads the return file: each line paid or returned. Then files the WPS file |
| Nasser, or the client | Uploads the WPS file to Mudad | Records the upload and the acknowledgement |

A direct bank link, host-to-host or through Mudad, can replace the manual steps later. The files stay the same. No Tasama finance role is added, because the salaries are paid from the client's account. Open question for Tasama: does it ever pay salaries from its own account, for example for outsourced staff? If yes, a Tasama finance role is needed for those clients.

## 3. Data, with this addendum

| Change | Why |
|---|---|
| `layer.employee_documents` (person, kind, file name, received, status) | The document set (1.5) |
| Seed: every active employee gets a contract, an ID or iqama and an IBAN letter on file. At each client, two records miss their IBAN letter and one misses its ID | Lama's Documents has gaps to chase |
| Seed: two contracts the client sent wait on Lama at ROSHN and SEVEN, for pending hires. One is clean; one pays housing below the policy and has no IBAN letter | WF-37 on the demo day |
| WF-36 gains `triage` (Tasama HR Ops). It is skipped when the question goes to the client directly | 1.11 |
| WF-19 gains `check` (Tasama HR Ops) at clients with HR operations. Seeded history decides it | Exits |
| WF-33: `send` becomes "Uploaded to the bank portal" | 3.5 |
| `layer.notifications` holds Tasama staff rows, with a negative person id per staff member | Notifications |
| The finance persona gains the role `FINANCE` | 3.6 |
| `SEED_VERSION` 14 → 15 | — |

## 4. Scenarios

| Scenario | Change |
|---|---|
| Payroll pre-run finds blockers (ROSHN) | Step 2: Nasser raises the GOSI check to Tasama HR Ops, and Lama gives the date from ROSHN's GOSI account. Red Sea Global, which has no HR operations contract, still asks the client |
| Bank file, WPS and Mudad | Step 2: Sharifa uploads to the portal. Step 3: the finance controller records the approval in the bank, on Payroll costs › Payments. Step 4: Nasser reads the return file. Step 6: Sharifa uploads the follow-up. Step 7: Nasser files the WPS file and records Mudad |
| New **A contract from the client** (Tasama level, ROSHN, 4 steps; in the "Changes on time" storyline) | Aqd reads a contract ROSHN sent against its policy. Lama sees the gap and takes it to the client. ROSHN's HR operations sends the corrected contract and the IBAN letter. Lama enters it, and the joiner is in the month |
| Back pay and a leaver | Step 3: Lama checked the settlement before ROSHN's approver approved it |

## 5. Checks

`npm run check` gains checks for:
- each client's document gaps;
- the two contracts waiting on Lama;
- a question raised to HR Ops reaching Lama and, through her, the client;
- the finance controller's Payments;
- a return file read;
- the package PDF and Excel downloading.

**Effort:** about 4 Claude sessions.
