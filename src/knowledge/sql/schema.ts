// Schema reference handed to the LLM so it can translate a plain-English question
// into a read-only SQL query. Keep this in sync with store/migrations/*.sql — it is
// documentation the model reads, not executable code. Only describe what is safe to
// read; the guard (sql/guard.ts) enforces read-only at execution time regardless.

export const KNOWLEDGE_SCHEMA_PROMPT = `PostgreSQL schema (Knowledge Layer). All tables key off \`app_id\` (an app's
normalized origin: scheme + host, lowercased, no "www.", and NO trailing slash or
path — e.g. 'https://example.com').

TABLE apps
  app_id      TEXT PRIMARY KEY        -- normalized origin
  first_seen  TIMESTAMPTZ
  last_seen   TIMESTAMPTZ
  run_count   INTEGER

TABLE runs
  run_id      TEXT PRIMARY KEY
  app_id      TEXT  -> apps(app_id)
  url         TEXT                     -- the exact URL that was tested
  status      TEXT                     -- e.g. 'completed', 'running', 'failed'
  crawl_mode  TEXT
  created_at  TIMESTAMPTZ

TABLE specs                            -- one generated Playwright test file
  id            BIGSERIAL PRIMARY KEY
  run_id        TEXT -> runs(run_id)
  app_id        TEXT
  file          TEXT
  title         TEXT
  flow_id       TEXT
  content_hash  TEXT
  reused        BOOLEAN                 -- true = copied forward from a prior run (a copy)
  tokens        TEXT[]                  -- significant words of the intent
  created_at    TIMESTAMPTZ
  embedding         vector(384)         -- title + step comments (do not select raw vectors)
  pattern_text      TEXT                -- abstracted, entity-stripped workflow skeleton
  pattern_embedding vector(384)
  title_embedding   vector(384)

TABLE plan_scenarios                   -- scenario titles the planner proposed
  id       BIGSERIAL PRIMARY KEY
  run_id   TEXT -> runs(run_id)
  app_id   TEXT
  ordinal  TEXT
  name     TEXT
  tokens   TEXT[]

TABLE test_results                     -- outcome per flow/file in a run
  id              BIGSERIAL PRIMARY KEY
  run_id          TEXT -> runs(run_id)
  app_id          TEXT
  flow_id         TEXT
  file            TEXT
  outcome         TEXT                  -- 'passed' | 'healed' | 'failed'
  failure_reason  TEXT
  created_at      TIMESTAMPTZ

TABLE coverage_snapshots               -- one row per run
  run_id         TEXT PRIMARY KEY -> runs(run_id)
  app_id         TEXT
  curated_total  INTEGER
  tested_count   INTEGER
  percent        INTEGER               -- coverage percentage (0..100)
  missing_flows  TEXT[]
  created_at     TIMESTAMPTZ

TABLE raw_reports                      -- full RunReport JSON for a run
  run_id      TEXT PRIMARY KEY -> runs(run_id)
  app_id      TEXT
  report      JSONB                     -- report->>'planMarkdown' = the test plan;
                                        -- report->>'generatedAt'; report->'coverage'->>'percent'
  created_at  TIMESTAMPTZ

TABLE healing_events                   -- one row per self-heal repair
  id                BIGSERIAL PRIMARY KEY
  run_id            TEXT -> runs(run_id)
  app_id            TEXT
  flow_id           TEXT
  file              TEXT
  failure_signature TEXT
  before_snippet    TEXT
  after_snippet     TEXT
  strategy          TEXT
  outcome           TEXT                -- 'healed' | 'fixme'
  created_at        TIMESTAMPTZ

TABLE playbooks                        -- distilled reusable principles
  id              TEXT PRIMARY KEY
  scope_kind      TEXT                  -- 'app' | 'global' | 'componentType'
  scope_key       TEXT
  principle       TEXT
  antipattern     TEXT
  recommendation  TEXT
  support_count   INTEGER
  confidence      REAL
  status          TEXT                  -- 'episodic' | 'trusted'
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

Guidance:
- "Prior plan / previous plan for a URL" = report->>'planMarkdown' from raw_reports,
  filtered by app_id, newest first (ORDER BY created_at DESC LIMIT 1).
- Never select the vector columns (embedding / pattern_embedding / title_embedding) —
  they are huge and unreadable.
- Specs that are reused = false are the original, reusable tests; reused = true are copies.`;
