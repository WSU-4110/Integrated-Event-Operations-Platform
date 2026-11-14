export const MAX_MESSAGE_CHARS = 500;
export const MAX_HISTORY = 10;

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ValidationResult =
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; error: string };

/**
 * Checks a chat request body's `messages` value.
 *
 * Rules:
 * - must be an array with 1 to MAX_HISTORY messages
 * - each message has role "user" or "assistant" and a string content
 * - each content has 1 to MAX_MESSAGE_CHARS characters (not blank)
 * - the conversation starts and ends with a "user" message
 *
 * Pure function: no I/O, so it is easy to unit test.
 */
export function validateMessages(input: unknown): ValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: "messages must be an array." };
  }
  if (input.length === 0) {
    return { ok: false, error: "messages must not be empty." };
  }
  if (input.length > MAX_HISTORY) {
    return {
      ok: false,
      error: `messages must have at most ${MAX_HISTORY} entries.`,
    };
  }

  const messages: ChatMessage[] = [];
  for (const item of input) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: "each message must be an object." };
    }
    const { role, content } = item as Record<string, unknown>;

    if (role !== "user" && role !== "assistant") {
      return { ok: false, error: 'role must be "user" or "assistant".' };
    }
    if (typeof content !== "string") {
      return { ok: false, error: "content must be a string." };
    }
    if (content.trim().length === 0) {
      return { ok: false, error: "content must not be empty." };
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      return {
        ok: false,
        error: `content must be at most ${MAX_MESSAGE_CHARS} characters.`,
      };
    }
    messages.push({ role, content });
  }

  if (messages[0].role !== "user") {
    return { ok: false, error: "conversation must start with a user message." };
  }
  if (messages[messages.length - 1].role !== "user") {
    return { ok: false, error: "conversation must end with a user message." };
  }

  return { ok: true, messages };
}
