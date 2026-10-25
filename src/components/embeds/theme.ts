// One color per category so embeds are recognizable at a glance.
export const Colors = {
  brand: 0xa78bfa, // BuilderWars purple (matches the website accent)
  faq: 0x38bdf8,
  resources: 0x34d399,
  rules: 0xf59e0b,
  success: 0x57f287,
  warning: 0xfee75c,
  danger: 0xed4245,
} as const;

export const EMBED_DESCRIPTION_LIMIT = 4096;
export const EMBEDS_PER_MESSAGE = 10;
export const BUTTONS_PER_ROW = 5;
