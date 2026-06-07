// Failure-signature normalization (Spec R3, ADR-0004). Collapses a raw Playwright
// failure_reason to a stable key so the "same" failure across runs — differing
// only in dynamic ids, line/column numbers, timestamps, or absolute paths —
// matches as one signature. Used for precedent lookup and distillation clustering.

import { significantTokens } from "../../coverage/coverage";

/**
 * Normalize a raw failure reason to a stable signature.
 *
 *   "TimeoutError: locator '#btn-7f3a2' not found (app.spec.ts:42:13) @ 12:04:55"
 *      -> "timeouterror locator btn not found"
 *
 * Deterministic and lossy on purpose: we strip everything volatile so two runs
 * of the same failure converge. Never throws; empty/nullish input -> "".
 */
export function normalizeFailure(reason: string | null | undefined): string {
  if (!reason) return "";
  let s = reason;

  // Order matters: strip the most specific colon-bearing patterns first so a
  // later, looser rule can't eat part of one (e.g. clock-time eating "42:13").

  // 1. Full ISO datetimes (2026-06-07T12:04:55.123Z) — strip before any colon rule.
  s = s.replace(/\d{4}-\d{2}-\d{2}t[\d:.]+z?/gi, " ");

  // 2. file:line:col locations (app.spec.ts:42:13).
  s = s.replace(/[\w./-]+\.(ts|tsx|js|jsx|mjs):\d+(:\d+)?/gi, " ");

  // 3. Bare clock times (12:04:55) and remaining line/col tails (:42:13).
  s = s.replace(/\b\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\b/g, " ");
  s = s.replace(/:\d+(:\d+)?\b/g, " ");

  // 3. Drop absolute paths (/Users/..., C:\...).
  s = s.replace(/(?:[a-z]:)?[\\/][\w.\\/-]+/gi, " ");

  // 4. Drop uuids and long hex blobs (element handles, build ids).
  s = s.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    " ",
  );
  s = s.replace(/\b[0-9a-f]{6,}\b/gi, " ");

  // 5. Strip the trailing dynamic suffix off identifiers (btn-7f3a -> btn,
  //    item_92 -> item) so generated/dynamic ids collapse to their stable stem.
  s = s.replace(/\b([a-z]{2,})[-_]?\d[\w-]*/gi, "$1");

  // 6. Collapse remaining standalone digits.
  s = s.replace(/\b\d+\b/g, " ");

  // 7. Lowercase, keep word chars, squeeze whitespace.
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Significant tokens of a normalized signature, for lexical hybrid match (R6). */
export function signatureTokens(signature: string): string[] {
  return [...significantTokens(signature)];
}
