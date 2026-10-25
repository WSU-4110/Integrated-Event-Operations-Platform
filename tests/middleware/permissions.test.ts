import { MessageFlags, type GuildMember } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  isOrganizer,
  memberRoleIds,
  ORGANIZER_ONLY_MESSAGE,
  requireOrganizer,
} from '../../src/middleware/permissions.js';
import { fakeConfig, fakeInteraction, fakeLogger, ORGANIZER_ROLE } from '../helpers/fakes.js';

const ctx = { config: fakeConfig(), logger: fakeLogger() };
const OTHER_ROLE = '100000000000000099';

describe('memberRoleIds', () => {
  it('reads raw API members (role ID arrays)', () => {
    expect(memberRoleIds({ roles: [ORGANIZER_ROLE] } as never)).toEqual([ORGANIZER_ROLE]);
  });

  it('reads cached GuildMembers (role managers)', () => {
    const member = { roles: { cache: new Map([[ORGANIZER_ROLE, {}]]) } } as unknown as GuildMember;
    expect(memberRoleIds(member)).toEqual([ORGANIZER_ROLE]);
  });

  it('treats a missing member as having no roles', () => {
    expect(memberRoleIds(null)).toEqual([]);
  });
});

describe('isOrganizer', () => {
  it('is true only for configured organizer roles', () => {
    expect(isOrganizer({ roles: [OTHER_ROLE, ORGANIZER_ROLE] } as never, ctx)).toBe(true);
    expect(isOrganizer({ roles: [OTHER_ROLE] } as never, ctx)).toBe(false);
  });
});

describe('requireOrganizer', () => {
  it('lets organizers through without replying', async () => {
    const interaction = fakeInteraction({ kind: 'command', roles: [ORGANIZER_ROLE] });
    await expect(requireOrganizer(interaction as never, ctx)).resolves.toBe(true);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('blocks everyone else with an ephemeral message', async () => {
    const interaction = fakeInteraction({ kind: 'command', roles: [OTHER_ROLE] });
    await expect(requireOrganizer(interaction as never, ctx)).resolves.toBe(false);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: ORGANIZER_ONLY_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
  });
});
