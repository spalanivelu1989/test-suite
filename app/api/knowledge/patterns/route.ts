import { normalizeOrigin } from "@/src/knowledge/appId";
import { patternTextFor } from "@/src/knowledge/embeddings/abstractIntent";
import { significantTokens } from "@/src/coverage/coverage";
import { cosineSim, LocalEmbedder } from "@/src/knowledge/embeddings/embed";
import {
  decideForSpecs,
  overlapCoefficient,
  REUSE_THRESHOLD,
  SEM_REUSE,
  SEM_TITLE_WEIGHT,
} from "@/src/knowledge/retrieve/coverageDecision";
import {
  PATTERN_RELEVANCE,
  workflowSkeleton,
} from "@/src/knowledge/retrieve/globalPatterns";
import { getPool } from "@/src/knowledge/store/db";
import {
  findGlobalPatternSpecs,
  readSpecsForApp,
} from "@/src/knowledge/store/repo";

export const runtime = "nodejs";

// Standalone pattern explorer (prototype dev tool). Embeds a seed sentence the
// SAME two ways the pipeline does — concrete for within-app reuse, abstracted for
// cross-app transfer — and runs both nearest-neighbor reads so you can eyeball the
// scores side by side. Read-only; never writes, never copies source.

/** One embedder instance per server process — the bge model is heavy to load. */
let embedder: LocalEmbedder | null = null;
function getEmbedder(): LocalEmbedder {
  if (!embedder)
    embedder = new LocalEmbedder(process.env.EMBEDDING_MODEL || undefined);
  return embedder;
}

export async function POST(request: Request) {
  const url = process.env.KNOWLEDGE_DATABASE_URL;
  if (!url) {
    return Response.json(
      { enabled: false, error: "KNOWLEDGE_DATABASE_URL is not configured" },
      { status: 200 },
    );
  }

  let body: { seedText?: unknown; appId?: unknown; k?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const seedText =
    typeof body.seedText === "string" ? body.seedText.trim() : "";
  if (!seedText) {
    return Response.json({ error: "seedText is required" }, { status: 400 });
  }
  // appId scopes the in-app tier and is EXCLUDED from the cross-app tier. Empty =>
  // no in-app results, and cross-app spans every app (nothing to exclude). The
  // caller may pass any Target URL — normalize it to the app id (origin) so a
  // typed URL maps to the same key as ingested specs (idempotent on an app id).
  const rawAppId = typeof body.appId === "string" ? body.appId.trim() : "";
  const appId = rawAppId ? normalizeOrigin(rawAppId) : "";
  const kRaw = Number(body.k);
  const k = Number.isFinite(kRaw)
    ? Math.min(50, Math.max(1, Math.trunc(kRaw)))
    : 10;

  // The seed becomes TWO query vectors: the raw text (concrete reuse space) and
  // the entity-stripped abstraction (workflow-shape space). Comparing across the
  // two spaces would be meaningless, so each tier uses its matching vector.
  const abstracted = patternTextFor(seedText);
  const emb = getEmbedder();
  const [concreteVec, patternVec] = await emb.embed([seedText, abstracted]);

  const pool = getPool(url);
  const [appSpecs, crossApp] = await Promise.all([
    appId ? readSpecsForApp(pool, appId) : Promise.resolve([]),
    findGlobalPatternSpecs(pool, appId, patternVec, k),
  ]);

  // In-app reuse tier: the HYBRID score the real decision uses (coverageDecision)
  // — blend of the title-only cosine and the title+steps cosine, so an exact title
  // scores ~1.0 instead of ~0.79. Falls back to intent-only when un-backfilled.
  // Lexical token overlap of the seed against each spec — the OTHER half of the
  // real reuse rule (lexical ≥ 0.80 OR sem ≥ 0.82). Surfacing it keeps the explorer
  // from under-reporting reuse on exact-token matches the embeddings under-score.
  const scTokens = significantTokens(seedText);
  const inApp = appSpecs
    .map((s) => {
      const semIntent = s.embedding ? cosineSim(concreteVec, s.embedding) : 0;
      const semTitle =
        s.titleEmbedding && s.titleEmbedding.length
          ? cosineSim(concreteVec, s.titleEmbedding)
          : semIntent;
      return {
        runId: s.runId,
        file: s.file,
        title: s.title,
        flowId: s.flowId,
        lastOutcome: s.lastOutcome,
        lexical: overlapCoefficient(scTokens, new Set(s.tokens)),
        semTitle,
        semIntent,
        score: SEM_TITLE_WEIGHT * semTitle + (1 - SEM_TITLE_WEIGHT) * semIntent,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  // Authoritative reuse|new verdict — the SAME function the pipeline runs, so the
  // explorer mirrors it exactly: lexical OR semantic, the last-outcome gate, and
  // the Fix 2 flow guard. The seed carries no flow, so the flow guard stays dormant
  // here (same as the live pipeline today). Empty appSpecs → "new".
  const [decision] = decideForSpecs(
    [{ name: seedText, embedding: concreteVec }],
    appSpecs,
  );

  return Response.json(
    {
      enabled: true,
      seedText,
      abstracted,
      appId: appId || null,
      thresholds: {
        reuse: SEM_REUSE,
        lexical: REUSE_THRESHOLD,
        pattern: PATTERN_RELEVANCE,
      },
      titleWeight: SEM_TITLE_WEIGHT,
      // Authoritative reuse|new decision (mirrors decideForSpecs) — the explorer
      // should render THIS, not re-derive a verdict from the sem score alone.
      decision: {
        action: decision.action,
        score: decision.score,
        lastOutcome: decision.lastOutcome ?? null,
        matchedFile: decision.matchedSpec?.file ?? null,
      },
      // In-app reuse tier: hybrid blend, scoped to appId. Now also carries the
      // lexical score, last outcome, and flow so the UI can explain the decision.
      inApp: inApp.map((r) => ({
        runId: r.runId,
        file: r.file,
        title: r.title,
        flowId: r.flowId,
        lastOutcome: r.lastOutcome,
        lexical: r.lexical,
        score: r.score,
        semTitle: r.semTitle,
        semIntent: r.semIntent,
      })),
      // Cross-app pattern tier: abstracted embedding, all OTHER apps, passing/healed only.
      crossApp: crossApp.map((r) => ({
        appId: r.appId,
        runId: r.runId,
        file: r.file,
        title: r.title,
        flowId: r.flowId,
        score: r.score,
        // The abstracted workflow skeleton the Designer now receives for `new` scenarios.
        workflow: workflowSkeleton(r.patternText),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
