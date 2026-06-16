import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, test } from "node:test";
import type { RunReport } from "../types";
import { FakeEmbedder } from "./embeddings/embed";
import { createKnowledgeService } from "./index";
import { closeAllPools, getPool } from "./store/db";
import { migrate } from "./store/migrate";

// PROTOTYPE — DB-backed end-to-end proof of the GLOBAL pattern-retrieval tier with
// the richer (abstracted) embedding. App A ingests a passing "checkout with card
// ending 4242" spec; App B (a DIFFERENT origin) plans "checkout with card ending
// 1111". The two titles are concretely different — a per-URL / exact match never
// unifies them — but their ABSTRACTED intents both collapse to "checkout with card
// ending", so the cross-app tier surfaces App A's test as a pattern hint for App B.
// Skipped without KNOWLEDGE_DATABASE_URL.
import { dbTestSkip } from "./store/testDbGuard";
const DB = process.env.KNOWLEDGE_DATABASE_URL;
const opts = { skip: dbTestSkip(DB) };

const D = 384;
const uniqueUrl = (tag: string) =>
  `https://${tag}-${randomUUID().slice(0, 8)}.example.com/`;

/** Fake embedder mapping known texts → (padded, normalized) 384-d vectors. */
function fake(map: Record<string, number[]>, id = "fake"): FakeEmbedder {
  return new FakeEmbedder(map, D, id);
}

/** A one-hot vector with `1` at index i (FakeEmbedder pads/normalizes to 384-d). */
function oneHot(i: number): number[] {
  const v = new Array(i + 1).fill(0);
  v[i] = 1;
  return v;
}

/**
 * Two DISTINCT basis indices unique to this test run (≥2, to dodge e0/e1 used by
 * sibling suites). The global pattern pool ACCUMULATES across every test that
 * ingests — so we place this run's shared workflow on its own axis, guaranteeing
 * App A is the only cross-app candidate the query can match no matter what else
 * is in the DB. (App A and App B are still distinct origins — the cross-app claim
 * holds; we've only made the geometry collision-proof against a populated pool.)
 */
function runBasis(): [number, number] {
  const n = parseInt(randomUUID().replace(/-/g, "").slice(0, 6), 16);
  const k1 = 2 + (n % 190) * 2;
  return [k1, k1 + 1];
}

function report(
  runId: string,
  url: string,
  specs: { file: string; title: string }[],
  outcome = "passed",
): RunReport {
  return {
    runId,
    url,
    flows: specs.map((s) => ({ id: s.title, name: s.title })),
    results: specs.map((s) => ({
      flowId: s.title,
      fileName: s.file,
      outcome,
    })),
    generatedSpecs: specs.map((s) => ({
      file: s.file,
      // The `// run ${runId}` nonce makes the spec's content_hash unique per run
      // so the embed-by-hash cache never serves a PRIOR run's basis vector for
      // this title. It is not a numbered step, so it never enters intentText /
      // patternText — the abstracted workflow axis stays "${s.title}".
      code: `import { test } from '@playwright/test';\n// run ${runId}\ntest('${s.title}', async () => {});`,
    })),
    planMarkdown: "# Plan\n",
    coverage: {
      curatedTotal: 1,
      testedCount: 1,
      percent: 100,
      missingFlows: [],
    },
  } as unknown as RunReport;
}

/** Run a body with KNOWLEDGE_GLOBAL_PATTERNS forced to a value, then restored. */
async function withFlag<T>(value: string | undefined, fn: () => Promise<T>) {
  const prev = process.env.KNOWLEDGE_GLOBAL_PATTERNS;
  if (value === undefined) delete process.env.KNOWLEDGE_GLOBAL_PATTERNS;
  else process.env.KNOWLEDGE_GLOBAL_PATTERNS = value;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.KNOWLEDGE_GLOBAL_PATTERNS;
    else process.env.KNOWLEDGE_GLOBAL_PATTERNS = prev;
  }
}

before(async () => {
  if (DB) await migrate(DB);
});

