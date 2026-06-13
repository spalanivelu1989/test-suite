import { significantTokens } from "../coverage/coverage";
import type {
  SpecValidation,
  ValidationFinding,
  ValidationReport,
} from "../types";

// Deterministic static validator for AI-generated Playwright specs. Pure — no
// browser, no LLM, no I/O. It inspects each spec's *source* against the four
// acceptance bars the dynamic pipeline can't see from a green/red result alone:
//   • correctness  — does it parse as a single, importable Playwright test?
//   • assertion    — does it assert real behavior (not nothing / not tautology)?
//   • robustness   — is it written to not flake (no hard waits, stable selectors)?
//   • relevance    — does it correspond to a planned scenario (R2)?
// Rules are line/regex heuristics in the spirit of coverage.ts/trimPlan, kept
// intentionally light so the whole module stays unit-testable and dependency-free.

/** A scenario heading parsed out of the Discoverer's Markdown plan. */
export interface PlanScenario {
  /** Ordinal id like "1.1" when present, else the heading text. */
  id: string;
  /** Heading text with any leading ordinal stripped. */
  name: string;
}

const SCORE_PER_ERROR = 40;
const SCORE_PER_WARNING = 15;

/** Matchers that only prove an element exists/shows — not what it *does*. */
const WEAK_MATCHERS = new Set([
  "toBeVisible",
  "toBeHidden",
  "toBeAttached",
  "toBeInViewport",
]);

/** Known Playwright/expect matchers. Used to tell assertions from method calls. */
const KNOWN_MATCHERS = new Set([
  ...WEAK_MATCHERS,
  "toHaveText",
  "toContainText",
  "toHaveValue",
  "toHaveValues",
  "toHaveURL",
  "toHaveCount",
  "toHaveAttribute",
  "toHaveClass",
  "toHaveId",
  "toHaveJSProperty",
  "toHaveCSS",
  "toHaveTitle",
  "toHaveScreenshot",
  "toHaveLength",
  "toBeChecked",
  "toBeEnabled",
  "toBeDisabled",
  "toBeEditable",
  "toBeEmpty",
  "toBeFocused",
  "toBe",
  "toEqual",
  "toStrictEqual",
  "toContain",
  "toMatch",
  "toMatchObject",
  "toBeTruthy",
  "toBeFalsy",
  "toBeNull",
  "toBeDefined",
  "toBeGreaterThan",
  "toBeGreaterThanOrEqual",
  "toBeLessThan",
  "toBeLessThanOrEqual",
  "toBeCloseTo",
]);

/**
 * Parse scenario headings out of a plan's Markdown. Handles both formats the
 * Discoverer emits in practice:
 *   • `## Scenario 2 — Hero Section CTA`   (current Discoverer output)
 *   • `#### 1.1 Hero Section CTA`          (designer-doc / numbered form)
 * Section sub-headings (Purpose/Steps/Expected Outcome/…) are ignored.
 */
export function parsePlanScenarios(plan: string | null): PlanScenario[] {
  if (!plan) return [];
  const out: PlanScenario[] = [];
  const seen = new Set<string>();
  const headingRe = /^#{2,6}\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(plan)) !== null) {
    const heading = m[1].trim();
    // "Scenario N — Title" (em/en dash, hyphen, colon, or dot separator).
    const scen = heading.match(
      /^Scenario\s+(\d+(?:\.\d+)*)\s*[—–\-:.)]+\s*(.+)$/i,
    );
    // "1.1 Title" / "1.1) Title" — requires a dotted ordinal so plain prose
    // headings (Overview, Assumptions) aren't treated as scenarios.
    const nm = heading.match(/^(\d+(?:\.\d+)+)[.)]?\s+(.+)$/);
    let id: string | null = null;
    let name: string | null = null;
    if (scen) {
      id = scen[1];
      name = scen[2].trim();
    } else if (nm) {
      id = nm[1];
      name = nm[2].trim();
    }
    if (id && name && !seen.has(name)) {
      seen.add(name);
      out.push({ id, name });
    }
  }
  return out;
}

