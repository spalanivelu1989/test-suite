import { readFile } from "node:fs/promises";
import { significantTokens } from "../src/coverage/coverage";
import { LocalEmbedder } from "../src/knowledge/embeddings/embed";
import { decideForSpecs } from "../src/knowledge/retrieve/coverageDecision";
import type { SpecRow } from "../src/knowledge/store/repo";
import type { ScenarioInput } from "../src/knowledge/types";

// T15: calibrate SEM_REUSE (the single copy-forward bar) and measure M1
// (paraphrase recall) + M2 (false-reuse) against the labeled set, with the REAL
// local model. 2-way model: a scenario is "covered" only when it `reuse`s.
//   npx tsx bin/knowledge-calibrate.ts

interface Positive {
  flowId: string;
  intent: string;
  paraphrases: string[];
}
interface Labeled {
  positives: Positive[];
  negatives: string[];
}

const isCovered = (a: string) => a === "reuse";

async function main() {
  const set: Labeled = JSON.parse(
    await readFile("fixtures/paraphrase-set.json", "utf8"),
  );
  const embedder = new LocalEmbedder();

  // Existing "specs" — one per curated flow.
  const intents = set.positives.map((p) => p.intent);
  const intentVecs = await embedder.embed(intents);
  const specs: SpecRow[] = set.positives.map((p, i) => ({
    runId: "calib",
    file: `${p.flowId}.spec.ts`,
    title: p.intent,
    flowId: p.flowId,
    tokens: [...significantTokens(p.intent)],
    lastOutcome: "passed",
    embedding: intentVecs[i],
  }));

  // Paraphrases (positives) + negatives.
  const paraTexts = set.positives.flatMap((p) => p.paraphrases);
  const paraVecs = await embedder.embed(paraTexts);
  const paras: ScenarioInput[] = paraTexts.map((name, i) => ({
    name,
    embedding: paraVecs[i],
  }));
  const negVecs = await embedder.embed(set.negatives);
  const negs: ScenarioInput[] = set.negatives.map((name, i) => ({
    name,
    embedding: negVecs[i],
  }));

  // Which paraphrases does LEXICAL alone miss (mark "new")? → the M1 denominator.
  const lexParas = paras.map((p) => ({ ...p, embedding: undefined }));
  const lexDecisions = decideForSpecs(lexParas, specs);
  const lexMissedIdx = lexDecisions
    .map((d, i) => (d.action === "new" ? i : -1))
    .filter((i) => i >= 0);

  console.log(
    `Labeled set: ${paras.length} paraphrases (${lexMissedIdx.length} missed by lexical), ${negs.length} negatives.\n`,
  );
  console.log(
    "semReuse | M1 recall(lex-missed) | overall recall | M2 false-reuse",
  );
  console.log("-".repeat(78));

  let best: {
    semReuse: number;
    recall: number;
    fp: number;
  } | null = null;
  for (const semReuse of [0.75, 0.8, 0.82, 0.85, 0.88]) {
    const th = { semReuse };
    const pd = decideForSpecs(paras, specs, th);
    const nd = decideForSpecs(negs, specs, th);
    const m1 =
      lexMissedIdx.length === 0
        ? 1
        : lexMissedIdx.filter((i) => isCovered(pd[i].action)).length /
          lexMissedIdx.length;
    const overall = pd.filter((d) => isCovered(d.action)).length / pd.length;
    const fp = nd.filter((d) => isCovered(d.action)).length / nd.length;
    console.log(
      `  ${semReuse.toFixed(2)}   |        ${(m1 * 100).toFixed(0)}%         |      ${(overall * 100).toFixed(0)}%      |     ${(fp * 100).toFixed(0)}%`,
    );
    // Prefer configs meeting M2 ≤5%, then max M1.
    if (fp <= 0.05 && (!best || m1 > best.recall)) {
      best = { semReuse, recall: m1, fp };
    }
  }

  console.log("\n" + "=".repeat(78));
  if (best) {
    console.log(
      `RECOMMEND: SEM_REUSE=${best.semReuse} ` +
        `→ M1 ${(best.recall * 100).toFixed(0)}% (lex-missed), M2 ${(best.fp * 100).toFixed(0)}% false-reuse`,
    );
    console.log(
      best.recall >= 0.7
        ? "✅ Meets the Spec target (M1 ≥70%, M2 ≤5%)."
        : "⚠️  M2 met but M1 < 70% — consider the Voyage contingency (ADR-0002).",
    );
  } else {
    console.log(
      "⚠️  No threshold met M2 ≤5% — review the labeled set / model.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
