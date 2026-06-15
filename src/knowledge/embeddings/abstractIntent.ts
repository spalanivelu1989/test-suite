// PROTOTYPE — richer embedding for the cross-app pattern tier.
//
// Abstract an intent sentence so its embedding reflects the WORKFLOW SHAPE, not
// one app's vocabulary. The exact-reuse embedding (specs.embedding) deliberately
// keeps the concrete text — two apps' "login" tests SHOULD look different there.
// The pattern embedding wants the opposite: strip the app-specific entities that
// make "Add 'Acme Pro Plan' to cart" and "Add 'Widget XL' to cart" look unrelated
// so they collapse onto the shared workflow "add product to cart".
//
// Heuristic + deterministic by design (no dep, no network). A production version
// would canonicalize with an LLM ("→ add an item to the shopping cart"); this is
// the cheap, explainable stand-in that already lifts cross-app recall.

const PATTERNS: [RegExp, string][] = [
  [/https?:\/\/\S+/g, " "], // URLs
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, " "], // emails
  [/["'`][^"'`]{0,60}["'`]/g, " "], // quoted literals — app-specific entity names
  [/\$\s?\d[\d,.]*/g, " "], // prices
  [/\b\d[\w./:-]*\b/g, " "], // bare numbers, dates, ids, versions
  [/[^a-z\s]/g, " "], // residual punctuation
];

/**
 * Strip app-specific entities from an intent sentence, lowercased and squeezed.
 * Returns "" only if nothing survives — callers should fall back to the raw text.
 */
export function abstractIntent(text: string): string {
  let out = (text ?? "").toLowerCase();
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out.replace(/\s+/g, " ").trim();
}

/** Abstracted text, or the lowercased original when abstraction empties it. */
export function patternTextFor(intentText: string): string {
  const abstracted = abstractIntent(intentText);
  return abstracted || (intentText ?? "").toLowerCase().trim();
}
