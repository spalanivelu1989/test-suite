// The BusinessContextResolver: given a target URL and a loaded manifest, decide
// which authored OKF bundle(s) apply — the chosen app bundle plus the platform
// handbooks it inherits. PURE and deterministic (no IO, never throws), so it is
// exhaustively testable without a filesystem; loading lives in `manifest.ts`.
//
// Resolution order (see business-context/README.md):
//   1. Normalize the URL's origin (same identity as appId / normalizeOrigin).
//   2. Among app bundles for that origin, pick the one whose `routes` is the
//      LONGEST match against the URL's path+hash. SAP Fiori / Infor host many apps
//      under one origin, told apart only by route (#PurchaseOrder-manage), so
//      origin alone is too coarse — the route prefix is the tiebreaker.
//   3. Pull each platform named in the chosen app's `built_on:`.
//   4. No app match → nothing (the pipeline runs "cold", exactly like today).

import { normalizeOrigin } from "../appId";
import type {
  BusinessBundle,
  BusinessManifest,
  ResolvedBusinessContext,
} from "./types";

const EMPTY: ResolvedBusinessContext = {
  platforms: [],
  matchedBy: "none",
  routeScore: 0,
};

/**
 * The route-bearing part of a URL: `pathname + hash`, lowercased. Routes are
 * matched as substrings of this (a Fiori intent like `#purchaseorder-manage`
 * sits in the hash, possibly behind a `/ui` path). Best-effort; "" on bad input.
 */
export function navTargetFor(url: string): string {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    try {
      u = new URL(`https://${url.trim()}`);
    } catch {
      return "";
    }
  }
  return `${u.pathname}${u.hash}`.toLowerCase();
}

/**
 * Best matching route length for a candidate, or -1 when the candidate declares
 * routes but none match (so it is NOT a candidate). 0 means "origin-wide" (the
 * bundle declares no routes) — a valid but lowest-priority match.
 */
function routeScore(navTarget: string, routes: string[]): number {
  if (routes.length === 0) return 0; // whole-origin bundle
  let best = -1;
  for (const r of routes) {
    const needle = r.toLowerCase();
    if (needle !== "" && navTarget.includes(needle) && needle.length > best) {
      best = needle.length;
    }
  }
  return best;
}

/** Numeric-aware version compare ("2025.10" > "2025.2"); falls back to string. */
function compareVersions(a = "", b = ""): number {
  const seg = (s: string) =>
    s
      .split(/[^\d]+/)
      .filter(Boolean)
      .map(Number);
  const av = seg(a);
  const bv = seg(b);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const d = (av[i] ?? 0) - (bv[i] ?? 0);
    if (d !== 0) return d;
  }
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * Order two equally-origin-matched candidates: higher route score wins, then an
 * `active` status, then a higher version, then id (stable). Returns <0 when `a`
 * should rank before `b`.
 */
function preferred(
  a: { bundle: BusinessBundle; score: number },
  b: { bundle: BusinessBundle; score: number },
): number {
  if (a.score !== b.score) return b.score - a.score;
  const aActive = a.bundle.status === "active" ? 1 : 0;
  const bActive = b.bundle.status === "active" ? 1 : 0;
  if (aActive !== bActive) return bActive - aActive;
  const v = compareVersions(b.bundle.version, a.bundle.version);
  if (v !== 0) return v;
  return a.bundle.id < b.bundle.id ? -1 : a.bundle.id > b.bundle.id ? 1 : 0;
}

/** Resolve the app + platform bundles that apply to `url`. Never throws. */
export function resolveBusinessContext(
  url: string,
  manifest: BusinessManifest,
): ResolvedBusinessContext {
  const origin = normalizeOrigin(url);
  const navTarget = navTargetFor(url);

  const candidates = manifest.apps
    .filter((b) => b.origin === origin)
    .map((bundle) => ({ bundle, score: routeScore(navTarget, bundle.routes) }))
    .filter((c) => c.score >= 0);

  if (candidates.length === 0) return EMPTY;

  candidates.sort(preferred);
  const winner = candidates[0];

  // Resolve inherited platforms, deduped, preserving declaration order.
  const platforms: BusinessBundle[] = [];
  const seen = new Set<string>();
  for (const key of winner.bundle.builtOn) {
    const p = manifest.platforms.get(key);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      platforms.push(p);
    }
  }

  return {
    app: winner.bundle,
    platforms,
    matchedBy: winner.score > 0 ? "origin+route" : "origin",
    routeScore: winner.score,
  };
}
