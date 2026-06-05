import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeOrigin } from "./appId";

test("normalizeOrigin: www/path/query/case collapse to one origin (AC5)", () => {
  const a = normalizeOrigin("http://www.X.com/some/path?q=1#frag");
  const b = normalizeOrigin("https://x.com/");
  // scheme differs (http vs https) so these are different origins...
  assert.equal(a, "http://x.com");
  assert.equal(b, "https://x.com");
  // ...but path/query/case/www never matter within a scheme+host:
  assert.equal(
    normalizeOrigin("https://X.com/a?b=2"),
    normalizeOrigin("https://www.x.com/c#d"),
  );
});

test("normalizeOrigin: different origins differ", () => {
  assert.notEqual(
    normalizeOrigin("https://x.com"),
    normalizeOrigin("https://y.com"),
  );
  assert.notEqual(
    normalizeOrigin("https://x.com"),
    normalizeOrigin("https://sub.x.com"),
  );
});

test("normalizeOrigin: keeps non-default port, drops default", () => {
  assert.equal(normalizeOrigin("http://x.com:3000/a"), "http://x.com:3000");
  assert.equal(normalizeOrigin("http://x.com:80/a"), "http://x.com");
  assert.equal(normalizeOrigin("https://x.com:443/a"), "https://x.com");
});

test("normalizeOrigin: tolerates a bare host (assumes https), never throws", () => {
  assert.equal(normalizeOrigin("tarento.com/careers"), "https://tarento.com");
  assert.doesNotThrow(() => normalizeOrigin("::::not a url"));
});
