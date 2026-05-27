import type { ClaudeClient } from "../claude/client";
import type { FixPrompt, TestResult } from "../types";

export type { FixPrompt };

export interface Narrative {
  fixPrompts: FixPrompt[];
  issues: string[];
  recommendations: string[];
  summary: string[];
}

const SYSTEM =
  "You are a senior QA engineer reviewing an automated UI test run. Return ONLY a " +
  'JSON object: { "fixPrompts": [{"test":"","problem":"","change":""}], ' +
  '"issues": [""], "recommendations": [""], "summary": [""] }. ' +
  "fixPrompts cover failing/quarantined tests (concrete problem + exact change). " +
  "issues are problems found in the app or suite. " +
  "recommendations are how to improve coverage/quality. " +
  "summary is a list of clear, non-technical, simple English bullet points explaining " +
  "what features or user flows were tested (e.g. 'We verified that the user can filter items " +
  "by Coding, Design, and Personal categories. We also verified that typing a query in the " +
  "search bar narrows down results in real-time.'). Write in the third person, keeping descriptions " +
  "friendly and understandable for business stakeholders or non-technical users. " +
  "No prose outside the JSON.";

export function buildNarrativePrompt(
  results: TestResult[],
  specs: { file: string; code: string }[],
): string {
  const failing = results.filter(
    (r) => r.outcome === "failed" || r.outcome === "fixme",
  );
  const lines = [
    `Total tests: ${results.length}. Failing/quarantined: ${failing.length}.`,
    "",
    "All tests run (including success and failure):",
    ...results.map((r) => `- ${r.flowId} [${r.outcome}]`),
    "",
    "Problem tests details:",
    ...failing.map(
      (r) => `- ${r.flowId} [${r.outcome}] ${r.failureReason ?? ""}`,
    ),
    "",
    "Generated specs (truncated):",
    ...specs
      .slice(0, 20)
      .map((s) => `--- ${s.file} ---\n${s.code.slice(0, 800)}`),
    "",
    "Produce the JSON review now.",
  ];
  return lines.join("\n");
}

/** Extract the JSON object from a model response that may include fences/prose. */
export function parseNarrative(text: string): Narrative {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return { fixPrompts: [], issues: [], recommendations: [], summary: [] };
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return { fixPrompts: [], issues: [], recommendations: [], summary: [] };
  }
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const fixPrompts = Array.isArray(raw.fixPrompts)
    ? raw.fixPrompts
        .map((p): FixPrompt => {
          const o = (p ?? {}) as Record<string, unknown>;
          return {
            test: typeof o.test === "string" ? o.test : "",
            problem: typeof o.problem === "string" ? o.problem : "",
            change: typeof o.change === "string" ? o.change : "",
          };
        })
        .filter((p) => p.problem || p.change)
    : [];
  return {
    fixPrompts,
    issues: strArr(raw.issues),
    recommendations: strArr(raw.recommendations),
    summary: strArr(raw.summary),
  };
}

/** T13: ask Claude for fix prompts, issues, and recommendations (R16). */
export async function generateNarrative(
  results: TestResult[],
  specs: { file: string; code: string }[],
  claude: ClaudeClient,
): Promise<Narrative> {
  // No failures and nothing to review → skip the call.
  if (results.length === 0)
    return { fixPrompts: [], issues: [], recommendations: [], summary: [] };
  const text = await claude.complete({
    purpose: "report-narrative",
    system: SYSTEM,
    prompt: buildNarrativePrompt(results, specs),
  });
  return parseNarrative(text);
}