/** The first `test('<title>')` title in a spec, or null if there is none. */
export function extractTitle(code: string): string | null {
  const m = code.match(/\btest(?:\.\w+)?\s*\(\s*(['"`])([\s\S]*?)\1/);
  return m ? m[2] : null;
}

/** Count real test cases (excludes `test.describe`/hooks/`test.step`). */
function countTestCases(code: string): number {
  const re = /\btest(?:\.(?:only|skip|fixme))?\s*\(/g;
  return (code.match(re) ?? []).length;
}

/** All known expect matchers used anywhere in the spec. */
function matchersUsed(code: string): string[] {
  const out: string[] = [];
  const re = /\.(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (KNOWN_MATCHERS.has(m[1])) out.push(m[1]);
  }
  return out;
}

/** Best-matching plan scenario for a spec title (token overlap), or null. */
export function matchScenario(
  title: string | null,
  scenarios: PlanScenario[],
): PlanScenario | null {
  if (!title || scenarios.length === 0) return null;
  const titleTokens = significantTokens(title);
  let best: { sc: PlanScenario; overlap: number } | null = null;
  for (const sc of scenarios) {
    const scTokens = significantTokens(`${sc.id} ${sc.name}`);
    let overlap = 0;
    for (const t of titleTokens) if (scTokens.has(t)) overlap++;
    if (overlap > 0 && (!best || overlap > best.overlap))
      best = { sc, overlap };
  }
  return best ? best.sc : null;
}

/** 1-based line numbers where a regex matches (one entry per matching line). */
function linesMatching(code: string, re: RegExp): number[] {
  const out: number[] = [];
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) out.push(i + 1);
  }
  return out;
}

function clampScore(findings: ValidationFinding[]): number {
  let score = 100;
  for (const f of findings) {
    score -= f.severity === "error" ? SCORE_PER_ERROR : SCORE_PER_WARNING;
  }
  return Math.max(0, score);
}

/** Validate a single spec's source against the static rules. */
export function validateSpec(
  spec: { file: string; code: string },
  scenarios: PlanScenario[],
): SpecValidation {
  const { code } = spec;
  const findings: ValidationFinding[] = [];
  const add = (
    rule: string,
    category: ValidationFinding["category"],
    severity: ValidationFinding["severity"],
    message: string,
    line?: number,
  ) => findings.push({ rule, category, severity, message, line });

  const title = extractTitle(code);

  // --- correctness / structure ---
  if (!/from\s+['"]@playwright\/test['"]/.test(code)) {
    add(
      "missing-import",
      "correctness",
      "error",
      "Spec does not import from '@playwright/test'.",
    );
  }
  const testCount = countTestCases(code);
  if (testCount === 0) {
    add(
      "no-test-block",
      "correctness",
      "error",
      "No test() block found — the spec defines no test case.",
    );
  } else if (testCount > 1) {
    add(
      "multiple-tests",
      "correctness",
      "warning",
      `${testCount} test() blocks in one file — designer rule is one scenario per file.`,
    );
  }

  // --- assertions (meaningful) ---
  const expectCount = (code.match(/\bexpect\s*\(/g) ?? []).length;
  const matchers = matchersUsed(code);
  const hasMeaningful = matchers.some((m) => !WEAK_MATCHERS.has(m));
  if (expectCount === 0) {
    add(
      "no-assertions",
      "assertion",
      "error",
      "No expect() assertions — the test verifies nothing.",
    );
  } else if (!hasMeaningful) {
    add(
      "weak-assertion-only",
      "assertion",
      "warning",
      "Only presence/visibility assertions — nothing checks content, value, state, or URL.",
    );
  }
  // Asserting a literal constant proves nothing about the app.
  const tautoRe =
    /\bexpect\(\s*(?:true|false|\d+(?:\.\d+)?|(['"]).*?\1)\s*\)\s*\.\s*(?:not\.\s*)?(?:toBe|toEqual|toStrictEqual|toBeTruthy|toBeFalsy)\b/;
  for (const line of linesMatching(code, tautoRe)) {
    add(
      "tautological-assertion",
      "assertion",
      "warning",
      "Assertion compares a literal to itself — it can never fail.",
      line,
    );
  }

  // --- robustness (not flaky) ---
  for (const line of linesMatching(
    code,
    /\b(?:page\.)?waitForTimeout\s*\(|\bsetTimeout\s*\(/,
  )) {
    add(
      "hard-wait",
      "robustness",
      "warning",
      "Hard-coded wait — prefer auto-waiting locators/assertions over fixed sleeps.",
      line,
    );
  }
  for (const line of linesMatching(
    code,
    /waitForLoadState\s*\(\s*['"]networkidle['"]/,
  )) {
    add(
      "networkidle",
      "robustness",
      "warning",
      "waitForLoadState('networkidle') is discouraged and flake-prone — wait on a concrete element instead.",
      line,
    );
  }
  const brittleRe =
    /xpath=|locator\(\s*['"]\s*\/\/|\.nth\(\s*\d+\s*\)|locator\(\s*['"][^'"]*>[^'"]*>[^'"]*['"]|locator\(\s*['"](?:\s*\.[\w-]+){4,}\s*['"]/;
  for (const line of linesMatching(code, brittleRe)) {
    add(
      "brittle-selector",
      "robustness",
      "warning",
      "Brittle selector (xpath / deep CSS chain / positional nth) — prefer role/text/label locators.",
      line,
    );
  }

  // --- relevance ---
  const matched = matchScenario(title, scenarios);
  if (scenarios.length > 0 && !matched) {
    add(
      "orphan-spec",
      "relevance",
      "warning",
      "Spec does not correspond to any scenario in the test plan.",
    );
  }

  return {
    file: spec.file,
    title,
    matchedScenario: matched ? matched.name : null,
    findings,
    score: clampScore(findings),
  };
}

/** Validate the whole generated suite against the plan. Pure. */
export function validateSuite(
  specs: { file: string; code: string }[],
  planMarkdown: string | null,
): ValidationReport {
  const scenarios = parsePlanScenarios(planMarkdown);
  const specResults = specs.map((s) => validateSpec(s, scenarios));

  const matchedNames = new Set(
    specResults
      .map((s) => s.matchedScenario)
      .filter((n): n is string => n !== null),
  );
  const missingFlows = scenarios
    .filter((sc) => !matchedNames.has(sc.name))
    .map((sc) => sc.name);
  const orphanSpecs = specResults
    .filter((s) => s.matchedScenario === null && scenarios.length > 0)
    .map((s) => s.file);

  let errorCount = 0;
  let warningCount = 0;
  for (const s of specResults) {
    for (const f of s.findings) {
      if (f.severity === "error") errorCount++;
      else warningCount++;
    }
  }

  const base =
    specResults.length === 0
      ? 100
      : specResults.reduce((sum, s) => sum + s.score, 0) / specResults.length;
  const missingRatio = scenarios.length
    ? missingFlows.length / scenarios.length
    : 0;
  const score = Math.round(base * (1 - 0.5 * missingRatio));

  return {
    specs: specResults,
    missingFlows,
    orphanSpecs,
    errorCount,
    warningCount,
    score,
  };
}

/**
 * Render the fixable findings (everything except relevance, which the Evolver
 * can't act on) as an instruction block to append to the Evolver's prompt, so it
 * repairs static anti-patterns alongside real runtime failures. Returns "" when
 * there is nothing actionable.
 */
export function formatValidationForEvolver(report: ValidationReport): string {
  const fixable = report.specs
    .map((s) => ({
      file: s.file,
      findings: s.findings.filter((f) => f.category !== "relevance"),
    }))
    .filter((x) => x.findings.length > 0);
  if (fixable.length === 0) return "";

  const lines = [
    "Static validation flagged the following issues in the generated specs.",
    "In addition to fixing any runtime failures, address each of these where it does not change the test's intent:",
    "",
  ];
  for (const { file, findings } of fixable) {
    lines.push(`- ${file}:`);
    for (const f of findings) {
      const loc = f.line ? ` (line ${f.line})` : "";
      lines.push(`  - [${f.rule}]${loc} ${f.message}`);
    }
  }
  return lines.join("\n");
}
