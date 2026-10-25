import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { renderTimePlaceholders } from '../utils/time.js';

// Static content (rules, FAQ, resources, help text) lives in
// src/config/content/ so organizers can edit it without touching code.
// It is validated against Discord's limits when the bot starts.

export const DEFAULT_CONTENT_DIR = fileURLToPath(new URL('../config/content/', import.meta.url));

// All embeds in one message share a 6000-character budget; leave room for the title.
export const RULES_MAX_LENGTH = 5800;

export const HELP_SECTIONS = [
  'verify',
  'schedule',
  'workshops',
  'teams',
  'resources',
  'faq',
  'mentor',
  'submission',
  'rules',
] as const;
export type HelpSectionId = (typeof HELP_SECTIONS)[number];

const httpsUrl = z.url({ protocol: /^https$/, error: 'must be an https:// URL' });
const slug = z.string().regex(/^[a-z0-9-]{1,50}$/, 'must be lowercase letters, digits or dashes');

const faqSchema = z
  .array(
    z.object({
      id: slug,
      question: z.string().min(1).max(100), // select menu option label limit
      answer: z.string().min(1).max(4000),
    }),
  )
  .min(1)
  .max(25) // select menu option limit
  .refine((faqs) => new Set(faqs.map((f) => f.id)).size === faqs.length, 'FAQ ids must be unique');

const resourcesSchema = z
  .object({
    categories: z
      .array(
        z.object({
          id: slug,
          label: z.string().min(1).max(100),
          emoji: z.string().min(1),
          description: z.string().min(1).max(100),
        }),
      )
      .min(1)
      .max(25),
    resources: z.array(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().min(1).max(200),
        url: httpsUrl,
        category: slug,
      }),
    ),
  })
  .superRefine((data, ctx) => {
    const ids = new Set(data.categories.map((c) => c.id));
    if (ids.size !== data.categories.length) {
      ctx.addIssue({ code: 'custom', message: 'category ids must be unique' });
    }
    data.resources.forEach((r, i) => {
      if (!ids.has(r.category)) {
        ctx.addIssue({
          code: 'custom',
          path: ['resources', i, 'category'],
          message: `unknown category "${r.category}"`,
        });
      }
    });
  });

const helpSectionSchema = z.object({
  label: z.string().min(1).max(80), // button label limit
  emoji: z.string().min(1),
  title: z.string().min(1).max(256),
  body: z.string().min(1).max(4000),
});

const helpSchema = z.object({
  title: z.string().min(1).max(256),
  intro: z.string().min(1).max(2000),
  unverifiedNotice: z.string().min(1).max(1000),
  footer: z.string().min(1).max(2048),
  sections: z.record(z.enum(HELP_SECTIONS), helpSectionSchema),
});

export type Faq = z.infer<typeof faqSchema>[number];
export type ResourcesContent = z.infer<typeof resourcesSchema>;
export type ResourceCategory = ResourcesContent['categories'][number];
export type HelpContent = z.infer<typeof helpSchema>;

export interface Content {
  rules: string;
  faqs: Faq[];
  resources: ResourcesContent;
  help: HelpContent;
}

export class ContentError extends Error {
  override name = 'ContentError';
}

/** Values substituted for `{name}` placeholders, e.g. `{registrationUrl}`. */
export type ContentVars = Record<string, string>;

function fillVars(text: string, vars: ContentVars, file: string): string {
  return text.replace(/\{([A-Za-z]+)\}/g, (_match, name: string) => {
    const value = vars[name];
    if (value === undefined) throw new ContentError(`${file}: unknown placeholder {${name}}`);
    return value;
  });
}

function renderText(text: string, vars: ContentVars, file: string): string {
  try {
    return renderTimePlaceholders(fillVars(text, vars, file));
  } catch (err) {
    if (err instanceof ContentError) throw err;
    throw new ContentError(`${file}: ${(err as Error).message}`);
  }
}

// Applies placeholders to every string in a parsed JSON value.
function renderDeep(value: unknown, vars: ContentVars, file: string): unknown {
  if (typeof value === 'string') return renderText(value, vars, file);
  if (Array.isArray(value)) return value.map((v) => renderDeep(v, vars, file));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, renderDeep(v, vars, file)]),
    );
  }
  return value;
}

async function readJson<T>(dir: string, file: string, schema: z.ZodType<T>, vars: ContentVars) {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(dir, file), 'utf8'));
  } catch (err) {
    throw new ContentError(`${file}: could not read or parse (${(err as Error).message})`);
  }
  const result = schema.safeParse(renderDeep(raw, vars, file));
  if (!result.success) {
    throw new ContentError(`${file} is invalid:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export async function loadContent(
  options: { dir?: string; vars?: ContentVars } = {},
): Promise<Content> {
  const dir = options.dir ?? DEFAULT_CONTENT_DIR;
  const vars = options.vars ?? {};

  let rules: string;
  try {
    rules = (await readFile(join(dir, 'rules.md'), 'utf8')).trim();
  } catch (err) {
    throw new ContentError(`rules.md: could not read (${(err as Error).message})`);
  }
  if (!rules) throw new ContentError('rules.md is empty');
  rules = renderText(rules, vars, 'rules.md');
  if (rules.length > RULES_MAX_LENGTH) {
    throw new ContentError(
      `rules.md is ${rules.length} characters; the limit is ${RULES_MAX_LENGTH} (Discord allows 6000 per message)`,
    );
  }

  return {
    rules,
    faqs: await readJson(dir, 'faq.json', faqSchema, vars),
    resources: await readJson(dir, 'resources.json', resourcesSchema, vars),
    help: await readJson(dir, 'help.json', helpSchema, vars),
  };
}
