import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCuratedFlows } from "./runService";

test("loadCuratedFlows returns the tarento fixture for tarento.com", () => {
  const flows = loadCuratedFlows("https://www.tarento.com/");
  assert.ok(flows.length > 0);
  assert.ok(flows.some((f) => f.id === "contact"));
});

test("loadCuratedFlows returns empty for other hosts", () => {
  assert.deepEqual(loadCuratedFlows("https://example.com"), []);
});
