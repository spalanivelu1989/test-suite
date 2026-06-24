// Phase 2: the migration run. Composes existing pipeline helpers (workspace,
// suite execution, flake separation, report assembly) around the new origin-swap
// and diff logic. Skips Discoverer/Designer entirely and — by default — the
// Tester too (report-first: do not paper over regressions).
//
// Heavy dependencies are injectable so the orchestration is unit-testable without
// a browser, Claude, or the filesystem.

import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  createWorkspace,
  readGeneratedSpecs,
  type Workspace,
} from "../agents/workspace";
import { assessSuiteFlakiness } from "../results/parse";
import { buildReport } from "../reporter/report";
import { evolveTests } from "../orchestrator/stages";
import { normalizeOrigin } from "../knowledge/appId";
import type { CoverageSummary, RunReport, TestResult } from "../types";
import { buildDiff } from "./diff";
import { fingerprintMigration } from "./fingerprint";
import { normalizePrefix, rewriteOrigin } from "./originRewrite";
import { MIGRATION_BASE_DIR, saveMigrationReport } from "./persistence";
import { resolveSourceRun, specsForRun, type RunReader } from "./sourceSpecs";
import { getRunManager } from "../runManager/manager";
import type {
  FingerprintResult,
  MigrationCheckRequest,
  MigrationReport,
  MigrationStep,
  SourceSpec,
} from "./types";

type WrittenSpec = { file: string; code: string };

/** Thrown when the user stops a migration check mid-run. */
export class MigrationAbortedError extends Error {
  constructor() {
    super("Migration check stopped by user");
    this.name = "MigrationAbortedError";
  }
}

export interface MigrationCheckDeps {
  reader?: RunReader;
  /** Create a workspace and write the origin-rewritten specs into it. */
  prepare?: (
    id: string,
    req: MigrationCheckRequest,
    specs: SourceSpec[],
  ) => Promise<{ ws: Workspace; written: WrittenSpec[] }>;
  /** Run the suite N times and separate flaky results. */
  assess?: (
    ws: Workspace,
    reruns: number,
    signal?: AbortSignal,
  ) => Promise<{ results: TestResult[]; flakeRate: number }>;
  /** Cancellation: aborting this stops the run (suite + Tester) and marks it cancelled. */
  abortController?: AbortController;
  /** Conservative heal (Tester). Default runs evolveTests; injectable for tests. */
  heal?: (ws: Workspace) => Promise<void>;
  /** Read the specs on disk after a heal, to detect which were modified. */
  readSpecs?: (ws: Workspace) => Promise<WrittenSpec[]>;
  /** Detect a suite-level abort (login/global-setup failure) from the run output. */
  readSetupError?: (ws: Workspace) => Promise<string | undefined>;
  /** Build-fingerprint verification. Defaults to the real check; injectable for tests. */
  fingerprint?: (
    req: MigrationCheckRequest,
    ws: Workspace,
  ) => Promise<FingerprintResult>;
  buildTargetReport?: (args: {
    id: string;
    targetUrl: string;
    results: TestResult[];
    flakeRate: number;
    specs: WrittenSpec[];
  }) => RunReport | Promise<RunReport>;
  persist?: (report: MigrationReport) => Promise<void>;
  /** Progress callback for live UI updates. */
  onEvent?: (event: { step: MigrationStep; message: string }) => void;
  now?: () => string;
  newId?: () => string;
}

const SKIPPED_FINGERPRINT: FingerprintResult = {
  status: "skipped",
  sharedAssetCount: 0,
  detail: "fingerprint check not run",
};

/** The target app's base URL, including any approuter path prefix. */
function targetAppBase(req: MigrationCheckRequest): string {
  return `${normalizeOrigin(req.targetUrl)}${normalizePrefix(req.pathPrefix)}`;
}

/** Files whose on-disk code changed during the heal (basename → modified). */
function modifiedFiles(
  before: WrittenSpec[],
  after: WrittenSpec[],
): Set<string> {
  const afterByFile = new Map(after.map((a) => [basename(a.file), a.code]));
  const set = new Set<string>();
  for (const b of before) {
    const key = basename(b.file);
    const a = afterByFile.get(key);
    if (a !== undefined && a !== b.code) set.add(key);
  }
  return set;
}

/**
 * Detect a suite-level abort from the workspace's Playwright report. Top-level
 * `errors` (as opposed to per-test failures) mean global-setup/config failed —
 * most commonly login. Returns the message, or undefined if the suite ran.
 */
async function detectSetupError(root: string): Promise<string | undefined> {
  try {
    const raw = await readFile(join(root, "results.json"), "utf8");
    const report = JSON.parse(raw) as { errors?: { message?: string }[] };
    const msgs = (report.errors ?? [])
      .map((e) => e?.message)
      .filter((m): m is string => !!m)
      .map((m) => m.replace(/\s+/g, " ").trim());
    return msgs.length ? msgs.join(" | ") : undefined;
  } catch {
    return undefined;
  }
}

