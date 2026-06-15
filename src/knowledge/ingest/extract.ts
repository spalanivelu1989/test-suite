import { createHash } from "node:crypto";
import type { RunReport } from "../../types";
import { norm, significantTokens } from "../../coverage/coverage";
import { extractTitle, parsePlanScenarios } from "../../validator/validate";
import { normalizeOrigin } from "../appId";
import { REUSE_MARKER } from "../constants";
import { patternTextFor } from "../embeddings/abstractIntent";
import type { HealingEvent } from "../types";

// Normalize a RunReport into knowledge-base rows (Spec R3). DEFENSIVE: any
// missing/malformed field is skipped, never thrown (Plan RK5) — a partial report
// still ingests whatever it does contain.

export interface ExtractedRun {
  appId: string;
  run: {
    runId: string;
    appId: string;
    url: string;
    status: string | null;
    crawlMode: string | null;
  };
  specs: {
    file: string;
    title: string | null;
    flowId: string | null;
    contentHash: string;
    tokens: string[];
    /** Text embedded for semantic match (title + step comments) — Phase 2 (D5). */
    intentText: string;
    /**
     * PROTOTYPE: abstracted intent (app-specific entities stripped) embedded into
     * pattern_embedding for the cross-app pattern tier — distinct from intentText.
     */
    patternText: string;
    /**
     * The TITLE on its own — embedded into title_embedding for hybrid reuse (0005).
     * Symmetric with the title-only scenario query, unlike intentText (+steps).
     */
    titleText: string;
    /** True when this spec was copied forward from a prior run (carries the marker). */
    reused: boolean;
    /** Embedding + model, populated by ingestRun (best-effort); null if absent. */
    embedding?: number[] | null;
    embeddingModel?: string | null;
    /** PROTOTYPE: pattern embedding + model (best-effort); null if absent. */
    patternEmbedding?: number[] | null;
    patternModel?: string | null;
    /** Hybrid reuse (0005): title embedding + model (best-effort); null if absent. */
    titleEmbedding?: number[] | null;
    titleModel?: string | null;
  }[];
  flows: { appId: string; flowId: string; name: string }[];
  planScenarios: {
    runId: string;
    appId: string;
    ordinal: string | null;
    name: string;
    tokens: string[];
  }[];
  testResults: {
    runId: string;
    appId: string;
    flowId: string | null;
    file: string | null;
    outcome: string;
    failureReason: string | null;
  }[];
  coverage: {
    runId: string;
    appId: string;
    curatedTotal: number;
    testedCount: number;
    percent: number;
    missingFlows: string[];
  } | null;
  edges: {
    appId: string;
    srcType: string;
    srcId: string;
    rel: string;
    dstType: string;
    dstId: string;
  }[];
  /** Phase 3: healing events captured by the orchestrator (ADR-0004). */
  healingEvents: HealingEvent[];
}

function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

function toArr(s: Set<string>): string[] {
  return [...s];
}

/** Numbered step-comment text from a generated spec (`// 1. Click …` → `Click …`). */
function stepComments(code: string): string[] {
  return (code.match(/^\s*\/\/\s*\d+[.)]\s*(.+)$/gm) ?? []).map((l) =>
    l.replace(/^\s*\/\/\s*\d+[.)]\s*/, "").trim(),
  );
}

