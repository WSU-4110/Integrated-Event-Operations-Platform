import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { MessageView } from '../../interactions/types.js';
import type { ResourcesContent } from '../../services/contentService.js';
import { buildCustomId } from '../../utils/customId.js';
import { Colors } from './theme.js';

export const RESOURCES_NAMESPACE = 'resources';
export const RESOURCES_SELECT_ID = buildCustomId(RESOURCES_NAMESPACE, 'select');

/** The category picker, listing the resources in `categoryId` if one is given. */
export function buildResourcesView(content: ResourcesContent, categoryId?: string): MessageView {
  const category = content.categories.find((c) => c.id === categoryId);

  const embed = new EmbedBuilder().setColor(Colors.resources);
  if (category) {
    const items = content.resources.filter((r) => r.category === category.id);
    embed
      .setTitle(`${category.emoji} ${category.label}`)
      .setDescription(
        items.length > 0
          ? items.map((r) => `**[${r.name}](${r.url})**\n${r.description}`).join('\n\n')
          : 'Nothing here yet.',
      );
  } else {
    embed
      .setTitle('📚 Resources')
      .setDescription(
        content.categories.map((c) => `${c.emoji} **${c.label}**: ${c.description}`).join('\n'),
      );
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(RESOURCES_SELECT_ID)
    .setPlaceholder('Choose a category…')
    .addOptions(
      content.categories.map((c) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.label)
          .setValue(c.id)
          .setEmoji(c.emoji)
          .setDescription(c.description)
          .setDefault(c.id === category?.id),
      ),
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)],
  };
}
