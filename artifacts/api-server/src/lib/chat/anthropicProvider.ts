import type { AiProvider, AiRequest } from "./aiProvider";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export const DEFAULT_MODEL = "claude-haiku-5-5";
export const DEFAULT_MAX_TOKENS = 400;
export const DEFAULT_TIMEOUT_MS = 20_000;

export type AnthropicProviderOptions = {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
};

/**
 * Adapter (design pattern): makes the Anthropic Messages API fit our own
 * AiProvider interface.
 *
 * It translates AiRequest into Anthropic's request format, calls the API with
 * fetch (the same approach the Resend email code uses, so no new dependency),
 * and translates the response back into plain text.
 */
export class AnthropicProvider implements AiProvider {
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;

  constructor(options: AnthropicProviderOptions) {
    if (!options.apiKey) {
      throw new Error("An Anthropic API key is required.");
    }
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async complete({ system, messages }: AiRequest): Promise<string> {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        // The packet is the same on every request, so mark it cacheable.
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ],
        messages,
      }),
    });

    if (!response.ok) {
      // Report the status only: the body can echo request details.
      throw new Error(`Anthropic request failed (${response.status}).`);
    }

    const data = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) {
      throw new Error("Anthropic returned no text.");
    }
    return text;
  }
}
