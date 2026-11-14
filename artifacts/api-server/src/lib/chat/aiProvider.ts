import type { ChatMessage } from "./validation";

/** What the chat service sends to an AI provider. */
export type AiRequest = {
  /** Instructions plus the information packet. */
  system: string;
  /** The validated conversation: starts and ends with a user message. */
  messages: ChatMessage[];
};

/**
 * The only thing the chat logic knows about an AI vendor.
 *
 * ChatService depends on this interface, not on a vendor SDK or HTTP API
 * (dependency inversion). To use another vendor, or a fake in tests, write
 * another class that implements it.
 */
export interface AiProvider {
  /** Returns the model's reply text. Throws if the provider fails. */
  complete(request: AiRequest): Promise<string>;
}
