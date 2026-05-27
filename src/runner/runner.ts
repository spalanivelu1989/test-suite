import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GeneratedTest, TestResult } from "../types";

// Shape of the bits of the Playwright JSON reporter we consume.
interface PwTestRun {
  status?: string;
  error?: { message?: string };
  errors?: { message?: string }[];
}
interface PwSpec {
  title: string;
  file: string;
  ok: boolean;
  tests: { results: PwTestRun[] }[];
}
interface PwSuite {
  specs?: PwSpec[];
  suites?: PwSuite[];
}
export interface PlaywrightJsonReport {
  suites?: PwSuite[];
}

/** Flatten Playwright's nested suite tree into a flat spec list. */
function flattenSpecs(suites: PwSuite[] = []): PwSpec[] {
  const out: PwSpec[] = [];
  for (const s of suites) {
    if (s.specs) out.push(...s.specs);
    if (s.suites) out.push(...flattenSpecs(s.suites));
  }
  return out;
}

/** Pure mapping: JSON report + the tests we ran -> per-flow TestResult[] (R4). */
export function mapPlaywrightResults(
  report: PlaywrightJsonReport,
  tests: GeneratedTest[],
): TestResult[] {
  const specs = flattenSpecs(report.suites);
  const byFile = new Map<string, PwSpec>();
  for (const spec of specs) {
    byFile.set(spec.file.split("/").pop() ?? spec.file, spec);
  }

  return tests.map((t): TestResult => {
    if (!t.valid) {
      return {
        flowId: t.flowId,
        fileName: t.fileName,
        outcome: "failed",
        failureReason: t.validationError ?? "test failed validation",
      };
    }
    const spec = byFile.get(t.fileName);
    if (!spec) {
      return {
        flowId: t.flowId,
        fileName: t.fileName,
        outcome: "failed",
        failureReason: "no result reported for this test",
      };
    }
    if (spec.ok) {
      return { flowId: t.flowId, fileName: t.fileName, outcome: "passed" };
    }
    const run = spec.tests[0]?.results[0];
    const reason =
      run?.error?.message ?? run?.errors?.[0]?.message ?? "test failed";
    return {
      flowId: t.flowId,
      fileName: t.fileName,
      outcome: "failed",
      failureReason: reason,
    };
  });
}

const CONFIG = `import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  reporter: [['json']],
  use: { headless: true, ...devices['Desktop Chrome'] },
});
`;

/** Spawns the Playwright CLI in a temp dir and returns the parsed JSON report. */
async function defaultExecutor(
  tests: GeneratedTest[],
): Promise<PlaywrightJsonReport> {
  // Run dir lives under the project root (gitignored .runs/) so the spawned
  // Playwright CLI resolves the project's node_modules via upward lookup.
  const base = join(process.cwd(), ".runs");
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, "run-"));
  try {
    await writeFile(join(dir, "playwright.config.ts"), CONFIG, "utf8");
    const testsDir = join(dir, "tests");
    await mkdir(testsDir, { recursive: true });
    for (const t of tests) {
      if (t.valid) await writeFile(join(testsDir, t.fileName), t.code, "utf8");
    }
    const stdout = await new Promise<string>((resolve) => {
      const child = spawn(
        "npx",
        [
          "playwright",
          "test",
          "--config",
          join(dir, "playwright.config.ts"),
          "--reporter=json",
        ],
        { cwd: dir, env: { ...process.env } },
      );
      let out = "";
      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", () => {});
      // Playwright exits non-zero when tests fail; we still parse the JSON.
      child.on("close", () => resolve(out));
    });
    const start = stdout.indexOf("{");
    const end = stdout.lastIndexOf("}");
    if (start === -1 || end === -1) return { suites: [] };
    return JSON.parse(stdout.slice(start, end + 1)) as PlaywrightJsonReport;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type RunExecutor = (
  tests: GeneratedTest[],
) => Promise<PlaywrightJsonReport>;

/** T8: execute the generated tests and capture per-test results. */
export async function runTests(
  tests: GeneratedTest[],
  executor: RunExecutor = defaultExecutor,
): Promise<TestResult[]> {
  const valid = tests.filter((t) => t.valid);
  const report = valid.length > 0 ? await executor(tests) : { suites: [] };
  return mapPlaywrightResults(report, tests);
}
