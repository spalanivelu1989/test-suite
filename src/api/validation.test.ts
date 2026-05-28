import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRunRequest } from "./validation";

test("accepts a valid https url with crawlMode and maxPages", () => {
  const r = parseRunRequest({ url: "https://x.com", crawlMode: "standard", maxPages: 5 });
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
