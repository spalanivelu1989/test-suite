import assert from "node:assert/strict";
import { test } from "node:test";
import { computeCoverage, isCovered } from "./coverage";

const curated = [
  { id: "home", name: "Load home page" },
  { id: "contact", name: "Open contact page and form" },
  { id: "careers", name: "View careers page" },
];

test("isCovered matches by id substring and by token overlap", () => {
  assert.equal(
    isCovered(curated[0], [{ id: "home-hero", name: "Landing" }]),
    true,
  );
  assert.equal(
    isCovered(curated[1], [{ id: "x", name: "Submit the contact form" }]),
    true,
  );
  assert.equal(
    isCovered(curated[2], [{ id: "x", name: "Browse blog" }]),
    false,
  );
});

test("computeCoverage reports percent, count, and missing flows", () => {
  const tested = [
    { id: "home", name: "Home" },
    { id: "c1", name: "Contact form submission" },
  ];
  const summary = computeCoverage(curated, tested);
  assert.equal(summary.curatedTotal, 3);
  assert.equal(summary.testedCount, 2);
  assert.equal(summary.percent, 67);
  assert.deepEqual(summary.missingFlows, ["View careers page"]);
});

test("computeCoverage handles empty curated list", () => {
  assert.equal(computeCoverage([], []).percent, 0);
});
