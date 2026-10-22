-- =============================================================================
-- Rafeeq — the agentic HR layer for National Bonds
--
-- Two schemas, and the line between them is the point of the prototype:
--
--   hcm    A simulation of Oracle Fusion Cloud HCM, the SYSTEM OF RECORD.
--          Shaped like Fusion: legal employer, departments, jobs, positions,
--          grades; person -> work relationship -> effective-dated assignment;
--          salaries and element entries; absences; recruiting; performance;
--          document records; journeys; Atom events.
--          The agentic layer NEVER reads or writes these tables directly.
--          Everything goes through apps/server/src/hcm/connector.ts, which
--          speaks Oracle REST resource names and logs every call.
--
--   layer  The agentic layer's own store: requests (cases), workflow runs and
--          steps, approvals, the decision trail, agents, policies the agents
--          cite, conversations, alerts, the integration log.
--
-- Every person, case and figure is synthetic. Every identifier carries DEMO-.
-- =============================================================================

DROP SCHEMA IF EXISTS layer CASCADE;
DROP SCHEMA IF EXISTS hcm CASCADE;
CREATE SCHEMA hcm;
CREATE SCHEMA layer;

-- ----------------------------------------------------------------- structures

CREATE TABLE hcm.legal_employers (
  id              serial PRIMARY KEY,
  code            text UNIQUE NOT NULL,
  name            text NOT NULL,
  name_ar         text NOT NULL,
  country         text NOT NULL DEFAULT 'SA',
  mol_establishment_no text NOT NULL,     -- WPS / MOHRE establishment id (DEMO)
  payroll_statutory_unit text NOT NULL
);

CREATE TABLE hcm.locations (
  id        serial PRIMARY KEY,
  code      text UNIQUE NOT NULL,
  name      text NOT NULL,
  name_ar   text NOT NULL,
  region   text NOT NULL
);

CREATE TABLE hcm.departments (
  id            serial PRIMARY KEY,
  code          text UNIQUE NOT NULL,
  name          text NOT NULL,
  name_ar       text NOT NULL,
  division      text NOT NULL,
  division_ar   text NOT NULL,
  parent_id     int REFERENCES hcm.departments(id),
  cost_center   text NOT NULL,
  manager_person_id int                          -- FK added after persons
);

CREATE TABLE hcm.grades (
  id            serial PRIMARY KEY,
  code          text UNIQUE NOT NULL,            -- G04 .. G15
  rank          int NOT NULL,
  min_basic     numeric(12,2) NOT NULL,          -- AED per month
  mid_basic     numeric(12,2) NOT NULL,
  max_basic     numeric(12,2) NOT NULL,
  annual_leave_days int NOT NULL DEFAULT 30,
  notice_days   int NOT NULL DEFAULT 30
);

CREATE TABLE hcm.jobs (
  id          serial PRIMARY KEY,
  code        text UNIQUE NOT NULL,
  name        text NOT NULL,
  name_ar     text NOT NULL,
  family      text NOT NULL,
  family_ar   text NOT NULL,
  level       text NOT NULL,                     -- Professional, Manager, Executive ...
  skilled     boolean NOT NULL DEFAULT true      -- counts toward Emiratisation
);

CREATE TABLE hcm.positions (
  id               serial PRIMARY KEY,
  code             text UNIQUE NOT NULL,         -- DEMO-POS-0001
  name             text NOT NULL,
  name_ar          text NOT NULL,
  job_id           int NOT NULL REFERENCES hcm.jobs(id),
  department_id    int NOT NULL REFERENCES hcm.departments(id),
  location_id      int NOT NULL REFERENCES hcm.locations(id),
  grade_id         int NOT NULL REFERENCES hcm.grades(id),
  reports_to_position_id int REFERENCES hcm.positions(id),
  fte              numeric(3,2) NOT NULL DEFAULT 1,
  headcount        int NOT NULL DEFAULT 1,
  budget_status    text NOT NULL DEFAULT 'BUDGETED',     -- BUDGETED | UNBUDGETED
  status           text NOT NULL DEFAULT 'ACTIVE',       -- ACTIVE | PROPOSED | FROZEN
  hiring_status    text NOT NULL DEFAULT 'FILLED',       -- FILLED | VACANT | APPROVED | IN_RECRUITMENT
  annual_budget numeric(14,2),
  effective_start  date NOT NULL,
  effective_end    date NOT NULL DEFAULT '4712-12-31'
);

-- ---------------------------------------------------------------- people

