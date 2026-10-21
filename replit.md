# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

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

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
