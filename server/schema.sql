-- LOTS CRM — MySQL schema (MySQL 5.7+ / 8.x, MariaDB 10.5+).
-- The CRM creates these tables itself on first start if its user has CREATE rights;
-- otherwise a DBA can run this file once.
--
-- Every table keeps the full record in `doc` (JSON) plus real columns for searching and reports.
-- Times are stored in UTC.

CREATE TABLE IF NOT EXISTS cases (
  id              VARCHAR(20)  NOT NULL PRIMARY KEY,
  created_at      DATETIME(3)  NULL,
  updated_at      DATETIME(3)  NULL,
  channel         VARCHAR(40)  NULL,
  caller_type     VARCHAR(40)  NULL,
  member_id       VARCHAR(20)  NULL,
  name            VARCHAR(200) NULL,
  phone           VARCHAR(20)  NULL,
  email           VARCHAR(200) NULL,
  business_name   VARCHAR(200) NULL,
  card_no         VARCHAR(50)  NULL,
  store           VARCHAR(10)  NULL,
  case_type       VARCHAR(40)  NULL,
  category        VARCHAR(80)  NULL,
  sub_category    VARCHAR(120) NULL,
  status          VARCHAR(20)  NULL,
  resolution_type VARCHAR(10)  NULL,
  escalation_level INT         NULL,
  escalated_at    DATETIME(3)  NULL,
  due_at          DATETIME(3)  NULL,
  closed_at       DATETIME(3)  NULL,
  assigned_to     VARCHAR(80)  NULL,
  created_by      VARCHAR(80)  NULL,
  doc             JSON         NOT NULL,
  KEY idx_cases_status (status),
  KEY idx_cases_phone (phone),
  KEY idx_cases_created (created_at),
  KEY idx_cases_store (store),
  KEY idx_cases_agent (assigned_to)
);

CREATE TABLE IF NOT EXISTS members (
  id             VARCHAR(20)  NOT NULL PRIMARY KEY,
  card_no        VARCHAR(50)  NULL,
  business_name  VARCHAR(200) NULL,
  owner_name     VARCHAR(200) NULL,
  phone          VARCHAR(20)  NULL,
  alt_phone      VARCHAR(20)  NULL,
  email          VARCHAR(200) NULL,
  gstin          VARCHAR(20)  NULL,
  customer_group VARCHAR(80)  NULL,
  customer_type  VARCHAR(80)  NULL,
  home_store     VARCHAR(10)  NULL,
  status         VARCHAR(20)  NULL,
  created_at     DATETIME(3)  NULL,
  doc            JSON         NOT NULL,
  KEY idx_members_phone (phone),
  KEY idx_members_card (card_no)
);

CREATE TABLE IF NOT EXISTS missed_calls (
  id          VARCHAR(20) NOT NULL PRIMARY KEY,
  phone       VARCHAR(20) NULL,
  missed_at   DATETIME(3) NULL,
  due_at      DATETIME(3) NULL,
  status      VARCHAR(40) NULL,
  assigned_to VARCHAR(80) NULL,
  case_id     VARCHAR(20) NULL,
  txn_id      VARCHAR(64) NULL,
  doc         JSON        NOT NULL,
  KEY idx_missed_status (status),
  KEY idx_missed_at (missed_at)
);

CREATE TABLE IF NOT EXISTS leads (
  id            VARCHAR(20)  NOT NULL PRIMARY KEY,
  type          VARCHAR(60)  NULL,
  name          VARCHAR(200) NULL,
  business_name VARCHAR(200) NULL,
  phone         VARCHAR(20)  NULL,
  store         VARCHAR(10)  NULL,
  status        VARCHAR(40)  NULL,
  case_id       VARCHAR(20)  NULL,
  assigned_to   VARCHAR(80)  NULL,
  created_at    DATETIME(3)  NULL,
  doc           JSON         NOT NULL,
  KEY idx_leads_status (status)
);

CREATE TABLE IF NOT EXISTS calls (
  id           VARCHAR(64) NOT NULL PRIMARY KEY,
  direction    VARCHAR(10) NULL,
  phone        VARCHAR(20) NULL,
  agent        VARCHAR(80) NULL,
  started_at   DATETIME(3) NULL,
  ended_at     DATETIME(3) NULL,
  connected    TINYINT(1)  NULL,
  disposition  VARCHAR(60) NULL,
  duration_sec INT         NULL,
  case_id      VARCHAR(20) NULL,
  member_id    VARCHAR(20) NULL,
  doc          JSON        NOT NULL,
  KEY idx_calls_started (started_at),
  KEY idx_calls_agent (agent),
  KEY idx_calls_phone (phone)
);

CREATE TABLE IF NOT EXISTS outbox (
  id        VARCHAR(20)  NOT NULL PRIMARY KEY,
  sent_at   DATETIME(3)  NULL,
  to_addr   VARCHAR(500) NULL,
  subject   VARCHAR(500) NULL,
  kind      VARCHAR(60)  NULL,
  status    VARCHAR(20)  NULL,
  case_id   VARCHAR(20)  NULL,
  doc       JSON         NOT NULL,
  KEY idx_outbox_case (case_id)
);

CREATE TABLE IF NOT EXISTS stores (
  code       VARCHAR(10)  NOT NULL PRIMARY KEY,
  short_name VARCHAR(10)  NULL,
  name       VARCHAR(100) NULL,
  spoc_name  VARCHAR(100) NULL,
  spoc_email VARCHAR(300) NULL,
  spoc_phone VARCHAR(40)  NULL,
  doc        JSON         NOT NULL
);