CREATE TABLE hcm.persons (
  id                 serial PRIMARY KEY,
  person_number      text UNIQUE NOT NULL,       -- DEMO-100123
  first_name         text NOT NULL,
  last_name          text NOT NULL,
  first_name_ar      text NOT NULL,
  last_name_ar       text NOT NULL,
  display_name       text NOT NULL,
  display_name_ar    text NOT NULL,
  gender             text NOT NULL,              -- M | F
  date_of_birth      date NOT NULL,
  nationality        text NOT NULL,              -- ISO-2
  is_saudi    boolean NOT NULL,
  marital_status     text NOT NULL,
  work_email         text NOT NULL,
  mobile             text NOT NULL,
  national_id_masked text NOT NULL,              -- 784-XXXX-XXXXXXX-X, never full
  national_id_expiry date NOT NULL,
  passport_masked    text NOT NULL,
  passport_expiry    date NOT NULL,
  iqama_expiry date,                    -- null for UAE nationals
  bank_name          text NOT NULL,
  iban_masked        text NOT NULL,
  photo_seed         int NOT NULL DEFAULT 0
);
ALTER TABLE hcm.departments
  ADD CONSTRAINT departments_manager_fk FOREIGN KEY (manager_person_id) REFERENCES hcm.persons(id);

CREATE TABLE hcm.work_relationships (
  id                   serial PRIMARY KEY,
  period_of_service_id bigint UNIQUE NOT NULL,
  person_id            int NOT NULL REFERENCES hcm.persons(id),
  legal_employer_id    int NOT NULL REFERENCES hcm.legal_employers(id),
  worker_type          text NOT NULL,            -- E employee | P pending worker
  start_date           date NOT NULL,
  original_hire_date   date NOT NULL,
  end_date             date,
  notified_termination_date date,
  last_working_day     date,
  termination_action   text,                     -- RESIGNATION | TERMINATION | END_OF_CONTRACT | PROBATION_END
  termination_reason   text,
  rehire_eligible      boolean
);

-- Effective-dated, exactly like PER_ALL_ASSIGNMENTS_M: a change is a new row.
CREATE TABLE hcm.assignments (
  id                  serial PRIMARY KEY,
  assignment_number   text NOT NULL,             -- E100123
  person_id           int NOT NULL REFERENCES hcm.persons(id),
  work_relationship_id int NOT NULL REFERENCES hcm.work_relationships(id),
  effective_start     date NOT NULL,
  effective_end       date NOT NULL DEFAULT '4712-12-31',
  effective_sequence  int NOT NULL DEFAULT 1,
  action_code         text NOT NULL,             -- HIRE | PROMOTION | TRANSFER | SALARY_CHANGE | PROBATION_CONFIRM | TERMINATION
  action_reason       text,
  position_id         int REFERENCES hcm.positions(id),
  job_id              int NOT NULL REFERENCES hcm.jobs(id),
  department_id       int NOT NULL REFERENCES hcm.departments(id),
  grade_id            int NOT NULL REFERENCES hcm.grades(id),
  location_id         int NOT NULL REFERENCES hcm.locations(id),
  manager_person_id   int REFERENCES hcm.persons(id),
  assignment_status   text NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | INACTIVE
  probation_end_date  date,
  probation_status    text,                      -- IN_PROBATION | CONFIRMED
  contract_type       text NOT NULL DEFAULT 'FIXED_TERM',
  contract_end_date   date,
  notice_period_days  int NOT NULL DEFAULT 30,
  working_hours       numeric(4,1) NOT NULL DEFAULT 40,
  UNIQUE (assignment_number, effective_start, effective_sequence)
);
CREATE INDEX ON hcm.assignments (person_id, effective_start, effective_end);
CREATE INDEX ON hcm.assignments (manager_person_id);

-- Salary records, date-effective (Oracle `salaries`). Compa-ratio is derived.
CREATE TABLE hcm.salaries (
  id              serial PRIMARY KEY,
  person_id       int NOT NULL REFERENCES hcm.persons(id),
  assignment_number text NOT NULL,
  date_from       date NOT NULL,
  date_to         date NOT NULL DEFAULT '4712-12-31',
  basic           numeric(12,2) NOT NULL,
  housing         numeric(12,2) NOT NULL,
  transport       numeric(12,2) NOT NULL,
  other_allowance numeric(12,2) NOT NULL,
  currency        text NOT NULL DEFAULT 'AED',
  action_code     text NOT NULL,
  reason          text
);
CREATE INDEX ON hcm.salaries (person_id, date_from);

-- ---------------------------------------------------------------- payroll

