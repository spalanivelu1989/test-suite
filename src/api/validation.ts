import type { RunConfig } from "../types";

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
  if (b.maxDepth !== undefined) {
    if (typeof b.maxDepth !== "number" || b.maxDepth < 0) {
      return { ok: false, error: "maxDepth must be a non-negative number" };
    }
    config.maxDepth = b.maxDepth;
  }
  if (b.maxPages !== undefined) {
    if (typeof b.maxPages !== "number" || b.maxPages < 1) {
      return { ok: false, error: "maxPages must be a positive number" };
    }
    config.maxPages = b.maxPages;
  }
  return { ok: true, config };
}
