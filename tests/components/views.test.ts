import { ButtonStyle, ComponentType } from 'discord.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildFaqView, FAQ_SELECT_ID } from '../../src/components/embeds/faqEmbeds.js';
import { buildHelpMenu, buildHelpSection } from '../../src/components/embeds/helpEmbeds.js';
import { buildResourcesView } from '../../src/components/embeds/resourceEmbeds.js';
import { buildRulesView, splitForEmbeds } from '../../src/components/embeds/rulesEmbeds.js';
import {
  buildWorkshopCard,
  buildWorkshopList,
} from '../../src/components/embeds/workshopEmbeds.js';
import type { WorkshopWithCounts } from '../../src/database/repositories/workshopRepository.js';
import { HELP_SECTIONS, loadContent, type Content } from '../../src/services/contentService.js';

let content: Content;
beforeAll(async () => {
  content = await loadContent({ vars: { registrationUrl: 'https://builderwars.dev/#register' } });
});

// Serializes the view the way discord.js sends it, then flattens the buttons.
function buttonsOf(view: ReturnType<typeof buildHelpMenu>) {
  return view.components.flatMap((row) => row.toJSON().components);
}

describe('help menu', () => {
  it('shows all nine sections, at most five buttons per row', () => {
    const view = buildHelpMenu(content.help, { verified: false });
    const buttons = buttonsOf(view);
    expect(buttons).toHaveLength(HELP_SECTIONS.length);
    for (const row of view.components) expect(row.components.length).toBeLessThanOrEqual(5);
  });

  it('uses unique custom IDs within Discord limits', () => {
    const ids = buttonsOf(buildHelpMenu(content.help, { verified: false })).map((b) =>
      'custom_id' in b ? b.custom_id : '',
    );
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.length).toBeLessThanOrEqual(100);
    expect(ids).toContain('verify:start'); // Verify opens the form directly
  });

  it('highlights Verify and explains registration for unverified users', () => {
    const view = buildHelpMenu(content.help, { verified: false });
    const verify = buttonsOf(view).find((b) => 'custom_id' in b && b.custom_id === 'verify:start');
    expect(verify?.type === ComponentType.Button && verify.style).toBe(ButtonStyle.Success);
    expect(view.embeds[0]?.toJSON().description).toContain('https://builderwars.dev/#register');
  });

  it("doesn't highlight Verify once verified", () => {
    const view = buildHelpMenu(content.help, { verified: true });
    const verify = buttonsOf(view).find((b) => 'custom_id' in b && b.custom_id === 'verify:start');
    expect(verify?.type === ComponentType.Button && verify.style).toBe(ButtonStyle.Secondary);
    expect(view.embeds[0]?.toJSON().description).not.toContain('not verified');
  });

  it('builds a section embed for every section', () => {
    for (const id of HELP_SECTIONS) {
      const embed = buildHelpSection(content.help, id).embeds[0]?.toJSON();
      expect(embed?.title).toContain(content.help.sections[id].title);
    }
  });
});

describe('FAQ view', () => {
  it('lists every question in the select menu', () => {
    const menu = buildFaqView(content.faqs).components[0]?.toJSON().components[0];
    expect(menu?.type).toBe(ComponentType.StringSelect);
    if (menu?.type !== ComponentType.StringSelect) return;
    expect(menu.custom_id).toBe(FAQ_SELECT_ID);
    expect(menu.options).toHaveLength(content.faqs.length);
  });

  it('shows the selected answer and marks it as the default option', () => {
    const faq = content.faqs[0]!;
    const view = buildFaqView(content.faqs, faq.id);
    expect(view.embeds[0]?.toJSON().description).toBe(faq.answer);
    const menu = view.components[0]?.toJSON().components[0];
    if (menu?.type !== ComponentType.StringSelect) throw new Error('expected a select menu');
    expect(menu.options.filter((o) => o.default).map((o) => o.value)).toEqual([faq.id]);
  });

  it('falls back to the picker when the question no longer exists', () => {
    const view = buildFaqView(content.faqs, 'deleted-question');
    expect(view.embeds[0]?.toJSON().title).toContain('Frequently Asked Questions');
  });
});

