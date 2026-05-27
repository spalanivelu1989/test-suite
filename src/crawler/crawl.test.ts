import assert from "node:assert/strict";
import { test } from "node:test";
import { crawl, type PageFetcher } from "./crawl";
import { isCrawlable, isSameOrigin, normalizeUrl } from "./url";

test("normalizeUrl strips hash and trailing slash", () => {
  assert.equal(normalizeUrl("https://x.com/a/#top"), "https://x.com/a");
  assert.equal(normalizeUrl("https://x.com/"), "https://x.com");
});

test("isSameOrigin and isCrawlable gate links", () => {
  assert.equal(isSameOrigin("https://x.com", "https://x.com/a"), true);
  assert.equal(isSameOrigin("https://x.com", "https://other.com/a"), false);
  assert.equal(isCrawlable("mailto:a@b.com"), false);
  assert.equal(isCrawlable("https://x.com"), true);
});

// A fake site: home links to /a and /b; /a links to /deep; external link ignored.
function fakeFetcher(): PageFetcher {
  const site: Record<string, string[]> = {
    "https://x.com": [
      "https://x.com/a",
      "https://x.com/b",
      "https://ext.com/z",
    ],
    "https://x.com/a": ["https://x.com/deep"],
    "https://x.com/b": [],
    "https://x.com/deep": [],
  };
  return {
    async fetch(url) {
      return { title: `title:${url}`, links: site[url] ?? [], elements: [] };
    },
  };
}

test("crawl visits same-origin pages breadth-first within depth", async () => {
  const result = await crawl(
    { url: "https://x.com", maxDepth: 1 },
    fakeFetcher(),
  );
  const urls = result.pages.map((p) => p.url).sort();
  // depth 0: home; depth 1: /a,/b. /deep is depth 2 (excluded), ext is off-origin.
  assert.deepEqual(urls, [
    "https://x.com",
    "https://x.com/a",
    "https://x.com/b",
  ]);
});

test("crawl honors maxPages", async () => {
  const result = await crawl(
    { url: "https://x.com", maxDepth: 5, maxPages: 2 },
    fakeFetcher(),
  );
  assert.equal(result.pages.length, 2);
});

test("crawl reaches deeper pages when depth allows", async () => {
  const result = await crawl(
    { url: "https://x.com", maxDepth: 2 },
    fakeFetcher(),
  );
  assert.ok(result.pages.some((p) => p.url === "https://x.com/deep"));
});