CREATE TABLE hcm.element_types (
  code            text PRIMARY KEY,
  name            text NOT NULL,
  name_ar         text NOT NULL,
  classification  text NOT NULL,      -- EARNING | DEDUCTION | EMPLOYER_CONTRIBUTION | INFORMATION
  recurring       boolean NOT NULL
);

CREATE TABLE hcm.element_entries (
  id              serial PRIMARY KEY,
  entry_number    text UNIQUE NOT NULL,
  person_id       int NOT NULL REFERENCES hcm.persons(id),
  element_code    text NOT NULL REFERENCES hcm.element_types(code),
  amount          numeric(12,2) NOT NULL,
  effective_start date NOT NULL,
  effective_end   date NOT NULL DEFAULT '4712-12-31',
  source          text NOT NULL DEFAULT 'HRMS',     -- HRMS | RAFEEQ (written through the connector)
  reference       text
);
CREATE INDEX ON hcm.element_entries (person_id);

CREATE TABLE hcm.payroll_periods (
  id            serial PRIMARY KEY,
  period_name   text UNIQUE NOT NULL,  -- 2026-09
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  cutoff_date   date NOT NULL,
  pay_date      date NOT NULL,         -- MR 340/2026: wages due on the 1st for the previous month
  status        text NOT NULL          -- CLOSED | OPEN | RELEASED
);

CREATE TABLE hcm.payroll_results (
  id            serial PRIMARY KEY,
  period_id     int NOT NULL REFERENCES hcm.payroll_periods(id),
  person_id     int NOT NULL REFERENCES hcm.persons(id),
  days_paid     int NOT NULL,
  gross         numeric(12,2) NOT NULL,
  deductions    numeric(12,2) NOT NULL,
  employer_contributions numeric(12,2) NOT NULL DEFAULT 0,
  net           numeric(12,2) NOT NULL,
  lines         jsonb NOT NULL,        -- [{code, name, amount}]
  wps_status    text NOT NULL DEFAULT 'PAID',
  UNIQUE (period_id, person_id)
);

CREATE TABLE hcm.advances (
  id              serial PRIMARY KEY,
  advance_number  text UNIQUE NOT NULL,
  person_id       int NOT NULL REFERENCES hcm.persons(id),
  amount          numeric(12,2) NOT NULL,
  monthly_recovery numeric(12,2) NOT NULL,
  months          int NOT NULL,
  start_period    text NOT NULL,
  outstanding     numeric(12,2) NOT NULL,
  status          text NOT NULL      -- ACTIVE | SETTLED
);

-- End-of-service basis per employee: Art. 51 gratuity, or the voluntary
-- savings scheme (Cabinet Resolution 96/2023) where National Bonds is the
-- MOHRE-approved fund manager.
CREATE TABLE hcm.end_of_service (
  person_id        int PRIMARY KEY REFERENCES hcm.persons(id),
  basis            text NOT NULL,     -- GRATUITY | SAVINGS_SCHEME | GPSSA (UAE nationals: pension, no gratuity)
  enrolled_date    date,
  fund_name        text,
  contributions_to_date numeric(14,2)
);

-- ---------------------------------------------------------------- absence

CREATE TABLE hcm.absence_types (
  code               text PRIMARY KEY,
  name               text NOT NULL,
  name_ar            text NOT NULL,
  plan               text NOT NULL,
  annual_entitlement numeric(5,1),
  paid_rule          text NOT NULL,
  requires_certificate boolean NOT NULL DEFAULT false,
  legal_ref          text
);

CREATE TABLE hcm.absence_balances (
  person_id     int NOT NULL REFERENCES hcm.persons(id),
  year          int NOT NULL,
  type_code     text NOT NULL REFERENCES hcm.absence_types(code),
  entitlement   numeric(5,1) NOT NULL,
  carried_over  numeric(5,1) NOT NULL DEFAULT 0,
  taken         numeric(5,1) NOT NULL DEFAULT 0,
  booked        numeric(5,1) NOT NULL DEFAULT 0,
  PRIMARY KEY (person_id, year, type_code)
);

CREATE TABLE hcm.absences (
  id               serial PRIMARY KEY,
  absence_number   text UNIQUE NOT NULL,
  person_id        int NOT NULL REFERENCES hcm.persons(id),
  type_code        text NOT NULL REFERENCES hcm.absence_types(code),
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  days             numeric(5,1) NOT NULL,
  status           text NOT NULL,     -- SUBMITTED | APPROVED | DENIED | WITHDRAWN | COMPLETED
  approver_person_id int REFERENCES hcm.persons(id),
  submitted_at     timestamptz NOT NULL,
  comments         text,
  source           text NOT NULL DEFAULT 'HRMS'
);
CREATE INDEX ON hcm.absences (person_id, start_date);

