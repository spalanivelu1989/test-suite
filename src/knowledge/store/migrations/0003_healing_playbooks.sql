-- Knowledge Platform Phase 3 — healing memory + playbooks (Spec R4/R9, ADR-0004/0005).
-- Adds append-only healing events, distilled playbooks, and a distillation
-- watermark. Additive and forward-only: never edit once shipped. Reuses the
-- Phase 2 embedder/dimension (vector(384)); degrades cleanly when pgvector or
-- embeddings are absent (Spec R13).

CREATE EXTENSION IF NOT EXISTS vector;

-- Append-only record of every repair the Healer made, reconstructed by diffing
-- pre/post-heal specs (ADR-0004). Idempotent by run: persistRun deletes-by-run
-- then re-inserts, so re-ingesting a runId never duplicates.
CREATE TABLE IF NOT EXISTS healing_events (
  id                BIGSERIAL PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  app_id            TEXT NOT NULL,
  flow_id           TEXT,
  file              TEXT,
  failure_signature TEXT NOT NULL,
  failure_embedding vector(384),
  before_snippet    TEXT NOT NULL,
  after_snippet     TEXT NOT NULL,
  strategy          TEXT NOT NULL,
  outcome           TEXT NOT NULL,            -- 'healed' | 'fixme'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS healing_app_idx      ON healing_events(app_id);
CREATE INDEX IF NOT EXISTS healing_strategy_idx ON healing_events(strategy);
CREATE INDEX IF NOT EXISTS healing_outcome_idx  ON healing_events(outcome);
-- Approximate nearest-neighbour (cosine) for precedent retrieval by signature.
CREATE INDEX IF NOT EXISTS healing_embedding_hnsw
  ON healing_events USING hnsw (failure_embedding vector_cosine_ops);

-- Distilled, evidence-linked principles produced off the hot-path (ADR-0005).
-- Upserted by scope+key+signature; only `trusted` rows are ever injected (R11).
CREATE TABLE IF NOT EXISTS playbooks (
  id              TEXT PRIMARY KEY,           -- deterministic: scope_kind:key:sig_hash
  scope_kind      TEXT NOT NULL,              -- 'app' | 'global' | 'componentType'
  scope_key       TEXT NOT NULL,
  principle       TEXT NOT NULL,
  antipattern     TEXT,
  recommendation  TEXT NOT NULL,
  evidence_run_ids TEXT[] NOT NULL DEFAULT '{}',
  support_count   INTEGER NOT NULL DEFAULT 0,
  confidence      REAL NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'episodic',  -- 'episodic' | 'trusted'
  embedding       vector(384),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS playbooks_scope_idx  ON playbooks(scope_kind, scope_key);
CREATE INDEX IF NOT EXISTS playbooks_status_idx ON playbooks(status);
CREATE INDEX IF NOT EXISTS playbooks_embedding_hnsw
  ON playbooks USING hnsw (embedding vector_cosine_ops);

-- Single-row watermark so the distillation job is incremental (R9): it only
-- processes episodes created after the last successful run.
CREATE TABLE IF NOT EXISTS distill_watermark (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z'
);
INSERT INTO distill_watermark (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
