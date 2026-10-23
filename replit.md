# Tasama HR

A demo prototype of the agentic HR and payroll platform Tasama would use to run HR and payroll for its client companies, on synthetic data. The app is in `artifacts/tasama-hr/imported`; its README says how it runs and what is real.

## Screens (binding)

These rules come from the Cognirise Prototype Canon (`SCREEN-DISCIPLINE.md`) and bind every change to the app in `artifacts/tasama-hr/imported`, whoever makes it.

- One job, one person: every screen, card and chat answer has a job a person would say in one sentence ("Approve or decline Ravi's leave") and one persona it is for.
- Each fact appears once on a view. If the headline says "4 days", nothing else on the view repeats it.
- The person's words only. No workflow ids (`WF-15`), case ids in titles, type codes (`ANNUAL`, `type_code`), tool names (`propose_request`), autonomy rungs (`A0`–`A4`), table or endpoint names, or HTTP verbs on a work surface. A reference the person would quote goes once, small, in the meta line.
- Work above, proof behind one collapsed disclosure named for its question ("How this was checked"): steps, decision trail, rules cited, HRMS calls. Collapsed by default, also in demos. The Audit trail and Integration log screens keep the full proof.
- Governance is explained once: on the Agents screen and in the Demo Director's closing card. Never as copy on a transaction ("the decision is yours", "nothing is submitted until you confirm").
- Budget: decision card = meta line, one headline, up to four facts, one recommendation line that carries its reason and its exception, one or two actions, one disclosure. Chat answer = one sentence and one card (`ConfirmCard`: one sentence, the facts once, Confirm and Change). List row = one line and one status. Screen = one hero and at most three panels before the fold.
- Every headline makes a claim in a sentence a person would say.
- Do not change the seed, the engine or the HRMS connector without a dated design addendum.
- Check before calling a change done: `npm run typecheck`, `npm run check`, `npm run check:screens` where Playwright is available, every scenario twice through the Director.

## Run & Operate

- The Run button runs `tools/replit-run.sh`, which starts `artifacts/tasama-hr/imported/tools/replit-run.sh`: install once, build the web app, start the server on port 5000.
- Required: a PostgreSQL database (`DATABASE_URL`) and Replit AI Integrations for Anthropic (`AI_INTEGRATIONS_ANTHROPIC_BASE_URL`). Never an Anthropic API key.
- The server creates its tables and the demo data on first start (`SEED_VERSION` in `apps/server/src/seed/index.ts`); `/api/health` answers `"seeding":false` when ready.
- Checks, from `artifacts/tasama-hr/imported`: `npm run typecheck`, `npm run check` (server running), `npm run check:golden`.

## Stack

- npm workspaces inside `artifacts/tasama-hr/imported`: `apps/server` (Express, TypeScript run with tsx), `apps/web` (React, Vite), `packages/design-system` (Atelier).
- PostgreSQL through `pg` with plain SQL: `db/schema.sql` per client, `db/tasama.sql` for Tasama. No ORM, no migrations, no schema push.

## Where things live

- `artifacts/tasama-hr/imported/README.md`: running it, the clients, what is real and simulated, the checks.
- `artifacts/tasama-hr/imported/design/`: the design addenda. Nothing is built that is not in them.

## Gotchas

- Do not add Drizzle, migrations or `db push`: the app owns its schema and seed.
- Do not change the seed, the payroll engine or the HRMS connector without a dated design addendum.
- Keep the `rollup` and `vite` overrides in `artifacts/tasama-hr/imported/package.json`.
- Changes are made in the GitHub repository and pulled here; edits made only in Replit are lost on the next pull.

## Product

- Tasama's HR operations: portfolio, service levels, escalations, patterns, invoices, delivery team.
- Each client's HR on its own HRMS (Oracle HCM, or Tasama HR), with the employee helper Rafeeq and 27 agents.
- Tasama's payroll month for every client: inputs, attendance, runs, payments (bank, WPS, Mudad), journals; and a new client moved in from its spreadsheets.
- Present mode and the Stage: the demo plays scripted scenarios one step at a time, in English or Arabic.

## User preferences

- The prototype owner commits and pushes from GitHub Desktop; Replit pulls. Do not commit from Replit.
- Claude only through Replit AI Integrations; the database is created by the Replit prompt in the README.
