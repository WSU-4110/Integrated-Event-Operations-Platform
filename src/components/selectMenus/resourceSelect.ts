import type { ComponentHandler } from '../../interactions/types.js';
import { buildResourcesView, RESOURCES_NAMESPACE } from '../embeds/resourceEmbeds.js';

/** The resource category picker: swaps the list shown in place. */
export const resourceSelect: ComponentHandler = {
  namespace: RESOURCES_NAMESPACE,

  async handle(interaction, customId, ctx) {
    if (customId.action !== 'select' || !interaction.isStringSelectMenu()) {
      throw new Error(`Unexpected resources component: ${interaction.customId}`);
    }
    await interaction.update(buildResourcesView(ctx.content.resources, interaction.values[0]));
  },
};