-- Small shared values: counters, agents, agent emails / shifts, automation settings and state, activity log.
CREATE TABLE IF NOT EXISTS kv (
  k          VARCHAR(50) NOT NULL PRIMARY KEY,
  v          JSON        NOT NULL,
  updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================================================
-- Readable detail and reference tables (schema v2).
-- The CRM keeps these in step automatically; they are for viewing and reports (read-only).
-- ============================================================================================

-- One row per timeline entry of a case (status changes, notes, calls, emails).
CREATE TABLE IF NOT EXISTS case_timeline (
  case_id     VARCHAR(20)  NOT NULL,
  seq         INT          NOT NULL,
  at          DATETIME(3)  NULL,
  by_agent    VARCHAR(80)  NULL,
  type        VARCHAR(30)  NULL,
  from_status VARCHAR(20)  NULL,
  to_status   VARCHAR(20)  NULL,
  subject     VARCHAR(500) NULL,
  text        TEXT         NULL,
  PRIMARY KEY (case_id, seq),
  KEY idx_tl_at (at),
  KEY idx_tl_type (type)
);

-- SparkTG calls linked to a case.
CREATE TABLE IF NOT EXISTS case_calls (
  case_id       VARCHAR(20)  NOT NULL,
  txn_id        VARCHAR(64)  NOT NULL,
  status        VARCHAR(30)  NULL,
  direction     VARCHAR(20)  NULL,
  disposition   VARCHAR(60)  NULL,
  duration_sec  INT          NULL,
  agent         VARCHAR(80)  NULL,
  recording_url VARCHAR(500) NULL,
  linked_at     DATETIME(3)  NULL,
  PRIMARY KEY (case_id, txn_id)
);

-- Files received with a case (email attachments).
CREATE TABLE IF NOT EXISTS case_attachments (
  case_id      VARCHAR(20)  NOT NULL,
  file         VARCHAR(255) NOT NULL,
  name         VARCHAR(255) NULL,
  size_bytes   INT          NULL,
  content_type VARCHAR(100) NULL,
  at           DATETIME(3)  NULL,
  PRIMARY KEY (case_id, file)
);

-- Add-on (secondary) cards of a member.
CREATE TABLE IF NOT EXISTS member_addon_cards (
  member_id VARCHAR(20)  NOT NULL,
  seq       INT          NOT NULL,
  name      VARCHAR(200) NULL,
  phone     VARCHAR(20)  NULL,
  card_no   VARCHAR(50)  NULL,
  PRIMARY KEY (member_id, seq),
  KEY idx_addon_phone (phone)
);

-- Every call outcome logged on an outbound lead.
CREATE TABLE IF NOT EXISTS lead_log (
  lead_id  VARCHAR(20)  NOT NULL,
  seq      INT          NOT NULL,
  at       DATETIME(3)  NULL,
  by_agent VARCHAR(80)  NULL,
  outcome  VARCHAR(60)  NULL,
  note     TEXT         NULL,
  PRIMARY KEY (lead_id, seq)
);

-- Call-back attempts on a missed call.
CREATE TABLE IF NOT EXISTS missed_call_attempts (
  missed_call_id VARCHAR(20)  NOT NULL,
  seq            INT          NOT NULL,
  at             DATETIME(3)  NULL,
  by_agent       VARCHAR(80)  NULL,
  outcome        VARCHAR(200) NULL,
  txn_id         VARCHAR(64)  NULL,
  PRIMARY KEY (missed_call_id, seq)
);

-- Agents with their SparkTG login email and shift.
CREATE TABLE IF NOT EXISTS agents (
  name          VARCHAR(80)  NOT NULL PRIMARY KEY,
  sparktg_email VARCHAR(200) NULL,
  shift         VARCHAR(20)  NULL
);

-- Everything the automation engine did.
CREATE TABLE IF NOT EXISTS automation_log (
  id      BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  at      DATETIME(3)  NOT NULL,
  text    VARCHAR(1000) NULL,
  case_id VARCHAR(20)  NULL,
  KEY idx_autolog_at (at),
  KEY idx_autolog_case (case_id)
);

-- ----- Reference data from the SOP (rewritten from the CRM's code at every start) -----

-- Case type → category → sub-category, with the SOP requirements where the SOP lists them.
CREATE TABLE IF NOT EXISTS ref_case_categories (
  case_type      VARCHAR(40)  NOT NULL,
  category       VARCHAR(80)  NOT NULL,
  sub_category   VARCHAR(120) NOT NULL,
  sort           INT          NOT NULL,
  needs_documents TINYINT(1)  NOT NULL DEFAULT 0,
  requirements   TEXT         NULL,
  PRIMARY KEY (case_type, category, sub_category)
);

-- Customer group → customer type.
CREATE TABLE IF NOT EXISTS ref_customer_types (
  customer_group VARCHAR(80) NOT NULL,
  customer_type  VARCHAR(80) NOT NULL,
  sort           INT         NOT NULL,
  PRIMARY KEY (customer_group, customer_type)
);

-- Simple lists: statuses, channels, caller types, product categories, lead types / outcomes, missed-call reasons.
CREATE TABLE IF NOT EXISTS ref_values (
  list        VARCHAR(40)  NOT NULL,
  value       VARCHAR(120) NOT NULL,
  sort        INT          NOT NULL,
  description VARCHAR(300) NULL,
  PRIMARY KEY (list, value)
);
