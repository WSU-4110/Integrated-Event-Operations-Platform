type EventContentDetails =
  | { kind: "announcement"; body: string; url: null; position: 0 }
  | { kind: "resource"; body: null; url: string; position: number };

type EventContentInput = EventContentDetails & { title: string; published: boolean };

interface EventContentStrategy {
  prepare(input: Record<string, unknown>): EventContentDetails | null;
}

class AnnouncementStrategy implements EventContentStrategy {
  prepare(input: Record<string, unknown>): EventContentDetails | null {
    const body = typeof input.body === "string" ? input.body.trim() : "";
    if (!body || body.length > 4000) return null;
    return { kind: "announcement", body, url: null, position: 0 };
  }
}

class ResourceLinkStrategy implements EventContentStrategy {
  prepare(input: Record<string, unknown>): EventContentDetails | null {
    if (typeof input.url !== "string" || input.url.length > 2048) return null;
    const position = input.position === undefined ? 0 : input.position;
    if (typeof position !== "number" || !Number.isSafeInteger(position) ||
        position < 0 || position > 2_147_483_647) return null;

    try {
      const url = new URL(input.url);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
      return { kind: "resource", body: null, url: url.href, position };
    } catch {
      return null;
    }
  }
}

const strategies: ReadonlyMap<unknown, EventContentStrategy> = new Map<unknown, EventContentStrategy>([
  ["announcement", new AnnouncementStrategy()],
  ["resource", new ResourceLinkStrategy()],
]);

export function prepareEventContent(value: unknown): EventContentInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const published = input.published === undefined ? false : input.published;
  if (!title || title.length > 160 || typeof published !== "boolean") return null;

  const details = strategies.get(input.kind)?.prepare(input);
  return details ? { ...details, title, published } : null;
}
