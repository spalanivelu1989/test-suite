import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { findTracePath } from "./trace";

// findTracePath resolves baseDir against process.cwd(), so the test baseDir must
// be expressed relative to cwd.
async function withRun(
  id: string,
  resultsJson: unknown,
  fn: (baseDir: string) => Promise<void>,
): Promise<void> {
  const abs = await mkdtemp(join(tmpdir(), "trace-test-"));
  const baseDir = relative(process.cwd(), abs);
  try {
    const runDir = join(abs, id);
    await mkdir(runDir, { recursive: true });
    if (resultsJson !== undefined)
      await writeFile(
        join(runDir, "results.json"),
        JSON.stringify(resultsJson),
        "utf8",
      );
    await fn(baseDir);
  } finally {
    await rm(abs, { recursive: true, force: true });
  }
}

test("findTracePath returns the trace attachment for a matching spec", async () => {
  const id = "mig-1";
  const report = {
    suites: [
      {
        suites: [
          {
            specs: [
              {
                file: "tests/login.spec.ts",
                tests: [
                  {
                    results: [
                      {
                        attachments: [
                          { name: "screenshot", path: "/x/shot.png" },
                          { name: "trace", path: "/abs/login-trace.zip" },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  await withRun(id, report, async (baseDir) => {
    // Matches by basename, even when the caller passes only the basename.
    assert.equal(
      await findTracePath(id, "login.spec.ts", baseDir),
      "/abs/login-trace.zip",
    );
  });
});

test("findTracePath prefers the last (retry) trace", async () => {
  const id = "mig-2";
  const report = {
    suites: [
      {
        specs: [
          {
            file: "checkout.spec.ts",
            tests: [
              {
                results: [
                  { attachments: [{ name: "trace", path: "/abs/try1.zip" }] },
                  { attachments: [{ name: "trace", path: "/abs/try2.zip" }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  await withRun(id, report, async (baseDir) => {
    assert.equal(
      await findTracePath(id, "checkout.spec.ts", baseDir),
      "/abs/try2.zip",
    );
  });
});

test("findTracePath returns null when the spec has no trace", async () => {
  const id = "mig-3";
  const report = {
    suites: [
      {
        specs: [
          {
            file: "home.spec.ts",
            tests: [{ results: [{ attachments: [] }] }],
          },
        ],
      },
    ],
  };
  await withRun(id, report, async (baseDir) => {
    assert.equal(await findTracePath(id, "home.spec.ts", baseDir), null);
  });
});

test("findTracePath returns null when results.json is absent", async () => {
  await withRun("mig-4", undefined, async (baseDir) => {
    assert.equal(await findTracePath("mig-4", "any.spec.ts", baseDir), null);
  });
});
