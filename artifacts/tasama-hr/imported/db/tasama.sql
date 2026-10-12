-- =============================================================================
-- Tasama HR Services: the provider's own data, above the client accounts.
--
-- Each client has its own simulated HRMS schema (hcm_<key>) and its own
-- agentic-layer schema (layer_<key>), created from schema.sql. This schema
-- holds what Tasama runs as a business: the client contracts and service
-- levels, the delivery team, invoices, satisfaction surveys, payroll run
-- outcomes, the escalations its SLA agent raises, and Tasama's own trail.
--
-- Everything is synthetic. Contracts, fees and service levels are illustrative.
-- =============================================================================

DROP SCHEMA IF EXISTS tasama CASCADE;
CREATE SCHEMA tasama;

CREATE TABLE tasama.clients (
  key             text PRIMARY KEY,
  code            text NOT NULL,
  name            text NOT NULL,
  name_ar         text NOT NULL,
  short           text NOT NULL,
  sector          text NOT NULL,
  sector_ar       text NOT NULL,
  city            text NOT NULL,
  city_ar         text NOT NULL,
  hrms            text NOT NULL,            -- ORACLE | ODOO
  hrms_label      text NOT NULL,
  model           text NOT NULL,
  model_ar        text NOT NULL,
  services        text[] NOT NULL,
  pepm            numeric NOT NULL,         -- SAR per employee per month
  per_hire        numeric NOT NULL,
  contract_start  date NOT NULL,
  contract_end    date NOT NULL,
  phase           text NOT NULL,            -- BUILD | OPERATE | TRANSFER
  credit_cap_pct  numeric NOT NULL,
  account_manager_id int,
  nitaqat         jsonb NOT NULL,
  sort            int NOT NULL
);

CREATE TABLE tasama.sla_defs (
  client_key  text NOT NULL REFERENCES tasama.clients(key) ON DELETE CASCADE,
  key         text NOT NULL,
  label       text NOT NULL,
  label_ar    text NOT NULL,
  target      numeric NOT NULL,
  credit_pct  numeric NOT NULL,
  PRIMARY KEY (client_key, key)
);

CREATE TABLE tasama.staff (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  name_ar       text NOT NULL,
  role          text NOT NULL,
  role_ar       text NOT NULL,
  skills        text[] NOT NULL,          -- PAYROLL, HR_OPS, RECRUITMENT, ACCOUNT
  monthly_cost  numeric NOT NULL,         -- fully loaded, SAR
  capacity_hours numeric NOT NULL         -- per month
);

CREATE TABLE tasama.allocations (
  staff_id    int NOT NULL REFERENCES tasama.staff(id) ON DELETE CASCADE,
  client_key  text NOT NULL REFERENCES tasama.clients(key) ON DELETE CASCADE,
  fte         numeric NOT NULL,
  PRIMARY KEY (staff_id, client_key)
);

-- One row per client per closed month: what the payroll run looked like after release.
CREATE TABLE tasama.payroll_runs (
  client_key          text NOT NULL REFERENCES tasama.clients(key) ON DELETE CASCADE,
  period              date NOT NULL,       -- month start
  employees           int NOT NULL,
  findings_before     int NOT NULL,        -- caught by the pre-run check and fixed or explained
  errors_after        int NOT NULL,        -- corrections needed after release
  pay_date_due        date NOT NULL,
  paid_on             date NOT NULL,
  mudad_uploaded_on   date NOT NULL,
  gross               numeric NOT NULL,
  PRIMARY KEY (client_key, period)
);

