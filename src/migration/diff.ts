// Pure assembly of the migration before/after diff. Given the source specs (with
// their source-app outcome) and the final post-flake target results, produce a
// per-spec SpecDiff plus the headline summary counts.

import { basename } from "node:path";
import type { TestResult } from "../types";
import { classifySpec, targetOutcomeOf } from "./classify";
import type { MigrationReport, SourceSpec, SpecDiff } from "./types";

export function buildDiff(
  specs: SourceSpec[],
  finalResults: TestResult[],
  healedFiles: Set<string> = new Set(),
  setupError?: string,
): { diff: SpecDiff[]; summary: MigrationReport["summary"] } {
  const byFile = new Map(finalResults.map((r) => [r.fileName, r]));

  const diff: SpecDiff[] = specs.map((s) => {
    const key = basename(s.file);
    const result =
      byFile.get(key) ??
      finalResults.find(
        (r) => r.fileName.endsWith(key) || key.endsWith(r.fileName),
      );
    const targetOutcome = targetOutcomeOf(result);

    // The suite never ran (login/global-setup aborted): not a regression, an
    // environment problem. Attribute every un-run spec to that, classified infra.
    if (!result && setupError) {
      return {
        file: s.file,
        title: s.title,
        sourceOutcome: s.sourceOutcome,
        targetOutcome,
        classification: "infra",
        failureReason: `Did not run — ${setupError}`,
      };
    }

    const failureReason =
      targetOutcome === "failed"
        ? (result?.failureReason ?? "spec did not run")
        : undefined;
    return {
      file: s.file,
      title: s.title,
      sourceOutcome: s.sourceOutcome,
      targetOutcome,
      classification: classifySpec({
        sourceOutcome: s.sourceOutcome,
        targetOutcome,
        failureReason,
        healed: healedFiles.has(key),
      }),
      failureReason,
    };
  });

  const count = (c: SpecDiff["classification"]) =>
    diff.filter((d) => d.classification === c).length;

  return {
    diff,
    summary: {
      total: diff.length,
      stillPassing: count("ok"),
      behavioral: count("behavioral"),
      infra: count("infra"),
      flaky: count("flaky"),
      preExisting: count("pre-existing"),
      healed: count("healed"),
    },
  };
}
