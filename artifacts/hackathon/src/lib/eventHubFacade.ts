import {
  ANNOUNCEMENTS,
  EVENT_CONFIG,
  RESOURCES,
  SCHEDULE,
} from "@/config/event";

/**
 * Facade pattern (FR-14, View the BuilderWars Event Hub).
 *
 * The Event Hub needs the event details, schedule, announcements, and
 * resources. EventHubFacade gives the page one call, getEventHub(), and hides
 * four subsystem services, the "published only" rule, the latest-announcement
 * rule, and per-section failure handling.
 */

export type SectionStatus = "available" | "empty" | "unavailable";

export interface SectionResult<T> {
  status: SectionStatus;
  items: T[];
  message: string | null;
}

export type ScheduleItem = (typeof SCHEDULE)[number] & { published?: boolean };
export type Announcement = (typeof ANNOUNCEMENTS)[number];
export type Resource = (typeof RESOURCES)[number] & { isExternal: boolean };

export interface EventHubPage {
  eventName: string;
  eventDate: string;
  eventLocation: string;
  schedule: SectionResult<ScheduleItem>;
  announcements: SectionResult<Announcement>;
  resources: SectionResult<Resource>;
  latestAnnouncementId: string | null;
}

// ---- Subsystem classes (unchanged by the facade) -------------------------

export class EventService {
  getEvent() {
    return {
      name: EVENT_CONFIG.name,
      date: EVENT_CONFIG.date,
      location: EVENT_CONFIG.location,
    };
  }
}

export class ScheduleService {
  getPublishedSchedule(): ScheduleItem[] {
    return (SCHEDULE as ScheduleItem[]).filter((i) => i.published !== false);
  }
}

export class AnnouncementService {
  getPublishedAnnouncements(): Announcement[] {
    return ANNOUNCEMENTS.filter((a) => a.published);
  }
}

export class ResourceService {
  getPublishedResources(): Omit<Resource, "isExternal">[] {
    return RESOURCES.filter((r) => r.published);
  }
}

// ---- Facade ---------------------------------------------------------------

export class EventHubFacade {
  constructor(
    private readonly eventService = new EventService(),
    private readonly scheduleService = new ScheduleService(),
    private readonly announcementService = new AnnouncementService(),
    private readonly resourceService = new ResourceService(),
  ) {}

  getEventHub(): EventHubPage {
    const event = this.eventService.getEvent();
    const schedule = this.loadSection(
      () => this.scheduleService.getPublishedSchedule(),
      "The schedule has not been published yet. Check back soon.",
    );
    const announcements = this.loadSection(
      () => this.announcementService.getPublishedAnnouncements(),
      "No announcements yet. We will post updates here.",
    );
    const resources = this.loadSection(
      () => this.markLinkTargets(this.resourceService.getPublishedResources()),
      "No resources have been shared yet.",
    );
    return {
      eventName: event.name,
      eventDate: event.date,
      eventLocation: event.location,
      schedule,
      announcements,
      resources,
      latestAnnouncementId: this.findLatest(announcements.items)?.id ?? null,
    };
  }

  private loadSection<T>(
    loader: () => T[],
    emptyMessage: string,
  ): SectionResult<T> {
    try {
      const items = loader();
      return items.length === 0
        ? { status: "empty", items: [], message: emptyMessage }
        : { status: "available", items, message: null };
    } catch {
      return {
        status: "unavailable",
        items: [],
        message: "This section is temporarily unavailable.",
      };
    }
  }

  private findLatest(list: Announcement[]): Announcement | undefined {
    return [...list].sort(
      (a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt),
    )[0];
  }

  private markLinkTargets(
    list: Omit<Resource, "isExternal">[],
  ): Resource[] {
    return list.map((r) => ({ ...r, isExternal: r.kind === "external" }));
  }
}

export const eventHubFacade = new EventHubFacade();
