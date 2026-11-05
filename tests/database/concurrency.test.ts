import { readFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/database/migrate.js';
import { createRepositories } from '../../src/database/repositories/index.js';
import { createAnnouncementService } from '../../src/services/announcementService.js';
import { createTeamService } from '../../src/services/teamService.js';
import { createWorkshopService } from '../../src/services/workshopService.js';

// PGlite (used by the other tests) has one connection, so its transactions
// never overlap. This runs real overlapping transactions on separate
// connections to prove the row lock (workshops) and the conditional
// status updates (announcements) hold up. It needs a THROWAWAY Postgres
// where it may create the website table and the bot role:
//
//   TEST_DATABASE_URL=postgres://postgres:postgres_local@localhost:5432/postgres npm test
//
// e.g. the docker-compose database on a fresh volume. Never point it at builderwars-db.

const url = process.env.TEST_DATABASE_URL;
const EVENT_ID = 'builderwars-2026';

describe.skipIf(!url)('concurrency on real Postgres (separate connections)', () => {
  let admin: pg.Pool;
  let bot: pg.Pool;

  beforeAll(async () => {
    if (/lightsail|amazonaws/i.test(url!))
      throw new Error('Refusing to run against a hosted database');
    admin = new pg.Pool({ connectionString: url, max: 2 });
    const initSql = (file: string) =>
      readFile(new URL(`../../docker/initdb/${file}`, import.meta.url), 'utf8');
    const exists = await admin.query(`SELECT 1 FROM pg_roles WHERE rolname = 'discord_bot_app'`);
    if (exists.rowCount === 0) {
      await admin.query(await initSql('01-website-tables.sql'));
      await admin.query(await initSql('02-discord-bot-role.sql'));
    }

    // Every bot connection acts as discord_bot_app, with production grants.
    bot = new pg.Pool({ connectionString: url, max: 10 });
    bot.on('connect', (client) => void client.query('SET ROLE discord_bot_app'));
    await runMigrations(drizzle(bot));
  });

  afterAll(async () => {
    await bot?.end();
    await admin?.end();
  });

  it('fills exactly the capacity when 40 people click at once', async () => {
    const repos = createRepositories(drizzle(bot), EVENT_ID);
    const service = createWorkshopService(repos);
    const tag = Date.now();

    const created = await service.create({
      name: `Race ${tag}`,
      description: '',
      speaker: null,
      startTime: new Date(Date.now() + 3_600_000),
      endTime: new Date(Date.now() + 7_200_000),
      location: 'Room 1',
      capacity: 5,
    });
    if (created.kind !== 'saved') throw new Error(created.kind);
    const workshopId = created.workshop.id;

    const links = [];
    for (let i = 0; i < 40; i++) {
      const reg = await admin.query<{ id: number }>(
        `INSERT INTO public.registrations
           (event_id, name, email, school, class_standing, experience_level, status)
         VALUES ($1, 'Racer', $2, 'Wayne State', 'junior', 'beginner', 'approved') RETURNING id`,
        [EVENT_ID, `race${tag}-${i}@wayne.edu`],
      );
      const link = await repos.links.create({
        discordUserId: `${tag}${String(i).padStart(3, '0')}`,
        registrationId: reg.rows[0]!.id,
        linkedBy: null,
      });
      if (!link.ok) throw new Error('link failed');
      links.push(link.link);
    }

    const outcomes = await Promise.all(
      links.map((link) => service.register(workshopId, link, { joinWaitlist: true })),
    );

    expect(outcomes.filter((o) => o.kind === 'registered')).toHaveLength(5);
    const positions = outcomes.flatMap((o) => (o.kind === 'waitlisted' ? [o.position] : []));
    expect(positions.sort((a, b) => a - b)).toEqual(Array.from({ length: 35 }, (_, i) => i + 1));
    expect(await service.get(workshopId)).toMatchObject({ registered: 5, waitlisted: 35 });

    // Five concurrent cancellations promote exactly five people.
    const registered = links.filter((_, i) => outcomes[i]!.kind === 'registered');
    const cancels = await Promise.all(registered.map((link) => service.cancel(workshopId, link)));
    const promoted = cancels.flatMap((c) => (c.kind === 'cancelled' ? c.promoted : []));
    expect(new Set(promoted.map((p) => p.discordUserId)).size).toBe(5);
    expect(await service.get(workshopId)).toMatchObject({ registered: 5, waitlisted: 30 });
  });

  it('sends each announcement once when job runs and Send clicks overlap', async () => {
    const service = createAnnouncementService(createRepositories(drizzle(bot), EVENT_ID));
    const draft = (scheduledFor: Date | null) =>
      service.createDraft({
        title: 'Race',
        body: 'Race',
        type: 'GENERAL',
        pingParticipants: false,
        scheduledFor,
        createdBy: '400000000000000001',
      });

    const due: number[] = [];
    for (let i = 0; i < 20; i++) {
      const a = await draft(new Date(Date.now() - 1000));
      await service.confirm(a.id);
      due.push(a.id);
    }
    // Ten overlapping job runs: every due announcement is claimed by exactly one.
    const claims = await Promise.all(Array.from({ length: 10 }, () => service.claimDue()));
    const claimed = claims
      .flat()
      .map((a) => a.id)
      .filter((id) => due.includes(id));
    expect(claimed.sort((a, b) => a - b)).toEqual(due);

    // Ten simultaneous presses of Send now: one of them sends.
    const now = await draft(null);
    const outcomes = await Promise.all(Array.from({ length: 10 }, () => service.confirm(now.id)));
    expect(outcomes.filter((o) => o.kind === 'send_now')).toHaveLength(1);
  });

  it('never overfills a team, or puts anyone on two teams, under overlapping presses', async () => {
    const repos = createRepositories(drizzle(bot), EVENT_ID);
    const teams = createTeamService(repos, { maxSize: 4 });
    const tag = Date.now();
    let counter = 0;
    const participant = async () => {
      const n = ++counter;
      const reg = await admin.query<{ id: number }>(
        `INSERT INTO public.registrations
           (event_id, name, email, school, class_standing, experience_level, status)
         VALUES ($1, 'Racer', $2, 'Wayne State', 'junior', 'beginner', 'approved') RETURNING id`,
        [EVENT_ID, `team${tag}-${n}@wayne.edu`],
      );
      const link = await repos.links.create({
        discordUserId: `${tag}${String(n).padStart(3, '0')}`,
        registrationId: reg.rows[0]!.id,
        linkedBy: null,
      });
      if (!link.ok) throw new Error('link failed');
      return link.link;
    };
    const newTeam = async (name: string) => {
      const owner = await participant();
      const outcome = await teams.create(owner, { name, description: '', skills: '' });
      if (outcome.kind !== 'created') throw new Error(outcome.kind);
      return { owner, team: outcome.team };
    };

    // The last spots: an owner accepts 10 requests at once on a team with 3 left.
    const crowded = await newTeam(`Crowded ${tag}`);
    const askers = await Promise.all(Array.from({ length: 10 }, () => participant()));
    const requests = [];
    for (const asker of askers) {
      const outcome = await teams.requestToJoin(asker, crowded.team.id);
      if (outcome.kind !== 'requested') throw new Error(outcome.kind);
      requests.push(outcome.request);
    }
    const answers = await Promise.all(
      requests.map((r) => teams.respond(crowded.owner, r.id, true)),
    );
    expect(answers.filter((a) => a.kind === 'accepted')).toHaveLength(3);
    expect(answers.filter((a) => a.kind === 'full')).toHaveLength(7);
    expect((await teams.get(crowded.team.id))?.memberCount).toBe(4);

    // One person, accepted by two teams at the same moment: different locks, so
    // only the unique constraint can stop this.
    for (let round = 0; round < 5; round++) {
      const a = await newTeam(`Rival A ${tag} ${round}`);
      const b = await newTeam(`Rival B ${tag} ${round}`);
      const wanted = await participant();
      const toA = await teams.requestToJoin(wanted, a.team.id);
      const toB = await teams.requestToJoin(wanted, b.team.id);
      if (toA.kind !== 'requested' || toB.kind !== 'requested') throw new Error('request failed');
      const [first, second] = await Promise.all([
        teams.respond(a.owner, toA.request.id, true),
        teams.respond(b.owner, toB.request.id, true),
      ]);
      const kinds = [first.kind, second.kind].sort();
      expect(kinds[0]).toBe('accepted');
      expect(['joiner_on_team', 'not_pending']).toContain(kinds[1]);
      const onA = (await teams.get(a.team.id))?.memberCount ?? 0;
      const onB = (await teams.get(b.team.id))?.memberCount ?? 0;
      expect(onA + onB).toBe(3);
    }

    // Twelve people grabbing one name, in differing case: exactly one gets it.
    const founders = await Promise.all(Array.from({ length: 12 }, () => participant()));
    const creations = await Promise.all(
      founders.map((founder, i) =>
        teams.create(founder, {
          name: i % 2 ? `Same Name ${tag}` : `SAME NAME ${tag}`,
          description: '',
          skills: '',
        }),
      ),
    );
    expect(creations.filter((c) => c.kind === 'created')).toHaveLength(1);
    expect(creations.filter((c) => c.kind === 'name_taken')).toHaveLength(11);

    // Everyone leaves at once: the team dissolves exactly once.
    const leaving = await newTeam(`Leaving ${tag}`);
    const stayers = await Promise.all(Array.from({ length: 3 }, () => participant()));
    for (const member of stayers) await teams.addMember(leaving.team.id, member);
    const leaves = await Promise.all(
      [leaving.owner, ...stayers].map((member) => teams.leave(member)),
    );
    expect(leaves.filter((l) => l.kind === 'left')).toHaveLength(4);
    expect(leaves.filter((l) => l.kind === 'left' && l.dissolved)).toHaveLength(1);
    expect(await teams.get(leaving.team.id)).toBeNull();
  });
});
