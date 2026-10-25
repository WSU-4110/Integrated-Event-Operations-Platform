// Buttons and select menus carry all their state in the custom ID
// (`namespace:action:arg1:arg2`), so they keep working after a restart.

const SEPARATOR = ':';
const MAX_LENGTH = 100; // Discord's limit

export interface ParsedCustomId {
  namespace: string;
  action: string;
  args: string[];
}

export function buildCustomId(
  namespace: string,
  action: string,
  ...args: (string | number)[]
): string {
  const parts = [namespace, action, ...args.map(String)];
  for (const part of parts) {
    if (part.length === 0 || part.includes(SEPARATOR)) {
      throw new Error(`Invalid custom ID part: "${part}"`);
    }
  }
  const id = parts.join(SEPARATOR);
  if (id.length > MAX_LENGTH) {
    throw new Error(`Custom ID is longer than ${MAX_LENGTH} characters: ${id}`);
  }
  return id;
}

export function parseCustomId(customId: string): ParsedCustomId | null {
  const [namespace, action, ...args] = customId.split(SEPARATOR);
  if (!namespace || !action) return null;
  return { namespace, action, args };
}
