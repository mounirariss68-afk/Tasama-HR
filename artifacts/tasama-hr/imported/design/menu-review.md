# Menu review: the CHRO sees 26 items in four lenses and the same inbox twice; after the change no lens has more than eight and the rig leaves the menu

Run on 21 October 2026 against `MENU-DISCIPLINE.md` and `templates/menu-review.md` of the Cognirise Prototype Canon v1. Step 1 was done from the code, not from the menu arrays:

- the personas: `apps/server/src/seed/layer.ts` for the seven client personas, `apps/server/src/api/session.ts` for Tasama;
- the lens filters: `MENUS` and their `show` rules in `apps/web/src/App.tsx`, and `LENS_HOME` and `homeLens` in `app/state.tsx`;
- every screen's hero, panels and tabs: `apps/web/src/screens/*.tsx`.

**Applied on 21 October 2026, night, after the prototype owner's go.** Both decisions below were taken as recommended: four items accepted in My Team and for Talent acquisition; the Demo control built in the app and a `theme` prop added to Atelier's `TitleBar`. Screen ids were kept as routes, so no scenario step was re-pointed and the server was not touched; renamed items keep their old ids. One departure from step 4: Home keeps the leave figure, net pay and open requests from the redesign of the same evening (`design/ux-review.md`), which the owner asked to take into the canon, so defect 3 is only half fixed on Home.

## Step 2 — Today, persona by persona

The app already shows one lens's menu at a time. The count below is per lens, with the total the persona can reach in brackets.

| Persona | Lenses | Items visible (count) | Lands on |
|---|---|---|---|
| Tasama HR Operations Manager | Tasama Services · HR Workspace · Agent Control, plus the client switcher | 8 · 9 · 8 (25) | Portfolio |
| Employee | My HR (no picker) | 5 (5) | Home |
| New joiner | My HR (no picker) | 6 (6) | Home, not Onboarding |
| Line manager | My HR · My Team | 5 · 4 (9) | Team |
| HR business partner | My HR · HR Workspace · Agent Control | 5 · 8 · 8 (21) | Inbox |
| Talent acquisition | My HR · HR Workspace | 5 · 5 (10) | Inbox |
| Payroll and HR operations | My HR · HR Workspace | 5 · 7 (12) | Inbox |
| CHRO | My HR · My Team · HR Workspace · Agent Control | 5 · 4 · 9 · 8 (26) | Inbox |

## Step 3 — The seven defects, with evidence

