// The BusinessContextService: the one seam the pipeline calls to get authored OKF
// priming for a URL. It composes the pure pieces — resolve which bundles apply, load
// their concept docs, select the relevant ones, format budgeted prompt blocks — and
// wraps every method best-effort so a missing dir, an unmatched URL, or a parse error
// degrades to `null` (run cold), never an exception. Mirrors createKnowledgeService.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConcept, loadLeafConcepts, type ConceptDoc } from "./concept";
import { formatContext, formatOverview } from "./format";
import { buildManifest } from "./manifest";
import { resolveBusinessContext } from "./resolver";
import { selectConcepts } from "./select";
import type {
  BusinessBundle,
  BusinessContextResult,
  BusinessContextService,
  BusinessManifest,
  BusinessOverview,
} from "./types";

export interface BusinessContextConfig {
  /** Bundle-tree root. Default: `<cwd>/business-context`. */
  root?: string;
}

class FsBusinessContextService implements BusinessContextService {
  readonly enabled: boolean;
  private manifestP: Promise<BusinessManifest> | null = null;

  constructor(private root: string) {
    this.enabled = existsSync(root);
  }

  /** Build the manifest once and reuse it for the process lifetime. */
  private manifest(): Promise<BusinessManifest> {
    return (this.manifestP ??= buildManifest(this.root));
  }

  /** Run `fn` best-effort: any throw → null, logged like the rest of the layer. */
  private async guard<T>(
    op: string,
    fn: () => Promise<T | null>,
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[business-context] ${op} failed (ignored, running cold): ${message}`,
      );
      return null;
    }
  }

  async getBusinessOverview(url: string): Promise<BusinessOverview | null> {
    return this.guard("getBusinessOverview", async () => {
      const r = resolveBusinessContext(url, await this.manifest());
      if (!r.app) return null;
      const [app, workflows, screens] = await Promise.all([
        loadConcept(join(r.app.dir, "index.md"), this.root),
        loadLeafConcepts(join(r.app.dir, "workflows"), this.root),
        loadLeafConcepts(join(r.app.dir, "screens"), this.root),
      ]);
      const platformTitles = r.platforms.map(
        (p) => p.title ?? p.platformKey ?? p.id,
      );
      const block = formatOverview({ app, workflows, screens, platformTitles });
      return {
        appId: r.app.id,
        appTitle: app?.title ?? r.app.title ?? r.app.id,
        platforms: platformTitles,
        block,
      };
    });
  }

  async getBusinessContext(
    url: string,
    scenarios: string[],
  ): Promise<BusinessContextResult | null> {
    return this.guard("getBusinessContext", async () => {
      const r = resolveBusinessContext(url, await this.manifest());
      if (!r.app) return null;
      const dirs = [
        r.app.dir,
        ...r.platforms.map((p: BusinessBundle) => p.dir),
      ];
      const pool: ConceptDoc[] = (
        await Promise.all(dirs.map((d) => loadLeafConcepts(d, this.root)))
      ).flat();
      const selected = selectConcepts(pool, scenarios.join("  "));
      if (selected.length === 0) return null;
      return {
        appId: r.app.id,
        appTitle: r.app.title ?? r.app.id,
        concepts: selected.map((c) => c.id),
        block: formatContext(selected),
      };
    });
  }
}

/** Build a BusinessContextService rooted at `business-context/` (cwd by default). */
export function createBusinessContextService(
  config: BusinessContextConfig = {},
): BusinessContextService {
  const root = config.root ?? join(process.cwd(), "business-context");
  return new FsBusinessContextService(root);
}
