# Tasama HR: an agentic HR services platform (demo prototype)

Tasama runs HR for several client companies. This platform is the agentic layer Tasama would use to do that. Two clients keep their employee master in Oracle Fusion Cloud HCM and the platform works on top of it. Three hold it, and their payroll, in Tasama HR itself (`design/payroll-addendum.md`).

- **Inside each client account,** the client's employees get an HR helper, Rafeeq, and the HR team gets a co-pilot, Murshid. Fourteen agents run 21 workflows from position request to exit. Rafeeq answers each employee only from their own company's HR handbook.
- **Above the accounts,** the Tasama HR Operations Manager runs the business: portfolio, service levels, escalations, rising problems and their causes (Patterns), invoices, the delivery team and every client's HR policies. Five more agents support this: Raqeeb (service levels), Basira (pattern watch and root cause), Fatoora (billing), Tawzee (workload) and Intiqal (client transition, designed, not built).
- **Tasama's payroll team,** Sharifa AlMousa (Payroll lead) and Nasser AlFarraj (Payroll specialist), works in the Payroll lens: every client's month, one inbox across clients, and each client's payroll policy. Nizam reads a client's handbook into rules on 27 dimensions and flags what the law refuses or the words leave unclear; the client's CHRO activates a version.

Agents check, prepare and recommend; people decide. Every read and write to a client's employee master goes through one connector and is logged in that system's own API dialect (Oracle REST, or Tasama HR's own).

**Data:** the client names are real PIF portfolio companies, used for this demo only. Every employee, salary, HR policy, contract, fee and service level is fictional. Which HRMS each client runs is also assumed for the demo.

## Run it on Replit (no terminal needed)

1. **Import.** Go to replit.com/import, choose **ZIP**, upload `tasama-hr.zip` and press **Import**.
2. **Add a database.** Open the **Database** tool and create a PostgreSQL database. Replit sets `DATABASE_URL` for you.
3. **Connect Claude.** The assistants use Replit's built-in Anthropic connection (Replit AI Integrations), so no API key is needed. If it is not already on for this app, ask Replit's Agent: *"Enable Replit AI Integrations for Anthropic for this app. Don't change any code."* That sets `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, which the server reads. Replit AI Integrations needs a paid Replit plan. Until it is connected, the assistants run in *Offline* mode: they give fixed answers matched against the same data and handbooks, and the screen labels them "Offline".
4. **Press Run.** The first run installs packages, builds the app and creates the five client accounts and Tasama's data. This takes two to three minutes. Later runs start in seconds.
5. **Open the web view.** It opens as the Tasama HR Operations Manager. The lens picker in the title bar holds Tasama Services, Payroll, each client's HR and How it works. The **Demo** control (top right) holds the scenarios, the persona (any of the eight people inside a client, or Tasama's two payroll people), the client account, the theme and Reset. Add `?client=1` to the address to hide the Demo control when the client drives.

To return to a clean state, use **Demo → Reset the demo data**. It rebuilds everything in about 20 seconds.

## Present mode and the Stage

The demo runs without PowerPoint (`design/stage-addendum.md`, canon stage 5). **Demo › Present** opens a storyline: cards with live numbers from the five client accounts, three scenarios on the Stage, a card after each with what it did, and the close. Two storylines ship: **Tasama leadership** (salary certificate, advance exception, service level rescue) and **Compliance and Legal** (screening refusal, termination stop, payroll pre-run). Edit them in Settings › Present mode; they are saved on the server and survive a reset.

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

## What's real and what's simulated

- **Real:** the data model, the workflow engine, approvals and the decision trail, policy search, and the agent checks (payroll pre-run, calibration, settlement, compliance). The Saudi Labor Law calculations are real too: Arts. 53, 75, 84, 85, 88, 92, 93, 109 and 117, plus GOSI. So are the service-level, invoice and workload calculations. With Replit AI Integrations connected, the assistant answers come from Claude.
- **Simulated:** each client's HRMS is a Postgres schema (`hcm_<client>`), reached only through `apps/server/src/hcm/connector.ts`. That file logs Oracle REST resource names for Oracle clients and Tasama HR's own `/api/v1` calls for the three clients held on the platform. An Odoo dialect is kept in the code as a fallback and is not shown. Qiwa, GOSI, Muqeem, Mudad, Jadarat and Microsoft 365 are simulated too. Decisions that a scenario takes on a person's behalf are labelled "simulated".
- **Designed, not built:** WF-24 (new client transition).
- **Partial workflows:**
  - WF-04 (interviews and assessment centre)
  - WF-07 (onboarding buddy)
  - WF-09 (goals and check-ins)
  - WF-11 (succession)
  - WF-18 (exit interviews)

## Screens and checks

Every work surface keeps to the canon's `SCREEN-DISCIPLINE.md`. Each decision is one card: a meta line, a headline, up to four facts and one recommendation line, then the actions and one collapsed "How this was checked" disclosure (`apps/web/src/app/decision.tsx`). The assistant confirms with one card (`apps/web/src/app/confirm-card.tsx`). What was removed from each screen is listed in `design/screen-review.md`; the menu review is in `design/menu-review.md`.

| Check | Command | Result, 22 October 2026 |
|---|---|---|
| Types | `npm run typecheck` | Clean |
| The live world | `npm run check` (needs `DATABASE_URL` and the server running) | 83 of 83 pass |
| The screen lint | `npm run check:screens` (needs Playwright; run in the Cognirise container) | 168 views, 0 problems |
| The payroll engine | `npm run check:golden`: Tasama's July 2025 template run, and hand-worked cases | 43 of 43 figures match; 22 of 22 cases |
| The Director | Every scenario, every step, twice through the Director's routes | 12 scenarios, 0 failing steps |

Deviations from the canon: the canon's `<DemoControl>`, `<ConfirmCard>` and `<Provenance>` are Atelier components; this repo's copy of Atelier has none of them, so the confirm card and the disclosure are built in the app. The canon's agent budget is exceeded on purpose: the payroll addendum brings the platform to 27 agents (20 built so far), each with its own job (`design/payroll-addendum.md` §6).

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
```
