import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { MessageView } from '../../interactions/types.js';
import {
  HELP_SECTIONS,
  type HelpContent,
  type HelpSectionId,
} from '../../services/contentService.js';
import { buildCustomId } from '../../utils/customId.js';
import { BUTTONS_PER_ROW, Colors } from './theme.js';
import { VERIFY_START_ID } from './verifyEmbeds.js';

export const HELP_NAMESPACE = 'help';

export function helpButtonId(section: HelpSectionId): string {
  return buildCustomId(HELP_NAMESPACE, 'show', section);
}

export function helpMenuButtonId(): string {
  return buildCustomId(HELP_NAMESPACE, 'menu');
}

export function buildHelpMenu(help: HelpContent, options: { verified: boolean }): MessageView {
  const description = options.verified ? help.intro : `${help.intro}\n\n${help.unverifiedNotice}`;

  const embed = new EmbedBuilder()
    .setColor(Colors.brand)
    .setTitle(help.title)
    .setDescription(description)
    .setFooter({ text: help.footer });

  const buttons = HELP_SECTIONS.map((id) => {
    const section = help.sections[id];
    // Unverified users see Verify highlighted: it's the first thing they need.
    const style =
      id === 'verify' && !options.verified ? ButtonStyle.Success : ButtonStyle.Secondary;
    return (
      new ButtonBuilder()
        // Verify opens the verification form directly instead of a help page.
        .setCustomId(id === 'verify' ? VERIFY_START_ID : helpButtonId(id))
        .setLabel(section.label)
        .setEmoji(section.emoji)
        .setStyle(style)
    );
  });

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        buttons.slice(i, i + BUTTONS_PER_ROW),
      ),
    );
  }

  return { embeds: [embed], components };
}

export function buildHelpSection(help: HelpContent, id: HelpSectionId): MessageView {
  const section = help.sections[id];
  const embed = new EmbedBuilder()
    .setColor(Colors.brand)
    .setTitle(`${section.emoji} ${section.title}`)
    .setDescription(section.body)
    .setFooter({ text: help.footer });
  return { embeds: [embed], components: [] };
}
