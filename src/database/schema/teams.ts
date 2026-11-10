import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { discordBot } from './discordBot.js';
import { participantLinks } from './participantLinks.js';

// The website has no team tables, so the bot owns teams (organizer decision,
// 2026-10-25). Participants are referenced through participant_links; no
// names or emails are stored here.

export const TEAM_NAME_UNIQUE = 'teams_name_lower_unique';
export const TEAM_MEMBER_UNIQUE = 'team_members_participant_link_unique';
export const TEAM_PENDING_UNIQUE = 'team_join_requests_pending_unique';

export const teams = discordBot.table(
  'teams',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    skillsNeeded: text('skills_needed')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // RESTRICT: ownership must be handed over before a link can be deleted.
    ownerLinkId: integer('owner_link_id')
      .notNull()
      .references(() => participantLinks.id, { onDelete: 'restrict' }),
    // Set only when TEAM_CHANNELS_ENABLED is on.
    discordRoleId: text('discord_role_id'),
    discordChannelId: text('discord_channel_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Case-insensitive, so "Neural Ninjas" and "neural ninjas" can't both exist.
  (t) => [uniqueIndex(TEAM_NAME_UNIQUE).on(sql`lower(${t.name})`)],
);

export type Team = typeof teams.$inferSelect;

export const teamMembers = discordBot.table(
  'team_members',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    participantLinkId: integer('participant_link_id')
      .notNull()
      .references(() => participantLinks.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The final guard for "one team per participant", across all teams.
    unique(TEAM_MEMBER_UNIQUE).on(t.participantLinkId),
    index('team_members_team_idx').on(t.teamId, t.joinedAt),
  ],
);

export const TEAM_REQUEST_KINDS = ['REQUEST', 'INVITE'] as const;
export type TeamRequestKind = (typeof TEAM_REQUEST_KINDS)[number];

export const TEAM_REQUEST_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'] as const;
export type TeamRequestStatus = (typeof TEAM_REQUEST_STATUSES)[number];

const quoted = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');

/**
 * A pending way onto a team: REQUEST is a participant asking the owner,
 * INVITE is the owner asking a participant. `participantLinkId` is always the
 * person who would join.
 */
export const teamJoinRequests = discordBot.table(
  'team_join_requests',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    participantLinkId: integer('participant_link_id')
      .notNull()
      .references(() => participantLinks.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<TeamRequestKind>().notNull(),
    status: text('status').$type<TeamRequestStatus>().notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex(TEAM_PENDING_UNIQUE)
      .on(t.teamId, t.participantLinkId)
      .where(sql.raw(`status = 'PENDING'`)),
    index('team_join_requests_link_status_idx').on(t.participantLinkId, t.status),
    check('team_join_requests_kind_check', sql.raw(`kind IN (${quoted(TEAM_REQUEST_KINDS)})`)),
    check(
      'team_join_requests_status_check',
      sql.raw(`status IN (${quoted(TEAM_REQUEST_STATUSES)})`),
    ),
  ],
);

export type TeamJoinRequest = typeof teamJoinRequests.$inferSelect;

/** "Looking for a team": having a row means being listed. */
export const lftProfiles = discordBot.table('lft_profiles', {
  participantLinkId: integer('participant_link_id')
    .primaryKey()
    .references(() => participantLinks.id, { onDelete: 'cascade' }),
  skills: text('skills')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  blurb: text('blurb').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type LftProfile = typeof lftProfiles.$inferSelect;
