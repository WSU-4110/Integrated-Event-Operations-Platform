/** `%text%` for ILIKE, with the user's own `%`, `_` and `\` matched literally. */
export function containsPattern(text: string): string {
  return `%${text.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
