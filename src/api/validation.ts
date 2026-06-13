import type { CrawlMode, RunConfig } from "../types";

const VALID_CRAWL_MODES: CrawlMode[] = [
  "direct",
  "standard",
  "deep",
  "aggressive",
];

/** Upper bound on the free-text focus directive (keeps prompts bounded). */
export const FOCUS_MAX_CHARS = 1000;

/** Upper bound on the per-page test rate (the total is separately clamped by MAX_TOTAL_TESTS). */
export const MAX_TESTS_PER_PAGE = 50;

export type ParseResult =
  | { ok: true; config: RunConfig }
  | { ok: false; error: string };

/** Validate a run-start request body (R1). Pure — unit tested. */
export function parseRunRequest(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.url !== "string" || b.url.trim() === "") {
    return { ok: false, error: "A 'url' string is required" };
  }
  let parsed: URL;
  try {
    parsed = new URL(b.url);
  } catch {
    return { ok: false, error: `Invalid URL: ${b.url}` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "URL must use http or https" };
  }
  const config: RunConfig = { url: parsed.toString() };
  if (b.crawlMode !== undefined) {
    if (!VALID_CRAWL_MODES.includes(b.crawlMode as CrawlMode)) {
      return {
        ok: false,
        error: `crawlMode must be one of: ${VALID_CRAWL_MODES.join(", ")}`,
      };
    }
    config.crawlMode = b.crawlMode as CrawlMode;
  }
  if (b.maxPages !== undefined) {
    if (typeof b.maxPages !== "number" || b.maxPages < 1) {
      return { ok: false, error: "maxPages must be a positive number" };
    }
    config.maxPages = b.maxPages;
  }
  if (b.focus !== undefined && b.focus !== null) {
    if (typeof b.focus !== "string") {
      return { ok: false, error: "focus must be a string" };
    }
    const focus = b.focus.trim();
    if (focus.length > FOCUS_MAX_CHARS) {
      return {
        ok: false,
        error: `focus must be at most ${FOCUS_MAX_CHARS} characters`,
      };
    }
    // Empty/whitespace-only focus is treated as "no focus" (unscoped), so the
    // field stays omitted from the config rather than injecting a blank directive.
    if (focus.length > 0) config.focus = focus;
  }
  if (b.testsPerPage !== undefined && b.testsPerPage !== null) {
    if (
      typeof b.testsPerPage !== "number" ||
      !Number.isInteger(b.testsPerPage) ||
      b.testsPerPage < 1
    ) {
      return { ok: false, error: "testsPerPage must be a positive integer" };
    }
    if (b.testsPerPage > MAX_TESTS_PER_PAGE) {
      return {
        ok: false,
        error: `testsPerPage must be at most ${MAX_TESTS_PER_PAGE}`,
      };
    }
    config.testsPerPage = b.testsPerPage;
  }
  return { ok: true, config };
}
