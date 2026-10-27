import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  AnnouncementMessages,
  buildAnnouncementModal,
} from '../../components/embeds/announcementEmbeds.js';
import { UserFacingError } from '../../interactions/errors.js';
import type { SlashCommand } from '../../interactions/types.js';
import { requireOrganizer } from '../../middleware/permissions.js';

// Opens the form; the preview and sending live in components/modals/announceModal.ts.
export const announceCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post an announcement now or later (you see a preview first)')
    .setContexts(InteractionContextType.Guild)
    // Hides the command from regular members; requireOrganizer is the real check.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, ctx) {
    if (!(await requireOrganizer(interaction, ctx))) return;
    if (!ctx.config.channels.announcementId) {
      throw new UserFacingError(AnnouncementMessages.notConfigured);
    }
    // A modal must be the first response, so nothing slow happens before it.
    await interaction.showModal(buildAnnouncementModal({ timeZone: ctx.config.eventTimeZone }));
  },
};
