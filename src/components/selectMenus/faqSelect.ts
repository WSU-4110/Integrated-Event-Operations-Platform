import type { ComponentHandler } from '../../interactions/types.js';
import { buildFaqView, FAQ_NAMESPACE } from '../embeds/faqEmbeds.js';

/** The FAQ question picker: swaps the answer shown in place. */
export const faqSelect: ComponentHandler = {
  namespace: FAQ_NAMESPACE,

  async handle(interaction, customId, ctx) {
    if (customId.action !== 'select' || !interaction.isStringSelectMenu()) {
      throw new Error(`Unexpected FAQ component: ${interaction.customId}`);
    }
    // If the question was removed since the menu was sent, the view falls back to the picker.
    await interaction.update(buildFaqView(ctx.content.faqs, interaction.values[0]));
  },
};
