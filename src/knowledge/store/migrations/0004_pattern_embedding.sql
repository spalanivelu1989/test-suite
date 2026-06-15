-- PROTOTYPE — Global pattern-retrieval tier, richer embedding (cross-app transfer).
-- Additive and forward-only: never edit once shipped.
--
-- WHY A SEPARATE COLUMN. specs.embedding embeds the CONCRETE intent (title + step
-- comments) and is tuned for EXACT, within-app reuse (SEM_REUSE=0.82). Cross-app
-- matching wants the opposite: an ABSTRACTED intent with app-specific entities
-- ("Acme Pro Plan", prices, URLs) stripped, so cosine reflects the WORKFLOW SHAPE
-- ("add product to cart") rather than one app's vocabulary. Overloading the single
-- column would force one text to serve two opposed similarity goals. Two columns,
-- two HNSW indexes, two thresholds — each tier reads the embedding it needs.
--
-- Degrades cleanly: rows without pattern_embedding fall back to embedding at query
-- time (COALESCE in findGlobalPatternSpecs), so the tier works before any backfill.

ALTER TABLE specs ADD COLUMN IF NOT EXISTS pattern_text       TEXT;
ALTER TABLE specs ADD COLUMN IF NOT EXISTS pattern_embedding  vector(384);
ALTER TABLE specs ADD COLUMN IF NOT EXISTS pattern_model      TEXT;

-- Separate HNSW index so cross-app nearest-neighbor never competes with the
-- exact-reuse index (specs_embedding_hnsw).
CREATE INDEX IF NOT EXISTS specs_pattern_embedding_hnsw
  ON specs USING hnsw (pattern_embedding vector_cosine_ops);
