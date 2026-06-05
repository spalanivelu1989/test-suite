// Embeddings for semantic test reuse (Spec R1, Plan I1, ADR-0002). The Embedder
// interface is the seam: a local model in production, a deterministic FakeEmbedder
// in tests, a hosted provider (Voyage) as a future drop-in — all the same shape.

/** Produces L2-normalized embedding vectors for text, in batches. */
export interface Embedder {
  /** Stable id incl. model, e.g. "local:Xenova/bge-small-en-v1.5". */
  readonly id: string;
  /** Vector dimension — fixes the `vector(N)` column. */
  readonly dims: number;
  /** Embed a batch; returns one vector per input (L2-normalized). */
  embed(texts: string[]): Promise<number[][]>;
}

/** L2-normalize a vector (so cosine similarity == dot product). */
export function l2normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n);
  return n === 0 ? v.slice() : v.map((x) => x / n);
}

/** Cosine similarity in [-1, 1]; 0 for empty/mismatched/zero vectors. */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Local in-process embedder (Spec C2, ADR-0002): transformers.js running
 * bge-small-en-v1.5 (384d), mean-pooled + L2-normalized. Lazy-loads the model on
 * first use and caches it (N2). Symmetric: specs and scenarios are embedded the
 * same way (short titles — no asymmetric query prefix).
 */
export class LocalEmbedder implements Embedder {
  readonly id: string;
  readonly dims = 384;
  private readonly model: string;
  // Typed loosely to avoid importing transformers types at module load (it's a
  // heavy, ESM-only dep loaded lazily on first embed).
  private pipe: Promise<
    (texts: string[], opts: object) => Promise<{ tolist(): number[][] }>
  > | null = null;

  constructor(model = "Xenova/bge-small-en-v1.5") {
    this.model = model;
    this.id = `local:${model}`;
  }

  private load() {
    if (!this.pipe) {
      this.pipe = import("@huggingface/transformers").then(
        (m) =>
          m.pipeline("feature-extraction", this.model) as unknown as Promise<
            (texts: string[], opts: object) => Promise<{ tolist(): number[][] }>
          >,
      );
    }
    return this.pipe;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.load();
    const out = await extractor(texts, { pooling: "mean", normalize: true });
    return out.tolist();
  }
}

/**
 * Deterministic, network-free embedder for tests. Tests inject the exact vectors
 * for known texts so they control the near/related/unrelated geometry; unknown
 * texts map to a zero vector (→ semantic score 0, i.e. lexical-only).
 */
export class FakeEmbedder implements Embedder {
  readonly id = "fake";
  readonly dims: number;
  constructor(
    private readonly vectors: Record<string, number[]> = {},
    dims = 3,
  ) {
    this.dims = dims;
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) =>
      this.vectors[t]
        ? l2normalize(this.vectors[t])
        : new Array(this.dims).fill(0),
    );
  }
}
