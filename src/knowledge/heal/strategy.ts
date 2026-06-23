// Heal-strategy classifier (Spec R2, ADR-0004). A deterministic, rule-based read
// of a before/after diff hunk that labels HOW the Tester fixed a failure. Pure and
// total: anything it can't place becomes `other`; it never throws.
//
// Order matters — `fixme` is checked first (quarantine dominates), then the
// repair kinds from most-specific signal to least.

import type { HealStrategy } from "../types";

const ROLE_LOCATORS =
  /\b(getByRole|getByLabel|getByPlaceholder|getByText|getByTestId|getByTitle|getByAltText)\b/;
const BRITTLE_SELECTOR = /\b(locator|querySelector)\s*\(|[#.][\w-]+['"]/;
const WAIT_CALLS =
  /\b(waitFor|waitForSelector|waitForLoadState|toBeVisible|toBeAttached|scrollIntoViewIfNeeded)\b/;
const ASSERTION = /\b(expect|toHaveText|toHaveValue|toEqual|toBe|toContain)\b/;

function has(re: RegExp, s: string): boolean {
  return re.test(s);
}

/** True when `after` adds a regex/partial matcher that `before` lacked. */
function addedRegexText(before: string, after: string): boolean {
  const reLiteral = /\/[^/\n]+\/[gimsuy]*/; // a /.../ regex literal
  const partial = /\{\s*exact\s*:\s*false\s*\}|hasText\s*:/;
  const gained = (re: RegExp) => has(re, after) && !has(re, before);
  return gained(reLiteral) || gained(partial);
}

/**
 * Classify a single repair from its diff hunk.
 *
 *   before: the removed/old line(s); after: the added/new line(s).
 *
 * `outcomeFixme` short-circuits to `fixme` — when the Tester quarantined the test
 * the strategy is the quarantine itself, regardless of incidental edits.
 */
export function classifyStrategy(
  before: string,
  after: string,
  outcomeFixme = false,
): HealStrategy {
  if (outcomeFixme || /\btest\.fixme\s*\(/.test(after)) return "fixme";

  // Brittle CSS/locator selector replaced by a semantic role/label locator.
  if (has(ROLE_LOCATORS, after) && !has(ROLE_LOCATORS, before)) {
    return "role-locator";
  }

  // Exact text turned into a regex / partial match for dynamic content.
  if (addedRegexText(before, after)) return "regex-text";

  // An explicit visibility/wait was introduced before interacting.
  if (has(WAIT_CALLS, after) && !has(WAIT_CALLS, before)) {
    return "wait-visibility";
  }

  // A brittle selector was swapped for another brittle selector — still a
  // locator fix, classify as role-locator's weaker cousin via `other` unless the
  // change is purely an assertion/expectation.
  if (has(ASSERTION, before) || has(ASSERTION, after)) {
    if (has(BRITTLE_SELECTOR, before) && has(BRITTLE_SELECTOR, after)) {
      return "other";
    }
    return "assertion-fix";
  }

  return "other";
}
