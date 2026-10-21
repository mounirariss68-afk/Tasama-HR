# UX review: Tasama HR is correct and thin. Its screens are lists of sentences, with the one visual the app had removed from every hero

Reviewed on 21 October 2026, evening. Production build at 1600×1000, light theme, every screen of every persona (137 views), the case reader, the chat and the Director bar. Written after the screen-discipline passes the same day, applying the method of the Δ Force review.

## Why it came out this way

Today's passes removed, then re-laid out what was left. Neither pass asked what each screen should be made of. `SCREEN-DISCIPLINE.md` says what must leave a screen. Atelier's `docs/LAYOUT.md` says what composes one:

- "A hero that is only eyebrow + headline + lede is the most common way an Atelier app ends up looking thin."
- "Do give the hero a `media` visual and a `feature` figure."
- "A page that is a stat row, then a chart, then a full-width table is a report."

The app had a signature visual, the hire-to-retire lifecycle ring. The first pass deleted it from four heroes as a "repeated count". It was not a repeat: the ring shows where the cases sit by stage, and the headline only gives the total. The second pass then removed hero features because they echoed the headline. Every hero is now text only.

## What is wrong, element by element

| # | Where | What is wrong | What to do |
|---|---|---|---|
| 1 | Heroes | Every hero is text only. Island heroes (HR Inbox, Escalations, Patterns, Agents) sit on work lists. | The island hero only on landing pages (Portfolio, a client account), with a feature figure. Work lists get a compact surface hero. The landing pages of each lens (Home, Team, Lifecycle, Portfolio) carry the media visual. |
| 2 | Screen real estate | At 1600px, 300px of assistant rail and 236px of menu. On Home, Team approvals, Inbox and Leave the content ends at 60% of the height and the rest is blank. In the inbox the reader holds three facts and stops. | The assistant rail starts collapsed for people who work in lists (HR, Payroll, CHRO, Tasama) and open for the employee and the manager, whose work starts in chat. Screens fill their height: the inbox reader carries visuals, and the landing pages gain a second row of panels. |
| 3 | No visual for the decision | Leave balance, team cover, notice, the advance against its limit, the deduction cap, a promotion against the grade range, the settlement's make-up and the SLA clock are all sentences or bare numbers. | One visual per decision, the same wherever it appears. Six are built once in `app/viz.tsx` on Atelier's chart tokens: **clock bar** (opened → due, today marked, red when overdue) · **balance bar** (taken · booked · this request · left) · **cap bar** (amount against a limit, cap line marked) · **range bar** (grade min–max with peer median and the proposed figure) · **cover strip** (team members across the leave days) · **composition bar** (settlement lines). |
| 4 | Case reader | Facts are text tiles. The SLA is a chip. | Each fact tile carries its visual: the leave balance bar, the cover strip, the notice against ten days, the advance cap bar, the deduction gauge, the promotion range bar, the settlement composition. The header carries the clock bar. |
| 5 | Inbox rows | Rows are well shaped (initials, kind, who, what, due chip), but urgency is only a chip. | A thin clock bar under each row, so the eye sees which clock is running out without reading. |
| 6 | Home (employee) | Four stat tiles, then two short panels. The bottom 40% is empty. | Hero feature: annual leave left, with its balance bar. The panels become **My requests** (each with its clock bar), **What changed**, and **Pay** (the last six net payslips as bars, plus the next pay date). |
| 7 | Team (manager) | Team cards and "Waiting on you", all text. Who is away is a chip per card. | Hero media: the lifecycle ring of the decisions waiting. The main panel is a **two-week away calendar**: people as rows, days as columns, leave as bars, today marked, pending requests hatched. It answers "can I approve this" for every leave at once. The team cards follow. |
| 8 | HR Inbox, Approvals | Compact hero, then the list and the reader, and blank below the reader. | Unchanged layout; the reader fills with visuals (4) and the list rows gain clock bars (5). |
| 9 | Lifecycle | The three lanes work; the hero has no picture. | Hero media: the lifecycle ring. Cards in flight carry clock bars. |
| 10 | Workforce | Saudization is the headline but is only a number. | Hero feature: a Saudization gauge (now, target, band). Division rows already have bars; add the Saudi share as a second bar. |
| 11 | Payroll | A held payroll shows as text. 13 findings sit in a dense table; severity is only a chip. | Hero feature: findings by severity as one stacked bar. A **gross trend** of the last runs as columns beside the findings. Findings stay a table, but money is right-aligned and severity drives the row marker. |
| 12 | Compliance | 28 alerts in a table; the due date is text. | A **due-date clock** per row (days left in a 30-day window, red under 7). The Saudization panel becomes the gauge. |
| 13 | Exits | Settlement amounts are text in a table. | The settlement deadline clock (14 days from the last working day) per open case. |
| 14 | Onboarding | Joiner task cards are text. | A progress bar per joiner and a countdown to the start date. Probation rows get the clock to the end date. |
| 15 | Portfolio (Tasama) | Island hero, text only. Client table with chips. | Island hero with feature "Escalations open". Hero media: the **client strip**, five client tiles each with its SLA attainment bar and its HRMS. The table's SLA and payroll columns become bars. |
| 16 | Client account | Eight panels stacked; the SLA history is a grid of chips. | SLA history as a heat strip (cells coloured by attainment). Tabs on the record come with the menu change. |
| 17 | Escalations | The due date is text; actions are fine since the "More" menu. | A clock bar per row. |
| 18 | Finance, Delivery | Margin is a number per cell; utilisation already has bars. | A margin bar per client row. Delivery is acceptable as it is. |
| 19 | Pay and documents | Payslips are a table of identical rows. | A net-pay bar chart for twelve months above the table; the end-of-service panel shows the two awards as bars. |
| 20 | Leave | Four tiles and a table. | Hero feature: the balance bar at full width (taken, booked, left, and what carries over). |
| 21 | Typography | Fixed today: 22–28px hero, 18px card headline, 14px body. | Keep. Tile figures stay at 22px. |
| 22 | Empty states | "Nothing here.", "No cases." | Atelier `Empty` with an icon and the sentence that says what would appear here. |
| 23 | Title bar and menu | Seven elements; rig items in the menu. | `design/menu-review.md`, waiting for your go. It is a separate pass, so the two do not fight over the title bar. |

