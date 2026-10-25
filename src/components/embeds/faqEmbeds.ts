import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { MessageView } from '../../interactions/types.js';
import type { Faq } from '../../services/contentService.js';
import { buildCustomId } from '../../utils/customId.js';
import { Colors } from './theme.js';

export const FAQ_NAMESPACE = 'faq';
export const FAQ_SELECT_ID = buildCustomId(FAQ_NAMESPACE, 'select');

/** The FAQ picker, showing the answer to `selectedId` if one is given. */
export function buildFaqView(faqs: readonly Faq[], selectedId?: string): MessageView {
  const selected = faqs.find((faq) => faq.id === selectedId);

  const embed = new EmbedBuilder().setColor(Colors.faq);
  if (selected) {
    embed.setTitle(`❓ ${selected.question}`).setDescription(selected.answer);
  } else {
    embed
      .setTitle('❓ Frequently Asked Questions')
      .setDescription('Pick a question from the menu below.');
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(FAQ_SELECT_ID)
    .setPlaceholder('Choose a question…')
    .addOptions(
      faqs.map((faq) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(faq.question)
          .setValue(faq.id)
          .setDefault(faq.id === selected?.id),
      ),
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)],
  };
}
