import { createClaudeClient } from "../src/claude/client";
import {
  runDistillation,
  type DistillOptions,
} from "../src/knowledge/distill/run";
import type { Summarizer } from "../src/knowledge/distill/summarize";
import { LocalEmbedder } from "../src/knowledge/embeddings/embed";
import { closeAllPools, getPool } from "../src/knowledge/store/db";

// Off-hot-path playbook distillation CLI (Spec R9, ADR-0005). Thin wrapper over
// runDistillation: incremental (watermark), idempotent, template-or-LLM summaries.
//
//   KNOWLEDGE_DATABASE_URL=... npx tsx bin/knowledge-distill.ts

/** Wire Claude as the summarizer only when a key is configured (C4). */
function resolveSummarizer(): Summarizer | undefined {
  if (!process.env.ANTHROPIC_API_KEY) return undefined;
  const claude = createClaudeClient();
  return (prompt: string) =>
    claude.complete({ purpose: "distill-playbook", prompt, maxTokens: 400 });
}

async function main() {
  const url = process.env.KNOWLEDGE_DATABASE_URL;
  if (!url) {
    console.error("KNOWLEDGE_DATABASE_URL is not set — nothing to distill.");
    process.exit(1);
  }
  const opts: DistillOptions = {
    summarize: resolveSummarizer(),
    embedder: new LocalEmbedder(process.env.EMBEDDING_MODEL || undefined),
  };
  const r = await runDistillation(getPool(url), opts);

  if (r.noop) {
    console.log("Distill: no new heals since last run — nothing to do.");
  } else {
    console.log(
      `Distill complete: ${r.playbooks} playbook(s) (${r.trusted} trusted), ` +
        `${r.procedural} procedural; ${r.episodes} episodes clustered.` +
        (opts.summarize
          ? " [LLM summaries]"
          : " [template summaries — no ANTHROPIC_API_KEY]"),
    );
  }
  await closeAllPools();
}

main().catch((err) => {
  console.error("Distill failed:", err);
  process.exit(1);
});
