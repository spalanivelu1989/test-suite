// Loads the authored OKF bundles from disk into a BusinessManifest the resolver
// can query. The ONLY IO in this layer; everything downstream is pure. Best-effort
// throughout: a missing `business-context/` dir, an unreadable file, or malformed
// frontmatter yields an empty/partial manifest rather than throwing, so a run is
// never blocked by authored content (mirrors the rest of the knowledge layer).

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { normalizeOrigin } from "../appId";
import { parseFrontmatter } from "./frontmatter";
import type { BusinessBundle, BusinessManifest } from "./types";

/** Build the manifest by scanning `<root>/apps/*` and `<root>/platform/*`. */
export async function buildManifest(root: string): Promise<BusinessManifest> {
  const [apps, platformList] = await Promise.all([
    loadKind(join(root, "apps"), "app"),
    loadKind(join(root, "platform"), "platform"),
  ]);
  const platforms = new Map<string, BusinessBundle>();
  for (const p of platformList) {
    if (p.platformKey) platforms.set(p.platformKey, p);
  }
  return { apps, platforms };
}

/** Load every immediate sub-dir that has an `index.md` as a bundle of `kind`. */
async function loadKind(
  dir: string,
  kind: "app" | "platform",
): Promise<BusinessBundle[]> {
  let entries: string[];
  try {
    entries = (await readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return []; // dir absent → nothing of this kind
  }

  const bundles = await Promise.all(
    entries.map((name) => loadBundle(join(dir, name), name, kind)),
  );
  return bundles.filter((b): b is BusinessBundle => b !== null);
}

async function loadBundle(
  bundleDir: string,
  name: string,
  kind: "app" | "platform",
): Promise<BusinessBundle | null> {
  let raw: string;
  try {
    raw = await readFile(join(bundleDir, "index.md"), "utf8");
  } catch {
    return null; // no index.md → not a bundle
  }

  const { data } = parseFrontmatter(raw);
  const type = asString(data.type) ?? (kind === "app" ? "App" : "Platform");
  const base: BusinessBundle = {
    id: `${kind === "app" ? "apps" : "platform"}/${name}`,
    dir: bundleDir,
    kind,
    type,
    title: asString(data.title),
    routes: [],
    builtOn: [],
  };

  if (kind === "platform") return { ...base, platformKey: name };

  const appliesTo = asRecord(data.applies_to);
  const origin = asString(appliesTo?.origin);
  return {
    ...base,
    origin: origin ? normalizeOrigin(origin) : undefined,
    routes: asStringArray(appliesTo?.routes),
    builtOn: asStringArray(data.built_on),
    status: asString(data.status),
    version: asString(data.version),
  };
}

// ─── frontmatter value coercion (tolerant) ─────────────────────────────────────

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

/** Accept an array OR a lone scalar (`built_on: sap-fiori`) as a string[]. */
function asStringArray(v: unknown): string[] {
  if (Array.isArray(v))
    return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string" && v !== "") return [v];
  return [];
}