-- ---------------------------------------------------------------- recruiting

CREATE TABLE hcm.requisitions (
  id                 serial PRIMARY KEY,
  req_number         text UNIQUE NOT NULL,     -- DEMO-REQ-2026-031
  position_id        int NOT NULL REFERENCES hcm.positions(id),
  title              text NOT NULL,
  title_ar           text NOT NULL,
  hiring_manager_id  int NOT NULL REFERENCES hcm.persons(id),
  recruiter_id       int NOT NULL REFERENCES hcm.persons(id),
  status             text NOT NULL,            -- DRAFT | PENDING_APPROVAL | OPEN | ON_HOLD | FILLED | CANCELLED
  openings           int NOT NULL DEFAULT 1,
  opened_date        date,
  target_start_date  date,
  saudi_priority   boolean NOT NULL DEFAULT false,
  summary            text NOT NULL,
  criteria           jsonb NOT NULL            -- [{key, label, kind: must|nice}]
);

CREATE TABLE hcm.candidates (
  id                serial PRIMARY KEY,
  candidate_number  text UNIQUE NOT NULL,      -- DEMO-CAN-40211
  first_name        text NOT NULL,
  last_name         text NOT NULL,
  display_name_ar   text NOT NULL,
  gender            text NOT NULL,
  nationality       text NOT NULL,
  is_saudi   boolean NOT NULL,
  email             text NOT NULL,
  current_employer  text,
  current_title     text,
  years_experience  int NOT NULL,
  education         text NOT NULL,
  certifications    text[] NOT NULL DEFAULT '{}',
  skills            text[] NOT NULL DEFAULT '{}',
  source            text NOT NULL,             -- Career site | LinkedIn | Referral | Agency | Nafis | Internal
  internal_person_id int REFERENCES hcm.persons(id)
);

CREATE TABLE hcm.applications (
  id                 serial PRIMARY KEY,
  application_number text UNIQUE NOT NULL,
  requisition_id     int NOT NULL REFERENCES hcm.requisitions(id),
  candidate_id       int NOT NULL REFERENCES hcm.candidates(id),
  phase              text NOT NULL,   -- NEW | SCREENING | SHORTLISTED | INTERVIEW | ASSESSMENT | OFFER | HIRED | NOT_SELECTED | WITHDRAWN
  applied_at         timestamptz NOT NULL,
  evidence           jsonb,           -- Hessa's evidence against criteria; never a score or rank
  recruiter_decision text,
  decision_reason    text,
  updated_at         timestamptz NOT NULL
);

CREATE TABLE hcm.interviews (
  id              serial PRIMARY KEY,
  application_id  int NOT NULL REFERENCES hcm.applications(id),
  stage           text NOT NULL,      -- Recruiter screen | Panel | Assessment centre
  scheduled_at    timestamptz NOT NULL,
  panel           jsonb NOT NULL,
  status          text NOT NULL,      -- SCHEDULED | COMPLETED | CANCELLED
  scores          jsonb,              -- [{assessor, competency, score 1-5}]
  recommendation  text
);

CREATE TABLE hcm.assessment_centres (
  id           serial PRIMARY KEY,
  code         text UNIQUE NOT NULL,
  name         text NOT NULL,
  purpose      text NOT NULL,         -- SELECTION | DEVELOPMENT
  centre_date  date NOT NULL,
  exercises    jsonb NOT NULL,
  competencies jsonb NOT NULL,
  status       text NOT NULL
);

CREATE TABLE hcm.assessment_results (
  id              serial PRIMARY KEY,
  centre_id       int NOT NULL REFERENCES hcm.assessment_centres(id),
  participant     text NOT NULL,      -- candidate number or person number
  participant_name text NOT NULL,
  assessor        text NOT NULL,
  exercise        text NOT NULL,
  competency      text NOT NULL,
  score           int NOT NULL CHECK (score BETWEEN 1 AND 5)
);

CREATE TABLE hcm.offers (
  id            serial PRIMARY KEY,
  offer_number  text UNIQUE NOT NULL,
  application_id int NOT NULL REFERENCES hcm.applications(id),
  position_id   int NOT NULL REFERENCES hcm.positions(id),
  grade_id      int NOT NULL REFERENCES hcm.grades(id),
  basic         numeric(12,2) NOT NULL,
  housing       numeric(12,2) NOT NULL,
  transport     numeric(12,2) NOT NULL,
  other_allowance numeric(12,2) NOT NULL,
  start_date    date NOT NULL,
  status        text NOT NULL,        -- DRAFT | PENDING_APPROVAL | EXTENDED | ACCEPTED | DECLINED
  extended_at   timestamptz,
  responded_at  timestamptz
);

