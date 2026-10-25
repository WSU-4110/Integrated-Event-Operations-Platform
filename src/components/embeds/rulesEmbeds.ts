import { EmbedBuilder } from 'discord.js';
import type { MessageView } from '../../interactions/types.js';
import { Colors, EMBED_DESCRIPTION_LIMIT, EMBEDS_PER_MESSAGE } from './theme.js';

/**
 * Splits text into chunks that fit an embed description, breaking between
 * paragraphs, then lines, and only mid-line as a last resort.
 */
export function splitForEmbeds(text: string, max = EMBED_DESCRIPTION_LIMIT): string[] {
  const chunks: string[] = [];
  let current = '';

  const push = (piece: string, separator: string) => {
    if (!current) current = piece;
    else if (current.length + separator.length + piece.length <= max) current += separator + piece;
    else {
      chunks.push(current);
      current = piece;
    }
  };

  for (const paragraph of text.split(/\n{2,}/)) {
    if (paragraph.length <= max) {
      push(paragraph, '\n\n');
      continue;
    }
    let separator = '\n\n';
    for (const line of paragraph.split('\n')) {
      for (let i = 0; i < line.length; i += max) {
        push(line.slice(i, i + max), separator);
        separator = '\n';
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function buildRulesView(rules: string): MessageView {
  const chunks = splitForEmbeds(rules).slice(0, EMBEDS_PER_MESSAGE);
  const embeds = chunks.map((chunk, i) => {
    const embed = new EmbedBuilder().setColor(Colors.rules).setDescription(chunk);
    if (i === 0) embed.setTitle('📜 Official Hackathon Rules');
    return embed;
  });
  return { embeds, components: [] };
}
