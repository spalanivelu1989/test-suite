#!/usr/bin/env tsx
// T1 smoke test: confirm @anthropic-ai/claude-agent-sdk query() runs end-to-end
// with no MCP. Run with ANTHROPIC_API_KEY in env. Not part of the app.
import { query } from "@anthropic-ai/claude-agent-sdk";

async function main() {
  let text = "";
  let resultSubtype = "";
  for await (const msg of query({
    prompt: "Reply with exactly the word: PONG",
    options: { maxTurns: 1 },
  })) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") text += block.text;
      }
    } else if (msg.type === "result") {
      resultSubtype = msg.subtype;
    }
  }
  console.log("assistant text:", JSON.stringify(text.trim()));
  console.log("result subtype:", resultSubtype);
  if (!text.toUpperCase().includes("PONG")) {
    console.error("SMOKE FAIL: expected PONG in response");
    process.exit(1);
  }
  console.log("SMOKE OK");
}

main().catch((err) => {
  console.error(
    "SMOKE ERROR:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
