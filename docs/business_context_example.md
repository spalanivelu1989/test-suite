The Northwind OKF workflow, step by step

The cast:
- Northwind Materials — a company running SAP S/4HANA Cloud.
- Priya — a QA engineer who uses your testing tool.
- The agents — the Discoverer (crawls + plans) and the Generator (writes the actual tests).
- The OKF bundles — the human-written "briefing binders" sitting in business-context/.

---
Phase 0 — Before anyone runs anything (one-time setup)

Long before Priya clicks a button, someone at Northwind who knows the procurement process (a business analyst, a QA lead) wrote two binders, as plain text files committed to the git repo:

- platform/sap-fiori/ — the general handbook: "how any SAP Fiori app behaves" (tiles, filter bars, busy spinners, error-vs-warning messages).
- apps/manage-purchase-orders/ — the specific binder for one app: itsbusiness rules (like "three-way match").

The very first lines of the app's cover page (index.md) are the impor that says which website this binder is for:

applies_to:
  origin: https://northwind.s4hana.ondemand.com
  routes: ["#PurchaseOrder-manage"]
built_on: [sap-fiori]

That's it. The binders just sit there in git. *(Built today.)*

---
Phase 1 — Priya provides the URL

Priya opens your tool and pastes the address of the app she wants tes

https://northwind.s4hana.ondemand.com/ui#PurchaseOrder-manage

In SAP Fiori, that #PurchaseOrder-manage at the end is the "intent roozens of mini-apps apart even though they all live at the samenorthwind.s4hana.ondemand.com address. Think of the domain as a big office tower and #PurchaseOrder-manage as the floor + room number. She hits Run.

---
Phase 2 — The tool reads every binder's cover page (build the manifes

Before the agents do anything, the tool quietly scans the business-cojust the cover page (index.md) of every binder. It's not reading the
whole binder yet — just the labels — to build a quick directory of "wite."

In the code this is buildManifest(root) (src/knowledge/business/manifest.ts). For each binder it records:
- where it lives on disk,
- the website + route it's labeled for (applies_to),
- which general handbook it leans on (built_on),
- whether it's the live version (status: active).

It's deliberately bulletproof: if the business-context/ folder is misd, it just skips it and carries on — it never crashes the run. (Builttoday — tested.)

The result is an in-memory index: a list of app binders + a lookup of platform handbooks by name (sap-fiori → that folder).

---
Phase 3 — The tool figures out which binder applies (resolution)

Now the tool takes Priya's URL and matches it to a binder. This is th manifest) function (resolver.ts), and it happens in four small moves:

3a. Simplify the address to its "identity."
It strips the URL down to just the origin — https://northwind.s4hana.ondemand.com — dropping the /ui, the #..., any www, casing, etc. This uses the exact same normalizeOrigin the rest of your tool already uses, so the app's identity is consistent everywhere.

