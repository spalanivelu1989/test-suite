import type { ClaudeClient } from "../claude/client";
import type { FixPrompt, TestResult } from "../types";

export type { FixPrompt };

export interface Narrative {
  fixPrompts: FixPrompt[];
  issues: string[];
  recommendations: string[];
  better: string;
  recommendationsText: string;
  summary: string[];
  testSummary: string;
}

const SYSTEM =
  "You are an expert QA consultant and senior diagnostic engineer reviewing an automated UI test run. Your task is to analyze the results and produce a professional, client-oriented, and highly diagnostic narrative report. Return ONLY a " +
  'JSON object: { "fixPrompts": [{"test":"","problem":"","change":""}], ' +
  '"issues": [""], "better": "", "recommendationsText": "", "summary": [""], "testSummary": "" }. ' +
  "fixPrompts cover failing/quarantined tests (concrete problem + exact change). " +
  "issues are problems found in the app or suite as a list of short strings. " +
  "better is a single cohesive prose paragraph (3-6 sentences) summarizing what could be better on the frontend, written in a professional, client-oriented, and diagnostic tone. Identify frontend gaps, UX/accessibility, and testability/discoverability limitations (e.g. missing filters, navigation omissions, elements hidden in DOM, reCAPTCHA blocks) and note how they impact user discoverability and automation reliability. " +
  "recommendationsText is a single cohesive prose paragraph (3-6 sentences) offering clear, actionable next steps, written in a professional, client-oriented, and diagnostic tone. Focus on fixing UI defects first, improving testability/accessibility (e.g. exposing inputs in accessible DOM, bypass mechanisms for CAPTCHAs in non-prod), and specifying the exact test names to re-run to confirm fixes. " +
  "summary is an array of strings, where each string is a narrative-driven, engaging story (2-4 sentences) in plain English for EACH test carried out in the run (ordered the same as the tests), explaining the user journey like a tech journalist telling it to a generalist audience. Instead of using dry technical terms, robot templates, or ambiguous descriptions, it should bring the test flow to life, narrate the simulated user action, explain what the specific check verified (the 'how' and 'why'), and outline what the success or failure means for the actual end-user's experience. " +
  "testSummary is a SINGLE concise prose paragraph (3-6 sentences), third person, " +
  "business-friendly, that synthesizes the whole run. It MUST use the exact counts and " +
  "success rate given in the 'Authoritative counts' block of the user message verbatim, " +
  "and MUST NOT invent numbers, tests, or findings. State how many tests passed, failed, " +
  "and were auto-fixed (healed), give the success rate, then describe where the failures " +
  "and auto-fixes are concentrated based ONLY on the listed tests and their failure reasons. " +
  "Mention auto-fixed (healed) and unreliable (flaky) tests where relevant. If there were no " +
  "failures, say so plainly. It MUST start with the target URL name (e.g. 'senthilcaesar.github.io') instead of generic text like 'The suite is in'. Example tone: 'senthilcaesar.github.io is in good shape overall: 23 tests passed, " +
  "2 failed, and 2 were auto-fixed, for a 92% success rate. The failures are concentrated in " +
  "navigation/content discovery...'. " +
  "No prose outside the JSON.";

export function buildNarrativePrompt(
  results: TestResult[],
  specs: { file: string; code: string }[],
  url?: string,
): string {
  const failing = results.filter(
    (r) => r.outcome === "failed" || r.outcome === "fixme",
  );
  const healed = results.filter((r) => r.outcome === "healed");
  const flaky = results.filter((r) => r.outcome === "flaky");
  const count = (o: TestResult["outcome"]) =>
    results.filter((r) => r.outcome === o).length;
  const total = results.length;
  const passed = count("passed");
  const healedCount = healed.length;
  // Success rate matches computeSuccessRate(): passed + healed over total.
  const successPct =
    total === 0 ? 0 : Math.round(((passed + healedCount) / total) * 100);
  const targetHost = url ? url.replace(/https?:\/\//, "").replace(/\/$/, "") : "unknown";
  const lines = [
    `Target URL name: ${targetHost}`,
    "",
    "Authoritative counts (use these exact numbers in testSummary; do not invent others):",
    `- Total tests: ${total}`,
    `- Passed: ${passed}`,
    `- Failed: ${count("failed") + count("fixme")}`,
    `- Auto-fixed (healed): ${healedCount}`,
    `- Unreliable (flaky): ${flaky.length}`,
    `- Success rate: ${successPct}% (passed + auto-fixed over total)`,
    "",
    "All tests run (including success and failure):",
    ...results.map((r) => `- ${r.flowId} [${r.outcome}]`),
    "",
    "Problem tests details (failed/quarantined):",
    ...(failing.length
      ? failing.map(
          (r) => `- ${r.flowId} [${r.outcome}] ${r.failureReason ?? ""}`,
        )
      : ["- none"]),
    "",
    "Auto-fixed (healed) tests:",
    ...(healed.length ? healed.map((r) => `- ${r.flowId}`) : ["- none"]),
    "",
    "Unreliable (flaky) tests:",
    ...(flaky.length ? flaky.map((r) => `- ${r.flowId}`) : ["- none"]),
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
    return {
      fixPrompts: [],
      issues: [],
      recommendations: [],
      better: "",
      recommendationsText: "",
      summary: [],
      testSummary: "",
    };
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return {
      fixPrompts: [],
      issues: [],
      recommendations: [],
      better: "",
      recommendationsText: "",
      summary: [],
      testSummary: "",
    };
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
    better: typeof raw.better === "string" ? raw.better : "",
    recommendationsText: typeof raw.recommendationsText === "string" ? raw.recommendationsText : "",
    summary: strArr(raw.summary),
    testSummary: typeof raw.testSummary === "string" ? raw.testSummary : "",
  };
}

/** T13: ask Claude for fix prompts, issues, and recommendations (R16). */
export async function generateNarrative(
  results: TestResult[],
  specs: { file: string; code: string }[],
  claude: ClaudeClient,
  url?: string,
): Promise<Narrative> {
  // No failures and nothing to review → skip the call.
  if (results.length === 0)
    return {
      fixPrompts: [],
      issues: [],
      recommendations: [],
      better: "",
      recommendationsText: "",
      summary: [],
      testSummary: "",
    };
  const text = await claude.complete({
    purpose: "report-narrative",
    system: SYSTEM,
    prompt: buildNarrativePrompt(results, specs, url),
  });
  return parseNarrative(text);
}
