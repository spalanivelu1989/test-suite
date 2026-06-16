import assert from "node:assert/strict";
import { test } from "node:test";
import { validateReadOnlySql } from "./guard";

test("validateReadOnlySql: allows a plain SELECT and strips a trailing semicolon", () => {
  const r = validateReadOnlySql(
    "SELECT app_id FROM apps ORDER BY last_seen DESC;",
  );
  assert.equal(r.ok, true);
  if (r.ok)
    assert.equal(r.sql, "SELECT app_id FROM apps ORDER BY last_seen DESC");
});

test("validateReadOnlySql: allows a WITH … SELECT (CTE)", () => {
  const r = validateReadOnlySql(
    "WITH recent AS (SELECT * FROM runs ORDER BY created_at DESC LIMIT 5) SELECT run_id FROM recent",
  );
  assert.equal(r.ok, true);
});

test("validateReadOnlySql: rejects empty / comment-only input", () => {
  assert.equal(validateReadOnlySql("").ok, false);
  assert.equal(validateReadOnlySql("   ").ok, false);
  assert.equal(validateReadOnlySql("-- just a comment").ok, false);
});

test("validateReadOnlySql: rejects non-SELECT statements", () => {
  for (const sql of [
    "DELETE FROM specs",
    "UPDATE apps SET run_count = 0",
    "INSERT INTO apps(app_id) VALUES ('x')",
    "DROP TABLE runs",
    "TRUNCATE specs",
    "ALTER TABLE specs ADD COLUMN x int",
  ]) {
    assert.equal(validateReadOnlySql(sql).ok, false, `should reject: ${sql}`);
  }
});

test("validateReadOnlySql: rejects stacked statements", () => {
  const r = validateReadOnlySql("SELECT 1; DROP TABLE runs");
  assert.equal(r.ok, false);
});

test("validateReadOnlySql: rejects a data-modifying CTE that starts with WITH", () => {
  const r = validateReadOnlySql(
    "WITH gone AS (DELETE FROM specs RETURNING id) SELECT * FROM gone",
  );
  assert.equal(r.ok, false);
});

test("validateReadOnlySql: does NOT trip on write keywords inside string literals", () => {
  const r = validateReadOnlySql(
    "SELECT title FROM specs WHERE title ILIKE '%delete account%'",
  );
  assert.equal(r.ok, true);
});

test("validateReadOnlySql: a semicolon inside a string literal is allowed", () => {
  const r = validateReadOnlySql("SELECT * FROM runs WHERE url = 'a;b'");
  assert.equal(r.ok, true);
});

test("validateReadOnlySql: 'offset' is not mistaken for the 'set' keyword", () => {
  const r = validateReadOnlySql("SELECT run_id FROM runs LIMIT 5 OFFSET 10");
  assert.equal(r.ok, true);
});
