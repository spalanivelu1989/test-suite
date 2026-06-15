-- Title-only embedding for the in-app reuse tier (hybrid match). Additive and
-- forward-only: never edit once shipped.
--
-- WHY. The reuse decision compares a planned scenario (always a bare TITLE, i.e.
-- ScenarioInput.name) against each spec. specs.embedding encodes title + step
-- comments (D5), which is richer but lives in a DIFFERENT space than a title-only
-- query: an exact-title scenario only reaches cosine ~0.79 against it, BELOW the
-- calibrated SEM_REUSE=0.82, so reuse silently never fires. This column stores the
-- spec's TITLE embedded on its own — symmetric with the query — so an exact title
-- matches ~1.0. coverageDecision blends the two (SEM_TITLE_WEIGHT): the title term
-- recovers exact-match confidence, the title+steps term keeps structurally-similar
-- but DIFFERENT tests apart ("About scrolls" vs "Contact scrolls").
--
-- Degrades cleanly: specs without title_embedding (pre-migration / un-backfilled)
-- fall back to `embedding` for BOTH blend terms, i.e. exactly today's behavior.

ALTER TABLE specs ADD COLUMN IF NOT EXISTS title_embedding vector(384);
ALTER TABLE specs ADD COLUMN IF NOT EXISTS title_model     TEXT;

-- Separate HNSW index so a future title-only nearest-neighbor read never competes
-- with the exact-reuse (specs_embedding_hnsw) or pattern (specs_pattern_*) indexes.
CREATE INDEX IF NOT EXISTS specs_title_embedding_hnsw
  ON specs USING hnsw (title_embedding vector_cosine_ops);
