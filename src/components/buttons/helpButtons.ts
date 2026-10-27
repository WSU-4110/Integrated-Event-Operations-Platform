import { MessageFlags } from 'discord.js';
import type { ComponentHandler, MessageView } from '../../interactions/types.js';
import { HELP_SECTIONS, type HelpSectionId } from '../../services/contentService.js';
import { buildFaqView } from '../embeds/faqEmbeds.js';
import { buildHelpMenu, buildHelpSection, HELP_NAMESPACE } from '../embeds/helpEmbeds.js';
import { buildResourcesView } from '../embeds/resourceEmbeds.js';
import { buildRulesView } from '../embeds/rulesEmbeds.js';
import { buildScheduleFor } from './scheduleButtons.js';

function isHelpSection(value: string | undefined): value is HelpSectionId {
  return (HELP_SECTIONS as readonly (string | undefined)[]).includes(value);
}

/** `help:show:<section>` buttons and the `help:menu` button. */
export const helpButtons: ComponentHandler = {
  namespace: HELP_NAMESPACE,

  async handle(interaction, customId, ctx) {
    const { content } = ctx;

    if (customId.action === 'menu') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const link = await ctx.services.verification.getLink(interaction.user.id);
      await interaction.editReply(buildHelpMenu(content.help, { verified: !!link?.active }));
      return;
    }

    const section = customId.args[0];
    if (customId.action !== 'show' || !isHelpSection(section)) {
      throw new Error(`Unexpected help button: ${interaction.customId}`);
    }

    let view: MessageView;
    switch (section) {
      case 'faq':
        view = buildFaqView(content.faqs);
        break;
      case 'resources':
        view = buildResourcesView(content.resources);
        break;
      case 'rules':
        view = buildRulesView(content.rules);
        break;
      case 'schedule':
        view = await buildScheduleFor(ctx);
        break;
      default:
        view = buildHelpSection(content.help, section);
    }

    // A new ephemeral reply, so the help menu stays usable.
    await interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
  },
};
