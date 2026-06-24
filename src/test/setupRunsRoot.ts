// Test-only preload (wired into the `test:*` npm scripts via `--import`).
//
// Redirects every run/migration workspace into a per-process temp directory so
// the suite never writes `test-*` folders into the real `.runs` dir — those
// leak into the dashboard as phantom "pending" runs (i-test-*) until their
// owning test's cleanup fires. getRunsRoot() reads TEST_RUNS_ROOT at call time,
// so setting it here — before any test imports — is enough.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "test-suite-runs-"));
process.env.TEST_RUNS_ROOT = root;

// Best-effort cleanup; the OS reaps tmpdir anyway, so never let this throw.
process.on("exit", () => {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
