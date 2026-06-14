// Picks the few concept docs most relevant to the scenarios being generated, so the
// Generator gets the rules/screens that matter and not the whole binder. LEXICAL for
// this slice (token overlap, reusing the same `significantTokens` the coverage layer
// uses) — deterministic, needs no DB or embeddings. Semantic ranking (LocalEmbedder +
// pgvector) is a drop-in upgrade later, mirroring how the knowledge layer itself
// started lexical-only in Phase 1.

import { significantTokens } from "../../coverage/coverage";
import type { ConceptDoc } from "./concept";

/** Business rules describe intended behaviour → they drive assertions → rank them up. */
const TYPE_BOOST: Record<string, number> = { "Business Rule": 3 };

/** Relevance of a doc to a token set: overlap count + a small type boost. */
export function scoreConcept(
  doc: ConceptDoc,
  queryTokens: Set<string>,
): number {
  const docTokens = significantTokens(doc.text);
  let overlap = 0;
  for (const t of queryTokens) if (docTokens.has(t)) overlap++;
  return overlap + (TYPE_BOOST[doc.type] ?? 0);
}

export interface SelectOptions {
  /** Max docs to return. Default 6. */
  k?: number;
}

/**
 * Rank `docs` against `query` and return the top-k. Ties and the type boost mean a
 * relevant Business Rule outranks a loosely-matching pattern. When nothing overlaps
 * the query at all, fall back to the bundle's Business Rules (always worth showing
 * the Generator) so a phrasing mismatch never strips the assertion guidance.
 */
export function selectConcepts(
  docs: ConceptDoc[],
  query: string,
  opts: SelectOptions = {},
): ConceptDoc[] {
  const k = opts.k ?? 6;
  const queryTokens = significantTokens(query);

  const scored = docs
    .map((doc) => ({ doc, score: scoreConcept(doc, queryTokens) }))
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id));

  // A doc "matches" if it overlaps the query beyond its mere type boost.
  const matched = scored.filter(
    (s) => s.score - (TYPE_BOOST[s.doc.type] ?? 0) > 0,
  );
  if (matched.length > 0) return matched.slice(0, k).map((s) => s.doc);

  // Fallback: no lexical overlap → still surface the rules.
  return docs.filter((d) => d.type === "Business Rule").slice(0, k);
}
