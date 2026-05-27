import type { CoverageSummary } from "../types";

export interface NamedFlow {
  id: string;
  name: string;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function significantTokens(s: string): Set<string> {
  return new Set(
    norm(s)
      .split(" ")
      .filter((t) => t.length > 3),
  );
}

/** Does any tested flow correspond to this curated flow? (id substring or token overlap) */
export function isCovered(curated: NamedFlow, tested: NamedFlow[]): boolean {
  const curatedId = norm(curated.id);
  const curatedTokens = significantTokens(curated.name);
  return tested.some((t) => {
    const haystack = norm(`${t.id} ${t.name}`);
    if (curatedId && haystack.includes(curatedId)) return true;
    const testedTokens = significantTokens(`${t.id} ${t.name}`);
    for (const w of curatedTokens) if (testedTokens.has(w)) return true;
    return false;
  });
}

/**
 * T11: coverage of curated primary flows by the tested flows (M1). percent uses
 * M1's formula: covered curated flows / total curated flows * 100.
 */
export function computeCoverage(
  curated: NamedFlow[],
  tested: NamedFlow[],
): CoverageSummary {
  const covered = curated.filter((c) => isCovered(c, tested));
  const missingFlows = curated
    .filter((c) => !covered.includes(c))
    .map((c) => c.name);
  const percent =
    curated.length === 0
      ? 0
      : Math.round((covered.length / curated.length) * 100);
  return {
    curatedTotal: curated.length,
    testedCount: covered.length,
    percent,
    missingFlows,
  };
}
