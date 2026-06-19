import nextEnv from "@next/env";
import { readFile } from "node:fs/promises";
const { loadEnvConfig } = nextEnv; loadEnvConfig(process.cwd());
const run = JSON.parse(await readFile(".runs/c0aa2dab-7b8d-4592-b764-f9d0eea81a00/run.json","utf8"));
const specFiles = run.report.generatedSpecs.map(s=>s.file);
const body = {
  sourceUrl: "https://sapbtp-roi.tarento-ivolve.com/single",
  sourceRunId: "c0aa2dab-7b8d-4592-b764-f9d0eea81a00",
  targetUrl: "https://sapbtp-roi-calculator-stage.cfapps.eu10-004.hana.ondemand.com/single",
  selectedSpecFiles: specFiles,
  auth: {
    username: process.env.TARGET_USERNAME?.trim(),
    password: process.env.TARGET_PASSWORD?.trim(),
    idp: process.env.TARGET_IDP?.trim(),
  },
  options: { heal: false },
};
console.log(`[trigger] POST prod->stage, ${specFiles.length} specs, heal=false`);
const res = await fetch("http://localhost:3000/api/migration-check", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const data = await res.json();
if (!res.ok) { console.log("[trigger] FAILED:", JSON.stringify(data)); process.exit(1); }
const id = data.id;
console.log("[trigger] run id:", id);
let last = "";
for (;;) {
  await new Promise(r=>setTimeout(r,4000));
  const s = await fetch(`http://localhost:3000/api/migration-check/${id}?t=${Date.now()}`, { cache:"no-store" });
  if (!s.ok) continue;
  const st = await s.json();
  const evs = st.status?.events ?? st.events ?? [];
  const latest = evs.length ? evs[evs.length-1] : null;
  if (latest && `${latest.step}:${latest.message}` !== last) { last = `${latest.step}:${latest.message}`; console.log(`  [${latest.step}] ${latest.message}`); }
  const status = st.status?.status ?? st.status;
  if (status === "completed" || status === "error") {
    console.log("[trigger] terminal status:", status);
    const rep = st.report;
    if (rep) {
      console.log("[trigger] summary:", JSON.stringify(rep.summary));
      console.log("[trigger] fingerprint:", rep.fingerprint?.status);
      if (rep.setupError) console.log("[trigger] setupError:", rep.setupError);
    }
    console.log("[trigger] RUN_ID="+id);
    break;
  }
}
