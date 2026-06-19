import assert from "node:assert/strict";
import { test } from "node:test";
import { rewriteOrigin } from "./originRewrite";

const SRC = "https://roi-calculator.lovable.app";
const DST =
  "https://sapbtp-roi-calculator-stage.cfapps.eu10-004.hana.ondemand.com";

test("rewrites the BASE_URL constant, preserving the path", () => {
  const code = `const BASE_URL = "https://roi-calculator.lovable.app/single";`;
  const { code: out, replacements } = rewriteOrigin(code, SRC, DST);
  assert.equal(replacements, 1);
  assert.equal(out, `const BASE_URL = "${DST}/single";`);
});

test("rewrites a bare-origin goto without inventing a trailing slash", () => {
  const code = `await page.goto("https://roi-calculator.lovable.app");`;
  const { code: out } = rewriteOrigin(code, SRC, DST);
  assert.equal(out, `await page.goto("${DST}");`);
});

test("leaves external URLs (different origin) untouched", () => {
  const code = [
    `await page.goto("https://roi-calculator.lovable.app/");`,
    `await expect(link).toHaveAttribute("href", "https://www.linkedin.com/in/x");`,
  ].join("\n");
  const { code: out, replacements } = rewriteOrigin(code, SRC, DST);
  assert.equal(replacements, 1);
  assert.ok(out.includes(`https://www.linkedin.com/in/x`));
  assert.ok(out.includes(`${DST}/`));
});

test("matches source by normalized origin: www/case variants are rewritten", () => {
  const code = `goto("https://WWW.Roi-Calculator.lovable.app/a?b=1#c");`;
  const { code: out, replacements } = rewriteOrigin(code, SRC, DST);
  assert.equal(replacements, 1);
  assert.equal(out, `goto("${DST}/a?b=1#c");`);
});

test("preserves query and fragment exactly", () => {
  const code = `goto("https://roi-calculator.lovable.app/page?tab=charts#section");`;
  const { code: out } = rewriteOrigin(code, SRC, DST);
  assert.equal(out, `goto("${DST}/page?tab=charts#section");`);
});

test("rewrites every occurrence and counts them", () => {
  const code = [
    `const BASE_URL = "https://roi-calculator.lovable.app/single";`,
    `// navigate to https://roi-calculator.lovable.app/single`,
    `await page.goto(BASE_URL);`,
    `await expect(page).toHaveURL("https://roi-calculator.lovable.app/single");`,
  ].join("\n");
  const { out, replacements } = (() => {
    const r = rewriteOrigin(code, SRC, DST);
    return { out: r.code, replacements: r.replacements };
  })();
  assert.equal(replacements, 3);
  assert.equal(out.includes("lovable.app"), false);
});

test("does NOT touch relative-URL assertions (no origin to swap)", () => {
  const code = `await expect(page).toHaveURL(/\\/products/);`;
  const { code: out, replacements } = rewriteOrigin(code, SRC, DST);
  assert.equal(replacements, 0);
  assert.equal(out, code);
});

test("respects a non-default port as part of the origin identity", () => {
  const src = "http://localhost:3000";
  const dst = "https://app.example.com";
  const code = [
    `goto("http://localhost:3000/x");`,
    `goto("http://localhost:4000/x");`, // different port = different origin → keep
  ].join("\n");
  const { code: out, replacements } = rewriteOrigin(code, src, dst);
  assert.equal(replacements, 1);
  assert.ok(out.includes(`${dst}/x`));
  assert.ok(out.includes(`http://localhost:4000/x`));
});

test("is a no-op when source and target share an origin", () => {
  const code = `goto("https://x.com/a");`;
  const { code: out, replacements } = rewriteOrigin(
    code,
    "https://x.com",
    "https://www.x.com/",
  );
  assert.equal(replacements, 0);
  assert.equal(out, code);
});

test("applies a path prefix between the new origin and the original path", () => {
  const code = `goto("https://roi-calculator.lovable.app/single");`;
  const { code: out } = rewriteOrigin(code, SRC, DST, { pathPrefix: "/myapp" });
  assert.equal(out, `goto("${DST}/myapp/single");`);
});

test("path prefix is normalized (leading slash added, trailing stripped)", () => {
  const code = `goto("https://roi-calculator.lovable.app/x");`;
  const a = rewriteOrigin(code, SRC, DST, { pathPrefix: "myapp/" }).code;
  const b = rewriteOrigin(code, SRC, DST, { pathPrefix: "/myapp" }).code;
  assert.equal(a, b);
  assert.equal(a, `goto("${DST}/myapp/x");`);
});

test("path prefix on a bare-origin goto produces just origin+prefix", () => {
  const code = `goto("https://roi-calculator.lovable.app");`;
  const { code: out } = rewriteOrigin(code, SRC, DST, { pathPrefix: "/myapp" });
  assert.equal(out, `goto("${DST}/myapp");`);
});

test("an empty/'/' path prefix behaves like no prefix", () => {
  const code = `goto("https://roi-calculator.lovable.app/x");`;
  assert.equal(
    rewriteOrigin(code, SRC, DST, { pathPrefix: "/" }).code,
    rewriteOrigin(code, SRC, DST).code,
  );
});

test("path prefix applies even when source and target share an origin", () => {
  const code = `goto("https://x.com/a");`;
  const { code: out, replacements } = rewriteOrigin(
    code,
    "https://x.com",
    "https://x.com",
    { pathPrefix: "/sub" },
  );
  assert.equal(replacements, 1);
  assert.equal(out, `goto("https://x.com/sub/a");`);
});
