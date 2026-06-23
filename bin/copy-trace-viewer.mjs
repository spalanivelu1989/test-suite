// Vendor Playwright's Trace Viewer into public/ so the dashboard can open traces
// from its OWN origin. trace.playwright.dev can't be used for migration traces:
// it's an https site fetching http://localhost, which browsers block via mixed
// content / Local Network Access. Serving the viewer same-origin sidesteps both.
//
// Runs on postinstall (and is safe to run anytime) so the vendored copy always
// matches the installed playwright-core version. No-op if Playwright is absent.

import { access, cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

let src;
try {
  const pkgJson = require.resolve("playwright-core/package.json");
  src = join(dirname(pkgJson), "lib", "vite", "traceViewer");
  await access(src);
} catch {
  console.warn(
    "[trace-viewer] playwright-core trace viewer not found; skipping copy",
  );
  process.exit(0);
}

const dest = join(process.cwd(), "public", "trace-viewer");
await rm(dest, { recursive: true, force: true });
await mkdir(dirname(dest), { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`[trace-viewer] copied ${src} -> public/trace-viewer`);
