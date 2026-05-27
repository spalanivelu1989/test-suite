import type { ClaudeClient } from "../claude/client";
import type { GeneratedTest, TestResult } from "../types";
import { validateTestCode } from "../generator/validate";

/** Heuristic: is this failure caused by a locator/selector problem (R9)? */
export function isLocatorFailure(reason?: string): boolean {
  if (!reason) return false;
  return /locator|selector|not found|no element|getby|waiting for|resolved to 0|strict mode/i.test(
    reason,
  );
}

const SYSTEM = [
  "You repair a failing Playwright test whose locator no longer matches the page.",
  "Given the test code and the failure, return corrected TypeScript only —",
  "prefer resilient locators (getByRole/getByText/getByPlaceholder). No prose, no fences.",
].join(" ");

export function buildHealPrompt(code: string, reason: string): string {
  return [
    "The following Playwright test failed with a locator error.",
    `Failure: ${reason}`,
    "",
    "Test code:",
    code,
    "",
    "Return the corrected test file.",
  ].join("\n");
}

/** Ask Claude to repair one test; returns the repaired+validated GeneratedTest. */
export async function healTest(
  test: GeneratedTest,
  reason: string,
  claude: ClaudeClient,
): Promise<GeneratedTest> {
  const text = await claude.complete({
    purpose: "heal-test",
    system: SYSTEM,
    prompt: buildHealPrompt(test.code, reason),
  });
  const code = text.replace(/```[a-z]*\n?|```/g, "").trim();
  const validation = validateTestCode(code);
  return {
    ...test,
    code,
    valid: validation.valid,
    validationError: validation.error,
  };
}

export type RunOnce = (tests: GeneratedTest[]) => Promise<TestResult[]>;

/**
 * T10: attempt to heal every failed result caused by a locator error. Re-runs
 * the repaired test; marks it healed if it now passes. Returns updated results
 * plus the heal success rate (M3).
 */
export async function healFailures(
  tests: GeneratedTest[],
  results: TestResult[],
  claude: ClaudeClient,
  runOnce: RunOnce,
): Promise<{ results: TestResult[]; healSuccessRate: number }> {
  const byFlow = new Map(tests.map((t) => [t.flowId, t]));
  let attempted = 0;
  let healed = 0;

  const updated = await Promise.all(
    results.map(async (res): Promise<TestResult> => {
      if (res.outcome !== "failed" || !isLocatorFailure(res.failureReason)) {
        return res;
      }
      const original = byFlow.get(res.flowId);
      if (!original) return res;

      attempted += 1;
      const repaired = await healTest(
        original,
        res.failureReason ?? "",
        claude,
      );
      if (!repaired.valid) return res;

      const [rerun] = await runOnce([repaired]);
      if (rerun && rerun.outcome === "passed") {
        healed += 1;
        return {
          ...res,
          outcome: "healed",
          healed: true,
          failureReason: undefined,
        };
      }
      return res;
    }),
  );

  const healSuccessRate = attempted === 0 ? 0 : healed / attempted;
  return { results: updated, healSuccessRate };
}
