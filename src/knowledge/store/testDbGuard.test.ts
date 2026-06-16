import assert from "node:assert/strict";
import { test } from "node:test";
import {
  databaseName,
  dbTestSkip,
  isTestDatabase,
  isTestRunId,
} from "./testDbGuard";

test("databaseName: extracts the db name from a connection URL", () => {
  assert.equal(
    databaseName("postgres://user@localhost:5433/knowledge_test"),
    "knowledge_test",
  );
  assert.equal(databaseName("postgres://u@h:5433/knowledge"), "knowledge");
  assert.equal(databaseName("not a url"), "");
});

test("isTestDatabase: true only for *test* databases", () => {
  assert.equal(isTestDatabase("postgres://u@h:5433/knowledge_test"), true);
  assert.equal(isTestDatabase("postgres://u@h:5433/test"), true);
  assert.equal(isTestDatabase("postgres://u@h:5433/knowledge"), false);
  assert.equal(isTestDatabase(undefined), false);
});

test("dbTestSkip: skip with reason for missing or non-test DB, run for test DB", () => {
  assert.equal(dbTestSkip(undefined), "KNOWLEDGE_DATABASE_URL not set");
  assert.equal(dbTestSkip("postgres://u@h:5433/knowledge_test"), false);

  const reason = dbTestSkip("postgres://u@h:5433/knowledge");
  assert.equal(typeof reason, "string");
  assert.match(reason as string, /non-test database "knowledge"/);
});

test("isTestRunId: true only for synthetic test-<uuid> run ids", () => {
  assert.equal(isTestRunId("test-fc70b034-0b82-4207-b7ee-79865e085988"), true);
  // Real runs get a bare UUID from the run store — never the test- prefix.
  assert.equal(isTestRunId("fc70b034-0b82-4207-b7ee-79865e085988"), false);
  assert.equal(isTestRunId("run-123"), false);
  assert.equal(isTestRunId(undefined), false);
  assert.equal(isTestRunId(""), false);
});
