import Anthropic from "@anthropic-ai/sdk";

/** A single logged Claude request — makes R6 (Claude-powered) verifiable (AC5). */
export interface ClaudeCallLog {
  at: string;
  model: string;
  purpose: string;
  inputChars: number;
}

/** Minimal slice of the Anthropic SDK the client uses — injectable for tests. */
export interface AnthropicLike {
  messages: {
    create(args: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: { role: "user"; content: string }[];
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export interface ClaudeClientOptions {
  apiKey?: string;
  model?: string;
  /** Inject a fake SDK in tests; defaults to a real Anthropic client when a key exists. */
  sdk?: AnthropicLike;
  /** Called for every request — used by the run store/orchestrator to surface call counts. */
  onCall?: (log: ClaudeCallLog) => void;
}

export interface ClaudeCompleteArgs {
  purpose: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
}

export interface ClaudeClient {
  complete(args: ClaudeCompleteArgs): Promise<string>;
  readonly calls: ReadonlyArray<ClaudeCallLog>;
  readonly model: string;
}

export const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Thrown when a Claude call is attempted with no API key configured (R6/DEP1). */
export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY is not set. The Claude reasoning engine is required " +
        "(see .env.example). Set the key to run crawl/generation/healing.",
    );
    this.name = "MissingApiKeyError";
  }
}

export function createClaudeClient(
  opts: ClaudeClientOptions = {},
): ClaudeClient {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const sdk: AnthropicLike | null =
    opts.sdk ?? (apiKey ? new Anthropic({ apiKey }) : null);
  const calls: ClaudeCallLog[] = [];

  return {
    get calls() {
      return calls;
    },
    model,
    async complete({ purpose, prompt, system, maxTokens = 4096 }) {
      if (!sdk) throw new MissingApiKeyError();
      const log: ClaudeCallLog = {
        at: new Date().toISOString(),
        model,
        purpose,
        inputChars: prompt.length,
      };
      calls.push(log);
      opts.onCall?.(log);
      // Logged to stderr so Claude usage is observable in CI logs (AC5).
      console.error(
        `[claude] ${log.at} purpose=${purpose} model=${model} inputChars=${log.inputChars}`,
      );
      const res = await sdk.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      });
      return res.content
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("");
    },
  };
}
