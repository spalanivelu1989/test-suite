import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FOCUS_MAX_CHARS,
  MAX_TESTS_PER_PAGE,
  parseRunRequest,
} from "./validation";

test("accepts a valid https url with crawlMode and maxPages", () => {
  const r = parseRunRequest({
    url: "https://x.com",
    crawlMode: "standard",
    maxPages: 5,
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.config.crawlMode, "standard");
    assert.equal(r.config.maxPages, 5);
  }
});

test("accepts all valid crawlMode values", () => {
  for (const mode of ["direct", "standard", "deep", "aggressive"] as const) {
    const r = parseRunRequest({ url: "https://x.com", crawlMode: mode });
    assert.equal(r.ok, true, `mode '${mode}' should be accepted`);
    if (r.ok) assert.equal(r.config.crawlMode, mode);
  }
});

test("rejects invalid crawlMode", () => {
  const r = parseRunRequest({ url: "https://x.com", crawlMode: "turbo" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes("crawlMode"));
});

test("rejects missing url", () => {
  const r = parseRunRequest({});
  assert.equal(r.ok, false);
});

test("rejects non-http protocol", () => {
  const r = parseRunRequest({ url: "ftp://x.com" });
  assert.equal(r.ok, false);
});

test("rejects malformed url", () => {
  const r = parseRunRequest({ url: "not a url" });
  assert.equal(r.ok, false);
});

test("rejects invalid maxPages", () => {
  const r = parseRunRequest({ url: "https://x.com", maxPages: 0 });
  assert.equal(r.ok, false);
});

test("accepts and trims a focus directive", () => {
  const r = parseRunRequest({
    url: "https://x.com",
    focus: "  Test only the Logistics platform  ",
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.config.focus, "Test only the Logistics platform");
});

test("treats empty/whitespace focus as no focus (omitted)", () => {
  for (const focus of ["", "   ", "\n\t "]) {
    const r = parseRunRequest({ url: "https://x.com", focus });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.config.focus, undefined);
  }
});

test("omits focus entirely when not provided", () => {
  const r = parseRunRequest({ url: "https://x.com" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.config.focus, undefined);
});

test("rejects a non-string focus", () => {
  const r = parseRunRequest({ url: "https://x.com", focus: 42 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes("focus"));
});

test("rejects a focus over the length cap", () => {
  const r = parseRunRequest({
    url: "https://x.com",
    focus: "a".repeat(FOCUS_MAX_CHARS + 1),
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes("focus"));
});

test("accepts a positive integer testsPerPage", () => {
  const r = parseRunRequest({ url: "https://x.com", testsPerPage: 20 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.config.testsPerPage, 20);
});

test("omits testsPerPage when not provided", () => {
  const r = parseRunRequest({ url: "https://x.com" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.config.testsPerPage, undefined);
});

test("rejects a non-integer or non-positive testsPerPage", () => {
  const invalid: unknown[] = [0, -5, 3.5, "8", true];
  for (const testsPerPage of invalid) {
    const r = parseRunRequest({ url: "https://x.com", testsPerPage });
    assert.equal(
      r.ok,
      false,
      `should reject testsPerPage=${String(testsPerPage)}`,
    );
    if (!r.ok) assert.ok(r.error.includes("testsPerPage"));
  }
});

test("rejects testsPerPage over the per-page limit", () => {
  const r = parseRunRequest({
    url: "https://x.com",
    testsPerPage: MAX_TESTS_PER_PAGE + 1,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes("testsPerPage"));
});