CREATE TABLE tasama.invoices (
  id            serial PRIMARY KEY,
  number        text UNIQUE NOT NULL,
  client_key    text NOT NULL REFERENCES tasama.clients(key) ON DELETE CASCADE,
  period        date NOT NULL,
  headcount     int NOT NULL,
  base_fee      numeric NOT NULL,
  hires         int NOT NULL,
  hire_fees     numeric NOT NULL,
  credits       numeric NOT NULL,         -- service credits for missed SLAs (negative impact)
  credit_lines  jsonb NOT NULL DEFAULT '[]',
  vat           numeric NOT NULL,
  total         numeric NOT NULL,
  status        text NOT NULL,            -- PREPARED | APPROVED | ISSUED | PAID | OVERDUE
  prepared_at   timestamptz,
  issued_at     date,
  due_at        date,
  paid_at       date,
  notes         jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE tasama.csat (
  client_key  text NOT NULL REFERENCES tasama.clients(key) ON DELETE CASCADE,
  period      date NOT NULL,
  score       numeric NOT NULL,           -- 1-5
  responses   int NOT NULL,
  PRIMARY KEY (client_key, period)
);

CREATE TABLE tasama.escalations (
  id           serial PRIMARY KEY,
  client_key   text NOT NULL REFERENCES tasama.clients(key) ON DELETE CASCADE,
  case_ref     text NOT NULL,
  title        text NOT NULL,
  title_ar     text NOT NULL,
  sla_key      text NOT NULL,
  kind         text NOT NULL,             -- AT_RISK | BREACHED
  waiting_on   text,
  waiting_on_role text,
  due_at       timestamptz,
  detected_at  timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'OPEN',   -- OPEN | NUDGED | ASSIGNED | RESOLVED
  owner_staff_id int REFERENCES tasama.staff(id),
  action       text,
  note         text,
  resolved_at  timestamptz,
  reason_code  text,
  UNIQUE (client_key, case_ref)
);

CREATE TABLE tasama.trail (
  id          serial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  client_key  text,
  actor_type  text NOT NULL,              -- AGENT | HUMAN | SYSTEM
  actor_id    text NOT NULL,
  actor_name  text NOT NULL,
  act         text NOT NULL,
  autonomy    text,
  summary     text NOT NULL,
  summary_ar  text NOT NULL,
  ref         text
);

-- Basira's pattern watch: a rising rate of one kind of problem, the cases behind it, the likely causes and what was done.
CREATE TABLE tasama.patterns (
  id            serial PRIMARY KEY,
  ref           text UNIQUE NOT NULL,             -- PAT-2026-001
  scope         text NOT NULL,                    -- CLIENT | CROSS_CLIENT
  client_keys   text[] NOT NULL,
  category      text NOT NULL,
  workflow_id   text,
  reason_code   text NOT NULL,
  title         text NOT NULL,
  title_ar      text NOT NULL,
  baseline_rate numeric NOT NULL,                 -- per 100 cases, weekly average over the baseline weeks
  current_rate  numeric NOT NULL,                 -- per 100 cases, average over the last two weeks
  series        jsonb NOT NULL,                   -- [{week, rate, issues, cases}]
  issue_refs    text[] NOT NULL,
  case_refs     text[] NOT NULL,
  facts         jsonb NOT NULL,                   -- what is different about the recent issues
  causes        jsonb NOT NULL,                   -- [{cause, evidence, strength}] likely causes, not conclusions
  causes_by     text NOT NULL,                    -- 'claude' | 'rules'
  status        text NOT NULL DEFAULT 'NEW',      -- NEW | ASSIGNED | MONITORING | CLOSED
  owner_staff_id int REFERENCES tasama.staff(id),
  action        text,
  recheck_on    date,
  outcome       text,
  detected_at   timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Rises Basira looked at and did not flag, with the reason (one week only, too few cases).
CREATE TABLE tasama.pattern_watch (
  id           serial PRIMARY KEY,
  client_key   text NOT NULL,
  category     text NOT NULL,
  workflow_id  text,
  reason_code  text NOT NULL,
  note         text NOT NULL,
  series       jsonb NOT NULL,
  scanned_at   timestamptz NOT NULL DEFAULT now()
);

-- The Demo Director: which scenario is playing, at which step, and what each step did.
CREATE TABLE tasama.director_runs (
  id           serial PRIMARY KEY,
  key          text NOT NULL,
  client_key   text NOT NULL,
  status       text NOT NULL DEFAULT 'RUNNING',   -- RUNNING | DONE | ABANDONED
  step_index   int NOT NULL DEFAULT -1,
  refs         jsonb NOT NULL DEFAULT '{}',       -- case references the scenario created, by name
  log          jsonb NOT NULL DEFAULT '[]',
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);

CREATE TABLE tasama.meta (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);
