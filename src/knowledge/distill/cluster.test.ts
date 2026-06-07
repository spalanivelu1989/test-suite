import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterEpisodes, type EpisodeInput } from "./cluster";
import { confidenceFor, nextStatus, shouldTrust } from "./promote";
import { summarizeCluster } from "./summarize";

const ep = (over: Partial<EpisodeInput>): EpisodeInput => ({
  runId: "r1",
  signature: "timeouterror locator not found",
  tokens: ["timeouterror", "locator", "found"],
  strategy: "role-locator",
  embedding: null,
  before: "page.locator('#a')",
  after: "page.getByRole('button')",
  ...over,
});

test("clusterEpisodes: same strategy + similar signature → one cluster", () => {
  const clusters = clusterEpisodes([ep({ runId: "r1" }), ep({ runId: "r2" })]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].supportCount, 2); // distinct runs
  assert.equal(clusters[0].strategy, "role-locator");
});

test("clusterEpisodes: different strategies never merge", () => {
  const clusters = clusterEpisodes([
    ep({ strategy: "role-locator" }),
    ep({ strategy: "wait-visibility" }),
  ]);
  assert.equal(clusters.length, 2);
});

test("clusterEpisodes: fixme episodes are excluded (not a reusable fix)", () => {
  const clusters = clusterEpisodes([ep({ strategy: "fixme" })]);
  assert.equal(clusters.length, 0);
});

test("clusterEpisodes: same signature healed two ways → contradictions counted", () => {
  const clusters = clusterEpisodes([
    ep({ runId: "r1", strategy: "role-locator" }),
    ep({ runId: "r2", strategy: "wait-visibility" }),
  ]);
  // each cluster sees the other run as a contradicting fix of the same signature
  for (const c of clusters) assert.equal(c.contradictions, 1);
});

test("clusterEpisodes: deterministic — same input → same clusters", () => {
  const input = [ep({ runId: "a" }), ep({ runId: "b" })];
  assert.deepEqual(clusterEpisodes(input), clusterEpisodes(input));
});

test("shouldTrust / nextStatus: support ≥ N and no contradiction → trusted (AC13)", () => {
  assert.equal(shouldTrust({ supportCount: 2, contradictions: 0 }), true);
  assert.equal(nextStatus({ supportCount: 2, contradictions: 0 }), "trusted");
  assert.equal(nextStatus({ supportCount: 1, contradictions: 0 }), "episodic");
});

test("nextStatus: contradiction demotes even with support (AC18)", () => {
  assert.equal(nextStatus({ supportCount: 5, contradictions: 1 }), "episodic");
});

test("confidenceFor: rises with support, falls with contradictions", () => {
  const strong = confidenceFor({ supportCount: 4, contradictions: 0 });
  const contested = confidenceFor({ supportCount: 4, contradictions: 2 });
  assert.ok(strong > contested);
  assert.ok(strong > 0 && strong <= 1);
});

test("summarizeCluster: no summarizer → deterministic template (SC9/AC12)", async () => {
  const [c] = clusterEpisodes([ep({})]);
  const p = await summarizeCluster(c);
  assert.ok(p.principle.length > 0);
  assert.ok(p.recommendation.toLowerCase().includes("getbyrole"));
});

test("summarizeCluster: uses summarizer JSON when it parses", async () => {
  const [c] = clusterEpisodes([ep({})]);
  const p = await summarizeCluster(
    c,
    async () =>
      'noise {"principle":"P","recommendation":"R","antipattern":"A"} trailing',
  );
  assert.equal(p.principle, "P");
  assert.equal(p.recommendation, "R");
  assert.equal(p.antipattern, "A");
});

test("summarizeCluster: summarizer throwing falls back to template", async () => {
  const [c] = clusterEpisodes([ep({})]);
  const p = await summarizeCluster(c, async () => {
    throw new Error("boom");
  });
  assert.ok(p.principle.length > 0); // template, not a crash
});
