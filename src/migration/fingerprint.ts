// Phase 4: build-fingerprint verification. A pure rehost serves the SAME built
// assets, and Vite/Lovable stamp each bundle with a content hash in its filename
// (e.g. `index-Dk3a9Fb2.js`). If the source and target reference the same hashed
// filenames, it's the same build — which both confirms "same app" AND validates
// the assumption that verbatim spec reuse is safe.
//
// We load each deployment in a real headless browser and capture the JS/CSS it
// actually pulls (from network responses AND the rendered DOM) — a raw HTTP GET
// often returns a bot challenge, a redirect, or an SPA shell whose asset tags
// aren't in the initial bytes. The target is loaded with the storageState that
// global-setup produced (so login is carried), or anonymously when there's no
// auth. Asset comparison is pure; collection is injectable for unit tests.

import { chromium } from "playwright";
import { normalizeOrigin } from "../knowledge/appId";
import { normalizePrefix } from "./originRewrite";
import type { FingerprintResult, MigrationCheckRequest } from "./types";

// We compare the JS/CSS asset BASENAMES a document references. A pure rehost
// serves the identical built bundles, so the filenames (which carry Vite's
// content hash, in whatever format — hex or base64url with '-'/'_') match. The
// approuter may PREFIX the path on BTP, but the filename is stable, so we compare
// basenames, not full URLs. We don't try to recognise a specific "hash shape" —
// that proved too brittle; any js/mjs/css reference counts.
const ASSET_EXT = /\.(?:js|mjs|css)$/i;
const ASSET_REF = /(?:src|href)\s*=\s*["']([^"']+?)["']/gi;

/** Extract the set of JS/CSS asset basenames referenced by an HTML document. */
export function extractAssetTokens(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(ASSET_REF)) {
    const path = m[1].split(/[?#]/)[0];
    const base = path.split("/").pop() ?? path;
    if (ASSET_EXT.test(base)) out.add(base);
  }
  return out;
}

/**
 * Compare two builds by their hashed asset sets. A pure rehost should share
 * essentially all of the source's hashed assets; we accept a generous majority
 * to tolerate an approuter injecting an extra script or a differing chunk.
 */
export function compareFingerprints(
  source: Set<string>,
  target: Set<string>,
): FingerprintResult {
  if (source.size === 0 || target.size === 0) {
    return {
      status: "error",
      sharedAssetCount: 0,
      detail: `could not read JS/CSS assets (source: ${source.size}, target: ${target.size}) — the page may need login, render assets via JS, or have returned a redirect`,
    };
  }
  let shared = 0;
  for (const token of source) if (target.has(token)) shared += 1;
  const ratio = shared / source.size;
  if (ratio >= 0.5) {
    return { status: "match", sharedAssetCount: shared };
  }
  return {
    status: "mismatch",
    sharedAssetCount: shared,
    detail: `${shared}/${source.size} source build assets found on target`,
  };
}

export type CollectAssets = (
  url: string,
  storageStatePath?: string,
) => Promise<Set<string>>;

/**
 * Default collector: load the page in a headless browser (optionally
 * authenticated) and gather the JS/CSS basenames it pulls, from both network
 * responses and the rendered DOM.
 */
async function collectAssetsViaBrowser(
  url: string,
  storageStatePath?: string,
): Promise<Set<string>> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(
      storageStatePath ? { storageState: storageStatePath } : {},
    );
    const page = await context.newPage();
    const found = new Set<string>();
    page.on("response", (resp) => {
      const path = resp.url().split(/[?#]/)[0];
      const base = path.split("/").pop() ?? path;
      if (ASSET_EXT.test(base)) found.add(base);
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    // Let lazily-loaded chunks settle; ignore the timeout if it never idles.
    await page
      .waitForLoadState("networkidle", { timeout: 8_000 })
      .catch(() => {});
    for (const token of extractAssetTokens(await page.content()))
      found.add(token);
    return found;
  } finally {
    await browser.close();
  }
}

/**
 * Load both deployments and compare their build fingerprints. Never throws —
 * any failure downgrades to status "error" so it can't break the run.
 *
 * `storageStatePath` should be the run's authenticated session when (and only
 * when) login was enabled; pass `undefined` for no-auth targets so the target is
 * loaded anonymously rather than failing on a missing session file.
 */
export async function fingerprintMigration(
  req: MigrationCheckRequest,
  storageStatePath: string | undefined,
  collect: CollectAssets = collectAssetsViaBrowser,
): Promise<FingerprintResult> {
  try {
    const targetUrl = `${normalizeOrigin(req.targetUrl)}${normalizePrefix(req.pathPrefix)}`;
    const [sourceAssets, targetAssets] = await Promise.all([
      collect(req.sourceUrl),
      collect(targetUrl, storageStatePath),
    ]);
    return compareFingerprints(sourceAssets, targetAssets);
  } catch (err) {
    return {
      status: "error",
      sharedAssetCount: 0,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
