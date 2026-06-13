import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authEnvFor,
  buildDesignerAuthPreamble,
  buildDiscovererAuthPreamble,
  loadAuthFromEnv,
} from "./credentials";

test("loadAuthFromEnv returns null unless both username and password are set", () => {
  assert.equal(loadAuthFromEnv({}), null);
  assert.equal(loadAuthFromEnv({ TARGET_USERNAME: "u" }), null);
  assert.equal(loadAuthFromEnv({ TARGET_PASSWORD: "p" }), null);
  // Blank/whitespace values do not count as configured.
  assert.equal(
    loadAuthFromEnv({ TARGET_USERNAME: "  ", TARGET_PASSWORD: "p" }),
    null,
  );
});

test("loadAuthFromEnv reads credentials and optional login url", () => {
  const auth = loadAuthFromEnv({
    TARGET_USERNAME: " user@example.com ",
    TARGET_PASSWORD: " secret ",
    TARGET_LOGIN_URL: " https://app.test/login ",
  });
  assert.deepEqual(auth, {
    username: "user@example.com",
    password: "secret",
    loginUrl: "https://app.test/login",
  });
});

test("loadAuthFromEnv leaves loginUrl undefined when unset", () => {
  const auth = loadAuthFromEnv({ TARGET_USERNAME: "u", TARGET_PASSWORD: "p" });
  assert.equal(auth?.loginUrl, undefined);
});

test("discoverer preamble references env vars and the state-save path", () => {
  const preamble = buildDiscovererAuthPreamble(
    { username: "u", password: "p", loginUrl: "https://app.test/login" },
    "https://app.test/home",
    "/runs/abc/.auth/storageState.json",
  );
  assert.match(preamble, /AUTHENTICATION REQUIRED/);
  // Fills reference the env vars, double-quoted (mangle-proof), not literals.
  assert.match(preamble, /fill <ref> "\$TARGET_USERNAME"/);
  assert.match(preamble, /fill <ref> "\$TARGET_PASSWORD" --submit/);
  assert.match(preamble, /state-save \/runs\/abc\/\.auth\/storageState\.json/);
  // Uses the explicit login url, not the entry url, when one is provided.
  assert.match(preamble, /https:\/\/app\.test\/login/);
});

test("discoverer preamble never inlines the literal password (no shell-mangle, no trace leak)", () => {
  // The exact failure shape from the failing runs: a `$` in the password. The
  // value must NOT appear in the prompt at all — it travels via the env var.
  const secret = "abcdeF$789";
  const preamble = buildDiscovererAuthPreamble(
    { username: "user@x.com", password: secret },
    "https://app.test",
    "/s.json",
  );
  assert.ok(
    !preamble.includes(secret),
    "password literal must not be present in the prompt",
  );
});

test("authEnvFor maps credentials onto the documented env-var names", () => {
  assert.deepEqual(
    authEnvFor({ username: "user@x.com", password: "abcdeF$789" }),
    {
      TARGET_USERNAME: "user@x.com",
      TARGET_PASSWORD: "abcdeF$789",
    },
  );
});

test("discoverer preamble falls back to the entry url when no login url is given", () => {
  const preamble = buildDiscovererAuthPreamble(
    { username: "u", password: "p" },
    "https://app.test/home",
    "/s.json",
  );
  assert.match(preamble, /https:\/\/app\.test\/home/);
});

test("designer preamble tells specs to assume logged-in and load saved state", () => {
  const preamble = buildDesignerAuthPreamble(
    "https://app.test/home",
    "/s.json",
  );
  assert.match(preamble, /storageState/);
  assert.match(preamble, /state-load \/s\.json/);
  assert.match(preamble, /must NOT perform any login/);
});
