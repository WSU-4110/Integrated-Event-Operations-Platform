import { MessageFlags, type ButtonInteraction, type ModalSubmitInteraction } from 'discord.js';
import type { AnnouncementInput } from '../../database/repositories/announcementRepository.js';
import { ANNOUNCEMENT_TYPES, type AnnouncementType } from '../../database/schema/index.js';
import { UserFacingError } from '../../interactions/errors.js';
import type { BotContext, ComponentHandler } from '../../interactions/types.js';
import { requireOrganizer } from '../../middleware/permissions.js';
import { canPingParticipants, publishAnnouncement } from '../../services/announcementDelivery.js';
import { parseEventTime } from '../../utils/time.js';
import {
  ANNOUNCE_NAMESPACE,
  AnnounceFields,
  AnnouncementMessages,
  buildAnnouncementEmbed,
  buildAnnouncementModal,
  buildAnnouncementPreview,
} from '../embeds/announcementEmbeds.js';

const cleared = { embeds: [], components: [] };

function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Bad announcement ID: ${raw}`);
  return id;
}

function isAnnouncementType(value: string | undefined): value is AnnouncementType {
  return (ANNOUNCEMENT_TYPES as readonly (string | undefined)[]).includes(value);
}

/**
 * Reads the form. A send time that can't be used doesn't throw (that would
 * lose what the organizer typed); it comes back as `problem`, and the
 * preview blocks sending until it's fixed.
 */
function readForm(
  interaction: ModalSubmitInteraction,
  ctx: BotContext,
): { input: AnnouncementInput; problem?: string } {
  const { fields } = interaction;
  const title = fields.getTextInputValue(AnnounceFields.title).trim();
  const body = fields.getTextInputValue(AnnounceFields.body).trim();
  if (!title || !body) throw new UserFacingError("The title and message can't be blank.");

  const [type] = fields.getStringSelectValues(AnnounceFields.type);
  const [ping] = fields.getStringSelectValues(AnnounceFields.ping);
  const input: AnnouncementInput = {
    title,
    body,
    type: isAnnouncementType(type) ? type : 'GENERAL',
    pingParticipants: ping === 'yes',
    scheduledFor: null,
  };

  const sendAt = fields.getTextInputValue(AnnounceFields.sendAt).trim();
  if (!sendAt) return { input };
  const scheduledFor = parseEventTime(sendAt, ctx.config.eventTimeZone);
  if (!scheduledFor) {
    return { input, problem: AnnouncementMessages.badTime(sendAt, ctx.config.eventTimeZone) };
  }
  input.scheduledFor = scheduledFor;
  if (scheduledFor.getTime() <= ctx.services.announcements.now().getTime()) {
    return { input, problem: AnnouncementMessages.pastTime };
  }
  return { input };
}

/** The form was submitted: save the draft and show the preview. */
async function submit(
  interaction: ModalSubmitInteraction,
  draftId: number | undefined,
  ctx: BotContext,
): Promise<void> {
  if (!interaction.inCachedGuild()) throw new UserFacingError('Use this inside the server.');
  const channelId = ctx.config.channels.announcementId;
  if (!channelId) throw new UserFacingError(AnnouncementMessages.notConfigured);

  // Editing replaces the preview the Edit button was on.
  if (draftId !== undefined && interaction.isFromMessage()) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { input, problem } = readForm(interaction, ctx);
  const { announcements } = ctx.services;
  const announcement =
    draftId === undefined
      ? await announcements.createDraft({ ...input, createdBy: interaction.user.id })
      : await announcements.updateDraft(draftId, input);

  if (!announcement) {
    const current = draftId === undefined ? null : await announcements.get(draftId);
    await interaction.editReply({
      content: current
        ? AnnouncementMessages.alreadyHandled(current.status)
        : AnnouncementMessages.notFound,
      ...cleared,
    });
    return;
  }

  ctx.logger.info(
    { organizerId: interaction.user.id, announcementId: announcement.id, edited: !!draftId },
    'Announcement drafted',
  );
  await interaction.editReply(
    buildAnnouncementPreview(announcement, {
      channelId,
      canPing: canPingParticipants(interaction.guild, ctx),
      problem,
    }),
  );
}

/** Send now / Schedule. */
async function send(interaction: ButtonInteraction, id: number, ctx: BotContext): Promise<void> {
  await interaction.deferUpdate();
  const { announcements } = ctx.services;

  const draft = await announcements.get(id);
  if (
    draft?.status === 'DRAFT' &&
    draft.scheduledFor &&
    draft.scheduledFor.getTime() <= announcements.now().getTime()
  ) {
    throw new UserFacingError(
      `${AnnouncementMessages.pastTime} Press **Edit** to pick a new time.`,
    );
  }

  const outcome = await announcements.confirm(id);
  switch (outcome.kind) {
    case 'not_found':
      await interaction.editReply({ content: AnnouncementMessages.notFound, ...cleared });
      return;
    case 'not_draft':
      await interaction.editReply({
        content: AnnouncementMessages.alreadyHandled(outcome.announcement.status),
        ...cleared,
      });
      return;
    case 'scheduled':
      ctx.logger.info(
        { organizerId: interaction.user.id, announcementId: id },
        'Announcement scheduled',
      );
      await interaction.editReply({
        content: AnnouncementMessages.scheduled(outcome.announcement),
        embeds: [buildAnnouncementEmbed(outcome.announcement)],
        components: [],
      });
      return;
    case 'send_now': {
      const result = await publishAnnouncement(interaction.client, ctx, outcome.announcement);
      await interaction.editReply({
        content: result.ok
          ? AnnouncementMessages.sent(result.url)
          : AnnouncementMessages.failed(result.reason),
        // Kept on failure so the text can be copied into a new one.
        embeds: [buildAnnouncementEmbed(outcome.announcement)],
        components: [],
      });
      return;
    }
  }
}

async function edit(interaction: ButtonInteraction, id: number, ctx: BotContext): Promise<void> {
  const draft = await ctx.services.announcements.get(id);
  if (draft?.status !== 'DRAFT') {
    await interaction.update({
      content: draft
        ? AnnouncementMessages.alreadyHandled(draft.status)
        : AnnouncementMessages.notFound,
      ...cleared,
    });
    return;
  }
  await interaction.showModal(
    buildAnnouncementModal({ timeZone: ctx.config.eventTimeZone, draft }),
  );
}

async function discard(interaction: ButtonInteraction, id: number, ctx: BotContext): Promise<void> {
  await interaction.deferUpdate();
  const { announcements } = ctx.services;
  if (await announcements.discard(id)) {
    ctx.logger.info(
      { organizerId: interaction.user.id, announcementId: id },
      'Announcement discarded',
    );
    await interaction.editReply({ content: AnnouncementMessages.discarded, ...cleared });
    return;
  }
  const current = await announcements.get(id);
  await interaction.editReply({
    content: current
      ? AnnouncementMessages.alreadyHandled(current.status)
      : AnnouncementMessages.notFound,
    ...cleared,
  });
}

/**
 * The /announce form (`announce:submit[:<id>]`) and the preview's
 * `announce:send|edit|discard:<id>` buttons. Every step re-checks that the
 * user is an organizer.
 */
export const announceHandler: ComponentHandler = {
  namespace: ANNOUNCE_NAMESPACE,

  async handle(interaction, customId, ctx) {
    if (!(await requireOrganizer(interaction, ctx))) return;
    const { action, args } = customId;

    if (action === 'submit' && interaction.isModalSubmit()) {
      return submit(interaction, args[0] === undefined ? undefined : parseId(args[0]), ctx);
    }
    if (interaction.isButton()) {
      const id = parseId(args[0]);
      if (action === 'send') return send(interaction, id, ctx);
      if (action === 'edit') return edit(interaction, id, ctx);
      if (action === 'discard') return discard(interaction, id, ctx);
    }
    throw new Error(`Unexpected announce component: ${interaction.customId}`);
  },
};
