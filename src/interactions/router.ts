import {
  MessageFlags,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type RepliableInteraction,
} from 'discord.js';
import { parseCustomId } from '../utils/customId.js';
import { respondWithError } from './errors.js';
import type { BotContext, ComponentHandler, ComponentInteraction, SlashCommand } from './types.js';

export const STALE_COMMAND_MESSAGE = 'This command is no longer available.';
export const STALE_COMPONENT_MESSAGE = 'This button or menu is no longer active.';

/**
 * Sends each interaction to its command or component handler and catches
 * every error in one place.
 */
export class InteractionRouter {
  private readonly commands = new Map<string, SlashCommand>();
  private readonly components = new Map<string, ComponentHandler>();

  constructor(
    private readonly ctx: BotContext,
    commands: readonly SlashCommand[],
    components: readonly ComponentHandler[],
  ) {
    for (const command of commands) {
      if (this.commands.has(command.data.name)) {
        throw new Error(`Duplicate command: /${command.data.name}`);
      }
      this.commands.set(command.data.name, command);
    }
    for (const handler of components) {
      if (this.components.has(handler.namespace)) {
        throw new Error(`Duplicate component namespace: ${handler.namespace}`);
      }
      this.components.set(handler.namespace, handler);
    }
  }

  async handle(interaction: Interaction): Promise<void> {
    if (interaction.isChatInputCommand()) {
      await this.run(interaction, () => this.handleCommand(interaction));
    } else if (
      interaction.isButton() ||
      interaction.isAnySelectMenu() ||
      interaction.isModalSubmit()
    ) {
      await this.run(interaction, () => this.handleComponent(interaction));
    } else if (interaction.isAutocomplete()) {
      await this.handleAutocomplete(interaction);
    }
    // Context menus aren't used yet.
  }

  // Autocomplete can't show an error message, so failures just suggest nothing.
  private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);
    try {
      if (command?.autocomplete) await command.autocomplete(interaction, this.ctx);
      else await interaction.respond([]);
    } catch (err) {
      this.ctx.logger.error(
        { err, command: interaction.commandName, userId: interaction.user.id },
        'Autocomplete failed',
      );
      if (!interaction.responded) await interaction.respond([]).catch(() => {});
    }
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);
    if (!command) {
      this.ctx.logger.warn({ command: interaction.commandName }, 'Unknown command');
      await interaction.reply({ content: STALE_COMMAND_MESSAGE, flags: MessageFlags.Ephemeral });
      return;
    }

    // Log who ran what, never the arguments (they may contain PII).
    this.ctx.logger.info(
      { command: interaction.commandName, userId: interaction.user.id },
      'Command',
    );
    await command.execute(interaction, this.ctx);
  }

  private async handleComponent(interaction: ComponentInteraction): Promise<void> {
    const parsed = parseCustomId(interaction.customId);
    const handler = parsed && this.components.get(parsed.namespace);
    if (!parsed || !handler) {
      this.ctx.logger.warn({ customId: interaction.customId }, 'Unknown component');
      await interaction.reply({ content: STALE_COMPONENT_MESSAGE, flags: MessageFlags.Ephemeral });
      return;
    }

    this.ctx.logger.debug(
      { component: `${parsed.namespace}:${parsed.action}`, userId: interaction.user.id },
      'Component',
    );
    await handler.handle(interaction, parsed, this.ctx);
  }

  private async run(interaction: RepliableInteraction, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      await respondWithError(interaction, error, this.ctx.logger);
    }
  }
}
