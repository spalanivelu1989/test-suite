// Deterministic heal capture (Spec R1, ADR-0004). The Healer edits spec files in
// place and reports nothing structured, so we reconstruct each fix by DIFFING the
// pre-heal spec against the post-heal spec — both already in hand at the
// orchestrator seam. Pure: no DB, no LLM, no I/O. This is the heart of ADR-0004.
//
//   pre[]  (generated specs)          post[]  (healed specs)        results[]
//        │                                  │                          │
//        └────────────── per file: diffHunks(preCode, postCode) ──────┘
//                                  │
//                   for each hunk: classifyStrategy(before, after)
//                   failureSignature = normalizeFailure(result.failureReason)
//                                  │
//                                  ▼
//                          HealingEvent[]  (append-only evidence)

import type { TestResult } from "../../types";
import type { HealingEvent } from "../types";
import { normalizeFailure, signatureTokens } from "./signature";
import { classifyStrategy } from "./strategy";

type Spec = { file: string; code: string };

/** basename of a spec path, for matching specs to results by file. */
function base(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/**
 * Line-level diff of two texts via LCS, grouped into contiguous changed hunks.
 * Each hunk pairs the removed (`before`) and added (`after`) lines in one region.
 * Deterministic; whitespace-only and unchanged lines never produce a hunk.
 */
export function diffHunks(
  before: string,
  after: string,
): { before: string; after: string }[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const hunks: { before: string; after: string }[] = [];
  let i = 0;
  let j = 0;
  let rem: string[] = [];
  let add: string[] = [];
  const flush = () => {
    if (rem.length || add.length) {
      hunks.push({ before: rem.join("\n"), after: add.join("\n") });
      rem = [];
      add = [];
    }
  };

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flush();
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rem.push(a[i++]);
    } else {
      add.push(b[j++]);
    }
  }
  while (i < n) rem.push(a[i++]);
  while (j < m) add.push(b[j++]);
  flush();

  // Drop hunks whose change is only whitespace.
  return hunks.filter((h) => h.before.trim() !== "" || h.after.trim() !== "");
}

/**
 * Reconstruct the Healer's repairs as append-only HealingEvents (R1). One event
 * per changed hunk in each spec the Healer modified, tagged with the failure it
 * resolved, the strategy, and the outcome.
 */
export function captureHealDeltas(
  pre: Spec[],
  post: Spec[],
  results: TestResult[],
  ctx: { runId: string; appId: string },
): HealingEvent[] {
  const preByFile = new Map(pre.map((s) => [s.file, s.code]));
  const resultByBase = new Map(results.map((r) => [base(r.fileName), r]));

  const events: HealingEvent[] = [];
  for (const spec of post) {
    const before = preByFile.get(spec.file);
    if (before === undefined || before === spec.code) continue; // new/unchanged

    const result = resultByBase.get(base(spec.file));
    const quarantined =
      result?.outcome === "fixme" || /\btest\.fixme\s*\(/.test(spec.code);
    // Only capture from tests that actually failed-then-changed: a healed
    // outcome, a fixme quarantine, or an explicit failure reason.
    const relevant =
      quarantined ||
      result?.healed === true ||
      result?.outcome === "healed" ||
      result?.outcome === "failed" ||
      !!result?.failureReason;
    if (!relevant) continue;

    const failureSignature = normalizeFailure(result?.failureReason);
    const tokens = signatureTokens(failureSignature);
    const outcome: HealingEvent["outcome"] = quarantined ? "fixme" : "healed";

    for (const hunk of diffHunks(before, spec.code)) {
      events.push({
        runId: ctx.runId,
        appId: ctx.appId,
        flowId: result?.flowId ?? null,
        file: spec.file,
        failureSignature,
        before: hunk.before,
        after: hunk.after,
        strategy: classifyStrategy(hunk.before, hunk.after, quarantined),
        outcome,
        tokens,
      });
    }
  }
  return events;
}