/** Default: create a real workspace (auth on) and write each rewritten spec. */
async function defaultPrepare(
  id: string,
  req: MigrationCheckRequest,
  specs: SourceSpec[],
): Promise<{ ws: Workspace; written: WrittenSpec[] }> {
  // Only wire up login when credentials are actually provided — some targets
  // need no auth, and enabling it without creds would make global-setup fail.
  const authEnabled = !!(req.auth?.username && req.auth?.password);
  const ws = await createWorkspace(id, MIGRATION_BASE_DIR, {
    authEnabled,
    entryUrl: targetAppBase(req),
    // Migration replays a real app's flows against one authenticated account.
    // Many apps persist per-user state server-side, so parallel specs would
    // corrupt each other's shared state — run serially.
    serial: true,
  });
  const written: WrittenSpec[] = [];
  for (const s of specs) {
    const file = basename(s.file);
    // A user-edited override is already written against the target — run it
    // verbatim, no origin rewrite. Otherwise clone + rewrite the source spec.
    const override = req.specOverrides?.[file];
    const code = override
      ? override
      : rewriteOrigin(s.code, req.sourceUrl, req.targetUrl, {
          pathPrefix: req.pathPrefix,
        }).code;
    await writeFile(join(ws.testsDir, file), code, "utf8");
    written.push({ file, code });
  }
  return { ws, written };
}

/** Default target report: pure assembly from results — no Claude needed. */
function defaultBuildTargetReport(args: {
  id: string;
  targetUrl: string;
  results: TestResult[];
  flakeRate: number;
  specs: WrittenSpec[];
}): RunReport {
  const coverage: CoverageSummary = {
    curatedTotal: 0,
    testedCount: args.results.length,
    percent: 0,
    missingFlows: [],
  };
  return buildReport({
    runId: args.id,
    url: args.targetUrl,
    results: args.results,
    coverage,
    flakeRate: args.flakeRate,
    healSuccessRate: 0,
    claudeCallCount: 0,
    fixPrompts: [],
    issues: [],
    recommendations: [],
    planMarkdown: null,
    generatedSpecs: args.specs,
  });
}

const AUTH_ENV_KEYS = [
  "TARGET_USERNAME",
  "TARGET_PASSWORD",
  "TARGET_IDP",
  "TARGET_LOGIN_URL",
] as const;

/**
 * Run `fn` with the target's auth exported as the TARGET_* env vars that
 * global-setup.ts reads, restoring the prior environment afterward. The spawned
 * Playwright child inherits these at launch.
 */
async function withAuthEnv<T>(
  auth: MigrationCheckRequest["auth"],
  fn: () => Promise<T>,
): Promise<T> {
  const prev = Object.fromEntries(
    AUTH_ENV_KEYS.map((k) => [k, process.env[k]]),
  );
  const set = (k: string, v: string | undefined) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  set("TARGET_USERNAME", auth?.username);
  set("TARGET_PASSWORD", auth?.password);
  set("TARGET_IDP", auth?.idp);
  set("TARGET_LOGIN_URL", auth?.loginUrl);
  try {
    return await fn();
  } finally {
    for (const k of AUTH_ENV_KEYS) set(k, prev[k]);
  }
}

/**
 * Carry an app's existing specs to a new deployment and report the before/after
 * diff. Throws if no source run/specs are found or nothing is selected.
 */
