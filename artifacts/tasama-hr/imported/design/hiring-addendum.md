# Addendum, 23 October 2026: the offer decision shows who the candidate is, why they fit, what each interview found and why the hiring manager chose them

The prototype owner asked for this on 23 October 2026, and it is recorded in `design/payroll-addendum.md` §19 as work for after payroll. Today the offer card shows only the pay: "Offer for the Leasing Manager: SAR 21,500 basic". The person approving it cannot see who the offer is for.

## The card

The offer stays one decision card (`apps/web/src/app/decision.tsx`), with a headline, four facts and one recommendation line.

| Part | What it says | Example |
|---|---|---|
| Headline | The hiring manager, the candidate, the role, the pay and the start | "Abdulrahman Al Muqbel wants Hani Odeh as Leasing Manager: SAR 21,500 basic from 7 Dec 2026" |
| Fact 1: why the manager chose them | The hiring manager's reason, in their words, with who the candidate is today under it | "Hani came out strongest of our four finalists at the assessment centre, best on communication…" · 9 years · Senior Account Manager at Al Rajhi Bank |
| Fact 2: fit with the role | Each criterion of the requisition, shown, partly shown or not shown, as the screening read it | 2 of 2 must-haves · 1 nice-to-have partly shown |
| Fact 3: the interviews | Each stage held: recruiter screen, panel, and the assessment centre where there was one. Each row gives the date, who sat on it, the verdict and one line on what it found | Panel, 5 Oct · Abdulrahman, Joud, Waleed · Strong yes · strongest on stakeholder management |
| Fact 4: pay in the grade | The existing range bar with the peer median, and the package a month | — |
| Recommendation | Tarqiya's pay recommendation, unchanged | — |

What each interview found is worked out from its scores: the competency it scored highest, and the lowest one if it scored below 3. The verdict comes from the average score: 4 and above "Strong yes", 3.5 "Yes", 3 "Mixed", below 3 "No". Hessa's screening never scores or ranks; the interviews and the assessment centre are where people score, and the card shows what they scored.

## The data (a seed change)

- **Interviews.** `hcm.interviews` already exists but holds no rows. A new seed step, `seed/selection.ts`, writes them:

  | Application phase | Recruiter screen | Panel |
  |---|---|---|
  | Interview, assessment, offer, hired | Completed | — |
  | Assessment, offer, hired | Completed | Completed |
  | Interview | Completed | Scheduled in the coming week |

  - **Panel members:** the hiring manager, the client's HR business partner and the recruiter.
  - **Competencies:** motivation and communication at the screen; technical depth, problem solving, stakeholder management and team fit at the panel.
  - **Scores:** follow the candidate's screening evidence. The candidate the scenario or history offers scores highest on the requisition.
  - **Randomness:** the step uses its own seeded random numbers, so nothing else in the seed changes.
- **The assessment centre** already scores the Leasing Manager finalists. The card reads it as a third stage.
- **Security Analyst (D4).** The two lowest-numbered open applicants move to the interview phase with their panel completed. D4 then offers to a candidate who was interviewed, not to a new applicant.
- **Candidates' current titles** were written as the role code ("SEC-AN"). They become job titles ("SOC Analyst"). This does not touch the seed's random numbers.
- **The manager's reason** is written into the offer case when it opens, from the panel's and the assessment centre's scores, in English and Arabic. This covers the seeded Leasing Manager offer at each client and D4's offer. A case without one falls back to the same sentence worked out when the card is read.
- `SEED_VERSION` goes from 11 to 12.

## What does not change

- The engine's WF-05 steps.
- The connector.
- The payroll seed.
- The other scenarios.

The case reader gains the selection for an offer through `GET /requests/:ref`, as a read.

## Checks

`npm run check` gains one check. The waiting Leasing Manager offer at each client must have:

- its candidate;
- at least two completed interviews;
- a reason that names that candidate.

**Effort:** one Claude session.
