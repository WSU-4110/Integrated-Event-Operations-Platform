import { and, asc, count, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../errors.js';
import {
  lftProfiles,
  participantLinks,
  TEAM_MEMBER_UNIQUE,
  TEAM_NAME_UNIQUE,
  teamJoinRequests,
  teamMembers,
  teams,
  type LftProfile,
  type ParticipantLink,
  type Team,
  type TeamJoinRequest,
  type TeamRequestKind,
  type TeamRequestStatus,
} from '../schema/index.js';
import type { Database } from '../types.js';

export type TeamWithCount = Team & { memberCount: number };

export interface TeamMember {
  linkId: number;
  discordUserId: string;
  joinedAt: Date;
}

export type TeamContent = Pick<Team, 'name' | 'description' | 'skillsNeeded'>;

/** A request or invite with what it takes to show or act on it. */
export interface TeamRequestDetails extends TeamJoinRequest {
  teamName: string;
  ownerLinkId: number;
  /** The person who would join. */
  discordUserId: string;
}

export type LftListing = LftProfile & { discordUserId: string };

export type CreateTeamResult =
  { ok: true; team: Team } | { ok: false; conflict: 'name' | 'member' };

export type SaveTeamResult = { ok: true; team: Team } | { ok: false; conflict: 'name' };

/** Queries available inside `withLock`, all in one transaction. */
export interface LockedTeam {
  team: Team;
  /** Longest-standing first. */
  members(): Promise<TeamMember[]>;
  addMember(participantLinkId: number): Promise<void>;
  removeMember(participantLinkId: number): Promise<void>;
  setOwner(participantLinkId: number): Promise<void>;
  deleteTeam(): Promise<void>;
  /** Reads on the locked connection: a second connection here could deadlock the pool. */
  findLink(id: number): Promise<ParticipantLink | null>;
  findRequest(id: number): Promise<TeamJoinRequest | null>;
  /** Null if one is already pending for this person and team. */
  createRequest(participantLinkId: number, kind: TeamRequestKind): Promise<TeamJoinRequest | null>;
  setRequestStatus(id: number, status: TeamRequestStatus): Promise<void>;
  /** Clears someone's pending requests and invites, and their LFT listing. */
  clearOpenings(participantLinkId: number): Promise<void>;
}

export interface TeamRepository {
  /** Creates the team with its owner as the first member, in one transaction. */
  createWithOwner(input: TeamContent, ownerLinkId: number): Promise<CreateTeamResult>;
  /** Null if the team doesn't exist. */
  update(id: number, patch: Partial<TeamContent>): Promise<SaveTeamResult | null>;
  setDiscordResources(
    id: number,
    resources: { discordRoleId: string | null; discordChannelId: string | null },
  ): Promise<void>;
  findById(id: number): Promise<TeamWithCount | null>;
  listAll(): Promise<TeamWithCount[]>;
  /** For autocomplete: name contains `query`. */
  search(query: string, limit: number): Promise<Team[]>;
  members(teamId: number): Promise<TeamMember[]>;
  /** Team members whose registration is no longer active. */
  inactiveMembers(): Promise<{ linkId: number; discordUserId: string }[]>;
  /** Every member of every team, for the Discord role sync. */
  allMembers(): Promise<(TeamMember & { teamId: number })[]>;
  teamIdForMember(participantLinkId: number): Promise<number | null>;

  findRequest(id: number): Promise<TeamRequestDetails | null>;
  pendingForTeam(teamId: number): Promise<TeamRequestDetails[]>;
  pendingForParticipant(participantLinkId: number): Promise<TeamRequestDetails[]>;
  countPendingForParticipant(participantLinkId: number, kind: TeamRequestKind): Promise<number>;
  countPendingForTeam(teamId: number, kind: TeamRequestKind): Promise<number>;
  /** When this person and this team last turned each other down. */
  lastRejectedAt(teamId: number, participantLinkId: number): Promise<Date | null>;
  /** Conditional, so a double press changes it once. Null if it's no longer pending. */
  closeRequest(id: number, status: TeamRequestStatus): Promise<TeamJoinRequest | null>;
  clearOpenings(participantLinkId: number): Promise<void>;

  findProfile(participantLinkId: number): Promise<LftProfile | null>;
  saveProfile(
    participantLinkId: number,
    profile: Pick<LftProfile, 'skills' | 'blurb'>,
  ): Promise<LftProfile>;
  deleteProfile(participantLinkId: number): Promise<boolean>;
  /** Listed people with an active registration, oldest listing first. */
  listProfiles(limit: number, offset: number): Promise<LftListing[]>;
  countProfiles(): Promise<number>;

  /**
   * Runs `fn` in a transaction holding `SELECT ... FOR UPDATE` on the team
   * row, so capacity checks and membership changes can't interleave. Returns
   * null if the team doesn't exist.
   */
  withLock<T>(teamId: number, fn: (locked: LockedTeam) => Promise<T>): Promise<T | null>;
}

const t = teams;
const m = teamMembers;
const q = teamJoinRequests;
const lft = lftProfiles;
const links = participantLinks;

const pending = eq(q.status, 'PENDING');

const memberColumns = {
  linkId: m.participantLinkId,
  discordUserId: links.discordUserId,
  joinedAt: m.joinedAt,
};

const requestColumns = {
  ...getTableColumns(q),
  teamName: t.name,
  ownerLinkId: t.ownerLinkId,
  discordUserId: links.discordUserId,
};

async function clearOpenings(db: Database, participantLinkId: number): Promise<void> {
  await db
    .update(q)
    .set({ status: 'CANCELLED', updatedAt: sql`now()` })
    .where(and(eq(q.participantLinkId, participantLinkId), pending));
  await db.delete(lft).where(eq(lft.participantLinkId, participantLinkId));
}

function lockedQueries(tx: Database, team: Team): LockedTeam {
  const inThisTeam = eq(m.teamId, team.id);
  return {
    team,

    members: () =>
      tx
        .select(memberColumns)
        .from(m)
        .innerJoin(links, eq(links.id, m.participantLinkId))
        .where(inThisTeam)
        .orderBy(asc(m.joinedAt), asc(m.id)),

    async addMember(participantLinkId) {
      // clock_timestamp(): later joins in one transaction still sort later.
      await tx
        .insert(m)
        .values({ teamId: team.id, participantLinkId, joinedAt: sql`clock_timestamp()` });
    },

    async removeMember(participantLinkId) {
      await tx.delete(m).where(and(inThisTeam, eq(m.participantLinkId, participantLinkId)));
    },

    async setOwner(participantLinkId) {
      await tx
        .update(t)
        .set({ ownerLinkId: participantLinkId, updatedAt: sql`now()` })
        .where(eq(t.id, team.id));
    },

    async deleteTeam() {
      await tx.delete(t).where(eq(t.id, team.id));
    },

    async findLink(id) {
      const [row] = await tx.select().from(links).where(eq(links.id, id));
      return row ?? null;
    },

    async findRequest(id) {
      const [row] = await tx
        .select()
        .from(q)
        .where(and(eq(q.id, id), eq(q.teamId, team.id)));
      return row ?? null;
    },

    async createRequest(participantLinkId, kind) {
      // ON CONFLICT rather than catching: an error would abort the transaction.
      const [row] = await tx
        .insert(q)
        .values({ teamId: team.id, participantLinkId, kind })
        .onConflictDoNothing({
          target: [q.teamId, q.participantLinkId],
          where: sql.raw(`status = 'PENDING'`),
        })
        .returning();
      return row ?? null;
    },

    async setRequestStatus(id, status) {
      await tx
        .update(q)
        .set({ status, updatedAt: sql`now()` })
        .where(eq(q.id, id));
    },

    clearOpenings: (participantLinkId) => clearOpenings(tx, participantLinkId),
  };
}

export function createTeamRepository(db: Database): TeamRepository {
  const withCounts = () =>
    db
      .select({ ...getTableColumns(t), memberCount: count(m.id) })
      .from(t)
      .leftJoin(m, eq(m.teamId, t.id))
      .groupBy(t.id)
      .$dynamic();

  const requests = () =>
    db
      .select(requestColumns)
      .from(q)
      .innerJoin(t, eq(t.id, q.teamId))
      .innerJoin(links, eq(links.id, q.participantLinkId))
      .$dynamic();

  const members = (teamId: number) =>
    db
      .select(memberColumns)
      .from(m)
      .innerJoin(links, eq(links.id, m.participantLinkId))
      .where(eq(m.teamId, teamId))
      .orderBy(asc(m.joinedAt), asc(m.id));

  return {
    async createWithOwner(input, ownerLinkId) {
      try {
        return await db.transaction(async (tx) => {
          const [team] = await tx
            .insert(t)
            .values({ ...input, ownerLinkId })
            .returning();
          if (!team) throw new Error('Insert returned no row');
          await tx.insert(m).values({ teamId: team.id, participantLinkId: ownerLinkId });
          await clearOpenings(tx, ownerLinkId);
          return { ok: true as const, team };
        });
      } catch (err) {
        if (isUniqueViolation(err, TEAM_NAME_UNIQUE)) return { ok: false, conflict: 'name' };
        if (isUniqueViolation(err, TEAM_MEMBER_UNIQUE)) return { ok: false, conflict: 'member' };
        throw err;
      }
    },

    async update(id, patch) {
      try {
        const [team] = await db
          .update(t)
          .set({ ...patch, updatedAt: sql`now()` })
          .where(eq(t.id, id))
          .returning();
        return team ? { ok: true, team } : null;
      } catch (err) {
        if (isUniqueViolation(err, TEAM_NAME_UNIQUE)) return { ok: false, conflict: 'name' };
        throw err;
      }
    },

    async setDiscordResources(id, resources) {
      await db.update(t).set(resources).where(eq(t.id, id));
    },

    async findById(id) {
      const [team] = await withCounts().where(eq(t.id, id));
      return team ?? null;
    },

    listAll: () => withCounts().orderBy(asc(t.createdAt), asc(t.id)),

    search: (query, limit) =>
      db
        .select()
        .from(t)
        .where(sql`position(lower(${query.trim()}) in lower(${t.name})) > 0`)
        .orderBy(asc(t.name))
        .limit(limit),

    members,

    inactiveMembers: () =>
      db
        .select({ linkId: m.participantLinkId, discordUserId: links.discordUserId })
        .from(m)
        .innerJoin(links, eq(links.id, m.participantLinkId))
        .where(eq(links.active, false)),

    allMembers: () =>
      db
        .select({ ...memberColumns, teamId: m.teamId })
        .from(m)
        .innerJoin(links, eq(links.id, m.participantLinkId)),

    async teamIdForMember(participantLinkId) {
      const [row] = await db
        .select({ teamId: m.teamId })
        .from(m)
        .where(eq(m.participantLinkId, participantLinkId));
      return row?.teamId ?? null;
    },

    async findRequest(id) {
      const [row] = await requests().where(eq(q.id, id));
      return row ?? null;
    },

    pendingForTeam: (teamId) =>
      requests()
        .where(and(eq(q.teamId, teamId), pending))
        .orderBy(asc(q.createdAt), asc(q.id)),

    pendingForParticipant: (participantLinkId) =>
      requests()
        .where(and(eq(q.participantLinkId, participantLinkId), pending))
        .orderBy(asc(q.createdAt), asc(q.id)),

    async countPendingForParticipant(participantLinkId, kind) {
      const [row] = await db
        .select({ n: count() })
        .from(q)
        .where(and(eq(q.participantLinkId, participantLinkId), eq(q.kind, kind), pending));
      return row?.n ?? 0;
    },

    async countPendingForTeam(teamId, kind) {
      const [row] = await db
        .select({ n: count() })
        .from(q)
        .where(and(eq(q.teamId, teamId), eq(q.kind, kind), pending));
      return row?.n ?? 0;
    },

    async lastRejectedAt(teamId, participantLinkId) {
      const [row] = await db
        .select({ at: q.updatedAt })
        .from(q)
        .where(
          and(
            eq(q.teamId, teamId),
            eq(q.participantLinkId, participantLinkId),
            eq(q.status, 'REJECTED'),
          ),
        )
        .orderBy(desc(q.updatedAt))
        .limit(1);
      return row?.at ?? null;
    },

    async closeRequest(id, status) {
      const [row] = await db
        .update(q)
        .set({ status, updatedAt: sql`now()` })
        .where(and(eq(q.id, id), pending))
        .returning();
      return row ?? null;
    },

    clearOpenings: (participantLinkId) => clearOpenings(db, participantLinkId),

    async findProfile(participantLinkId) {
      const [row] = await db.select().from(lft).where(eq(lft.participantLinkId, participantLinkId));
      return row ?? null;
    },

    async saveProfile(participantLinkId, profile) {
      const [row] = await db
        .insert(lft)
        .values({ participantLinkId, ...profile })
        .onConflictDoUpdate({
          target: lft.participantLinkId,
          set: { ...profile, updatedAt: sql`now()` },
        })
        .returning();
      if (!row) throw new Error('Upsert returned no row');
      return row;
    },

    async deleteProfile(participantLinkId) {
      const rows = await db
        .delete(lft)
        .where(eq(lft.participantLinkId, participantLinkId))
        .returning({ id: lft.participantLinkId });
      return rows.length > 0;
    },

    listProfiles: (limit, offset) =>
      db
        .select({ ...getTableColumns(lft), discordUserId: links.discordUserId })
        .from(lft)
        .innerJoin(links, eq(links.id, lft.participantLinkId))
        .where(eq(links.active, true))
        .orderBy(asc(lft.createdAt), asc(lft.participantLinkId))
        .limit(limit)
        .offset(offset),

    async countProfiles() {
      const [row] = await db
        .select({ n: count() })
        .from(lft)
        .innerJoin(links, eq(links.id, lft.participantLinkId))
        .where(eq(links.active, true));
      return row?.n ?? 0;
    },

    async withLock(teamId, fn) {
      return db.transaction(async (tx) => {
        const [team] = await tx.select().from(t).where(eq(t.id, teamId)).for('update');
        if (!team) return null;
        return fn(lockedQueries(tx, team));
      });
    },
  };
}
