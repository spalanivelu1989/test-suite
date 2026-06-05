import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, test } from "node:test";
import type { RunReport } from "../types";
import { type Embedder, FakeEmbedder } from "./embeddings/embed";
import { createKnowledgeService } from "./index";
import { closeAllPools, getPool } from "./store/db";
import { migrate } from "./store/migrate";

// Phase 2 DB-backed tests (T13/T14): embeddings stored in pgvector, semantic
// matching, cache, backfill, degradation. Skipped without KNOWLEDGE_DATABASE_URL.
const DB = process.env.KNOWLEDGE_DATABASE_URL;
const opts = { skip: DB ? false : "KNOWLEDGE_DATABASE_URL not set" };

const D = 384;
const uniqueUrl = () => `https://sem-${randomUUID().slice(0, 8)}.example.com/`;

/** Fake embedder mapping known texts → (padded, normalized) 384-d vectors. */
function fake(map: Record<string, number[]>, id = "fake"): FakeEmbedder {
  return new FakeEmbedder(map, D, id);
}

/** Counts embed() calls to prove the content-hash cache (AC3). */
class CountingEmbedder implements Embedder {
  calls = 0;
  texts = 0;
  constructor(private inner: Embedder) {}
  get id() {
    return this.inner.id;
  }
  get dims() {
    return this.inner.dims;
  }
  async embed(texts: string[]) {
    this.calls++;
    this.texts += texts.length;
    return this.inner.embed(texts);
  }
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
      code: `import { test } from '@playwright/test';\ntest('${s.title}', async () => {});`,
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

before(async () => {
  if (DB) await migrate(DB);
});

test(
  "findSimilarSpecs ranks the semantically-nearest spec first (AC8/R6)",
  opts,
  async () => {
    // hero → e0, footer → e1; query is near e0.
    const emb = fake({
      "Hero CTA": [1, 0],
      "Footer Links": [0, 1],
      "get in touch hero button": [0.9, 0.1],
    });
    const k = createKnowledgeService({ databaseUrl: DB, embedder: emb });
    const url = uniqueUrl();
    await k.ingestRun(
      report(`r-${randomUUID()}`, url, [
        { file: "hero.spec.ts", title: "Hero CTA" },
        { file: "footer.spec.ts", title: "Footer Links" },
      ]),
    );
    const matches = await k.findSimilarSpecs(
      "get in touch hero button",
      k.appIdFor(url),
      2,
    );
    assert.ok(matches.length >= 1);
    assert.equal(matches[0].title, "Hero CTA");
    assert.ok(matches[0].score > 0.8);
    await k.close();
  },
);

test(
  "embed-at-ingest is cached by content_hash — no re-embed (AC3)",
  opts,
  async () => {
    // Unique title → unique spec code → novel content_hash, so the cache starts
    // empty for this test (the content-hash cache is global, by design).
    const title = `Unique Flow ${randomUUID().slice(0, 8)}`;
    const counting = new CountingEmbedder(fake({ [title]: [1, 0] }));
    const k = createKnowledgeService({ databaseUrl: DB, embedder: counting });
    const url = uniqueUrl();
    const rep = report(`r-${randomUUID()}`, url, [
      { file: "hero.spec.ts", title },
    ]);
    await k.ingestRun(rep); // first ingest embeds
    const after1 = counting.texts;
    await k.ingestRun(rep); // same content_hash → cache hit, no new embed
    assert.ok(after1 >= 1, "embedded on first ingest");
    assert.equal(counting.texts, after1, "no re-embed on unchanged re-ingest");
    await k.close();
  },
);

test(
  "paraphrase on a 2nd run → reuse (semantic catch; AC9/SC2)",
  opts,
  async () => {
    const emb = fake({
      "Hero CTA": [1, 0],
      "Open the get-in-touch widget": [0.95, 0.05], // paraphrase, near Hero CTA
    });
    const k = createKnowledgeService({ databaseUrl: DB, embedder: emb });
    const url = uniqueUrl();
    await k.ingestRun(
      report(`r-${randomUUID()}`, url, [
        { file: "hero.spec.ts", title: "Hero CTA" },
      ]),
    );
    const decisions = await k.planCoverageDecision(
      [{ name: "Open the get-in-touch widget" }],
      k.appIdFor(url),
    );
    assert.equal(decisions[0].action, "reuse"); // lexical would say "new"
    await k.close();
  },
);

test(
  "embedding completeness — no null embeddings for current model (N5)",
  opts,
  async () => {
    const k = createKnowledgeService({
      databaseUrl: DB,
      embedder: fake({ "Hero CTA": [1, 0] }),
    });
    const url = uniqueUrl();
    const appId = k.appIdFor(url);
    await k.ingestRun(
      report(`r-${randomUUID()}`, url, [
        { file: "hero.spec.ts", title: "Hero CTA" },
      ]),
    );
    const pool = getPool(DB!);
    const res = await pool.query(
      `SELECT count(*)::int n FROM specs WHERE app_id=$1 AND reused=false AND embedding IS NULL`,
      [appId],
    );
    assert.equal(res.rows[0].n, 0);
    await k.close();
  },
);

test("model switch re-embeds (AC11/R9)", opts, async () => {
  const url = uniqueUrl();
  const appId = k1AppId(url);
  const rep = report(`r-${randomUUID()}`, url, [
    { file: "hero.spec.ts", title: "Hero CTA" },
  ]);
  // Ingest with model m1...
  const k1 = createKnowledgeService({
    databaseUrl: DB,
    embedder: fake({ "Hero CTA": [1, 0] }, "m1"),
  });
  await k1.ingestRun(rep);
  // ...re-ingest with model m2 → embedding_model updates (the backfill path).
  const k2 = createKnowledgeService({
    databaseUrl: DB,
    embedder: fake({ "Hero CTA": [0, 1] }, "m2"),
  });
  await k2.ingestRun(rep);
  const pool = getPool(DB!);
  const res = await pool.query(
    `SELECT embedding_model FROM specs WHERE app_id=$1 AND reused=false`,
    [appId],
  );
  assert.equal(res.rows[0].embedding_model, "m2");
  await k1.close();
});

function k1AppId(url: string) {
  return createKnowledgeService({ databaseUrl: "" }).appIdFor(url);
}

test(
  "degradation: an embedder that throws → lexical decision, no error (R8/SC9)",
  opts,
  async () => {
    const throwing: Embedder = {
      id: "boom",
      dims: D,
      embed: async () => {
        throw new Error("model exploded");
      },
    };
    const k = createKnowledgeService({ databaseUrl: DB, embedder: throwing });
    const url = uniqueUrl();
    // ingest still completes (specs stored with null embedding)
    await assert.doesNotReject(() =>
      k.ingestRun(
        report(`r-${randomUUID()}`, url, [
          { file: "h.spec.ts", title: "Hero CTA" },
        ]),
      ),
    );
    // decision falls back to lexical (exact title → reuse via tokens)
    const decisions = await k.planCoverageDecision(
      [{ name: "Hero CTA" }],
      k.appIdFor(url),
    );
    assert.equal(decisions[0].action, "reuse"); // lexical match, no semantic needed
    await k.close();
  },
);

test("retrieval + scenario-embed (fake, warm) ≤500ms (N1)", opts, async () => {
  const k = createKnowledgeService({
    databaseUrl: DB,
    embedder: fake({ "Hero CTA": [1, 0] }),
  });
  const url = uniqueUrl();
  await k.ingestRun(
    report(`r-${randomUUID()}`, url, [
      { file: "h.spec.ts", title: "Hero CTA" },
    ]),
  );
  const start = process.hrtime.bigint();
  await k.planCoverageDecision(
    [{ name: "Hero CTA" }, { name: "Footer" }],
    k.appIdFor(url),
  );
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(ms <= 500, `took ${ms.toFixed(1)}ms`);
  await k.close();
});

test("close pools", opts, async () => {
  await closeAllPools();
});