-- ---------------------------------------------------------------- talent

CREATE TABLE hcm.goals (
  id          serial PRIMARY KEY,
  person_id   int NOT NULL REFERENCES hcm.persons(id),
  year        int NOT NULL,
  title       text NOT NULL,
  title_ar    text NOT NULL,
  weight      int NOT NULL,
  progress    int NOT NULL,           -- percent
  status      text NOT NULL           -- ON_TRACK | AT_RISK | COMPLETED | NOT_STARTED
);

CREATE TABLE hcm.check_ins (
  id          serial PRIMARY KEY,
  person_id   int NOT NULL REFERENCES hcm.persons(id),
  manager_id  int NOT NULL REFERENCES hcm.persons(id),
  check_in_date date NOT NULL,
  topics      text NOT NULL,
  sentiment   text NOT NULL           -- POSITIVE | NEUTRAL | CONCERN
);

CREATE TABLE hcm.performance_documents (
  id               serial PRIMARY KEY,
  doc_number       text UNIQUE NOT NULL,
  person_id        int NOT NULL REFERENCES hcm.persons(id),
  manager_id       int REFERENCES hcm.persons(id),
  review_period    text NOT NULL,     -- FY2024 | FY2025 | FY2026 (Oct-Sep)
  status           text NOT NULL,     -- NOT_STARTED | SELF_EVALUATION | MANAGER_EVALUATION | CALIBRATION | SHARED | COMPLETED
  self_rating      int,
  manager_rating   int,
  calibrated_rating int,
  manager_comment  text,
  calibration_note text,
  updated_at       timestamptz NOT NULL
);

CREATE TABLE hcm.talent_profiles (
  person_id      int PRIMARY KEY REFERENCES hcm.persons(id),
  potential      text NOT NULL,       -- LOW | MEDIUM | HIGH
  flight_risk    text NOT NULL,       -- LOW | MEDIUM | HIGH
  readiness      text,                -- READY_NOW | READY_1_2 | READY_3_PLUS
  key_skills     text[] NOT NULL DEFAULT '{}',
  mobility       text NOT NULL DEFAULT 'OPEN'
);

CREATE TABLE hcm.succession_plans (
  id              serial PRIMARY KEY,
  position_id     int NOT NULL REFERENCES hcm.positions(id),
  incumbent_id    int REFERENCES hcm.persons(id),
  risk_of_loss    text NOT NULL,
  impact_of_loss  text NOT NULL
);

CREATE TABLE hcm.succession_candidates (
  plan_id     int NOT NULL REFERENCES hcm.succession_plans(id),
  person_id   int NOT NULL REFERENCES hcm.persons(id),
  readiness   text NOT NULL,
  PRIMARY KEY (plan_id, person_id)
);

CREATE TABLE hcm.learning_items (
  id        serial PRIMARY KEY,
  code      text UNIQUE NOT NULL,
  title     text NOT NULL,
  title_ar  text NOT NULL,
  kind      text NOT NULL,          -- COURSE | CERTIFICATION | COMPLIANCE
  hours     numeric(5,1) NOT NULL
);

CREATE TABLE hcm.learning_enrollments (
  person_id  int NOT NULL REFERENCES hcm.persons(id),
  item_id    int NOT NULL REFERENCES hcm.learning_items(id),
  status     text NOT NULL,         -- ASSIGNED | IN_PROGRESS | COMPLETED | OVERDUE
  due_date   date,
  completed_date date,
  PRIMARY KEY (person_id, item_id)
);

-- ---------------------------------------------------------------- documents, journeys, events

CREATE TABLE hcm.document_records (
  id               serial PRIMARY KEY,
  document_number  text UNIQUE NOT NULL,   -- DEMO-DOC-26-01844
  person_id        int NOT NULL REFERENCES hcm.persons(id),
  type             text NOT NULL,          -- SALARY_CERTIFICATE | EMPLOYMENT_CERTIFICATE | SALARY_TRANSFER | NOC_TRAVEL | NOC_DRIVING | EXPERIENCE | OFFER_LETTER | WARNING
  addressee        text,
  purpose          text,
  language         text NOT NULL DEFAULT 'en',
  status           text NOT NULL,          -- DRAFT | ISSUED | VOID
  issued_at        timestamptz,
  body             text NOT NULL,
  issued_by        text NOT NULL           -- agent id or person number
);
CREATE INDEX ON hcm.document_records (person_id);

