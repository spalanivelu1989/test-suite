import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRunRequest } from "./validation";

test("accepts a valid https url and optional limits", () => {
  const r = parseRunRequest({ url: "https://x.com", maxDepth: 1, maxPages: 5 });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.config.maxDepth, 1);
    assert.equal(r.config.maxPages, 5);
  }
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
