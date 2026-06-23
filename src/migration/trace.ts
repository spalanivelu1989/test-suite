// Locate the Playwright trace.zip a migration run retained for a given spec.
//
// The migration workspace's playwright.config.ts sets `trace: 'retain-on-failure'`,
// so every FAILED test leaves a trace.zip under the run's Playwright output dir.
// The JSON reporter (results.json) records each retained trace as an attachment
// with `name: "trace"` and a path — so we resolve the file at request time from
// results.json rather than guessing Playwright's hashed output-folder names.

import { readFile } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { MIGRATION_BASE_DIR } from "./persistence";

interface PwAttachment {
  name?: string;
  contentType?: string;
  path?: string;
}
interface PwResult {
  attachments?: PwAttachment[];
}
interface PwTest {
  results?: PwResult[];
}
interface PwSpec {
  file?: string;
  tests?: PwTest[];
}
interface PwSuite {
  specs?: PwSpec[];
  suites?: PwSuite[];
}
interface PwReport {
  suites?: PwSuite[];
}

function* walkSpecs(suites: PwSuite[] = []): Generator<PwSpec> {
  for (const s of suites) {
    for (const sp of s.specs ?? []) yield sp;
    yield* walkSpecs(s.suites ?? []);
  }
}

/**
 * Absolute path to the retained trace.zip for `specFile` in migration run `id`,
 * or null when none was captured (the test passed, or no results.json yet). The
 * spec is matched by basename, and the LAST matching attachment wins so a retry's
 * trace is preferred over the first attempt's.
 */
export async function findTracePath(
  id: string,
  specFile: string,
  baseDir = MIGRATION_BASE_DIR,
): Promise<string | null> {
  const runDir = join(process.cwd(), baseDir, id);
  let report: PwReport;
  try {
    report = JSON.parse(
      await readFile(join(runDir, "results.json"), "utf8"),
    ) as PwReport;
  } catch {
    return null;
  }

  const want = basename(specFile);
  let found: string | null = null;
  for (const spec of walkSpecs(report.suites)) {
    if (!spec.file || basename(spec.file) !== want) continue;
    for (const t of spec.tests ?? []) {
      for (const r of t.results ?? []) {
        const trace = (r.attachments ?? []).find(
          (a) => a.name === "trace" && a.path,
        );
        if (trace?.path)
          found = isAbsolute(trace.path)
            ? trace.path
            : join(runDir, trace.path);
      }
    }
  }
  return found;
}
