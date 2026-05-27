import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AnthropicLike,
  createClaudeClient,
  MissingApiKeyError,
} from "./client";

test("throws MissingApiKeyError when no key and no injected sdk", async () => {
  const oldKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const client = createClaudeClient({ apiKey: undefined, sdk: undefined });
    await assert.rejects(
      () => client.complete({ purpose: "test", prompt: "hi" }),
      MissingApiKeyError,
    );
  } finally {
    if (oldKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = oldKey;
    }
  }
});

test("returns concatenated text and logs the call", async () => {
  const fake: AnthropicLike = {
    messages: {
      create: async () => ({
        content: [
          { type: "text", text: "hello " },
          { type: "tool_use" },
          { type: "text", text: "world" },
        ],
      }),
    },
  };
  const seen: string[] = [];
  const client = createClaudeClient({
    sdk: fake,
    model: "test-model",
    onCall: (log) => seen.push(log.purpose),
  });

  const out = await client.complete({
    purpose: "identify-flows",
    prompt: "data",
  });

  assert.equal(out, "hello world");
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].purpose, "identify-flows");
  assert.equal(client.calls[0].model, "test-model");
  assert.deepEqual(seen, ["identify-flows"]);
});