export async function runMigrationCheck(
  req: MigrationCheckRequest,
  deps: MigrationCheckDeps = {},
): Promise<MigrationReport> {
  const reader = deps.reader ?? getRunManager();
  const newId = deps.newId ?? (() => `mig-${randomUUID()}`);
  const now = deps.now ?? (() => new Date().toISOString());
  const id = newId();
  const emit = (step: MigrationStep, message: string) =>
    deps.onEvent?.({ step, message });
  // Login is wired only when credentials are provided (mirrors defaultPrepare).
  const authEnabled = !!(req.auth?.username && req.auth?.password);

  // Cooperative cancellation: throw at phase boundaries when the user stops it.
  const signal = deps.abortController?.signal;
  const checkpoint = () => {
    if (signal?.aborted) throw new MigrationAbortedError();
  };

  // 1. Resolve which source specs to carry over.
  checkpoint();
  emit("resolve", "Looking up the source app's existing tests…");
  const run = await resolveSourceRun(req.sourceUrl, req.sourceRunId, reader);
  if (!run) {
    throw new Error(`No prior run with specs found for ${req.sourceUrl}`);
  }
  const wanted = new Set(req.selectedSpecFiles.map((f) => basename(f)));
  const selected = specsForRun(run).filter((s) => wanted.has(basename(s.file)));
  if (selected.length === 0) {
    throw new Error("None of the selected specs were found in the source run");
  }
  emit("resolve", `Selected ${selected.length} test(s) to carry over.`);

  // 2 + 3. Workspace with auth + origin-rewritten specs.
  emit(
    "prepare",
    `Preparing workspace and pointing ${selected.length} test(s) at the target${authEnabled ? " (with login)" : ""}…`,
  );
  const prepare = deps.prepare ?? defaultPrepare;
  const { ws, written } = await prepare(id, req, selected);
  checkpoint();

  // 4. (Optional) conservative heal. The Tester may fix failures, but any spec
  // it had to MODIFY is flagged 'healed' — a needed fix means the test didn't
  // transfer as-is, which we surface rather than let it hide a regression.
  let healedFiles = new Set<string>();
  if (req.options?.heal) {
    emit("heal", "Auto-healing failing tests with the Tester…");
    const heal =
      deps.heal ??
      (async (w: Workspace) => {
        // Forward the Tester's per-step execution into the migration log so the
        // user can see HOW each test was run and repaired — tool calls (the
        // `npx playwright test` invocations, edits, re-runs) and synthetic status
        // lines, mirroring the Test Runs console. The model's raw narration
        // (kind "narration") is intentionally dropped: it's unstructured and was
        // surfacing confabulated, off-target commentary in the log.
        await evolveTests(
          w,
          (e) => {
            if (e.kind === "tool") emit("heal", `[tester] tool: ${e.tool}`);
            else if (e.kind === "text" && e.text.trim())
              emit("heal", `[tester] ${e.text.trim()}`);
            else if (e.kind === "result" && e.isError && e.text.trim())
              emit("heal", `[tester] ⚠ ${e.text.trim()}`);
          },
          // Forward the abort so a "stop" kills the Tester's agent subprocess.
          deps.abortController ? { abortController: deps.abortController } : {},
        );
      });
    await withAuthEnv(req.auth, () => heal(ws));
    checkpoint();
    const readSpecs = deps.readSpecs ?? readGeneratedSpecs;
    healedFiles = modifiedFiles(written, await readSpecs(ws));
    emit("heal", `Tester modified ${healedFiles.size} test(s).`);
  }

  // 5. Run + flake-separate.
  checkpoint();
  const reruns = req.options?.reruns ?? 2;
  emit(
    "run",
    `Running ${selected.length} test(s) on the target — ${reruns} pass(es) for flake detection. This can take a few minutes…`,
  );
  const assess = deps.assess ?? assessSuiteFlakiness;
  const { results, flakeRate } = await withAuthEnv(req.auth, () =>
    assess(ws, reruns, signal),
  );
  checkpoint();

  // Detect a suite-level abort (most often login). When the suite couldn't run,
  // the specs aren't regressions — they're blocked by an environment problem.
  const detectSetup =
    deps.readSetupError ?? ((w: Workspace) => detectSetupError(w.root));
  const setupError = results.length === 0 ? await detectSetup(ws) : undefined;

  // 6. Diff source vs target.
  const { diff, summary } = buildDiff(
    selected,
    results,
    healedFiles,
    setupError,
  );
  // Per-spec execution detail — so the log shows how each carried-over test
  // behaved on the target (outcome + classification), not just a roll-up.
  if (!setupError) {
    for (const d of diff) {
      const name = d.title?.trim() || d.file;
      const reason = d.failureReason
        ? ` — ${d.failureReason.replace(/\s+/g, " ").trim().slice(0, 200)}`
        : "";
      emit(
        "run",
        `• ${name}: ${d.targetOutcome} [${d.classification}]${reason}`,
      );
    }
  }
  emit(
    "run",
    setupError
      ? "Tests could not run — login/setup failed."
      : `Tests finished: ${summary.stillPassing} passing, ${summary.behavioral} regression(s), ${summary.infra} infra, ${summary.flaky} flaky.`,
  );

  // 7. Build-fingerprint verification (skippable). Never throws — a failure
  // downgrades to status "error" rather than failing the whole check.
  let fingerprint: FingerprintResult = SKIPPED_FINGERPRINT;
  if (req.options?.fingerprintCheck !== false) {
    emit("fingerprint", "Verifying it's the same build…");
    const fp =
      deps.fingerprint ??
      ((r, w) =>
        fingerprintMigration(r, authEnabled ? w.authStatePath : undefined));
    fingerprint = await fp(req, ws);
    emit(
      "fingerprint",
      fingerprint.status === "match"
        ? `Same build confirmed (${fingerprint.sharedAssetCount} shared assets).`
        : `Fingerprint: ${fingerprint.status}.`,
    );
  }

  // 8. Full target run report (for drill-down via the existing report view).
  emit("report", "Compiling the migration report…");
  const buildTarget = deps.buildTargetReport ?? defaultBuildTargetReport;
  const targetReport = await buildTarget({
    id,
    targetUrl: targetAppBase(req),
    results,
    flakeRate,
    specs: written,
  });

  // 9. Assemble + persist.
  const report: MigrationReport = {
    id,
    sourceUrl: req.sourceUrl,
    targetUrl: req.targetUrl,
    ...(req.pathPrefix?.trim() ? { pathPrefix: req.pathPrefix } : {}),
    sourceRunId: run.id,
    generatedAt: now(),
    fingerprint,
    ...(setupError ? { setupError } : {}),
    diff,
    summary,
    targetReport,
  };
  const persist = deps.persist ?? saveMigrationReport;
  await persist(report);
  emit("done", "Migration check complete.");
  return report;
}
