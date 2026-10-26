import { randomBytes } from 'node:crypto';
import { DiscordAPIError, MessageFlags, type RepliableInteraction } from 'discord.js';
import type { Logger } from '../utils/logger.js';

export const GENERIC_ERROR_MESSAGE =
  '❌ Something went wrong. Please try again or contact an organizer.';

/**
 * An expected failure with a message that is safe to show the user as-is
 * ("You're already on a team"). Anything else is treated as a bug.
 */
export class UserFacingError extends Error {
  override name = 'UserFacingError';
}

// The interaction can no longer be answered, so there's no point trying.
const UNANSWERABLE_CODES = new Set([
  10062, // Unknown interaction (the 3-second window expired)
  40060, // Interaction has already been acknowledged
]);

export function newErrorId(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

export function describeInteraction(interaction: RepliableInteraction) {
  return {
    type: interaction.type,
    command: interaction.isCommand() ? interaction.commandName : undefined,
    customId: 'customId' in interaction ? interaction.customId : undefined,
    userId: interaction.user.id,
    guildId: interaction.guildId,
  };
}

async function sendEphemeral(interaction: RepliableInteraction, content: string): Promise<void> {
  // After deferUpdate() (ephemeral stays null), editReply would overwrite the
  // message the button is on, such as a public workshop card.
  const deferredUpdate = interaction.deferred && interaction.ephemeral === null;
  if (interaction.deferred && !interaction.replied && !deferredUpdate) {
    await interaction.editReply({ content, embeds: [], components: [] });
  } else if (interaction.replied || deferredUpdate) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

/**
 * Logs the real error with an error ID and tells the user something friendly.
 * Stack traces and database errors never reach Discord.
 */
export async function respondWithError(
  interaction: RepliableInteraction,
  error: unknown,
  logger: Logger,
): Promise<void> {
  if (error instanceof UserFacingError) {
    logger.info(
      { interaction: describeInteraction(interaction), reason: error.message },
      'Refused',
    );
    await sendEphemeral(interaction, `❌ ${error.message}`).catch((err: unknown) =>
      logger.warn({ err }, 'Could not send refusal message'),
    );
    return;
  }

  const errorId = newErrorId();
  logger.error(
    { err: error, errorId, interaction: describeInteraction(interaction) },
    'Interaction failed',
  );

  if (error instanceof DiscordAPIError && UNANSWERABLE_CODES.has(Number(error.code))) return;

  try {
    await sendEphemeral(interaction, `${GENERIC_ERROR_MESSAGE}\nError ID: \`${errorId}\``);
  } catch (err) {
    logger.warn({ err, errorId }, 'Could not send error message to user');
  }
}
