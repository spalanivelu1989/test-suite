import { createHash } from "node:crypto";
import type { RunReport } from "../../types";
import { norm, significantTokens } from "../../coverage/coverage";
import { extractTitle, parsePlanScenarios } from "../../validator/validate";
import { normalizeOrigin } from "../appId";

// Normalize a RunReport into knowledge-base rows (Spec R3). DEFENSIVE: any
// missing/malformed field is skipped, never thrown (Plan RK5) — a partial report
// still ingests whatever it does contain.

export interface ExtractedRun {
  appId: string;
  run: { runId: string; appId: string; url: string; status: string | null };
  specs: {
    file: string;
    title: string | null;
    flowId: string | null;
    contentHash: string;
    tokens: string[];
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
}

function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

function toArr(s: Set<string>): string[] {
  return [...s];
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
      return {
        file: s.file,
        title,
        flowId,
        contentHash: sha1(s.code ?? ""),
        tokens,
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

  return {
    appId,
    run: { runId, appId, url: report.url ?? "", status: "completed" },
    specs,
    flows: [...flowsById.values()].map((f) => ({ appId, ...f })),
    planScenarios,
    testResults,
    coverage,
    edges,
  };
}
