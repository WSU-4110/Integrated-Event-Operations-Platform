import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ContentError,
  DEFAULT_CONTENT_DIR,
  HELP_SECTIONS,
  loadContent,
} from '../../src/services/contentService.js';

const vars = { registrationUrl: 'https://builderwars.dev/#register' };

describe('shipped content', () => {
  it('loads and passes validation', async () => {
    const content = await loadContent({ vars });
    expect(content.faqs.length).toBeGreaterThan(0);
    expect(content.rules).toContain('Shipyard');
    expect(Object.keys(content.help.sections).sort()).toEqual([...HELP_SECTIONS].sort());
  });

  it('has every placeholder rendered', async () => {
    const all = JSON.stringify(await loadContent({ vars }));
    expect(all).not.toMatch(/\{t:/);
    expect(all).not.toMatch(/\{[A-Za-z]+\}/);
    expect(all).toContain('<t:');
    expect(all).toContain(vars.registrationUrl);
  });

  it('has at least one resource in every category', async () => {
    const { resources } = await loadContent({ vars });
    for (const category of resources.categories) {
      expect(
        resources.resources.some((r) => r.category === category.id),
        category.id,
      ).toBe(true);
    }
  });

  it('answers the FAQ questions the spec requires', async () => {
    const ids = (await loadContent({ vars })).faqs.map((f) => f.id);
    for (const id of [
      'what-is-builderwars',
      'team-size',
      'solo',
      'what-to-build',
      'ai',
      'technologies',
      'judging',
      'submit',
      'contact',
      'registered-but-blocked',
      'changed-username',
    ]) {
      expect(ids).toContain(id);
    }
  });
});

describe('content validation', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'bw-content-'));
    await cp(DEFAULT_CONTENT_DIR, dir, { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('rejects non-https resource URLs', async () => {
    await writeFile(
      join(dir, 'resources.json'),
      JSON.stringify({
        categories: [{ id: 'dev', label: 'Dev', emoji: '💻', description: 'Docs' }],
        resources: [{ category: 'dev', name: 'Bad', description: 'x', url: 'http://example.com' }],
      }),
    );
    await expect(loadContent({ dir, vars })).rejects.toThrow(/resources\.json.*https/s);
  });

  it('rejects resources in unknown categories', async () => {
    await writeFile(
      join(dir, 'resources.json'),
      JSON.stringify({
        categories: [{ id: 'dev', label: 'Dev', emoji: '💻', description: 'Docs' }],
        resources: [{ category: 'nope', name: 'X', description: 'x', url: 'https://example.com' }],
      }),
    );
    await expect(loadContent({ dir, vars })).rejects.toThrow(/unknown category "nope"/);
  });

  it('rejects more FAQs than a select menu can hold', async () => {
    const faqs = Array.from({ length: 26 }, (_, i) => ({
      id: `q${i}`,
      question: `Question ${i}?`,
      answer: 'Answer',
    }));
    await writeFile(join(dir, 'faq.json'), JSON.stringify(faqs));
    await expect(loadContent({ dir, vars })).rejects.toThrow(ContentError);
  });

  it('rejects FAQ questions longer than a select option label', async () => {
    await writeFile(
      join(dir, 'faq.json'),
      JSON.stringify([{ id: 'long', question: 'x'.repeat(101), answer: 'y' }]),
    );
    await expect(loadContent({ dir, vars })).rejects.toThrow(/faq\.json/);
  });

  it('rejects unknown placeholders and times without an offset', async () => {
    await writeFile(join(dir, 'rules.md'), 'See {typoUrl}');
    await expect(loadContent({ dir, vars })).rejects.toThrow(/unknown placeholder \{typoUrl\}/);

    await writeFile(join(dir, 'rules.md'), 'Starts {t:2026-11-14T12:00:00}');
    await expect(loadContent({ dir, vars })).rejects.toThrow(/rules\.md.*offset/);
  });

  it('rejects rules too long for one Discord message', async () => {
    await writeFile(join(dir, 'rules.md'), 'x'.repeat(6000));
    await expect(loadContent({ dir, vars })).rejects.toThrow(/rules\.md is 6000 characters/);
  });

  it('reports malformed JSON with the file name', async () => {
    await writeFile(join(dir, 'help.json'), '{ not json');
    await expect(loadContent({ dir, vars })).rejects.toThrow(/help\.json: could not read or parse/);
  });
});
