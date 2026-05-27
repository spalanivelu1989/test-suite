import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Workspace } from "../agents/workspace";
import type { TestResult } from "../types";

// Authoritative results capture (T9): after the Healer has edited the specs, we
// run the suite ourselves and parse the Playwright JSON so results don't depend
// on what the agent reported.

interface PwAnnotation {
  type: string;
}
interface PwTestRun {
  status?: string;
}
interface PwTest {
  annotations?: PwAnnotation[];
  results: PwTestRun[];
  status?: string;
}
interface PwSpec {
  title: string;
  file: string;
  ok: boolean;
  tests: PwTest[];
}
interface PwSuite {
  specs?: PwSpec[];
  suites?: PwSuite[];
}
export interface PlaywrightJsonReport {
  suites?: PwSuite[];
}

function flattenSpecs(suites: PwSuite[] = []): PwSpec[] {
  const out: PwSpec[] = [];
  for (const s of suites) {
    if (s.specs) out.push(...s.specs);
    if (s.suites) out.push(...flattenSpecs(s.suites));
  }
  return out;
}

function isFixme(spec: PwSpec): boolean {
  return spec.tests.some(
    (t) =>
      (t.annotations ?? []).some((a) => a.type === "fixme") ||
      t.status === "skipped" ||
      t.results.some((r) => r.status === "skipped"),
  );
}

/** Pure: Playwright JSON report → TestResult[]. fixme/skipped flagged (R4, R15). */
export function parsePlaywrightResults(
  report: PlaywrightJsonReport,
): TestResult[] {
  return flattenSpecs(report.suites).map((spec): TestResult => {
    const fileName = spec.file.split("/").pop() ?? spec.file;
    const flowId = spec.title || fileName.replace(/\.spec\.ts$/, "");
    if (isFixme(spec)) {
      return {
        flowId,
        fileName,
        outcome: "fixme",
        failureReason: "quarantined (test.fixme)",
      };
    }
    if (spec.ok) return { flowId, fileName, outcome: "passed" };
    return {
      flowId,
      fileName,
      outcome: "failed",
      failureReason: "test failed",
    };
  });
}

export type SuiteExecutor = (ws: Workspace) => Promise<PlaywrightJsonReport>;

async function defaultExecutor(ws: Workspace): Promise<PlaywrightJsonReport> {
  await new Promise<void>((resolve) => {
    const child = spawn("npx", ["playwright", "test", "--reporter=json"], {
      cwd: ws.root,
      env: { ...process.env },
    });
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    child.on("close", () => resolve());
  });
  try {
    const raw = await readFile(join(ws.root, "results.json"), "utf8");
    return JSON.parse(raw) as PlaywrightJsonReport;
  } catch {
    return { suites: [] };
  }
}

/** Run the healed suite in the workspace and parse results (T9). */
export async function captureResults(
  ws: Workspace,
  exec: SuiteExecutor = defaultExecutor,
): Promise<TestResult[]> {
  const report = await exec(ws);
  return parsePlaywrightResults(report);
}