describe('resources view', () => {
  it('lists the resources of the chosen category as links', () => {
    const view = buildResourcesView(content.resources, 'submission');
    const description = view.embeds[0]?.toJSON().description ?? '';
    expect(description).toContain('[Shipyard](https://shipyardhq.tech/)');
    expect(description.length).toBeLessThanOrEqual(4096);
  });

  it('fits every category in one embed', () => {
    for (const category of content.resources.categories) {
      const embed = buildResourcesView(content.resources, category.id).embeds[0]?.toJSON();
      expect(embed?.description?.length ?? 0).toBeLessThanOrEqual(4096);
    }
  });
});

describe('rules view', () => {
  it('fits the shipped rules in one message', () => {
    const embeds = buildRulesView(content.rules).embeds.map((e) => e.toJSON());
    const total = embeds.reduce(
      (n, e) => n + (e.title?.length ?? 0) + (e.description?.length ?? 0),
      0,
    );
    expect(total).toBeLessThanOrEqual(6000);
  });

  it('splits long text between paragraphs and keeps every chunk under the limit', () => {
    const text = ['a'.repeat(30), 'b'.repeat(30), 'c'.repeat(30)].join('\n\n');
    const chunks = splitForEmbeds(text, 70);
    expect(chunks).toEqual([`${'a'.repeat(30)}\n\n${'b'.repeat(30)}`, 'c'.repeat(30)]);
  });

  it('hard-splits a single line longer than the limit', () => {
    const chunks = splitForEmbeds('x'.repeat(250), 100);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
  });
});

describe('workshop views', () => {
  const workshop: WorkshopWithCounts = {
    id: 12345,
    name: 'AI Fundamentals',
    description: 'Neural nets from scratch',
    speaker: 'Grace Hopper',
    startTime: new Date('2026-11-14T19:00:00Z'),
    endTime: new Date('2026-11-14T20:00:00Z'),
    location: 'Room 204',
    capacity: 30,
    channelId: null,
    messageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    registered: 18,
    waitlisted: 0,
  };
  const spotsField = (view: ReturnType<typeof buildWorkshopCard>) =>
    view.embeds[0]?.toJSON().fields?.find((f) => f.name.includes('Spots'))?.value;

  it('shows counts, remaining spots and persistent button IDs', () => {
    const view = buildWorkshopCard(workshop, { started: false });
    expect(spotsField(view)).toBe('18 / 30 registered\n12 spots remaining');
    const buttons = buttonsOf(view);
    expect(buttons.map((b) => ('custom_id' in b ? b.custom_id : ''))).toEqual([
      'workshop:register:12345',
      'workshop:cancel:12345',
    ]);
    // Times are Discord timestamps, so everyone sees their own time zone.
    expect(JSON.stringify(view.embeds[0]?.toJSON().fields)).toContain('<t:1794682800:F>');
  });

  it('shows the waitlist when full and disables buttons once started', () => {
    const full = { ...workshop, registered: 30, waitlisted: 4 };
    expect(spotsField(buildWorkshopCard(full, { started: false }))).toContain('4 on the waitlist');
    const started = buildWorkshopCard(full, { started: true });
    expect(buttonsOf(started).every((b) => 'disabled' in b && b.disabled)).toBe(true);
  });

  it('adds a back button only on the private card', () => {
    const ids = (withBack: boolean) =>
      buttonsOf(buildWorkshopCard(workshop, { started: false, withBack })).map((b) =>
        'custom_id' in b ? b.custom_id : '',
      );
    expect(ids(true)).toContain('workshop:list');
    expect(ids(false)).not.toContain('workshop:list');
  });

  it('caps the list menu at 25 workshops', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...workshop, id: i + 1 }));
    const view = buildWorkshopList(many, {
      statuses: new Map(),
      verified: true,
      timeZone: 'America/Detroit',
    });
    const menu = view.components[0]?.toJSON().components[0];
    expect(menu && 'options' in menu && menu.options).toHaveLength(25);
  });
});
