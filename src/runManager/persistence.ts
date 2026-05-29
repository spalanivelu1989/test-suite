import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { Run } from "../types";

// Disk side of a run's life (R8). Moved out of agents/workspace.ts so the Run
// Manager — not every caller — owns the "save after every state change"
// invariant; workspace.ts is left owning only a run's test files. Runs are
// stored as `.runs/<id>/run.json`; legacy folders without metadata are inferred.

/** Absolute path to the runs-root directory (the parent of every per-run dir). */
export function getRunsRoot(baseDir = ".runs"): string {
  return join(process.cwd(), baseDir);
}

/**
 * The disk half of run state behind one small interface, so the Run Manager can
 * coordinate it with the in-memory store — and tests can swap a fake for it.
 */
export interface RunPersistence {
  /** Best-effort save of a run's current state. Logs but never throws. */
  save(run: Run): Promise<void>;
  /** Load one run by id (run.json, inferring legacy folders). undefined if absent. */
  get(id: string): Promise<Run | undefined>;
  /** Every run recorded on disk. */
  list(): Promise<Run[]>;
  /** Purge a run's workspace dir. Returns whether it existed; throws on rm failure. */
  remove(id: string): Promise<boolean>;
}

/** Construct a disk-backed RunPersistence rooted at `baseDir`. */
export function createDiskPersistence(baseDir = ".runs"): RunPersistence {
  return {
    async save(run: Run): Promise<void> {
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
    },

    async get(id: string): Promise<Run | undefined> {
      const run = await loadOrInferRun(join(getRunsRoot(baseDir), id), id);
      return run ?? undefined;
    },

    async list(): Promise<Run[]> {
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
        const run = await loadOrInferRun(join(root, entry.name), entry.name);
        if (run) out.push(run);
      }
      return out;
    },

    async remove(id: string): Promise<boolean> {
      const dir = join(getRunsRoot(baseDir), id);
      try {
        await stat(dir);
      } catch {
        return false; // nothing on disk
      }
      await rm(dir, { recursive: true, force: true });
      return true;
    },
  };
}

/** Default disk persistence rooted at `.runs`. */
export const diskPersistence: RunPersistence = createDiskPersistence();

/**
 * Read run.json when present; for legacy folders without metadata, synthesise a
 * minimal Run by inspecting the workspace contents (results.json → completed,
 * otherwise pending) and pulling the URL from a saved spec if possible.
 */
async function loadOrInferRun(runDir: string, id: string): Promise<Run | null> {
  // Preferred: the run.json metadata we wrote during the run.
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
  const createdAt =
    dirStat.birthtime?.toISOString?.() ?? dirStat.mtime.toISOString();
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
  const stack: string[] = [testsDir];
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
