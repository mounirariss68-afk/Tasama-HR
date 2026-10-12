# Tasama HR: an agentic HR services platform (demo prototype)

Tasama runs HR for several client companies. This platform is the agentic layer Tasama would use to do that. It sits on top of each client's own HRMS: three clients run Oracle Fusion Cloud HCM, and two run Odoo.

- **Inside each client account,** the client's employees get an HR helper, Rafeeq, and the HR team gets a co-pilot, Murshid. Fourteen agents run 21 workflows from position request to exit. Rafeeq answers each employee only from their own company's HR handbook.
- **Above the accounts,** the Tasama HR Operations Manager runs the business: portfolio, service levels, escalations, rising problems and their causes (Patterns), invoices, the delivery team and every client's HR policies. Five more agents support this: Raqeeb (service levels), Basira (pattern watch and root cause), Fatoora (billing), Tawzee (workload) and Intiqal (client transition, designed, not built).

Agents check, prepare and recommend; people decide. Every read and write to a client's HRMS goes through one connector and is logged in that HRMS's own API dialect.

**Data:** the client names are real PIF portfolio companies, used for this demo only. Every employee, salary, HR policy, contract, fee and service level is fictional. Which HRMS each client runs is also assumed for the demo.

## Run it on Replit (no terminal needed)

1. **Import.** Go to replit.com/import, choose **ZIP**, upload `tasama-hr.zip` and press **Import**.
2. **Add a database.** Open the **Database** tool and create a PostgreSQL database. Replit sets `DATABASE_URL` for you.
3. **Connect Claude.** The assistants use Replit's built-in Anthropic connection (Replit AI Integrations), so no API key is needed. If it is not already on for this app, ask Replit's Agent: *"Enable Replit AI Integrations for Anthropic for this app. Don't change any code."* That sets `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, which the server reads. Replit AI Integrations needs a paid Replit plan. Until it is connected, the assistants run in *Offline* mode: they give fixed answers matched against the same data and handbooks, and the screen labels them "Offline".
4. **Press Run.** The first run installs packages, builds the app and creates the five client accounts and Tasama's data. This takes two to three minutes. Later runs start in seconds.
5. **Open the web view.** It opens as the Tasama HR Operations Manager. Use the client switcher (top centre) to change client account, and the persona menu (top right) to view the platform as any of the seven people inside that client.

To return to a clean state, use **Reset the demo** on Agent Control → Scenarios (or Settings). It rebuilds everything in about 20 seconds.

## Demo Director

Agent Control → Scenarios lists nine scenarios. **Run scenario** opens the Director bar at the bottom of the screen: each step switches the client account, the persona and the screen, runs through the real engine, and shows the narration, the trigger, the result and what happened (trail entries and cases, each clickable). **Step** runs the next step, **Play** steps every 9 seconds, **Pause** stops auto-play, **Back** shows an earlier step again without re-running it, **Stop** ends the scenario. Where a step takes a person's decision, the trail says "(decided by the scenario)". Narration is in English; step titles are in both languages.

## Data version

The server opens its port first, then builds the demo data in the background if the database is empty or was built by an older version (`SEED_VERSION` in `apps/server/src/seed/index.ts`). While it builds, the app shows a "Preparing the demo data" message and the API answers 503.

The server uses the first Claude model Replit's connection accepts, trying in this order: `claude-sonnet-4-6`, `claude-sonnet-4-5`, `claude-opus-4-6`, `claude-haiku-4-5`.

## The clients

| Client | Sector | HRMS (assumed) | Tasama service (fictional) |
|---|---|---|---|
| ROSHN Group | Real estate development | Oracle Fusion Cloud HCM | Full HR outsourcing |
| Riyadh Air | Aviation | Oracle Fusion Cloud HCM | Full HR outsourcing with recruitment |
| Red Sea Global | Tourism and hospitality | Oracle Fusion Cloud HCM | Payroll and employee services |
| SEVEN | Entertainment | Odoo 19 | Full HR outsourcing |
| Saudi Coffee Company | Food and agriculture | Odoo 19 | Payroll managed service (build, operate, transfer) |

## What's real and what's simulated

- **Real:** the data model, the workflow engine, approvals and the decision trail, policy search, and the agent checks (payroll pre-run, calibration, settlement, compliance). The Saudi Labor Law calculations are real too: Arts. 53, 75, 84, 85, 88, 92, 93, 109 and 117, plus GOSI. So are the service-level, invoice and workload calculations. With Replit AI Integrations connected, the assistant answers come from Claude.
- **Simulated:** each client's HRMS is a Postgres schema (`hcm_<client>`), reached only through `apps/server/src/hcm/connector.ts`. That file logs Oracle REST resource names for Oracle clients and Odoo JSON-2 calls for Odoo clients. Qiwa, GOSI, Muqeem, Mudad, Jadarat and Microsoft 365 are simulated too. Decisions that a scenario takes on a person's behalf are labelled "simulated".
- **Designed, not built:** WF-24 (new client transition).
- **Partial workflows:**
  - WF-04 (interviews and assessment centre)
  - WF-07 (onboarding buddy)
  - WF-09 (goals and check-ins)
  - WF-11 (succession)
  - WF-18 (exit interviews)

## Project layout

```
apps/server     Express API, workflow engine, agents, assistant, Tasama service layer, seed (TypeScript, run with tsx)
apps/web        React app on the Cognirise Atelier design system, English and Arabic
packages/design-system   Atelier, rebranded to Tasama
db/schema.sql   one client: hcm (simulated HRMS) and layer (agentic layer); created once per client
db/tasama.sql   Tasama's own data: contracts, service levels, staff, invoices, escalations
apps/server/src/domain/clients.ts   the five clients: HRMS, size, handbook terms, contract
apps/server/src/domain/policies.ts  the fictional HR handbooks, generated per client
```
