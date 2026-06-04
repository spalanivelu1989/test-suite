import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getRunsRoot } from "../runManager/persistence";
import type { PlaywrightJsonReport } from "../results/parse";

// Isolated per-run workspace (D3). This module owns a run's on-disk contract:
// the directory layout, the filenames we read/write ourselves, and running the
// generated suite. Agents run with cwd = workspace.root and write the plan/specs
// out-of-process via their own tools, so the directory paths stay on the
// interface; but the filenames *we* depend on (results.json, plan.md) and the
// suite launch live here once, behind behavioral operations — callers never
// hardcode a path or import node:fs to talk to the workspace.
//
// Run-state persistence (run.json) lives in runManager/persistence.ts, not here.

/** The Playwright JSON reporter's output file — written by CONFIG, read by runSuite. */
const RESULTS_FILE = "results.json";
/** The Markdown plan filename the Generator reads (the Planner saves a plan here). */
const PLAN_FILE = "plan.md";

export interface Workspace {
  root: string;
  specsDir: string;
  testsDir: string;
  seedPath: string;
  configPath: string;
  /** Run the generated suite in this workspace and return Playwright's raw JSON report. */
  runSuite(): Promise<PlaywrightJsonReport>;
  /** Write (or overwrite) the Markdown plan the Generator will read. */
  writePlan(markdown: string): Promise<void>;
}

const SEED = `import { test, expect } from '@playwright/test';

test.describe('Test group', () => {
  test('seed', async ({ page }) => {
    // generate code here.
  });
});
`;

const CONFIG = `import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  reporter: [['json', { outputFile: '${RESULTS_FILE}' }], ['line']],
  use: { 
    headless: true, 
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
});
`;

/**
 * Run `npx playwright test` in the workspace and parse the JSON report it writes.
 * No `--reporter` flag: the CLI flag would override the config's reporter and the
 * built-in json reporter would then write to stdout, not a file. The workspace
 * config already declares `['json', { outputFile: '${RESULTS_FILE}' }]`, so
 * letting it apply is what actually produces the results file on disk.
 */
async function runSuiteAt(root: string): Promise<PlaywrightJsonReport> {
  await new Promise<void>((resolve) => {
    const child = spawn("npx", ["playwright", "test"], {
      cwd: root,
      env: { ...process.env },
    });
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    child.on("close", () => resolve());
  });
  try {
    const raw = await readFile(join(root, RESULTS_FILE), "utf8");
    return JSON.parse(raw) as PlaywrightJsonReport;
  } catch {
    return { suites: [] };
  }
}

export async function createWorkspace(
  runId: string,
  baseDir = ".runs",
): Promise<Workspace> {
  const root = join(getRunsRoot(baseDir), runId);
  const specsDir = join(root, "specs");
  const testsDir = join(root, "tests");
  const screenshotsDir = join(root, "screenshots");
  await mkdir(specsDir, { recursive: true });
  await mkdir(testsDir, { recursive: true });
  await mkdir(screenshotsDir, { recursive: true });
  const seedPath = join(root, "seed.spec.ts");
  const configPath = join(root, "playwright.config.ts");
  await writeFile(seedPath, SEED, "utf8");
  await writeFile(configPath, CONFIG, "utf8");
  return {
    root,
    specsDir,
    testsDir,
    seedPath,
    configPath,
    runSuite: () => runSuiteAt(root),
    writePlan: (markdown: string) =>
      writeFile(join(specsDir, PLAN_FILE), markdown, "utf8"),
  };
}

/** Read the Markdown test plan the Planner saved (first .md under specs/). */
export async function readPlan(ws: Workspace): Promise<string | null> {
  try {
    const files = await readdir(ws.specsDir);
    const md = files.find((f) => f.endsWith(".md"));
    if (!md) return null;
    return await readFile(join(ws.specsDir, md), "utf8");
  } catch {
    return null;
  }
}

/** Read generated spec sources for the report's code-view tab (R17). */
export async function readGeneratedSpecs(
  ws: Workspace,
): Promise<{ file: string; code: string }[]> {
  const out: { file: string; code: string }[] = [];
  async function walk(dir: string, rel: string) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(abs, relPath);
      else if (e.name.endsWith(".spec.ts")) {
        out.push({ file: relPath, code: await readFile(abs, "utf8") });
      }
    }
  }
  await walk(ws.testsDir, "");
  return out;
}
