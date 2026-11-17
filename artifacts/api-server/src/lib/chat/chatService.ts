import type { AiProvider } from "./aiProvider";
import type { ChatMessage } from "./validation";

export type ChatServiceOptions = {
  provider: AiProvider;
  /** Instructions plus the information packet. */
  systemPrompt: string;
  /** Shown to the participant when the AI provider fails. */
  fallbackReply: string;
  /** Called with the error when the provider fails (for logging). */
  onError?: (error: unknown) => void;
};

export type ChatReply = {
  reply: string;
  /** True when the provider failed and fallbackReply was returned. */
  fallback: boolean;
};

/**
 * Answers a validated conversation. It depends on the AiProvider interface,
 * not on a vendor, and never throws because of a provider failure: the
 * participant gets the fallback reply instead.
 */
export class ChatService {
  provider: AiProvider;
  systemPrompt: string;
  fallbackReply: string;
  onError?: (error: unknown) => void;

  constructor(options: ChatServiceOptions) {
    this.provider = options.provider;
    this.systemPrompt = options.systemPrompt;
    this.fallbackReply = options.fallbackReply;
    this.onError = options.onError;
  }

  async answer(messages: ChatMessage[]): Promise<ChatReply> {
    try {
      const reply = await this.provider.complete({
        system: this.systemPrompt,
        messages,
      });
      return { reply, fallback: false };
    } catch (error) {
      this.onError?.(error);
      return { reply: this.fallbackReply, fallback: true };
    }
  }
}
