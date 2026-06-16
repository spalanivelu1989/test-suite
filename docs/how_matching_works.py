"""
How the knowledge-layer matching works — short version, using a real model.
=============================================================================

This is the teaching companion to docs/knowledge-db.md. It uses a REAL embedding
model so we don't hand-build vectors — the library does all the cosine math, and
this file is just the *rules*:

  IN-APP   (App-Scoped) : reuse a prior test for THIS app if it confidently matches.
  CROSS-APP (Global)    : for the leftovers, borrow an IDEA from a similar test on
                          ANOTHER app (advisory only — never the code).

Model: BAAI/bge-small-en-v1.5 — the same weights as the app's
Xenova/bge-small-en-v1.5 (384-dim, cosine similarity).

Setup (once, in an isolated virtualenv so your system Python stays clean):
    python3 -m venv .venv
    source .venv/bin/activate
    pip install sentence-transformers
Run:
    python3 docs/how_matching_works.py

Formulas it applies (all the real thresholds live in
src/knowledge/retrieve/coverageDecision.ts and globalPatterns.ts):
    lexical   = |A ∩ B| / min(|A|, |B|)              # word overlap of the titles
    semTitle  = cos(query, title)                    # title-only embedding
    semIntent = cos(query, title + steps)            # richer embedding
    sem       = 0.5 * semTitle + 0.5 * semIntent
    REUSE  ⟺  (lexical ≥ 0.80 OR sem ≥ 0.82) AND the matched test last passed
    cross-app: cos(abstracted query, other-app pattern) ≥ 0.70, passing-only, top-1
"""

import re

from sentence_transformers import SentenceTransformer, util

# ---- thresholds (mirror the TypeScript constants) ----
SEM_TITLE_WEIGHT = 0.5
LEX_REUSE = 0.80
SEM_REUSE = 0.82
PATTERN_FLOOR = 0.70
PATTERN_K = 1            # cross-app keeps only the single best match per scenario
CURRENT_APP = "shop"     # the app under test
STOPWORDS = {"the", "a", "an", "to", "of", "in", "on", "and",
             "with", "via", "is", "for", "my", "me"}

model = SentenceTransformer("BAAI/bge-small-en-v1.5")


# ---- tiny helpers so the rules below read cleanly ----
def words(text):
    """Significant title tokens: lowercase words minus stopwords."""
    return {w for w in re.findall(r"[a-z]+", text.lower()) if w not in STOPWORDS}


def overlap(a, b):
    """Lexical overlap coefficient = |A ∩ B| / min(|A|, |B|) (0 if either is empty)."""
    return 0.0 if not a or not b else len(a & b) / min(len(a), len(b))


def cosine(a, b):
    """Cosine similarity via the library (embeddings are pre-normalized)."""
    return float(util.cos_sim(a, b))


def abstract(text):
    """Cross-app abstraction: strip quoted strings, numbers, and lowercase — so the
    embedding captures the workflow SHAPE, not app-specific words."""
    text = re.sub(r"[\"'][^\"']*[\"']", " ", text)
    text = re.sub(r"\d+", " ", text)
    return re.sub(r"\s+", " ", text).strip().lower()


# ---- the knowledge base: previously generated tests ----
# `steps` are the numbered step comments folded into the richer "intent" embedding.
# `outcome` is how the test did last time ("passed" | "healed" | "failed").
KB = [
    {"app": "shop", "title": "Add item to cart",
     "steps": "open product; click add to cart; assert cart count is 1", "outcome": "passed"},
    {"app": "shop", "title": "Complete checkout",
     "steps": "fill shipping address; enter card; place order; assert confirmation", "outcome": "passed"},
    {"app": "shop", "title": "Contact page scrolls smoothly",
     "steps": "open contact page; scroll to map; assert footer is visible", "outcome": "passed"},
    {"app": "shop", "title": "Apply discount code",
     "steps": "enter promo code 'SAVE10'; click apply; assert total drops", "outcome": "failed"},
    # other apps — only used by the cross-app tier
    {"app": "bank", "title": "Track transaction status",
     "steps": "open activity; search reference; assert status is shown", "outcome": "passed"},
    {"app": "tax", "title": "Apply exemption code",
     "steps": "enter exemption code; submit; assert amount is adjusted", "outcome": "passed"},
]