CREATE TABLE hcm.journeys (
  id              serial PRIMARY KEY,
  journey_number  text UNIQUE NOT NULL,
  person_id       int NOT NULL REFERENCES hcm.persons(id),
  template        text NOT NULL,           -- PREBOARDING | ONBOARDING | OFFBOARDING
  status          text NOT NULL,           -- IN_PROGRESS | COMPLETED | BLOCKED
  started_at      date NOT NULL,
  target_date     date NOT NULL
);

CREATE TABLE hcm.journey_tasks (
  id            serial PRIMARY KEY,
  journey_id    int NOT NULL REFERENCES hcm.journeys(id) ON DELETE CASCADE,
  seq           int NOT NULL,
  task_key      text NOT NULL,
  title         text NOT NULL,
  title_ar      text NOT NULL,
  owner         text NOT NULL,             -- EMPLOYEE | MANAGER | HR_OPS | IT | DALIL | WADAA | MOHRE | ICP | CLINIC | INSURER | VENDOR
  external_system text,
  status        text NOT NULL,             -- NOT_STARTED | IN_PROGRESS | DONE | BLOCKED
  due_date      date NOT NULL,
  completed_at  date,
  note          text
);

-- Oracle Atom feed collections: newhire, empassignment, empupdate, payupdate,
-- termination, workrelshipupdate.
CREATE TABLE hcm.atom_events (
  id            bigserial PRIMARY KEY,
  collection    text NOT NULL,
  entity_key    text NOT NULL,
  summary       text NOT NULL,
  payload       jsonb NOT NULL,
  published_at  timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- layer: the agentic layer's own data
-- =============================================================================

CREATE TABLE layer.personas (
  key            text PRIMARY KEY,         -- employee | joiner | manager | hrbp | ta | payroll | chro
  person_id      int NOT NULL,             -- the HRMS person this persona signs in as
  label          text NOT NULL,
  label_ar       text NOT NULL,
  role_title     text NOT NULL,
  role_title_ar  text NOT NULL,
  lenses         text[] NOT NULL,
  roles          text[] NOT NULL,          -- EMPLOYEE, LINE_MANAGER, HRBP, TA, PAYROLL, HR_OPS, CHRO
  scope          jsonb NOT NULL,           -- data scope: self | team | division | all
  approval_limits jsonb NOT NULL,          -- [{what, limit, limit_ar}]
  sort           int NOT NULL
);

CREATE TABLE layer.agents (
  id             text PRIMARY KEY,         -- rafeeq, ajaza, ...
  name           text NOT NULL,
  name_ar        text NOT NULL,
  title          text NOT NULL,
  title_ar       text NOT NULL,
  stage          text NOT NULL,
  purpose        text NOT NULL,
  purpose_ar     text NOT NULL,
  autonomy       text NOT NULL,            -- A0 .. A4, the rung the prototype runs at
  owner_person_id int,                    -- null when the owner is a Tasama person (see owner_name in the API)
  functions      jsonb NOT NULL,
  superpower     text NOT NULL,
  impact         text NOT NULL,
  tools          text[] NOT NULL,
  hcm_reads      text[] NOT NULL,
  hcm_writes     text[] NOT NULL,
  decides        text NOT NULL,            -- who decides what this agent prepares
  sort           int NOT NULL
);

CREATE TABLE layer.policies (
  id             text PRIMARY KEY,         -- NBC-HR-07
  title          text NOT NULL,
  title_ar       text NOT NULL,
  version        text NOT NULL,
  effective_date date NOT NULL,
  owner          text NOT NULL,
  summary        text NOT NULL
);

CREATE TABLE layer.policy_clauses (
  id          text PRIMARY KEY,            -- NBC-HR-07 §7.3
  policy_id   text NOT NULL REFERENCES layer.policies(id),
  clause_ref  text NOT NULL,
  heading     text NOT NULL,
  heading_ar  text NOT NULL,
  text_en     text NOT NULL,
  text_ar     text NOT NULL,
  legal_ref   text,
  tags        text[] NOT NULL DEFAULT '{}',
  search      tsvector
);
CREATE INDEX ON layer.policy_clauses USING gin (search);

CREATE TABLE layer.workflow_defs (
  id          text PRIMARY KEY,            -- WF-16
  num         int NOT NULL,
  name        text NOT NULL,
  name_ar     text NOT NULL,
  stage       text NOT NULL,
  coverage    text NOT NULL,               -- implemented | partial | designed
  trigger_en  text NOT NULL,
  agents      text[] NOT NULL,
  decision_by text NOT NULL,
  steps       jsonb NOT NULL               -- [{key, actor_type, actor, label, inputs, outputs, decision}]
);

CREATE TABLE layer.requests (
  id               serial PRIMARY KEY,
  ref              text UNIQUE NOT NULL,   -- DEMO-CASE-26-00412
  workflow_id      text NOT NULL REFERENCES layer.workflow_defs(id),
  type             text NOT NULL,          -- SALARY_CERTIFICATE, LEAVE, ADVANCE, ...
  title            text NOT NULL,
  title_ar         text NOT NULL,
  requester_person_id int NOT NULL,
  subject_person_id   int NOT NULL,
  status           text NOT NULL,          -- RUNNING | WAITING | COMPLETED | REJECTED | ESCALATED | CANCELLED
  priority         text NOT NULL DEFAULT 'NORMAL',  -- LOW | NORMAL | HIGH | URGENT
  channel          text NOT NULL,          -- CHAT | FORM | EVENT | SCHEDULE | SCENARIO
  current_step     text,
  waiting_on_role  text,                   -- which role's inbox it sits in
  waiting_on_person_id int,
  sla_due          timestamptz,
  payload          jsonb NOT NULL DEFAULT '{}',
  result           jsonb NOT NULL DEFAULT '{}',
  scenario_key     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz
);
CREATE INDEX ON layer.requests (status, waiting_on_role);
CREATE INDEX ON layer.requests (subject_person_id);

CREATE TABLE layer.run_steps (
  id           serial PRIMARY KEY,
  request_id   int NOT NULL REFERENCES layer.requests(id) ON DELETE CASCADE,
  seq          int NOT NULL,
  step_key     text NOT NULL,
  actor_type   text NOT NULL,              -- AGENT | HUMAN | SYSTEM
  actor_id     text NOT NULL,              -- agent id, role, or 'connector'
  label        text NOT NULL,
  label_ar     text NOT NULL,
  status       text NOT NULL,              -- PENDING | RUNNING | DONE | WAITING | SKIPPED | FAILED | REFUSED
  outputs      jsonb NOT NULL DEFAULT '{}',
  decision     text,
  started_at   timestamptz,
  ended_at     timestamptz
);
CREATE INDEX ON layer.run_steps (request_id, seq);

CREATE TABLE layer.approvals (
  id               serial PRIMARY KEY,
  request_id       int NOT NULL REFERENCES layer.requests(id) ON DELETE CASCADE,
  step_key         text NOT NULL,
  approver_role    text NOT NULL,
  approver_person_id int,
  decision         text NOT NULL,          -- PENDING | APPROVED | REJECTED | RETURNED
  reason           text,
  decided_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- The decision trail. Overrides are the most valuable rows.
CREATE TABLE layer.trail (
  id            bigserial PRIMARY KEY,
  request_id    int REFERENCES layer.requests(id) ON DELETE CASCADE,
  at            timestamptz NOT NULL DEFAULT now(),
  actor_type    text NOT NULL,             -- AGENT | HUMAN | SYSTEM
  actor_id      text NOT NULL,
  actor_name    text NOT NULL,
  act           text NOT NULL,             -- READ | CHECK | RECOMMEND | PREPARE | APPROVE | REJECT | OVERRIDE | WRITE | NOTIFY | REFUSE | ESCALATE | ANSWER
  autonomy      text,
  summary       text NOT NULL,
  summary_ar    text NOT NULL,
  override_reason text,
  citation      text
);
CREATE INDEX ON layer.trail (request_id, at);
CREATE INDEX ON layer.trail (at DESC);

CREATE TABLE layer.integration_log (
  id           bigserial PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  system       text NOT NULL,              -- ORACLE_HCM | ATOM | MOHRE | ICP | WPS_BANK | GPSSA | M365 | BGCHECK | ASSESSMENT | ANTHROPIC
  direction    text NOT NULL,              -- OUT | IN
  method       text NOT NULL,
  resource     text NOT NULL,
  status_code  int NOT NULL,
  latency_ms   int NOT NULL,
  request_id   int,
  actor_id     text,
  summary      text NOT NULL
);
CREATE INDEX ON layer.integration_log (at DESC);

CREATE TABLE layer.conversations (
  id          serial PRIMARY KEY,
  persona_key text NOT NULL,
  assistant   text NOT NULL,               -- rafeeq | murshid
  started_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE layer.messages (
  id              bigserial PRIMARY KEY,
  conversation_id int NOT NULL REFERENCES layer.conversations(id) ON DELETE CASCADE,
  role            text NOT NULL,           -- user | assistant
  content         text NOT NULL,
  agent_id        text,
  mode            text,                    -- claude | offline
  citations       jsonb NOT NULL DEFAULT '[]',
  tool_calls      jsonb NOT NULL DEFAULT '[]',
  pending         jsonb,                   -- a write awaiting the user's confirmation
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE layer.alerts (
  id           serial PRIMARY KEY,
  ref          text UNIQUE NOT NULL,
  kind         text NOT NULL,              -- VISA_EXPIRY | EID_EXPIRY | PASSPORT_EXPIRY | PROBATION_DUE | CONTRACT_RENEWAL | EMIRATISATION | WPS_DUE | LEARNING_OVERDUE
  severity     text NOT NULL,              -- INFO | WATCH | ACTION | URGENT
  person_id    int,
  title        text NOT NULL,
  title_ar     text NOT NULL,
  detail       text NOT NULL,
  due_date     date,
  owner_role   text NOT NULL,
  status       text NOT NULL DEFAULT 'OPEN',   -- OPEN | ASSIGNED | RESOLVED
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE layer.notifications (
  id          bigserial PRIMARY KEY,
  person_id   int NOT NULL,
  title       text NOT NULL,
  title_ar    text NOT NULL,
  body        text NOT NULL,
  link        text,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE layer.meta (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);

CREATE SEQUENCE layer.case_seq START 4100;
CREATE SEQUENCE hcm.doc_seq START 1800;
CREATE SEQUENCE hcm.misc_seq START 5000;

-- ---------------------------------------------------------------- issues (input to Basira's pattern watch)
-- One row per problem that happened on a case: an escalation, a rejection, a
-- case returned for correction, a payroll pre-run finding. Each carries a
-- reason code from a fixed list and the facts root-cause analysis needs
-- (who it waited on, which step, who entered the data, whether it came after
-- the payroll cut-off). Older history is synthetic; new rows are written by
-- Raqeeb and by decisions taken in the platform.
CREATE TABLE layer.issues (
  id           serial PRIMARY KEY,
  ref          text UNIQUE NOT NULL,
  occurred_at  timestamptz NOT NULL,
  category     text NOT NULL,             -- ESCALATION | REJECTION | RETURNED | PAYROLL_FINDING
  workflow_id  text,
  reason_code  text NOT NULL,
  case_ref     text,
  summary      text NOT NULL,
  attrs        jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX ON layer.issues (occurred_at);

-- Cases handled per week and workflow: the denominator, so rates are compared, not raw counts.
CREATE TABLE layer.weekly_volume (
  week         date NOT NULL,
  workflow_id  text NOT NULL,
  cases        int NOT NULL,
  PRIMARY KEY (week, workflow_id)
);

-- ---------------------------------------------------------------- the client's policy as payroll reads it
-- design/payroll-addendum.md §4. A handbook becomes a version of itemised
-- rules on 27 dimensions (domain/payroll-policy.ts). Nizam drafts a version;
-- the client's CHRO activates it. Each rule keeps the clause and the words it
-- came from, and a flag where the law refuses it or the words are unclear.
CREATE TABLE layer.policy_versions (
  id             serial PRIMARY KEY,
  version        text NOT NULL,
  status         text NOT NULL,             -- DRAFT | ACTIVE | SUPERSEDED
  source         text NOT NULL,             -- the handbook it was read from
  read_by        text NOT NULL,             -- Nizam (Claude) | Nizam (offline)
  effective_from date NOT NULL,
  created_at     timestamptz NOT NULL,
  activated_by   text,
  activated_at   timestamptz,
  request_id     int
);
CREATE TABLE layer.policy_rules (
  id           serial PRIMARY KEY,
  version_id   int NOT NULL REFERENCES layer.policy_versions(id) ON DELETE CASCADE,
  dim          int NOT NULL,
  key          text NOT NULL,
  label        text NOT NULL,
  label_ar     text NOT NULL,
  value        text NOT NULL,
  value_ar     text,
  num          numeric,
  basis        text NOT NULL,               -- HANDBOOK | LAW | DEFAULT
  clause       text,
  quote        text,
  flag         text,                        -- BELOW_LAW | UNCLEAR | MISSING
  flag_note    text,
  resolution   text,                        -- what the person decided for a flagged rule
  UNIQUE (version_id, key)
);