// The abstracted workflow both apps share → one vector. A second, unrelated
// App-A workflow gets an orthogonal vector so we prove the tier RANKS, not just
// "returns any cross-app spec". Concrete intent texts are left UNMAPPED, so they
// embed to the zero vector — i.e. the concrete space cannot make this match; only
// the abstracted pattern_embedding can.
const CHECKOUT = "checkout with card ending"; // abstractIntent("...4242"/"...1111")
const RESET = "reset password"; // unrelated App-A workflow

test(
  "abstracted intent fires a cross-app pattern hint end-to-end (richer column)",
  opts,
  async () => {
    // Per-run axes → this run's App A is the sole match even in a populated pool.
    const [k1, k2] = runBasis();
    const emb = fake({ [CHECKOUT]: oneHot(k1), [RESET]: oneHot(k2) });

    // ── App A: a passing checkout spec + an unrelated reset-password spec ──
    const aUrl = uniqueUrl("app-a");
    const ka = createKnowledgeService({ databaseUrl: DB, embedder: emb });
    const aAppId = ka.appIdFor(aUrl);
    await ka.ingestRun(
      report(`r-${randomUUID()}`, aUrl, [
        { file: "checkout.spec.ts", title: "Checkout with card ending 4242" },
        { file: "reset.spec.ts", title: "Reset password" },
      ]),
    );

    // The new column is actually populated (richer embedding persisted).
    const pool = getPool(DB!);
    const nulls = await pool.query(
      `SELECT count(*)::int n FROM specs
        WHERE app_id=$1 AND reused=false AND pattern_embedding IS NULL`,
      [aAppId],
    );
    assert.equal(
      nulls.rows[0].n,
      0,
      "pattern_embedding persisted for App A specs",
    );

    // ── App B: a DIFFERENT origin plans a concretely-different checkout ──
    const bUrl = uniqueUrl("app-b");
    const kb = createKnowledgeService({ databaseUrl: DB, embedder: emb });
    const bScenario = "Checkout with card ending 1111";
    assert.notEqual(bScenario, "Checkout with card ending 4242"); // concretely distinct

    const ctx = await withFlag("true", () =>
      kb.assembleContext(bUrl, [{ name: bScenario }]),
    );

    const patterns = ctx.designer?.patterns ?? [];
    assert.equal(patterns.length, 1, "exactly one cross-app pattern surfaced");
    const hint = patterns[0];
    assert.equal(hint.patternTitle, "Checkout with card ending 4242");
    assert.equal(hint.sourceApp, aAppId, "provenance points at App A");
    assert.equal(hint.scenario, bScenario);
    assert.ok(hint.score > 0.9, `strong abstracted match (got ${hint.score})`);

    // The unrelated reset-password spec was ranked out (RANKS, not dumps).
    assert.ok(
      !patterns.some((p) => p.patternTitle === "Reset password"),
      "orthogonal workflow excluded by the relevance floor",
    );

    await ka.close();
    await kb.close();
  },
);

test(
  "flag OFF → no patterns surfaced (additive guarantee, end-to-end)",
  opts,
  async () => {
    const emb = fake({ [CHECKOUT]: [1, 0] });
    const aUrl = uniqueUrl("app-a-off");
    const ka = createKnowledgeService({ databaseUrl: DB, embedder: emb });
    await ka.ingestRun(
      report(`r-${randomUUID()}`, aUrl, [
        { file: "checkout.spec.ts", title: "Checkout with card ending 4242" },
      ]),
    );

    const bUrl = uniqueUrl("app-b-off");
    const kb = createKnowledgeService({ databaseUrl: DB, embedder: emb });
    const ctx = await withFlag(undefined, () =>
      kb.assembleContext(bUrl, [{ name: "Checkout with card ending 1111" }]),
    );

    assert.equal(
      ctx.designer?.patterns,
      undefined,
      "no patterns when flag off",
    );
    await ka.close();
    await kb.close();
  },
);

test("close pools", opts, async () => {
  await closeAllPools();
});
