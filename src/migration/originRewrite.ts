// Origin rewrite for Migration Check.
//
// A pure rehost (Lovable → SAP BTP) is the SAME app at a new host, so a spec
// proven on the source transfers verbatim once its OWN origin is swapped for the
// target's. The only safe, surgical change is the origin (scheme://host[:port]) —
// paths, selectors, assertions, and external URLs (e.g. a LinkedIn href) must be
// left untouched.
//
// Rather than a blind string replace, we tokenize every http(s) URL in the spec
// and rewrite ONLY those whose normalized origin equals the source app's origin.
// That handles case / "www." / port variants and provably leaves third-party
// URLs (a different origin) alone.

import { normalizeOrigin } from "../knowledge/appId";

// Matches an http(s) URL up to the first character that can't be part of one in
// spec source: whitespace, quotes, backtick, parentheses, angle brackets, backslash.
const URL_TOKEN = /https?:\/\/[^\s"'`)\\<>]+/g;

// Splits a URL token into its origin-as-written and the remainder (path/query/hash).
// Group 1 = "https://Host:3000", Group 2 = "/a?b#c" (possibly empty).
const ORIGIN_SPLIT = /^(https?:\/\/[^/?#]+)(.*)$/;

export interface OriginRewriteResult {
  code: string;
  /** How many URL occurrences were rewritten. */
  replacements: number;
}

export interface OriginRewriteOptions {
  /** Path the target serves the app under (e.g. "/myapp"); prepended to each rewritten path. */
  pathPrefix?: string;
}

/** Normalize a path prefix: "" when empty, else a leading slash with no trailing slash. */
export function normalizePrefix(prefix?: string): string {
  const p = (prefix ?? "").trim();
  if (!p || p === "/") return "";
  return `/${p.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

/**
 * Rewrite every self-origin URL in `code` from the source app's origin to the
 * target app's origin, preserving each URL's path/query/fragment. When a
 * `pathPrefix` is given (the approuter route the target serves the app under),
 * it is inserted between the new origin and the original path.
 *
 * @param code        the spec source
 * @param sourceUrl   any URL of the source app (origin is what matters)
 * @param targetUrl   any URL of the target app (origin is what matters)
 */
export function rewriteOrigin(
  code: string,
  sourceUrl: string,
  targetUrl: string,
  options: OriginRewriteOptions = {},
): OriginRewriteResult {
  const sourceOrigin = normalizeOrigin(sourceUrl);
  const targetOrigin = normalizeOrigin(targetUrl);
  const prefix = normalizePrefix(options.pathPrefix);

  // No-op when nothing would change (e.g. re-running against the same app).
  if (sourceOrigin === targetOrigin && prefix === "") {
    return { code, replacements: 0 };
  }

  let replacements = 0;
  const next = code.replace(URL_TOKEN, (token) => {
    const parts = ORIGIN_SPLIT.exec(token);
    if (!parts) return token;
    const [, originAsWritten, rest] = parts;
    if (normalizeOrigin(originAsWritten) !== sourceOrigin) {
      return token; // external URL or different self-host — leave untouched
    }
    replacements += 1;
    return `${targetOrigin}${prefix}${rest}`;
  });

  return { code: next, replacements };
}
