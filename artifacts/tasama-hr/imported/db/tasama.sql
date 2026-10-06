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

CREATE TABLE tasama.meta (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);
