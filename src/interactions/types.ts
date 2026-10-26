import type {
  ActionRowBuilder,
  AnySelectMenuInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageActionRowComponentBuilder,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { Config } from '../config/env.js';
import type { Content } from '../services/contentService.js';
import type { VerificationService } from '../services/verificationService.js';
import type { WorkshopService } from '../services/workshopService.js';
import type { ParsedCustomId } from '../utils/customId.js';
import type { Logger } from '../utils/logger.js';

export interface Services {
  verification: VerificationService;
  workshops: WorkshopService;
}

/** Everything a handler needs, passed in so handlers stay testable. */
export interface BotContext {
  config: Config;
  logger: Logger;
  content: Content;
  services: Services;
}

export interface SlashCommand {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  execute(interaction: ChatInputCommandInteraction, ctx: BotContext): Promise<void>;
  /** Suggestions for options declared with setAutocomplete(true). */
  autocomplete?(interaction: AutocompleteInteraction, ctx: BotContext): Promise<void>;
}

export type ComponentInteraction =
  ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

/** Handles every button/select/modal whose custom ID starts with `namespace:`. */
export interface ComponentHandler {
  namespace: string;
  handle(
    interaction: ComponentInteraction,
    customId: ParsedCustomId,
    ctx: BotContext,
  ): Promise<void>;
}

/** A message body built by the view helpers in components/embeds. */
export interface MessageView {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}
