-- Knowledge Platform Phase 2 — semantic reuse (Spec R2, Plan I2, ADR-0001/0003).
-- Adds a pgvector embedding to each spec + an HNSW cosine index. Additive and
-- forward-only: never edit once shipped. Degrades cleanly — if pgvector is
-- absent the migration fails and the app runs lexical-only (Spec R8/SC8).

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE specs ADD COLUMN IF NOT EXISTS embedding       vector(384);
ALTER TABLE specs ADD COLUMN IF NOT EXISTS embedding_model TEXT;

-- Approximate nearest-neighbour (cosine) for fast top-k semantic search.
CREATE INDEX IF NOT EXISTS specs_embedding_hnsw
  ON specs USING hnsw (embedding vector_cosine_ops);
