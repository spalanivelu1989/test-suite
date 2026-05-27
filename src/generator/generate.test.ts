import assert from "node:assert/strict";
import { test } from "node:test";
import { createClaudeClient } from "../claude/client";
import type { CrawlResult, Flow } from "../types";
import { fileNameForFlow, generateTest, stripCodeFences } from "./generate";

const flow: Flow = { id: "contact", name: "Contact", steps: ["open contact"] };
const crawl: CrawlResult = {
  entryUrl: "https://x.com",
  pages: [
    { url: "https://x.com", title: "X", depth: 0, links: [], elements: [] },
  ],
};

test("stripCodeFences unwraps fenced code", () => {
  assert.equal(stripCodeFences("```ts\nconst a=1;\n```"), "const a=1;");
  assert.equal(stripCodeFences("const a=1;"), "const a=1;");
});

test("fileNameForFlow produces a safe .spec.ts name", () => {
  assert.equal(fileNameForFlow(flow), "contact.spec.ts");
});

test("generateTest returns code via Claude with valid=false (pre-validation)", async () => {
  const claude = createClaudeClient({
    sdk: {
      messages: {
        create: async () => ({
          content: [
            {
              type: "text",
              text: "```ts\nimport { test } from '@playwright/test';\n```",
            },
          ],
        }),
      },
    },
  });
  const result = await generateTest(flow, crawl, claude);
  assert.equal(result.flowId, "contact");
  assert.equal(result.fileName, "contact.spec.ts");
  assert.equal(result.valid, false);
  assert.match(result.code, /@playwright\/test/);
  assert.equal(claude.calls[0].purpose, "generate-test");
});