/** RunReport → ExtractedRun. Tolerant of partial reports. */
export function extractRun(report: RunReport): ExtractedRun {
  const appId = normalizeOrigin(report.url ?? "");
  const runId = report.runId;

  // fileName → flowId, so a spec can be linked to the flow it tested.
  const fileToFlow = new Map<string, string>();
  const results = Array.isArray(report.results) ? report.results : [];
  for (const r of results) {
    if (r?.fileName && r?.flowId) fileToFlow.set(r.fileName, r.flowId);
  }

  // Flows: curated metadata + any flow a result referenced.
  const flowsById = new Map<string, { flowId: string; name: string }>();
  for (const f of Array.isArray(report.flows) ? report.flows : []) {
    if (!f?.name && !f?.id) continue;
    const flowId = norm(f.id || f.name);
    if (flowId) flowsById.set(flowId, { flowId, name: f.name || f.id });
  }
  for (const r of results) {
    if (!r?.flowId) continue;
    const flowId = norm(r.flowId);
    if (flowId && !flowsById.has(flowId))
      flowsById.set(flowId, { flowId, name: r.flowId });
  }

  const specsIn = Array.isArray(report.generatedSpecs)
    ? report.generatedSpecs
    : [];
  const specs = specsIn
    .filter((s) => s && typeof s.file === "string")
    .map((s) => {
      const title = extractTitle(s.code ?? "");
      const flowId = fileToFlow.get(s.file)
        ? norm(fileToFlow.get(s.file)!)
        : null;
      // Lexical-match tokens come from the spec's INTENT (title + file), not
      // its volatile selectors (Plan §3.4).
      const tokens = toArr(significantTokens(`${title ?? ""} ${s.file}`));
      // Semantic-match intent text = title + numbered step comments (D5) —
      // captures what the test does, without volatile selectors.
      const steps = stepComments(s.code ?? "");
      const intentText = [title, ...steps].filter(Boolean).join(". ");
      return {
        file: s.file,
        title,
        flowId,
        contentHash: sha1(s.code ?? ""),
        tokens,
        intentText,
        // PROTOTYPE: abstracted intent for cross-app matching (R-pattern).
        patternText: patternTextFor(intentText),
        // Hybrid reuse (0005): the title alone — symmetric with the title-only
        // scenario query. Empty when the spec has no title → embedTitles skips it
        // and the decision falls back to intentText's embedding.
        titleText: title ?? "",
        reused: (s.code ?? "").includes(REUSE_MARKER),
      };
    });

  const planScenarios = parsePlanScenarios(report.planMarkdown ?? null).map(
    (sc) => ({
      runId,
      appId,
      ordinal: sc.id ?? null,
      name: sc.name,
      tokens: toArr(significantTokens(sc.name)),
    }),
  );

  const testResults = results
    .filter((r) => r && r.outcome)
    .map((r) => ({
      runId,
      appId,
      flowId: r.flowId ? norm(r.flowId) : null,
      file: r.fileName ?? null,
      outcome: r.outcome,
      failureReason: r.failureReason ?? null,
    }));

  const cov = report.coverage;
  const coverage = cov
    ? {
        runId,
        appId,
        curatedTotal: cov.curatedTotal ?? 0,
        testedCount: cov.testedCount ?? 0,
        percent: cov.percent ?? 0,
        missingFlows: Array.isArray(cov.missingFlows) ? cov.missingFlows : [],
      }
    : null;

  // Typed relations for the edges table.
  const edges: ExtractedRun["edges"] = [];
  for (const s of specs) {
    edges.push({
      appId,
      srcType: "run",
      srcId: runId,
      rel: "PRODUCED",
      dstType: "spec",
      dstId: s.file,
    });
    if (s.flowId)
      edges.push({
        appId,
        srcType: "spec",
        srcId: s.file,
        rel: "TESTS",
        dstType: "flow",
        dstId: s.flowId,
      });
  }
  for (const r of testResults) {
    if (r.flowId)
      edges.push({
        appId,
        srcType: "run",
        srcId: runId,
        rel: "COVERS",
        dstType: "flow",
        dstId: r.flowId,
      });
  }

  // Phase 3: heals are captured by the orchestrator (pre/post diff) and attached
  // to the report; carry them through, re-stamping run/app so a partial report
  // can't smuggle a mismatched id (ADR-0004).
  const healingEvents: HealingEvent[] = (report.healingEvents ?? []).map(
    (h) => ({ ...h, runId, appId }),
  );

  return {
    appId,
    run: {
      runId,
      appId,
      url: report.url ?? "",
      status: "completed",
      crawlMode: report.crawlMode ?? null,
    },
    specs,
    flows: [...flowsById.values()].map((f) => ({ appId, ...f })),
    planScenarios,
    testResults,
    coverage,
    edges,
    healingEvents,
  };
}
