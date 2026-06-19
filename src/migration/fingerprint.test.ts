import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareFingerprints,
  extractAssetTokens,
  fingerprintMigration,
} from "./fingerprint";
import type { MigrationCheckRequest } from "./types";

const lovableHtml = `
<!doctype html><html><head>
  <link rel="stylesheet" href="/assets/index-Dk3a9Fb2.css">
  <script type="module" src="/assets/index-A1b2C3d4.js"></script>
  <link rel="icon" href="/favicon.ico">
</head><body></body></html>`;

// Same build, but the BTP approuter prefixes asset paths under /myapp and adds a
// shell script. The hashed filenames are unchanged.
const btpHtml = `
<!doctype html><html><head>
  <link rel="stylesheet" href="/myapp/assets/index-Dk3a9Fb2.css?v=1">
  <script type="module" src="/myapp/assets/index-A1b2C3d4.js"></script>
  <script src="/approuter/shell-Z9y8x7w6.js"></script>
</head><body></body></html>`;

const loginPageHtml = `
<!doctype html><html><head>
  <link rel="stylesheet" href="/uaa/login-XXXXXXXX.css">
  <script src="/uaa/login-AbCdEf12.js"></script>
</head><body>Sign in</body></html>`;

test("extractAssetTokens keeps hashed js/css basenames, ignores favicon", () => {
  const tokens = extractAssetTokens(lovableHtml);
  assert.deepEqual([...tokens].sort(), [
    "index-A1b2C3d4.js",
    "index-Dk3a9Fb2.css",
  ]);
});

test("extractAssetTokens captures base64url hashes containing '-' and '_'", () => {
  const html = `<script type="module" src="/assets/index-Cs2Hd-x9_Q.js"></script>
    <link rel="stylesheet" href="/assets/main-AbC_d-12.css">`;
  const tokens = extractAssetTokens(html);
  assert.ok(tokens.has("index-Cs2Hd-x9_Q.js"));
  assert.ok(tokens.has("main-AbC_d-12.css"));
});

test("extractAssetTokens strips path prefixes and query strings", () => {
  const tokens = extractAssetTokens(btpHtml);
  assert.ok(tokens.has("index-Dk3a9Fb2.css")); // ?v=1 stripped, /myapp/ stripped
  assert.ok(tokens.has("index-A1b2C3d4.js"));
});

test("compareFingerprints: same build → match", () => {
  const r = compareFingerprints(
    extractAssetTokens(lovableHtml),
    extractAssetTokens(btpHtml),
  );
  assert.equal(r.status, "match");
  assert.equal(r.sharedAssetCount, 2);
});

test("compareFingerprints: different build (login page) → mismatch", () => {
  const r = compareFingerprints(
    extractAssetTokens(lovableHtml),
    extractAssetTokens(loginPageHtml),
  );
  assert.equal(r.status, "mismatch");
  assert.equal(r.sharedAssetCount, 0);
});

test("compareFingerprints: no hashed assets → error", () => {
  const r = compareFingerprints(new Set(), new Set(["a-123456.js"]));
  assert.equal(r.status, "error");
});

const req: MigrationCheckRequest = {
  sourceUrl: "https://app.lovable.app",
  targetUrl: "https://app.cfapps.hana.ondemand.com",
  selectedSpecFiles: ["a.spec.ts"],
  auth: { username: "u", password: "p" },
};

test("fingerprintMigration collects source anon + target authed, returns match", async () => {
  const seen: { url: string; storageState?: string }[] = [];
  const collect = async (url: string, storageState?: string) => {
    seen.push({ url, storageState });
    return extractAssetTokens(url === req.targetUrl ? btpHtml : lovableHtml);
  };
  const r = await fingerprintMigration(req, "/ws/.auth/state.json", collect);
  assert.equal(r.status, "match");
  // Target was loaded with the storageState; source without.
  const target = seen.find((s) => s.url === req.targetUrl);
  const source = seen.find((s) => s.url === req.sourceUrl);
  assert.equal(target?.storageState, "/ws/.auth/state.json");
  assert.equal(source?.storageState, undefined);
});

test("fingerprintMigration loads target anonymously when no session (no-auth target)", async () => {
  const seen: { url: string; storageState?: string }[] = [];
  const collect = async (url: string, storageState?: string) => {
    seen.push({ url, storageState });
    return extractAssetTokens(url === req.targetUrl ? btpHtml : lovableHtml);
  };
  const r = await fingerprintMigration(req, undefined, collect);
  assert.equal(r.status, "match");
  const target = seen.find((s) => s.url === req.targetUrl);
  assert.equal(target?.storageState, undefined);
});

test("fingerprintMigration never throws — collection failure → error", async () => {
  const collect = async () => {
    throw new Error("ECONNREFUSED");
  };
  const r = await fingerprintMigration(req, "x", collect);
  assert.equal(r.status, "error");
  assert.match(r.detail ?? "", /ECONNREFUSED/);
});
