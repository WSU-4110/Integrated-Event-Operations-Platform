
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type {
  ParticipantLink,
  VerificationAttempt,
} from '../../database/schema/index.js';
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

/**
 * FR-08: Safe verification failures and recovery.
 *
 * Failed verification messages must not disclose whether
 * a particular registration exists, its status, or whether
 * it belongs to another Discord account.
 *
 * Five failed attempts within 15 minutes trigger a
 * 15-minute lockout.
 */
export const Messages = {
  noMatch: (registrationUrl: string) =>
    `We couldn't verify your registration using the information provided. ` +
    `Please check your Discord username and registration email, then try again.\n\n` +
    `If you haven't registered, visit ${registrationUrl}.\n\n` +
    `If your information is correct or you need a replacement verification code, ` +
    `contact an event organizer through the official support process.`,

  ineligible: (_status: string) =>
    `We couldn't verify your registration automatically.\n\n` +
    `Please check your registration information and contact an event organizer ` +
    `if you believe you should have access. For your privacy, registration ` +
    `details cannot be provided through this verification message.`,

  needsOrganizer:
    `We couldn't complete your verification automatically.\n\n` +
    `Please contact an event organizer through the official support process. ` +
    `An organizer can review your request and help you recover access ` +
    `without exposing another participant's registration information.`,

  rateLimited:
    `You've reached the verification attempt limit.\n\n` +
    `For security, five failed attempts within 15 minutes temporarily ` +
    `block further verification attempts for 15 minutes.\n\n` +
    `Please wait until the lockout expires before trying again. ` +
    `If you still need help, contact an event organizer.`,

  invalidEmail:
    `That doesn't look like a valid email address.\n\n` +
    `Run \`/verify\` again and enter the email address you used ` +
    `when registering. Check for typing mistakes before submitting.`,

  inactive:
    `Your BuilderWars Participant access is currently paused.\n\n` +
    `If you believe this is incorrect, contact an event organizer ` +
    `through the official support process.`,

  notVerified:
    `You need to verify your BuilderWars registration first. ` +
    `Run \`/verify\` to begin.`,

  invalidCode:
    `We couldn't verify that code.\n\n` +
    `The code may be incorrect, expired, or already used. ` +
    `Please check the code and try again if it is still valid.\n\n` +
    `If the code has expired or was already used, contact an ` +
    `event organizer through the official support process ` +
    `to request a replacement.`,

  expiredCode:
    `We couldn't verify that code.\n\n` +
    `Please contact an event organizer through the official ` +
    `support process to request a replacement verification code.`,

  usedCode:
    `We couldn't verify that code.\n\n` +
    `If you need another verification code, contact an ` +
    `event organizer through the official support process.`,

  temporaryError:
    `Verification is temporarily unavailable because of a ` +
    `system error.\n\n` +
    `Please wait a few minutes and try again. ` +
    `If the problem continues, contact an event organizer.`,

  emailDeliveryFailed:
    `We couldn't confirm that the verification email was sent.\n\n` +
    `Please try again later or contact an event organizer ` +
    `through the official support process. ` +
    `No successful email delivery has been confirmed.`,

  replacementCode:
    `If your verification code is missing, expired, or already ` +
    `used, contact an event organizer through the official ` +
    `support process to request a replacement.\n\n` +
    `Replacement requests must be reviewed before a new code ` +
    `is issued. Never share your verification code publicly.`,
} as const;

const STATUS_LABELS: Record<string, string> = {
  pending: '✅ Registered',
  approved: '✅ Registered',
  waitlisted: '🚫 Removed from the event',
  declined: '🚫 Removed from the event',
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
        .setDescription(
          'Only used to find your registration. It is not stored.',
        )
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

export function buildVerifiedView(options: {
  roleAssigned: boolean;
}): MessageView {
  const embed = new EmbedBuilder()
    .setColor(Colors.success)
    .setTitle("✅ You're verified!")
    .setDescription(
      options.roleAssigned
        ? 'Welcome to BuilderWars. You now have the **Participant** role.'
        : "Welcome to BuilderWars. ⚠️ I couldn't give you the **Participant** role yet; an organizer has been notified.",
    );

  const row =
    new ActionRowBuilder<MessageActionRowComponentBuilder>()
      .addComponents(
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

  return {
    embeds: [embed],
    components: [row],
  };
}

export function buildAlreadyVerifiedMessage(
  link: ParticipantLink,
): string {
  return link.active
    ? "✅ You're already verified. Use `/profile` to see your registration."
    : Messages.inactive;
}

export function buildNotVerifiedView(
  message: string = Messages.notVerified,
): MessageView {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.warning)
        .setDescription(message),
    ],
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>()
        .addComponents(verifyButton()),
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
      {
        name: 'Name',
        value: registration?.name ?? 'Not found on the website',
        inline: true,
      },
      {
        name: 'Website status',
        value: registration
          ? statusLabel(registration.status)
          : '❔ Not found',
        inline: true,
      },
      {
        name: 'Discord access',
        value: link.active ? '✅ Active' : '⏸️ Paused',
        inline: true,
      },
      {
        name: 'Verified',
        value:
          `${discordTimestamp(link.linkedAt, 'R')}` +
          `${link.linkedBy ? ' (by an organizer)' : ''}`,
        inline: true,
      },
      {
        name: 'Checked in',
        value:
          link.checkedIn && link.checkedInAt
            ? discordTimestamp(link.checkedInAt, 'R')
            : 'Not yet',
        inline: true,
      },
    )
    .setFooter({
      text:
        'To change your details, update your registration ' +
        'on the website or contact an organizer.',
    });

  return {
    embeds: [embed],
    components: [],
  };
}

const RESULT_LABELS: Record<string, string> = {
  NO_MATCH: 'No match',
  INELIGIBLE: 'Not eligible',
  AMBIGUOUS: 'Several matches',
  ALREADY_LINKED: 'Registration already linked',
  RATE_LIMITED: 'Rate limited',
};

export function buildVerificationQueueView(
  attempts: readonly VerificationAttempt[],
): MessageView {
  const embed = new EmbedBuilder()
    .setColor(Colors.warning)
    .setTitle('🧾 Verification queue');

  if (attempts.length === 0) {
    embed.setDescription('Nothing to review. 🎉');
  } else {
    embed
      .setDescription(
        attempts
          .map(
            (a) =>
              `${discordTimestamp(a.createdAt, 'R')} ` +
              `<@${a.discordUserId}> ` +
              `\`${a.discordUsername}\`: ` +
              `**${RESULT_LABELS[a.result] ?? a.result}**` +
              `${a.registrationId ? ` (registration #${a.registrationId})` : ''}`,
          )
          .join('\n'),
      )
      .setFooter({
        text:
          'Latest unresolved attempt per member. ' +
          'Resolve with /admin link; items clear when ' +
          'the member is linked.',
      });
  }

  return {
    embeds: [embed],
    components: [],
  };
}