3b. Find binders for that origin, then pick the most specific by rout
It finds every app binder labeled for that origin (here, just the oneoutes against the part of the URL after the domain(/ui#purchaseorder-manage, lowercased). #PurchaseOrder-manage is found inside it → it's a match. The "score" is the length of the matching route, so if two binders matched, the longer, more specific route wins (e.g. #PurchaseOrder-manage beats a generic #PurchaseOrder).

3c. Stack the general handbook on top.
The winning binder's cover page says built_on: [sap-fiori], so the to/sap-fiori handbook. Now the agents will get two layers: the specific
PO binder and the general Fiori handbook underneath it. (If built_on exist, it's silently skipped — no crash.)

3d. Hand back the result.
The tool now holds: "app = Manage Purchase Orders, platforms = [SAP Fiori], matched by origin+route."

If nothing had matched (wrong domain, unknown route), it returns "none" and the run simply proceeds the old way — cold, no briefing, nothing broken. (Built today — 11 resolver tests cover all these branches.)

---
Phase 4 — The tool opens the binder and picks the right pages (retrieval)

▎ ⚠️ From here on is planned wiring — designed and specced, not yet built. This is the BusinessContextService we discussed building next.

Having decided which binders apply, the tool now reads inside them — e binder into the agent. A real PRD/Fiori binder could be huge. Itselects only the relevant pages, and it does this differently for the two agents:

4a. For the Discoverer — the "map" (a small, fixed overview).
It grabs the high-level navigation pages: the app's index.md (what this app is for, what it's built on) and workflows/index.md (the list of business journeys — "procure-to-pay," "post-supplier-invoice"). This is small and always included. It's the table of contents, so the Discoverer knows what to go looking for.

4b. For the Generator — the "relevant chapters" (smart selection).
The Generator is about to write a test for a specific scenario, e.g. more than was ordered." For that scenario the tool pulls only the pages
that matter:
- It compares the scenario's wording against every concept page in the closest few. (Mechanically: each page was turned into a list of
numbers — an "embedding" — that captures its meaning; the scenario is way; the tool picks the pages whose numbers are nearest. This reuses
the same embedding machinery (LocalEmbedder + the pgvector database) s learned-knowledge layer.)
- For this scenario the nearest pages are rules/three-way-match.md, screens/po-object-page.md, and — because three-way-match links to it — the platform page
conventions/message-toasts.md (the one explaining "a blocking error i.

4c. Follow the links.
This is where the graph we built matters. Picking three-way-match.md also surfaces what it links to, so the agent gets the connected context, not an isolated page. The link-walking is collectLinks/resolveLink in links.ts (which is built inks guaranteed).

4d. Keep it within budget.
Finally it trims the selected text so it can't balloon the prompt — the same discipline the existing Discoverer already uses for its "previous plan" memory (a ~16,000-character / ~4,000-token cap). Better to include the 3 most relevant pages fully than 30 pages truncated.

The output of this phase is two ready-to-paste text blocks: a short orer and a rules block for the Generator.

---
Phase 5 — The Discoverer crawls — but now it knows the business

▎ ⚠️ Planned wiring (the injection point itself is real code; the business block isn't fed in yet).

Your tool already builds the Discoverer's prompt at one specific spot around line 243), where it currently bolts on things like the previous
plan and learned playbooks. The business overview block gets bolted od in a clear tag like <business-context>.

The difference this makes, in plain terms: instead of arriving and bl and links it sees, the Discoverer arrives already knowing —
- what this app is for (managing purchase orders),
- that it's a Fiori app (so it should expect tiles, a filter bar, busy spinners — from the general handbook),
- that "procure-to-pay" and "three-way match" are real journeys worth covering.

So its test plan reflects the actual procurement process, not just "e

---
Phase 6 — The Generator writes tests against intended behavior

▎ ⚠️ Planned wiring (injection point real at ~line 402; business bloc

For each scenario in that plan, the tool builds the Generator's promp), where it already injects coverage decisions and locator hints. Hereit adds the scenario's rules block from Phase 4b.

Now the Generator isn't guessing what "correct" means — the binder told it. For the over-delivery scenario it knows the rule:

▎ invoice qty must be ≤ goods-received ≤ PO qty; over-delivery beyond 10% must be blocked with a hard error, not a warning.

So instead of a shallow test ("the invoice screen opens"), it writes

▎ Create a PO for 100 units → post a goods receipt for 100 → try to p0 units → expect a hard error that blocks the post.

---
Phase 7 — The run executes, and catches a real bug

The generated test runs against Northwind's live app. The app accepts the 120-unit invoice and only shows a yellow warning instead of blocking it.

Because the Generator knew the intended rule, this mismatch surfaces as a genuine functional defect — over-delivery beyond tolerance should have been blocked. A generic crawler, with no idea what the rule was, would have happily reported "invoice posted ✓" and walked past the bug. That jump — from "does the page render" to "does the business logic actually hold" — is the entire point of the OKF layer.

---
Phase 8 — Transparency, safety nets, and overrides (the minor details)

- You can see what it used. Whenever a binder is loaded, the run prints a line on screen like 📘 Loaded business context: Manage Purchase Orders (+ SAP Fiori) — the same way it already prints 🧠 Loaded previous plan as memory. No silent magic. (Planned — emitted as a KnowledgeEvent, the existing event mechanism.)
- It never blocks a run. Every step here is "best-effort": missing folder, bad file, embedding service down, no match — all degrade to "run cold," exactly like the rest of your knowledge layer (the withKb / "log, never throw" rule). (The his; the service will too.)
- You can override the match. If the automatic pick is ever wrong, or Priya wants a specific version of the binder, she can pin a bundle by hand at launch — the same way the existing focus option narrows a run. (Planned.)
- Authored ≠ learned. This whole layer is human-authored, trusted reference. It's kept separate from your tool's learned knowledge (the stuff distilled from past runs) and is never overwritten by the distillation job. If the binder and reality disagree, that's a finding to report — not a thing to silently "learn away."
