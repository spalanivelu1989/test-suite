import ts from "typescript";
import type { ClaudeClient } from "../claude/client";
import type { CrawlResult, Flow, GeneratedTest } from "../types";
import { generateTest } from "./generate";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * T7b: validate a generated test without running it (D8). Checks for syntax
 * errors via the TypeScript parser and asserts the minimal Playwright shape.
 */
export function validateTestCode(code: string): ValidationResult {
  if (!/@playwright\/test/.test(code)) {
    return { valid: false, error: "missing import from '@playwright/test'" };
  }
  if (!/\btest\s*\(/.test(code)) {
    return { valid: false, error: "no test() call found" };
  }
  const sf = ts.createSourceFile(
    "generated.spec.ts",
    code,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  // `parseDiagnostics` is populated by createSourceFile for syntax errors.
  const diagnostics = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics;
  if (diagnostics && diagnostics.length > 0) {
    const msg = ts.flattenDiagnosticMessageText(
      diagnostics[0].messageText,
      "\n",
    );
    return { valid: false, error: `syntax error: ${msg}` };
  }
  return { valid: true };
}

/**
 * Generate a test and, if it fails validation, ask Claude to fix it — up to
 * `maxAttempts` total tries. Returns the best GeneratedTest with its valid flag.
 */
export async function generateValidTest(
  flow: Flow,
  crawl: CrawlResult,
  claude: ClaudeClient,
  maxAttempts = 3,
): Promise<GeneratedTest> {
  let last: GeneratedTest | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const fix =
      last && !last.valid
        ? `The previous attempt was invalid (${last.validationError}). Return corrected, syntactically valid TypeScript only.`
        : undefined;
    const candidate = await generateTest(flow, crawl, claude, fix);
    const result = validateTestCode(candidate.code);
    last = {
      ...candidate,
      valid: result.valid,
      validationError: result.error,
    };
    if (result.valid) return last;
  }
  return last!;
}
