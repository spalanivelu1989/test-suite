import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Run } from "../types";

// Isolated per-run workspace (D3). Agents run with cwd = workspace.root, save
// the Markdown plan under specs/, and write generated specs under tests/. The UI
// reads the plan + specs back from here for the code-view tab (R17).

/** Absolute path to the runs-root directory. Shared by createWorkspace + persistence. */
export function getRunsRoot(baseDir = ".runs"): string {
  return join(process.cwd(), baseDir);
}

export interface Workspace {
  root: string;
  specsDir: string;
  testsDir: string;
  seedPath: string;
  configPath: string;
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
  reporter: [['json', { outputFile: 'results.json' }], ['line']],
  use: { headless: true, ...devices['Desktop Chrome'] },
});
`;

export async function createWorkspace(
  runId: string,
  baseDir = ".runs",
): Promise<Workspace> {
  const root = join(getRunsRoot(baseDir), runId);
  const specsDir = join(root, "specs");
  const testsDir = join(root, "tests");
  await mkdir(specsDir, { recursive: true });
  await mkdir(testsDir, { recursive: true });
  const seedPath = join(root, "seed.spec.ts");
  const configPath = join(root, "playwright.config.ts");
  await writeFile(seedPath, SEED, "utf8");
  await writeFile(configPath, CONFIG, "utf8");
  return { root, specsDir, testsDir, seedPath, configPath };
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

/**
 * Persist a Run's state to disk so the Instances list can show it after server
 * restart. Writes `.runs/{id}/run.json` (or the serverless equivalent). Failures
 * are logged but never thrown — persistence is best-effort.
 */
export async function persistRun(run: Run, baseDir = ".runs"): Promise<void> {
  const runDir = join(getRunsRoot(baseDir), run.id);
  try {
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(runDir, "run.json"),
      JSON.stringify(run, null, 2),
      "utf8",
    );
  } catch (err) {
    console.error(`Failed to persist run ${run.id}:`, err);
  }
}

/**
 * Scan the runs-root for previously-recorded runs. Reads run.json when present;
 * for legacy folders without metadata, synthesises a minimal Run by inspecting
 * the workspace contents (results.json → completed, otherwise pending) and
 * pulling the URL from the saved plan if possible.
 */
export async function listPersistedRuns(baseDir = ".runs"): Promise<Run[]> {
  const root = getRunsRoot(baseDir);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Run[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runDir = join(root, entry.name);
    const run = await loadOrInferRun(runDir, entry.name);
    if (run) out.push(run);
  }
  return out;
}

async function loadOrInferRun(
  runDir: string,
  id: string,
): Promise<Run | null> {
  // Preferred: read the run.json metadata we wrote during the run.
  try {
    const raw = await readFile(join(runDir, "run.json"), "utf8");
    return JSON.parse(raw) as Run;
  } catch {
    // Fall through to inference for legacy folders.
  }

  // Skip directories that don't look like a run workspace at all.
  let dirStat: import("node:fs").Stats;
  try {
    dirStat = await stat(runDir);
  } catch {
    return null;
  }

  const hasResults = await fileExists(join(runDir, "results.json"));
  const url = (await inferRunUrl(runDir)) ?? "(unknown)";
  const createdAt = dirStat.birthtime?.toISOString?.() ??
    dirStat.mtime.toISOString();
  const updatedAt = dirStat.mtime.toISOString();
  return {
    id,
    config: { url },
    status: hasResults ? "completed" : "pending",
    stage: hasResults ? "done" : "queued",
    events: [],
    createdAt,
    updatedAt,
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Best-effort URL recovery for legacy runs: grep page.goto() from any spec. */
async function inferRunUrl(runDir: string): Promise<string | null> {
  const testsDir = join(runDir, "tests");
  let stack: string[] = [testsDir];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (!e.name.endsWith(".spec.ts")) continue;
      try {
        const code = await readFile(abs, "utf8");
        const match = code.match(/page\.goto\(\s*['"`]([^'"`]+)['"`]/);
        if (match) return match[1];
      } catch {
        /* keep scanning */
      }
    }
  }
  return null;
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
