// Public contracts for the Business-Context layer — authored, ground-truth domain
// knowledge (OKF bundles under `business-context/`) that primes the agents BEFORE
// they crawl. This is the AUTHORED/trusted counterpart to the LEARNED knowledge in
// `src/knowledge` (distilled from past runs): it is reference, never evidence, and
// is never mutated by the distillation/promotion job.
//
// Resolution is two-level: (1) which bundle(s) apply to a target URL — this module —
// then (2) which docs within them (semantic retrieval, a later slice). The
// platform/app split mirrors the global/app scoping already used by PlaybookScope.

/** One loaded OKF bundle (an `apps/<x>/` app or a `platform/<x>/` handbook). */
export interface BusinessBundle {
  /** Stable id, e.g. `apps/manage-purchase-orders` or `platform/sap-fiori`. */
  id: string;
  /** Absolute path to the bundle root (the dir containing `index.md`). */
  dir: string;
  kind: "app" | "platform";
  /** OKF `type` frontmatter (e.g. "App", "Platform"). */
  type: string;
  title?: string;

  // ─── app bundles ───────────────────────────────────────────────────────────
  /** Normalized origin from `applies_to.origin` (via normalizeOrigin). */
  origin?: string;
  /**
   * `applies_to.routes` — hash/path prefixes that disambiguate apps sharing one
   * origin (e.g. `#PurchaseOrder-manage`). EMPTY means the bundle covers the whole
   * origin (a low-priority, origin-wide fallback).
   */
  routes: string[];
  /** Platform keys this app inherits (`built_on:`), e.g. `["sap-fiori"]`. */
  builtOn: string[];
  /** `active` marks the live bundle when several share a scope. */
  status?: string;
  version?: string;

  // ─── platform bundles ────────────────────────────────────────────────────────
  /** Key a `built_on:` entry resolves against — the dir name under `platform/`. */
  platformKey?: string;
}

/** All loaded bundles, indexed for resolution. Built once, then queried per URL. */
export interface BusinessManifest {
  apps: BusinessBundle[];
  /** platformKey → bundle, for `built_on:` lookup. */
  platforms: Map<string, BusinessBundle>;
}

/** How the app bundle was chosen — surfaced to the run event stream (no silent magic). */
export type MatchKind = "origin+route" | "origin" | "none";

/** Discoverer-facing priming: the app's purpose + its workflow/screen map. */
export interface BusinessOverview {
  /** Resolved app bundle id, e.g. `apps/manage-purchase-orders`. */
  appId: string;
  appTitle: string;
  /** Titles of the inherited platform handbooks (for the on-screen event). */
  platforms: string[];
  /** Ready-to-inject `<business-context>` block for the Discoverer prompt. */
  block: string;
}

/** Generator-facing priming: the rules/screens relevant to the scenarios. */
export interface BusinessContextResult {
  appId: string;
  appTitle: string;
  /** Ids of the concepts that were selected (for telemetry/debug). */
  concepts: string[];
  /** Ready-to-inject `<business-context>` block for the Generator prompt. */
  block: string;
}

/**
 * The authored-knowledge layer behind one small interface, mirroring KnowledgeService:
 * every method is best-effort and returns null when nothing applies (no bundle for the
 * URL, missing dir, parse error) — callers never branch on availability or handle errors.
 */
export interface BusinessContextService {
  /** False when no `business-context/` dir is configured/found. */
  readonly enabled: boolean;
  /** Discoverer priming for a URL, or null when no bundle matches. */
  getBusinessOverview(url: string): Promise<BusinessOverview | null>;
  /** Generator priming for these scenarios, or null when no bundle matches. */
  getBusinessContext(
    url: string,
    scenarios: string[],
  ): Promise<BusinessContextResult | null>;
}

/** The bundles that apply to a target URL: one app + its inherited platforms. */
export interface ResolvedBusinessContext {
  /** The chosen app bundle, or undefined when nothing matched. */
  app?: BusinessBundle;
  /** Platform handbooks the app inherits via `built_on:` (resolved + deduped). */
  platforms: BusinessBundle[];
  matchedBy: MatchKind;
  /** Length of the route prefix that won, for telemetry/debug (0 = origin-wide). */
  routeScore: number;
}
