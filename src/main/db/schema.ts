import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

/**
 * Schema JSON-blob (herdado do continental-champions): colunas planas apenas
 * onde há sort/filter; o resto vive em `data` JSON. Estado volátil (temporada,
 * standings, bracket, save info) fica no KV `meta`. Um SQLite por save.
 * O schema é aplicado por DDL em runtime (não drizzle-kit) — pasta migrations vazia.
 */

export const metaTable = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const teamsTable = sqliteTable('teams', {
  id: text('id').primaryKey(),
  data: text('data').notNull()
})

export const playersTable = sqliteTable('players', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  position: text('position').notNull(),
  overall: integer('overall').notNull(),
  data: text('data').notNull()
})

export const gamesTable = sqliteTable('games', {
  id: text('id').primaryKey(),
  week: integer('week').notNull(),
  round: text('round').notNull(),
  homeTeamId: text('home_team_id').notNull(),
  awayTeamId: text('away_team_id').notNull(),
  neutral: integer('neutral').notNull(),
  seed: integer('seed').notNull(),
  status: text('status').notNull(),
  result: text('result') // JSON GameResult (quando jogado)
})

/** DDL idempotente executado em runtime na abertura do save. */
export const DDL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  position TEXT NOT NULL,
  overall INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  week INTEGER NOT NULL,
  round TEXT NOT NULL,
  home_team_id TEXT NOT NULL,
  away_team_id TEXT NOT NULL,
  neutral INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  status TEXT NOT NULL,
  result TEXT
);
CREATE INDEX IF NOT EXISTS idx_games_week ON games(week);
`
