import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Isolated per-run workspace (D3). Agents run with cwd = workspace.root, save
// the Markdown plan under specs/, and write generated specs under tests/. The UI
// reads the plan + specs back from here for the code-view tab (R17).

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
  const isServerless = process.env.NETLIFY === "true" || !!process.env.LAMBDA || !!process.env.AWS_LAMBDA_JS_RUNTIME;
  const rootDir = isServerless ? tmpdir() : process.cwd();
  // On serverless, keep the subdirectory as "runs" instead of ".runs" if it's default
  const actualBaseDir = isServerless && baseDir === ".runs" ? "runs" : baseDir;
  
  const root = join(rootDir, actualBaseDir, runId);
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