| # | Defect | Found where | Evidence (screen, panel, item) |
|---|---|---|---|
| 1 | The same inbox in two places | My Team; and the CHRO across two lenses | `TeamScreen` has a "Waiting on you" panel listing the same cases as the Approvals item. The CHRO's My Team › Approvals and HR Workspace › Inbox both render `DecisionInbox` over `/requests?view=inbox`, which returns every case waiting on that person. The same rows appear in both lenses. |
| 2 | A board over cases that other items already show by stage | HR Workspace › Lifecycle | `Lifecycle` has Intake · In flight · Output lanes with stage filters: Hiring, Onboarding, Performance, Payroll, Exits. Those stages are items in the same lens: Positions and hiring, Onboarding and probation, Performance and talent, Payroll and rewards, Exits and relations. |
| 3 | A home screen that repeats panels from other items | My HR › Home; My Team › Team; Tasama › Portfolio | **Home:** the leave, next pay and goals tiles repeat Leave, Pay and Growth, and "My open requests" repeats Requests. **Team:** "Waiting on you" repeats Approvals; the review chips repeat Performance. **Portfolio:** the revenue-by-month panel repeats Finance; the payroll-calendar findings repeat each client's payroll. |
| 4 | A drill-down record that already contains its sibling items | Tasama › Client accounts | `TasamaAccount` has these panels, each a sibling menu item: Service levels by month (= Service levels), Delivery team on this account (= Delivery team), Invoices and margin (= Finance), Waiting in the client workflow (= Escalations), HRMS connector, last 7 days (= Agent Control › HRMS connector). Person (reached from Workforce) has Cases, Assignment history, Salary history, Element entries and Reviews as stacked panels. |
| 5 | No overview for the persona who runs things | CHRO | The CHRO runs the client's HR and lands on Inbox, an operational queue. No screen shows them, in one place, what is in flight by stage, Saudization, the payroll status and the open compliance alerts. Tasama's manager has one (Portfolio). |
| 6 | Two items with the same name for different things | Tasama persona; CHRO | **"HR policies"** (Tasama: every client's handbook) and **"Policies"** (Agent Control: the handbook the agents cite). **"Escalations"** (Tasama item: contract SLA escalations) and the inbox tab **"Escalated"** (case status: a check stopped the case). For the CHRO: **"Hiring"** and **"Positions and hiring"**; **"Performance"** and **"Performance and talent"**. Plus names in the system's words: **"Evidence"** is the audit trail, **"HRMS connector"** is the integration log, **"Agent Control"** is how it works. |
| 7 | Rig items in a lens | Agent Control; the person menu; the title bar | **Scenarios** and **Settings** (persona, language, AI mode, Reset) are items in Agent Control, beside Agents and Workflows. The person menu carries "Settings and approval limits". The client switcher for client personas is a presenter's device: an employee never changes company. The theme toggle sits in the title bar. |

## Step 4 — The menu after, lens by lens

Landing in **bold**. The numbers in the last column are defect numbers.

| Lens | Items (landing in bold) | What moved, and why (defect number) |
|---|---|---|
| **Tasama Services** (Tasama manager) | **Overview** · Escalations · Patterns · Finance · Delivery team · Client handbooks | Portfolio renamed Overview, with route tabs Portfolio · Service levels (2, 6). Client accounts leaves the menu: a client opens from an Overview row as a record with tabs Service levels · Waiting cases · Delivery team · Invoices · Payroll runs · HRMS health (4). HR policies renamed Client handbooks (6). Revenue by month leaves Overview; it stays in Finance (3). |
| **Client HR** (Tasama manager; one entry per client in the same picker) | **Inbox** · Workforce · Hiring · Onboarding · Performance · Payroll · Exits · Compliance | The client switcher becomes the lens picker: "ROSHN HR", "Riyadh Air HR" and the others sit beside Tasama Services. There is one switcher instead of two (7, title bar). Lifecycle goes; the CHRO's Overview takes its job (2). Items renamed to the person's words (6). |
| **My HR** (everyone) | **Home** · Requests · Leave · Pay and documents · Growth | Home keeps what is waiting and what changed. The leave, pay and goals tiles and the open-requests panel go, because their items show them (3). |
| **My HR** (new joiner) | **Onboarding** · Home · Requests · Leave · Pay and documents · Growth | The joiner lands on Onboarding, their job before day one (landing rule). |
| **My Team** (line manager, CHRO) | **Approvals** · Team · Hiring · Performance | The manager lands on Approvals, their inbox (1, landing). Team loses its "Waiting on you" panel (1, 3). For the CHRO, Approvals shows only the decisions they take as a line manager. HR decisions stay in the HR Workspace inbox, so no row is in both (1). **Four items, one below the floor of five: see the decision below.** |
| **HR Workspace** (HRBP) | **Inbox** · Workforce · Hiring · Onboarding · Performance · Exits · Compliance | Lifecycle goes (2); renames (6). |
| **HR Workspace** (Talent acquisition) | **Inbox** · Hiring · Onboarding · Workforce | Lifecycle goes (2). **Four items: see the decision below.** |
| **HR Workspace** (Payroll and HR operations) | **Inbox** · Payroll · Exits · Compliance · Onboarding · Workforce | Lifecycle goes (2); renames (6). |
| **HR Workspace** (CHRO) | **Overview** · Inbox · Workforce · Hiring · Onboarding · Performance · Payroll · Exits | New Overview for the CHRO only (5). It is built from the Lifecycle board, with route tabs In flight · Compliance, plus Saudization and payroll status in the hero (2, 5). For the CHRO, Compliance becomes that tab so the lens stays at eight. |
| **How it works** (Tasama manager, HRBP, CHRO) | **Agents** · Workflows · Rules · Audit trail · Value | Agent Control renamed (6). Policies renamed Rules (6). Evidence renamed Audit trail, with Integration log as its second tab; HRMS connector leaves the menu for that tab (6, 7). Scenarios and Settings leave for the Demo control (7). |
| **Demo control** (title bar, every persona; hidden with `?client=1`) | Scenarios · Persona · Client account (client personas) · Demo data and Reset · Interface (theme, AI mode) | Every rig item, in one control beside the person (7). The person menu loses "Settings and approval limits"; approval limits show under Persona. Present, Clock and Skin are not built in this prototype, so the control does not list them. |

Records whose properties become tabs (4):

| Record | Tabs |
|---|---|
| Client account (from Overview) | Service levels · Waiting cases · Delivery team · Invoices · Payroll runs · HRMS health |
| Person (from Workforce, Compliance, Probation) | Record · Cases · Assignments · Pay (salary history, element entries) · Reviews |

### Decisions the prototype owner has to make

**1. Two lenses fall below five items.** My Team has four jobs (Approvals, Team, Hiring, Performance). Talent acquisition has four once Lifecycle goes.

My recommendation is to accept four in both. The only way to reach five is to invent an item or split a screen. That is the padding the screen discipline removes elsewhere. The canon's floor exists to stop fragmentation, and these lenses are not fragmented.

**2. The theme toggle is built into Atelier's `<TitleBar>`.** The title bar can only drop to five if it loses that toggle. That needs either a `theme={false}` prop added to Atelier, or the toggle moved into the Demo control.

The canon says the lens picker, Demo control and title bar are Atelier components, but this repo's copy of Atelier has no `<DemoControl>`. I would build the Demo control in the app, add the prop to Atelier, and record both as deviations in the README.

## Step 5 — What it does to each persona

| Persona | Items today | Items after | Landing after |
|---|---|---|---|
| Tasama HR Operations Manager | 8 · 9 · 8 (25), plus a separate client switcher | 6 · 8 per client · 5 (19), one picker | Overview |
| Employee | 5 | 5 | Home |
| New joiner | 6 | 6 | Onboarding |
| Line manager | 5 · 4 (9) | 4 · 5 (9) | Approvals |
| HR business partner | 5 · 8 · 8 (21) | 7 · 5 · 5 (17) | Inbox |
| Talent acquisition | 5 · 5 (10) | 4 · 5 (9) | Inbox |
| Payroll and HR operations | 5 · 7 (12) | 6 · 5 (11) | Inbox |
| CHRO | 5 · 4 · 9 · 8 (26) | 8 · 4 · 5 · 5 (22) | Overview |

## The title bar, before and after

| | Elements | Count |
|---|---|---|
| Before | Brand (mark, "Tasama HR", "demo") · client switcher with the HRMS chip · lens picker · theme toggle · language · notifications · person (with "Settings and approval limits") | 7 |
| After | Brand ("Tasama HR demo") · the one switcher (lens picker, which carries the client accounts for Tasama) · notifications and language · person · Demo control | 5 |

## Scenario steps that will need re-pointing after the change

| Scenario | Step target today | After |
|---|---|---|
| Month-end invoice | `tasama-sla` | Overview › Service levels tab |
| Pattern root cause | `tasama-portfolio` | Overview |
| Screening refusal | `evidence` | Audit trail |
| Certificate, advance exception, payroll escalation, hire to onboard, termination stop, SLA rescue | `my-home`, `my-pay`, `hr-inbox`, `hr-hiring`, `hr-payroll`, `hr-onboarding`, `hr-exits`, `tasama-escalations`, `tasama-finance`, `tasama-patterns` | Unchanged screens; renamed labels only |
