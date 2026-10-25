import {
  MessageFlags,
  type APIInteractionGuildMember,
  type GuildMember,
  type RepliableInteraction,
} from 'discord.js';
import type { BotContext } from '../interactions/types.js';

export const ORGANIZER_ONLY_MESSAGE = '🔒 This is for organizers only.';

type Member = GuildMember | APIInteractionGuildMember | null;

/** Role IDs of an interaction member, whether discord.js cached it or not. */
export function memberRoleIds(member: Member): string[] {
  if (!member) return [];
  return Array.isArray(member.roles) ? member.roles : [...member.roles.cache.keys()];
}

export function hasAnyRole(member: Member, roleIds: readonly string[]): boolean {
  const held = new Set(memberRoleIds(member));
  return roleIds.some((id) => held.has(id));
}

export function isOrganizer(member: Member, ctx: Pick<BotContext, 'config'>): boolean {
  return hasAnyRole(member, ctx.config.roles.organizerRoleIds);
}

/**
 * Server-side organizer check. Organizer commands also set
 * default_member_permissions to hide them in the UI, but this is the real gate.
 * Replies and returns false if the user isn't an organizer.
 */
export async function requireOrganizer(
  interaction: RepliableInteraction,
  ctx: Pick<BotContext, 'config' | 'logger'>,
): Promise<boolean> {
  if (interaction.inGuild() && isOrganizer(interaction.member, ctx)) return true;

  ctx.logger.warn({ userId: interaction.user.id }, 'Organizer check failed');
  await interaction.reply({ content: ORGANIZER_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
  return false;
}
