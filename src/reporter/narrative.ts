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
  "You are an expert QA consultant and senior diagnostic engineer reviewing an automated UI test run. Your task is to analyze the results and produce a professional, client-oriented, and highly diagnostic narrative report in strict JSON format. " +
  "Return ONLY a JSON object matching this schema: " +
  '{ "fixPrompts": [{"test":"","problem":"","change":""}], "issues": [""], "better": "", "recommendationsText": "", "summary": [""], "testSummary": "" }. ' +
  "Do not include any explanation or prose outside the JSON. " +
  "\nField Instructions:\n" +
  "1. 'fixPrompts': Covers failing/quarantined tests with concrete problems and exact fixes.\n" +
  "2. 'issues': Bullet list of app or test suite setup problems as short strings.\n" +
  "3. 'better': A single paragraph (3-6 sentences) summarizing frontend/UX/accessibility gaps and testability limitations (e.g. missing filters, hidden DOM elements, CAPTCHAs) and their impact.\n" +
  "4. 'recommendationsText': A single paragraph (3-6 sentences) proposing actionable next steps: prioritize UI defect fixes, improve testability/accessibility, and name exact tests to re-run.\n" +
  "5. 'summary': An array of narrative-driven explanations (1-2 sentences) in plain English for EACH test (ordered the same as the results list). Explain the user journey and ground it in technical facts: name the specific routes/paths navigated, exact UI elements/inputs/buttons clicked/typed, and the precise assertions or verifications performed so the reader understands both the user flow and the exact test mechanics.\n" +
  "6. 'testSummary': A single executive summary paragraph (3-6 sentences) in the third person. It MUST start with the target URL name (e.g. 'senthilcaesar.github.io'). Verbatim-use the counts/rate from the 'Authoritative counts' block (do not invent numbers). State the counts of passed, failed, auto-fixed (healed), and flaky tests, and describe where the outcomes are concentrated.";

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

/** Repair a truncated or malformed JSON string by closing opened brackets and strings. */
export function repairJson(jsonStr: string): string {
  try {
    JSON.parse(jsonStr);
    return jsonStr;
  } catch {
    // If it fails, try to repair it
  }

  let insideString = false;
  let escaped = false;
  const stack: string[] = [];
  let lastTopLevelComma = -1;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      insideString = !insideString;
      continue;
    }
    if (!insideString) {
      if (char === "{") {
        stack.push("}");
      } else if (char === "[") {
        stack.push("]");
      } else if (char === "}") {
        if (stack[stack.length - 1] === "}") {
          stack.pop();
        }
      } else if (char === "]") {
        if (stack[stack.length - 1] === "]") {
          stack.pop();
        }
      } else if (char === "," && stack.length === 1 && stack[0] === "}") {
        lastTopLevelComma = i;
      }
    }
  }

  let simpleRepair = jsonStr;
  if (insideString) {
    simpleRepair += '"';
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    simpleRepair += stack[i];
  }

  try {
    JSON.parse(simpleRepair);
    return simpleRepair;
  } catch {
    // Simple repair failed (e.g. unclosed key/value in active parsing)
  }

  if (lastTopLevelComma !== -1) {
    const truncated = jsonStr.slice(0, lastTopLevelComma) + "}";
    try {
      JSON.parse(truncated);
      return truncated;
    } catch {
      // Ignore and fail
    }
  }

  return "";
}

/** Extract the JSON object from a model response that may include fences/prose. */
export function parseNarrative(text: string): Narrative {
  const start = text.indexOf("{");
  if (start === -1) {
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

  let raw: Record<string, unknown> | null = null;
  const end = text.lastIndexOf("}");
  if (end !== -1 && end > start) {
    try {
      raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      // Try repair if standard parsing fails
    }
  }

  if (!raw) {
    const repaired = repairJson(text.slice(start));
    if (repaired) {
      try {
        raw = JSON.parse(repaired) as Record<string, unknown>;
      } catch {
        // Fallback to empty
      }
    }
  }

  if (!raw) {
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
