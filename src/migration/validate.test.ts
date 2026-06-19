import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMigrationRequest } from "./validate";

const valid = {
  sourceUrl: "https://app.lovable.app",
  targetUrl: "https://app.cfapps.hana.ondemand.com",
  selectedSpecFiles: ["a.spec.ts"],
  auth: { username: "u", password: "p" },
};

test("accepts a valid request and applies defaults", () => {
  const r = parseMigrationRequest(valid);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.req.options?.reruns, 2);
  assert.equal(r.req.options?.heal, false);
  assert.equal(r.req.options?.fingerprintCheck, true);
  assert.equal(r.req.specOverrides, undefined);
});

test("parses specOverrides, keeping only non-empty string code", () => {
  const r = parseMigrationRequest({
    ...valid,
    specOverrides: {
      "a.spec.ts": "// edited code",
      "b.spec.ts": "", // dropped: empty
      "c.spec.ts": 123, // dropped: non-string
    },
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.req.specOverrides, { "a.spec.ts": "// edited code" });
});

test("omits specOverrides when nothing valid is provided", () => {
  const r = parseMigrationRequest({
    ...valid,
    specOverrides: { "a.spec.ts": "" },
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.req.specOverrides, undefined);
});

test("rejects non-http source/target URLs", () => {
  assert.equal(
    parseMigrationRequest({ ...valid, sourceUrl: "ftp://x" }).ok,
    false,
  );
  assert.equal(
    parseMigrationRequest({ ...valid, targetUrl: "not a url" }).ok,
    false,
  );
});

test("rejects empty or non-string selectedSpecFiles", () => {
  assert.equal(
    parseMigrationRequest({ ...valid, selectedSpecFiles: [] }).ok,
    false,
  );
  assert.equal(
    parseMigrationRequest({ ...valid, selectedSpecFiles: [1, 2] }).ok,
    false,
  );
});

test("auth is optional — omitting it (or username/password) is accepted", () => {
  const { auth: _omit, ...noAuth } = valid;
  const r1 = parseMigrationRequest(noAuth);
  assert.ok(r1.ok);
  if (r1.ok) assert.equal(r1.req.auth, undefined);

  const r2 = parseMigrationRequest({ ...valid, auth: {} });
  assert.ok(r2.ok);
  if (r2.ok) assert.equal(r2.req.auth, undefined);

  // Partial auth (e.g. just a login URL) is carried through.
  const r3 = parseMigrationRequest({
    ...valid,
    auth: { loginUrl: "https://login.x" },
  });
  assert.ok(r3.ok);
  if (r3.ok) {
    assert.equal(r3.req.auth?.loginUrl, "https://login.x");
    assert.equal(r3.req.auth?.username, undefined);
  }
});

test("carries optional idp/loginUrl/sourceRunId through", () => {
  const r = parseMigrationRequest({
    ...valid,
    sourceRunId: "run-123",
    auth: {
      username: "u",
      password: "p",
      idp: "corp",
      loginUrl: "https://login.x",
    },
    options: { reruns: 5, heal: true, fingerprintCheck: false },
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.req.sourceRunId, "run-123");
  assert.equal(r.req.auth?.idp, "corp");
  assert.equal(r.req.auth?.loginUrl, "https://login.x");
  assert.equal(r.req.options?.reruns, 5);
  assert.equal(r.req.options?.heal, true);
  assert.equal(r.req.options?.fingerprintCheck, false);
});

test("carries an optional pathPrefix through, omits it when blank", () => {
  const withPrefix = parseMigrationRequest({ ...valid, pathPrefix: "/myapp" });
  assert.ok(withPrefix.ok);
  if (withPrefix.ok) assert.equal(withPrefix.req.pathPrefix, "/myapp");

  const blank = parseMigrationRequest({ ...valid, pathPrefix: "   " });
  assert.ok(blank.ok);
  if (blank.ok) assert.equal(blank.req.pathPrefix, undefined);
});

test("rejects a non-object body", () => {
  assert.equal(parseMigrationRequest(null).ok, false);
  assert.equal(parseMigrationRequest("nope").ok, false);
});