# planned scenarios for the current app (each is just a title)
SCENARIOS = [
    "Add item to cart",            # identical to a passing spec  -> expect REUSE
    "Place an order",              # paraphrase of "Complete checkout" -> expect REUSE (semantics)
    "About page scrolls smoothly", # look-alike of the contact spec -> likely NEW
    "Apply discount code",         # matches a spec that LAST FAILED -> NEW, then cross-app helps
    "Track my shipment",           # nothing similar on shop -> NEW, then cross-app helps
]

# ---- embed the knowledge base once (batch) ----
title_emb = model.encode([s["title"] for s in KB], normalize_embeddings=True)
intent_emb = model.encode([f"{s['title']}. {s['steps']}" for s in KB], normalize_embeddings=True)
pattern_emb = model.encode([abstract(f"{s['title']}. {s['steps']}") for s in KB], normalize_embeddings=True)

# ===========================================================================
# PART 1 — IN-APP (App-Scoped): reuse vs new
# ===========================================================================
print(f"\n=== IN-APP RETRIEVAL (app under test: {CURRENT_APP}) ===")
new_scenarios = []

for name in SCENARIOS:
    q = model.encode(name, normalize_embeddings=True)
    qt = words(name)
    best = None  # the spec with the highest combined = max(lexical, sem)

    for i, s in enumerate(KB):
        if s["app"] != CURRENT_APP:
            continue
        lex = overlap(qt, words(s["title"]))
        sem = SEM_TITLE_WEIGHT * cosine(q, title_emb[i]) + (1 - SEM_TITLE_WEIGHT) * cosine(q, intent_emb[i])
        combined = max(lex, sem)
        if best is None or combined > best["combined"]:
            best = {"title": s["title"], "lex": lex, "sem": sem,
                    "combined": combined, "outcome": s["outcome"]}

    # REUSE only if the best match clears a bar AND it last passed.
    confident = best is not None and (best["lex"] >= LEX_REUSE or best["sem"] >= SEM_REUSE)
    reuse = confident and best["outcome"] in ("passed", "healed")

    print(f"\n  \"{name}\"")
    if best:
        print(f"    best match: \"{best['title']}\" [last={best['outcome']}]  "
              f"lexical={best['lex']:.2f}  sem={best['sem']:.2f}")
    print(f"    -> {'REUSE' if reuse else 'NEW'}")
    if not reuse:
        new_scenarios.append(name)

# ===========================================================================
# PART 2 — CROSS-APP (Global): borrow an idea for the NEW scenarios
# ===========================================================================
print(f"\n\n=== CROSS-APP RETRIEVAL (for NEW scenarios: {new_scenarios}) ===")

for name in new_scenarios:
    qp = model.encode(abstract(name), normalize_embeddings=True)

    # score against OTHER apps' passing patterns, keep those above the floor
    candidates = []
    for i, s in enumerate(KB):
        if s["app"] == CURRENT_APP or s["outcome"] not in ("passed", "healed"):
            continue
        score = cosine(qp, pattern_emb[i])
        if score >= PATTERN_FLOOR:
            candidates.append((score, s["app"], s["title"]))

    candidates.sort(reverse=True)        # best first
    top = candidates[:PATTERN_K]         # keep only the single best (PATTERN_K = 1)

    print(f"\n  \"{name}\"")
    if top:
        score, app, title = top[0]
        print(f"    -> HINT: \"{title}\" from {app} (cos={score:.2f}) — adapt the idea, not the code")
    else:
        print("    -> no relevant cross-app pattern; generate from scratch")