## What each screen becomes

| Screen | Layout | The visual | The aside |
|---|---|---|---|
| Home | Surface hero, feature = leave left with balance bar; stat row; two columns | Balance bar, request clock bars, net-pay bars | My requests |
| Team | Surface hero with the lifecycle ring; two columns | Two-week away calendar | Waiting on you |
| Approvals, HR Inbox, My requests | Compact hero; list and reader | Clock bars on rows; the visuals in the reader | The reader |
| Lifecycle | Surface hero with the lifecycle ring; three lanes | Ring; clock bars on cards in flight | — |
| Workforce | Hero feature = Saudization gauge | Gauge; division bars | By division |
| Payroll | Hero feature = findings by severity | Severity bar; gross trend | End of service; advances |
| Compliance | Compact hero | Due clocks; Saudization gauge | — |
| Portfolio | Island hero with client strip and escalations feature | Client strip; SLA and margin bars | Recent activity |
| Escalations | Compact surface hero | Clock bars | Resolved |
| Pay, Leave | Hero feature = the figure with its bar | Net-pay bars; balance bar | End of service |

## Order of work

One pass of my work, in this order, so each step can be looked at:

1. `app/viz.tsx` (the six visuals and the lifecycle ring reused) and the reader's fact tiles.
2. The chat rail default per persona.
3. The landing pages: Home, Team, Lifecycle, Portfolio.
4. The lists with clock bars: inbox rows, Escalations, Compliance, Exits, Onboarding.
5. Payroll, Workforce, Pay, Leave, Finance.
6. Empty states.
7. Screenshots and the lint.

The menu change comes after, once you give the go.

## What was built (21 October 2026, night)

| Where | Now |
|---|---|
| Visuals | `app/viz.tsx`: clock bar, segment bar, cap bar, range bar, cover strip, columns, progress, radial gauge, waterfall, bullet, funnel, year heatmap, slope. Bars grow on load; buttons press; motion stops under reduced-motion. |
| Case reader | Each fact carries its visual: leave balance and team cover, the advance and deduction caps, the promotion against the grade range, the settlement as a waterfall, the payroll findings by severity and the gross as a slope. |
| Landing pages | Home: leave left as the hero figure, net pay as columns, open requests with clocks. Team: a three-week away calendar with pending leave. Lifecycle: the ring. Portfolio: client strip with SLA bars. Workforce: Saudization gauge. |
| Lists | Clock bars on inbox rows, cards in flight, exits, compliance, escalations and probation. Hiring as a funnel, onboarding as progress per joiner, finance margin as bullets. |
| Fold | Home and Team lost their stat rows (the facts moved into the panel action, the lede and a hero figure). Growth merges goals and learning. `npm run check:screens` passes at 1440 × 900. At 1600 × 1000, Performance shows five panels and a client account four; they pass at the binding size. |
