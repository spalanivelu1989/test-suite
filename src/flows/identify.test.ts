import assert from "node:assert/strict";
import { test } from "node:test";
import { createClaudeClient } from "../claude/client";
import type { CrawlResult } from "../types";
import { identifyFlows, parseFlows } from "./identify";

test("parseFlows extracts a JSON array even with surrounding prose/fences", () => {
  const text =
    'Here are the flows:\n```json\n[{"id":"home","name":"Home","steps":["go"]}]\n```';
  const flows = parseFlows(text);
  assert.equal(flows.length, 1);
  assert.equal(flows[0].id, "home");
  assert.deepEqual(flows[0].steps, ["go"]);
});

test("parseFlows derives an id from the name when missing", () => {
  const flows = parseFlows('[{"name":"Contact Us","steps":[]}]');
  assert.equal(flows[0].id, "contact-us");
});

test("parseFlows throws on a response with no array", () => {
  assert.throws(() => parseFlows("no json here"));
});

test("identifyFlows calls Claude and returns parsed flows", async () => {
  const claude = createClaudeClient({
    sdk: {
      messages: {
        create: async () => ({
          content: [
            { type: "text", text: '[{"id":"a","name":"A","steps":[]}]' },
          ],
        }),
      },
    },
  });
  const crawl: CrawlResult = {
    entryUrl: "https://x.com",
    pages: [
      { url: "https://x.com", title: "X", depth: 0, links: [], elements: [] },
    ],
  };
  const flows = await identifyFlows(crawl, claude);
  assert.equal(flows[0].name, "A");
  assert.equal(claude.calls[0].purpose, "identify-flows");
});
