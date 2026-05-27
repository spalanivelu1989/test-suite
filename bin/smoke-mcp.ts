#!/usr/bin/env tsx
// T3 smoke test: confirm `playwright run-test-mcp-server` boots over stdio and
// exposes the expected tool surface. Not part of the app.
import { spawn } from "node:child_process";

const EXPECTED = [
  "browser_navigate",
  "planner_save_plan",
  "generator_write_test",
  "test_run",
];

function send(child: ReturnType<typeof spawn>, msg: unknown) {
  child.stdin!.write(JSON.stringify(msg) + "\n");
}

async function main() {
  const child = spawn(
    "npx",
    ["playwright", "run-test-mcp-server", "--headless"],
    {
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  const tools: string[] = [];
  let buf = "";
  const done = new Promise<void>((resolve) => {
    child.stdout!.on("data", (d) => {
      buf += d.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 1 && msg.result) {
          // initialize ok → request tool list
          send(child, { jsonrpc: "2.0", method: "notifications/initialized" });
          send(child, { jsonrpc: "2.0", id: 2, method: "tools/list" });
        } else if (msg.id === 2 && msg.result?.tools) {
          for (const t of msg.result.tools) tools.push(t.name);
          resolve();
        }
      }
    });
  });

  send(child, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke", version: "0" },
    },
  });

  const timeout = new Promise<void>((_, rej) =>
    setTimeout(
      () => rej(new Error("timed out waiting for tools/list")),
      60_000,
    ),
  );
  await Promise.race([done, timeout]);
  child.kill();

  console.log(`tool count: ${tools.length}`);
  const missing = EXPECTED.filter((e) => !tools.some((t) => t.includes(e)));
  console.log(
    "expected-present:",
    EXPECTED.filter((e) => !missing.includes(e)).join(", "),
  );
  if (missing.length) {
    console.error("SMOKE FAIL: missing tools:", missing.join(", "));
    console.error("got:", tools.join(", "));
    process.exit(1);
  }
  console.log("SMOKE OK — MCP server exposes the expected tools");
}

main().catch((err) => {
  console.error(
    "SMOKE ERROR:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
