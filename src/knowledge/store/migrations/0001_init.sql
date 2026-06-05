-- Knowledge Platform Phase 1 — initial schema (Spec R2, Plan I2).
-- Structured entities + an edges relations table + raw RunReport as JSONB.
-- No pgvector this phase (Phase 2). Forward-only: never edit this file once shipped.

CREATE TABLE IF NOT EXISTS apps (
  app_id      TEXT PRIMARY KEY,            -- normalized origin (R5)
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_count   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS runs (
  run_id        TEXT PRIMARY KEY,
  app_id        TEXT NOT NULL REFERENCES apps(app_id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  status        TEXT,
  crawl_mode    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_app_idx     ON runs(app_id);
CREATE INDEX IF NOT EXISTS runs_created_idx ON runs(created_at);

CREATE TABLE IF NOT EXISTS flows (
  app_id   TEXT NOT NULL REFERENCES apps(app_id) ON DELETE CASCADE,
  flow_id  TEXT NOT NULL,                  -- normalized flow key
  name     TEXT NOT NULL,
  PRIMARY KEY (app_id, flow_id)
);

CREATE TABLE IF NOT EXISTS specs (
  id            BIGSERIAL PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  app_id        TEXT NOT NULL,             -- denormalized for app-scoped queries
  file          TEXT NOT NULL,
  title         TEXT,
  flow_id       TEXT,
  content_hash  TEXT,
  reused        BOOLEAN NOT NULL DEFAULT false,  -- provenance: copied from a prior run (D4)
  tokens        TEXT[] NOT NULL DEFAULT '{}',     -- significantTokens of intent (lexical match)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, file)
);
CREATE INDEX IF NOT EXISTS specs_app_idx ON specs(app_id);

CREATE TABLE IF NOT EXISTS plan_scenarios (
  id        BIGSERIAL PRIMARY KEY,
  run_id    TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  app_id    TEXT NOT NULL,
  ordinal   TEXT,
  name      TEXT NOT NULL,
  tokens    TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE (run_id, name)
);
CREATE INDEX IF NOT EXISTS plan_scenarios_app_idx ON plan_scenarios(app_id);

CREATE TABLE IF NOT EXISTS test_results (
  id              BIGSERIAL PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  app_id          TEXT NOT NULL,
  flow_id         TEXT,
  file            TEXT,
  outcome         TEXT NOT NULL,
  failure_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, flow_id)
);
CREATE INDEX IF NOT EXISTS test_results_app_idx     ON test_results(app_id);
CREATE INDEX IF NOT EXISTS test_results_outcome_idx ON test_results(outcome);

CREATE TABLE IF NOT EXISTS coverage_snapshots (
  run_id         TEXT PRIMARY KEY REFERENCES runs(run_id) ON DELETE CASCADE,
  app_id         TEXT NOT NULL,
  curated_total  INTEGER NOT NULL DEFAULT 0,
  tested_count   INTEGER NOT NULL DEFAULT 0,
  percent        INTEGER NOT NULL DEFAULT 0,
  missing_flows  TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coverage_app_idx ON coverage_snapshots(app_id);

-- Typed graph relations (PRODUCED, TESTS, COVERS, SUPERSEDES, …). Phase-1 keeps
-- these in a table; recursive CTEs / AGE come later if graph queries dominate.
CREATE TABLE IF NOT EXISTS edges (
  app_id    TEXT NOT NULL,
  src_type  TEXT NOT NULL,
  src_id    TEXT NOT NULL,
  rel       TEXT NOT NULL,
  dst_type  TEXT NOT NULL,
  dst_id    TEXT NOT NULL,
  PRIMARY KEY (src_type, src_id, rel, dst_type, dst_id)
);
CREATE INDEX IF NOT EXISTS edges_app_idx ON edges(app_id);

-- The raw RunReport, verbatim — the rebuild source of truth (R12/N2, AC15).
CREATE TABLE IF NOT EXISTS raw_reports (
  run_id      TEXT PRIMARY KEY REFERENCES runs(run_id) ON DELETE CASCADE,
  app_id      TEXT NOT NULL,
  report      JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
