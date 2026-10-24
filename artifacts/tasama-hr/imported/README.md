# Tasama HR: an agentic HR services platform (demo prototype)

Tasama runs HR and payroll for several client companies. This platform is the agentic layer Tasama would use to do that. Two clients keep their employee master in Oracle Fusion Cloud HCM, and the platform works on top of it. Three hold the master and their payroll in Tasama HR itself (`design/payroll-addendum.md`). A sixth client, Soudah Development, moves in from spreadsheets during the demo.

- **Inside each client account,** the client's employees get an HR helper, Rafeeq, and the HR team gets a co-pilot, Murshid. Fourteen agents run the HR workflows from position request to exit. Rafeeq answers each employee only from their own company's HR handbook.
- **Above the accounts,** the Tasama HR Operations Manager runs the business:
  - portfolio and service levels;
  - escalations;
  - rising problems and their causes (Patterns);
  - invoices;
  - the delivery team;
  - every client's policies.

  Five agents support this: Raqeeb (service levels), Basira (pattern watch and root cause), Fatoora (billing), Tawzee (workload) and Intiqal (a new client's files read into the platform).
- **Tasama HR operations** works in the HR Operations lens: one inbox across clients, every client's month, the inputs, attendance, each employee's documents and each client's policy. Lama Al Dossary checks each change and each contract the client sends against its document, answers payroll's questions or takes them to the client, and hands the month to payroll. Faisal, the HR Operations Manager, sees the same inbox (`design/hr-ops-addendum.md`, `design/payroll-ops-addendum.md`).
- **Tasama's payroll team** works in the Payroll lens: every client's month, one inbox across clients, the runs, payments, journals and each client's policy. The team is Sharifa AlMousa, the Payroll lead, and Nasser AlFarraj, the Payroll specialist. Payroll validates the changes; it does not enter them. Eight agents each do one step, and none of them can approve a run or release a payment:

  | Agent | Step |
  |---|---|
  | Nizam | Reads a handbook into rules |
  | Hudoor | Reads attendance |
  | Wared | Collects the month's changes before the cut-off |
  | Aqd | Drafts contracts |
  | Tamin | Registers with GOSI |
  | Mutabaqa | Explains every difference from last month |
  | Tahweel | Builds the bank and WPS files |
  | Qaid | Builds the journals |

  The engine calculates every line from the client's approved rules, and every line names the rule it used.
- **The client's side:**
  - the client's HR operations approves each run in HR Workspace › Payroll;
  - HR operations sends the month's changes there;
  - the finance controller reads costs, provisions and journals in the Payroll costs lens, and records the bank approval of each payroll file on Payroll costs › Payments; no bank is connected.

Twenty-seven agents run 34 workflows in all. Agents check, prepare and recommend; people decide. Every read and write to a client's employee master goes through one connector, and is logged in that system's own API dialect (Oracle REST, or Tasama HR's own).

**Data:** the client names are real PIF portfolio companies, used for this demo only. Every employee, salary, HR policy, contract, fee and service level is fictional, and so is which HRMS each client runs. The July 2025 payroll file Tasama shared is used only, anonymised, as the engine's test fixture. It is never in the demo data.

## Run it on Replit (no terminal needed)

The Replit project is linked to this GitHub repository. After a change: commit and push from GitHub Desktop, pull in Replit's Git pane, and restart the **Project** workflow (the Run button).

**Setting up a new Replit project** follows the canon's `templates/REPLIT-PROMPT.md`. A ZIP import is used rather than a GitHub import, because GitHub imports have not received Replit's native Anthropic integration; link the project to this repository afterwards. Then paste the text below into Replit's Agent. When the **Confirm Anthropic Integration** card appears, choose **Approve**.

> This app uses Anthropic Claude through Replit AI Integrations — Anthropic (Replit managed). It is complete; set it up to run without changing its code.
>
> 1. Connect **Anthropic (Replit managed)** via Replit AI Integrations to this app first, so the environment carries `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` and `AI_INTEGRATIONS_ANTHROPIC_API_KEY`. Show me the integration approval card. Do not ask me for an Anthropic API key, do not create an `ANTHROPIC_API_KEY` secret or any other secret, and do not install any SDK. The app reads only those two variables (`artifacts/tasama-hr/imported/apps/server/src/ai.ts`).
> 2. Create a PostgreSQL database for this app with Replit's Database tool, so that `DATABASE_URL` is set. Do not create tables, run migrations, push a schema or insert data: the app creates its own schema and synthetic data on first start.
> 3. Do not modify, add, rename or delete any file. Do not change dependencies, any `package.json`, the lockfiles, `.replit`, `replit.md` or the scripts in `tools/`. If something seems to require a code change, stop and ask me instead.
> 4. Start the **Project** workflow defined in `.replit` (`bash tools/replit-run.sh`, port 5000 on external port 80) and wait until the console prints `Tasama HR platform is running on port 5000`. The first start takes two to three minutes because it installs, builds and generates the demo data; do not interrupt or restart it.
> 5. When it is running, run `env | grep AI_INTEGRATIONS` and tell me the web view URL, whether `DATABASE_URL` is set, and which `AI_INTEGRATIONS_ANTHROPIC_*` variables are set. The console line must end `AI: Claude via Replit AI Integrations`. If it says `offline`, the integration is not connected: connect it and restart, without changing code. Then stop.

What the first run does:

- It installs packages, builds the app and creates the five client accounts and Tasama's data. This takes two to three minutes; later runs start in seconds. While it builds, the app shows "Preparing the demo data".
- Replit AI Integrations needs a paid Replit plan. Until it is on, the assistants run *Offline*: they give fixed answers matched against the same data and handbooks, and the screen labels them "Offline". The payroll engine, the files and every scenario work the same either way.

Using the app:

- **The web view** opens as the Tasama HR Operations Manager. The lens picker in the title bar holds Tasama Services, each client's HR and How it works.
- **The Demo control** (top right) holds Present mode, the scenarios, the persona, the client account, the theme and Reset. There are eight personas inside a client (employee, new joiner, line manager, HR business partner, talent acquisition, HR operations, CHRO, finance controller), plus Tasama's manager and its two payroll people.
- **Add `?client=1`** to the address to hide the Demo control when the client drives.

To return to a clean state, use **Demo → Reset the demo data**. It rebuilds everything in about 20 seconds.

## Present mode and the Stage

The demo runs without PowerPoint (`design/stage-addendum.md`, canon stage 5). **Demo › Present** opens a storyline: cards with live numbers from the five client accounts, three scenarios on the Stage, a card after each with what it did, and the close. Five storylines ship: **Tasama leadership** (salary certificate, advance exception, service level rescue), **Compliance and Legal** (screening refusal, termination stop, payroll pre-run), and three for Tasama's payroll managers, in the order they named their problems: **Every client's own rules** (a new client from Excel, same overtime with different pay, a month of attendance), **Changes on time** (the cut-off without chasing, offer to first payslip, back pay and a leaver) and **From run to ledger** (run and approve, bank file, WPS and Mudad, the journal in Oracle). Edit them in Settings › Present mode; they are saved on the server and survive a reset.

On the **Stage** a scenario runs on one screen: **01 The request** (the employee in Rafeeq, the hiring manager's message, the schedule, Raqeeb's reminder), **02 The agents** (the narration and what the agents did, in plain words), **03 the client's system** (the record as the HRMS holds it, with "agent wrote" on what changed, and the decision card under it). When the next step is a decision the person on screen may take, pane 02 says "Your move": decide in pane 03 and the scenario moves on by itself, or press → and the scenario decides as scripted. Keys: → or space next, ← back, F full screen, Esc leave. The **App** toggle shows the product's own screens for the same step.

**Demo › Scenarios** plays one scenario on the Stage. The Director bar still appears when a scenario is played in the App view. Reset the demo data before a rehearsal or a room: a scenario played twice without a reset finds the first run's records (an advance already outstanding, a leave already booked).

## Data version

The server opens its port first, then builds the demo data in the background if the database is empty or was built by an older version (`SEED_VERSION` in `apps/server/src/seed/index.ts`). While it builds, the app shows a "Preparing the demo data" message and the API answers 503.

The server uses the first Claude model Replit's connection accepts, trying in this order: `claude-sonnet-4-6`, `claude-sonnet-4-5`, `claude-opus-4-6`, `claude-haiku-4-5`.

## The clients

| Client | Sector | HRMS (assumed) | Tasama service (fictional) |
|---|---|---|---|
| ROSHN Group | Real estate development | Oracle Fusion Cloud HCM | Full HR outsourcing |
| Riyadh Air | Aviation | Oracle Fusion Cloud HCM | Full HR outsourcing with recruitment |
| Red Sea Global | Tourism and hospitality | Tasama HR | Payroll and employee services |
| SEVEN | Entertainment | Tasama HR | Full HR outsourcing |
| Saudi Coffee Company | Food and agriculture | Tasama HR | Payroll managed service (build, operate, transfer) |
| Soudah Development (added during the demo, D10) | Tourism and destination development | Tasama HR, moved in from spreadsheets | Payroll |

## What's real and what's simulated

- **Real:**
  - the data model, the workflow engine, approvals and the decision trail;
  - policy search and the agent checks;
  - the Saudi Labor Law calculations: Arts. 53, 70, 75, 84, 85, 87, 88, 92, 93, 109, 116 and 117, plus GOSI by registration date;
  - the payroll engine: Tasama's July 2025 template run is matched figure by figure in `npm run check:golden`;
  - the bank, WPS and ledger files: the WPS wages file follows the public layout, and the Oracle journal file follows Oracle's GL interface;
  - the service-level, invoice and workload calculations.

  With Replit AI Integrations connected, the assistants' answers and Nizam's reading of a handbook come from Claude. Nothing in a payslip, a bank file or a journal does.
- **Simulated:**
  - **Each client's HRMS** is a Postgres schema (`hcm_<client>`), reached only through `apps/server/src/hcm/connector.ts`. That file logs Oracle REST resource names for the Oracle clients, and Tasama HR's own `/api/v1` calls for the clients held on the platform. An Odoo dialect is kept in the code as a fallback and is not shown.
  - **Banks and their layouts:** the banks, their return files, and every bank layout except the WPS file are illustrative until Tasama sends the banks' templates.
  - **Government and office systems:** Qiwa, GOSI, Muqeem, Mudad, Jadarat and Microsoft 365.
  - **Ledgers:** posting to Oracle Finance or Odoo is simulated. The import file is real; the ledger that receives it is not.
  - **Decisions a scenario takes on a person's behalf** are labelled "simulated".
- **Partial workflows:**
  - WF-04 (interviews and assessment centre)
  - WF-07 (onboarding buddy)
  - WF-09 (goals and check-ins)
  - WF-11 (succession)
  - WF-18 (exit interviews)

## Screens and checks

Every work surface keeps to the canon's `SCREEN-DISCIPLINE.md`. Each decision is one card: a meta line, a headline, up to four facts and one recommendation line, then the actions and one collapsed "How this was checked" disclosure (`apps/web/src/app/decision.tsx`). The assistant confirms with one card (`apps/web/src/app/confirm-card.tsx`). What was removed from each screen is listed in `design/screen-review.md`; the menu review is in `design/menu-review.md`.

| Check | Command | Result, 24 October 2026 |
|---|---|---|
| Types | `npm run typecheck` | Clean |
| The live world | `npm run check` (needs `DATABASE_URL` and the server running) | 114 of 114 pass |
| The screen lint | `npm run check:screens` (needs Playwright; run in the Cognirise container) | 190 views, 0 problems |
| The screen lint in Arabic | `npm run check:arabic`: English left on a work surface | 190 views; the Payroll, HR Operations and Payroll costs lenses clean; 21 left in HR and Tasama screens (Basira's findings, text people typed). The Stage's narration is English |
| The payroll engine | `npm run check:golden`: Tasama's July 2025 template run, and hand-worked cases | 43 of 43 figures match; 22 of 22 cases |
| The Director | Every scenario, every step, twice through the Director's routes | 19 scenarios, 84 steps, 0 failing |

Deviations from the canon: the canon's `<DemoControl>`, `<ConfirmCard>` and `<Provenance>` are Atelier components; this repo's copy of Atelier has none of them, so the confirm card and the disclosure are built in the app. The canon's agent budget is exceeded on purpose: the payroll addendum brings the platform to 27 agents, all built, each with its own job (`design/payroll-addendum.md` §6).

## Project layout

```
apps/server     Express API, workflow engine, agents, assistant, Tasama service layer, seed (TypeScript, run with tsx)
apps/web        React app on the Cognirise Atelier design system, English and Arabic
packages/design-system   Atelier, rebranded to Tasama
db/schema.sql   one client: hcm (simulated HRMS) and layer (agentic layer); created once per client
db/tasama.sql   Tasama's own data: contracts, service levels, staff, invoices, escalations
apps/server/src/domain/clients.ts   the five clients: HRMS, size, handbook terms, contract
apps/server/src/domain/policies.ts  the fictional HR handbooks, generated per client
apps/server/src/domain/payroll-policy.ts  the 27 payroll dimensions, each client's payroll terms and the legal checks
apps/server/src/domain/calendar.ts  each client's cut-off and pay day around the seed date
apps/server/src/domain/payroll/     the payroll engine: pure arithmetic over a client's approved rules
apps/server/src/payroll/            runs, inputs, payments (bank, WPS, Mudad) and journals
apps/server/src/domain/banks.ts     the banks and the bank file layouts
apps/server/src/domain/ledger.ts    the illustrative chart of accounts and the Oracle and Odoo journal files
apps/server/src/onboarding/         a new client read from its files into seven lanes, and go-live
apps/server/src/director.ts         the 19 scenarios the Demo Director plays on the Stage
apps/web/src/app/present.tsx        Present mode and its five storylines
apps/web/src/lib/ar.ts              the Arabic interface strings and templates
demo-files/soudah/                  the files Soudah Development hands over (generated by tools/new-client/)
design/                             the addenda: payroll, Stage, screen and menu reviews
```
