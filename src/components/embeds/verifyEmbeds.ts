import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { ParticipantLink, VerificationAttempt } from '../../database/schema/index.js';
import type { MessageView } from '../../interactions/types.js';
import type { RegistrationSummary } from '../../database/repositories/websiteRegistrationRepository.js';
import { buildCustomId } from '../../utils/customId.js';
import { discordTimestamp } from '../../utils/time.js';
import { helpButtonId, helpMenuButtonId } from './helpEmbeds.js';
import { Colors } from './theme.js';

export const VERIFY_NAMESPACE = 'verify';
export const VERIFY_START_ID = buildCustomId(VERIFY_NAMESPACE, 'start');
export const VERIFY_SUBMIT_ID = buildCustomId(VERIFY_NAMESPACE, 'submit');
export const EMAIL_INPUT_ID = 'email';

export const Messages = {
  noMatch: (registrationUrl: string) =>
    `We couldn't find a registration matching your Discord username and email. Make sure you registered at ${registrationUrl} using your current Discord username. If you changed your username, contact an organizer.`,
  ineligible: (status: string) =>
    `Your registration is currently **${status}**, so it can't be verified yet. If you think this is a mistake, contact an organizer.`,
  needsOrganizer:
    "We couldn't verify you automatically. An organizer has been notified and will sort it out. You don't need to do anything else.",
  rateLimited:
    'Too many verification attempts. Please wait an hour and try again, or ask an organizer for help.',
  invalidEmail: "That doesn't look like an email address. Run `/verify` again and check for typos.",
  inactive:
    'Your registration is no longer active on the website (for example, it was waitlisted or declined), so your Participant access is paused. Contact an organizer if this looks wrong.',
  notVerified: 'You need to verify your registration first. Run `/verify`.',
} as const;

const STATUS_LABELS: Record<string, string> = {
  pending: '🕓 Pending review',
  approved: '✅ Approved',
  waitlisted: '⏳ Waitlisted',
  declined: '❌ Declined',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function verifyButton(label = 'Verify'): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(VERIFY_START_ID)
    .setLabel(label)
    .setEmoji('✅')
    .setStyle(ButtonStyle.Success);
}

export function buildVerifyModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(VERIFY_SUBMIT_ID)
    .setTitle('Verify your registration')
    .addLabelComponents((label) =>
      label
        .setLabel('Email you registered with')
        .setDescription('Only used to find your registration. It is not stored.')
        .setTextInputComponent((input) =>
          input
            .setCustomId(EMAIL_INPUT_ID)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('you@school.edu')
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(254),
        ),
    );
}

export function buildVerifiedView(options: { roleAssigned: boolean }): MessageView {
  const embed = new EmbedBuilder()
    .setColor(Colors.success)
    .setTitle("✅ You're verified!")
    .setDescription(
      options.roleAssigned
        ? 'Welcome to BuilderWars. You now have the **Participant** role.'
        : "Welcome to BuilderWars. ⚠️ I couldn't give you the **Participant** role yet; an organizer has been notified.",
    );

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(helpButtonId('workshops'))
      .setLabel('Workshops')
      .setEmoji('🛠️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(helpButtonId('teams'))
      .setLabel('Teams')
      .setEmoji('👥')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(helpMenuButtonId())
      .setLabel('Help')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

export function buildAlreadyVerifiedMessage(link: ParticipantLink): string {
  return link.active
    ? "✅ You're already verified. Use `/profile` to see your registration."
    : Messages.inactive;
}

export function buildNotVerifiedView(message: string = Messages.notVerified): MessageView {
  return {
    embeds: [new EmbedBuilder().setColor(Colors.warning).setDescription(message)],
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(verifyButton()),
    ],
  };
}

export function buildProfileView(
  link: ParticipantLink,
  registration: RegistrationSummary | null,
): MessageView {
  const embed = new EmbedBuilder()
    .setColor(link.active ? Colors.brand : Colors.warning)
    .setTitle('👤 Your BuilderWars registration')
    .addFields(
      { name: 'Name', value: registration?.name ?? 'Not found on the website', inline: true },
      {
        name: 'Website status',
        value: registration ? statusLabel(registration.status) : '❔ Not found',
        inline: true,
      },
      {
        name: 'Discord access',
        value: link.active ? '✅ Active' : '⏸️ Paused',
        inline: true,
      },
      {
        name: 'Verified',
        value: `${discordTimestamp(link.linkedAt, 'R')}${link.linkedBy ? ' (by an organizer)' : ''}`,
        inline: true,
      },
      {
        name: 'Checked in',
        value:
          link.checkedIn && link.checkedInAt ? discordTimestamp(link.checkedInAt, 'R') : 'Not yet',
        inline: true,
      },
    )
    .setFooter({
      text: 'To change your details, update your registration on the website or contact an organizer.',
    });
  return { embeds: [embed], components: [] };
}

const RESULT_LABELS: Record<string, string> = {
  NO_MATCH: 'No match',
  INELIGIBLE: 'Not eligible',
  AMBIGUOUS: 'Several matches',
  ALREADY_LINKED: 'Registration already linked',
};

export function buildVerificationQueueView(attempts: readonly VerificationAttempt[]): MessageView {
  const embed = new EmbedBuilder().setColor(Colors.warning).setTitle('🧾 Verification queue');
  if (attempts.length === 0) {
    embed.setDescription('Nothing to review. 🎉');
  } else {
    embed
      .setDescription(
        attempts
          .map(
            (a) =>
              `${discordTimestamp(a.createdAt, 'R')} <@${a.discordUserId}> \`${a.discordUsername}\`: **${RESULT_LABELS[a.result] ?? a.result}**${a.registrationId ? ` (registration #${a.registrationId})` : ''}`,
          )
          .join('\n'),
      )
      .setFooter({
        text: 'Latest unresolved attempt per member. Resolve with /admin link; items clear when the member is linked.',
      });
  }
  return { embeds: [embed], components: [] };
}
