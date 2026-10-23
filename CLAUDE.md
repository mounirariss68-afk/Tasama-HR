# Tasama HR — Claude project instructions

This is a Cognirise prototype built on the Cognirise Prototype Canon. The app is in `artifacts/tasama-hr/imported` (npm workspaces: `apps/server`, `apps/web`, `packages/design-system`). Before any work here, read in this order:

1. `artifacts/tasama-hr/imported/design/00-frame.md` — whose desk, the questions the demo must answer (not written yet for this prototype; until it is, the frame is the README's first section)
2. `artifacts/tasama-hr/imported/design/DESIGN.md` — everything the app may contain; dated addenda override earlier sections (not written yet; `design/screen-review.md` and `design/menu-review.md` hold the screen and menu decisions until it is)
3. The canon, in the SharePoint site Cognirise Delivery, library Canon, synced on the owner's Mac as `OneDrive-cogniriseai/Cognirise Delivery - Canon/Cognirise Prototype Canon - v1/`: `README.md`, then `SCREEN-DISCIPLINE.md`, then `MENU-DISCIPLINE.md`, then `stages/03-build.md` and `checks/before-delivery.md`

Rules that bind every change in this repo:

- Nothing is built that is not in `design/DESIGN.md`; a needed addition is a dated addendum to the design first.
- Every screen, card and chat answer keeps to `SCREEN-DISCIPLINE.md`: one job per view, each fact once, the person's words only (no workflow ids, case ids, type codes, tool names or rung codes on a work surface), proof behind one collapsed disclosure, governance explained once (the Agents screen and the Director's closing card), the budget per view, review by subtraction.
- The case reader is one decision card for every decision (`apps/web/src/app/decision.tsx`); the assistant's confirmation is one component (`apps/web/src/app/confirm-card.tsx`). Change those, not copies of them.
- Do not change the seed, the engine or the HRMS connector without a dated design addendum.
- Claude only through Replit AI Integrations (`AI_INTEGRATIONS_ANTHROPIC_*`); never an API key. PostgreSQL is created by the Replit prompt, never by hand. No migrations, no ORM, no scaffolding; keep the `rollup`/`vite` overrides.
- Verification before anything is called done: `npm run typecheck`, `npm run check`, `npm run check:screens` (in a container with Playwright), every scenario twice through the Director, screenshots looked at.
- Every title makes a claim in a sentence a person would say.
- Changes are written into this clone file by file; the prototype owner commits and pushes; Replit pulls.
