import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env.js';

const TOKEN = 'MTU2Mzc3Mzg0MTQxNzgzODY2NQ.example-token-value-that-is-long-enough-for-tests';

const valid = {
  DISCORD_TOKEN: TOKEN,
  DISCORD_CLIENT_ID: '1563773841417838665',
  DISCORD_GUILD_ID: '1563774575739797588',
  ORGANIZER_ROLE_IDS: '1563774742887010374',
  PARTICIPANT_ROLE_ID: '1563774901133770902',
  VERIFICATION_LOG_CHANNEL_ID: '1563775111469735946',
  DATABASE_URL: 'postgres://discord_bot_app:secret-db-password@db.example.com:5432/postgres',
  DB_SSL_CA_PATH: './certs/global-bundle.pem',
  REGISTRATION_URL: 'https://builderwars.dev/#register',
};

describe('loadConfig', () => {
  it('parses a valid environment and applies defaults', () => {
    const config = loadConfig(valid);
    expect(config.nodeEnv).toBe('development');
    expect(config.logLevel).toBe('info');
    expect(config.discord.guildId).toBe('1563774575739797588');
    expect(config.roles.organizerRoleIds).toEqual(['1563774742887010374']);
  });

  it('splits and trims comma-separated organizer role IDs', () => {
    const config = loadConfig({
      ...valid,
      ORGANIZER_ROLE_IDS: ' 1563774742887010374 , 1563774850944860180,',
    });
    expect(config.roles.organizerRoleIds).toEqual(['1563774742887010374', '1563774850944860180']);
  });

  it('fails fast and names every missing variable', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    try {
      loadConfig({});
    } catch (err) {
      const message = (err as Error).message;
      for (const name of [
        'DISCORD_TOKEN',
        'DISCORD_CLIENT_ID',
        'DISCORD_GUILD_ID',
        'ORGANIZER_ROLE_IDS',
        'PARTICIPANT_ROLE_ID',
        'VERIFICATION_LOG_CHANNEL_ID',
        'DATABASE_URL',
        'REGISTRATION_URL',
      ]) {
        expect(message).toContain(name);
      }
    }
  });

  it('never echoes secret values in the error', () => {
    try {
      loadConfig({ ...valid, DISCORD_CLIENT_ID: 'not-an-id' });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain('DISCORD_CLIENT_ID');
      expect((err as Error).message).not.toContain(TOKEN);
    }
  });

  it('defaults to verified SSL and the BuilderWars event', () => {
    const config = loadConfig(valid);
    expect(config.database.ssl).toEqual({
      mode: 'verify-full',
      caPath: './certs/global-bundle.pem',
    });
    expect(config.eventId).toBe('builderwars-2026');
    expect(config.syncIntervalMinutes).toBe(15);
  });

  it('requires a CA bundle unless SSL is explicitly disabled', () => {
    expect(() => loadConfig({ ...valid, DB_SSL_CA_PATH: undefined })).toThrow(/DB_SSL_CA_PATH/);
    expect(
      loadConfig({ ...valid, DB_SSL_CA_PATH: undefined, DB_SSL_MODE: 'disable' }).database.ssl,
    ).toEqual({ mode: 'disable' });
  });

  it('refuses SSL settings in DATABASE_URL, which would override certificate checks', () => {
    expect(() =>
      loadConfig({ ...valid, DATABASE_URL: `${valid.DATABASE_URL}?sslmode=no-verify` }),
    ).toThrow(/DATABASE_URL/);
  });

  it('never echoes the database password', () => {
    try {
      loadConfig({ ...valid, DATABASE_URL: 'mysql://user:secret-db-password@host/db' });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain('DATABASE_URL');
      expect((err as Error).message).not.toContain('secret-db-password');
    }
  });

  it('rejects invalid snowflakes, empty role lists and non-https URLs', () => {
    expect(() => loadConfig({ ...valid, DISCORD_GUILD_ID: '123' })).toThrow(/DISCORD_GUILD_ID/);
    expect(() => loadConfig({ ...valid, ORGANIZER_ROLE_IDS: ' , ' })).toThrow(/ORGANIZER_ROLE_IDS/);
    expect(() => loadConfig({ ...valid, REGISTRATION_URL: 'http://builderwars.dev' })).toThrow(
      /REGISTRATION_URL/,
    );
  });
});
