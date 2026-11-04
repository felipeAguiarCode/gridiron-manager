import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { openSaveDb, type SaveDb } from '../db/connection'
import { metaTable, teamsTable, playersTable, gamesTable } from '../db/schema'
import { simulateGame } from '@core/engine/game/engine'
import { buildGameTeam, defaultScheme, schemeFrom } from '@core/engine/game/testkit'
import { buildDepthChart } from '@core/engine/ai/selectDepth'
import { buildRegularSchedule, buildGenericSchedule } from '@core/engine/season/schedule'
import { computeStandings, type ResultLike } from '@core/engine/season/standings'
import { playoffSeeding, makeFixtures, nextRoundPairs, confRoundCount, confRoundLabels } from '@core/engine/season/playoffs'
import { generateObjectives, evaluateObjective, computeBoardStatus, type ObjectiveView, type BoardStatus } from '@core/engine/objectives'
import { generateFreeAgentPool, freeAgentAccepts, needScore } from '@core/engine/market/market'
import { rotateMarket } from '@core/engine/market/pulse'
import { openNegotiation, evaluateOffer, type NegotiationCtx } from '@core/engine/market/negotiation'
import { picksValue, aiEvaluateTradeWithPicks, rotateTradeBlock, seedTeamPicks } from '@core/engine/market/trade'
import { generateDraftClass } from '@core/engine/draft/class'
import { scoutProspect } from '@core/engine/draft/scouting'
import { bestAvailable } from '@core/engine/draft/night'
import { applyCamp, resolveBattles } from '@core/engine/preseason/camp'
import { generateLegendPool, effectiveLegend } from '@core/engine/legends/comeback'
import { buildPlayer } from '@core/engine/generation/generate'
import { developPlayer, shouldRetire, generateRookie } from '@core/engine/development'
import { drawThree, applyCard } from '@core/engine/events/apply'
import type { EventCard } from '@core/engine/events/deck'
import { ROSTER_TEMPLATE, computeOverall } from '@core/domain/positions'
import { createRng, deriveSeed } from '@core/rng'
import { LEAGUE_CAP, computeCapHit, computeMarketValue } from '@core/domain/valuation'
import { LEAGUE_CONFIG } from '@shared/leagues'
import type { ContractOffer, DepthChart, DraftPick, DraftState, Fixture, GameInput, GameResult, GameTeam, League, MarketListing, MarketPulse, NegotiationSession, NewsItem, Objective, Player, Prospect, SchemeSetup, SeasonPhase, Standing, Team, TradeBlockItem, TrainingCampFocus } from '@core/domain/types'
import type { GameControlMode, TeamPlaybookProfile } from '@core/domain/playbook'
import { defaultPlaybookProfile } from '@core/engine/playbook/defaults'
import type {
  AdvanceResult, DepthChartView, DraftPickResultView, DraftRunResult, DraftView, EventChooseResult, EventsView, FeedView, FixtureView, GameDayView, MarketActionResult,
  LegendsView, MarketPulseView, MarketView, NegotiationView, NewsView, OfficeFinance, PlayerLite, PlayerRef, PreseasonView, ProspectView, RosterView, SaveMeta, ScoutView, Snapshot, StandingView, TeamPreview,
  TeamPreviewDetail, TeamRef, TradeBlockView, TransactionView
} from '@shared/ipc/contract'

export class AppError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

interface SaveInfo {
  saveName: string
  league: League
  masterSeed: number
  coachName: string
  coachArchetype?: string
  teamId: string
}
interface SeasonState {
  week: number
  phase: SeasonPhase
  seasonNumber: number
}

interface OpenSave {
  slug: string
  saveDb: SaveDb
  info: SaveInfo
  season: SeasonState
  teams: Map<string, Team>
  players: Map<string, Player>
}

let current: OpenSave | null = null

// ---------------------------------------------------------------- paths

function savesRoot(): string {
  return join(app.getPath('userData'), 'saves')
}

function seedRoot(): string {
  // dev: <cwd>/resources/seed · empacotado: process.resourcesPath/seed
  const packaged = join(process.resourcesPath || '', 'seed')
  if (existsSync(packaged)) return packaged
  return join(app.getAppPath(), 'resources', 'seed')
}

function loadSeedWorld(league: League): { teams: Team[]; players: Player[] } {
  const dir = join(seedRoot(), league)
  const teams: Team[] = JSON.parse(readFileSync(join(dir, 'teams.json'), 'utf-8')).teams
  const players: Player[] = JSON.parse(readFileSync(join(dir, 'players.json'), 'utf-8')).players
  return { teams, players }
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'save'
  return `${base}-${Date.now().toString(36)}`
}

// ---------------------------------------------------------------- meta KV

export function metaGet<T>(saveDb: SaveDb, key: string): T | null {
  const row = saveDb.db.select().from(metaTable).where(eq(metaTable.key, key)).get()
  return row ? (JSON.parse(row.value) as T) : null
}
export function metaSet(saveDb: SaveDb, key: string, value: unknown): void {
  saveDb.db
    .insert(metaTable)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: metaTable.key, set: { value: JSON.stringify(value) } })
    .run()
}

function mustBeOpen(): OpenSave {
  if (!current) throw new AppError('NO_SAVE', 'Nenhum save aberto')
  return current
}

/** Schedule por liga: NFL usa a fórmula rotativa; demais usam round-robin genérico. */
function buildScheduleFor(league: League, teams: Team[], masterSeed: number): Fixture[] {
  const config = LEAGUE_CONFIG[league]
  if (league === 'nfl') return buildRegularSchedule(teams, masterSeed)
  return buildGenericSchedule(teams, config.gamesPerTeam, config.regularSeasonWeeks, masterSeed)
}

// ---------------------------------------------------------------- index

function readIndex(): SaveMeta[] {
  const p = join(savesRoot(), 'index.json')
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as SaveMeta[]
  } catch {
    return []
  }
}
function writeIndex(entries: SaveMeta[]): void {
  mkdirSync(savesRoot(), { recursive: true })
  writeFileSync(join(savesRoot(), 'index.json'), JSON.stringify(entries, null, 2))
}
function upsertIndex(meta: SaveMeta): void {
  const entries = readIndex().filter((e) => e.slug !== meta.slug)
  entries.unshift(meta)
  writeIndex(entries)
}

function saveMetaOf(o: OpenSave): SaveMeta {
  const team = o.teams.get(o.info.teamId)!
  return {
    slug: o.slug,
    saveName: o.info.saveName,
    league: o.info.league,
    teamId: o.info.teamId,
    teamName: `${team.name} ${team.nickname}`,
    coachName: o.info.coachName,
    week: o.season.week,
    phase: o.season.phase,
    seasonNumber: o.season.seasonNumber,
    updatedAt: Date.now()
  }
}

// ---------------------------------------------------------------- helpers

export function teamRef(t: Team): TeamRef {
  return {
    id: t.id, name: t.name, nickname: t.nickname, abbr: t.abbr, city: t.city,
    colors: t.colors, conference: t.conference, division: t.division, reputation: t.reputation
  }
}

export function rosterOf(o: OpenSave, teamId: string): Player[] {
  return [...o.players.values()].filter((p) => p.teamId === teamId)
}

/** Wrapper exportado: garante que há um save aberto (usado pelos serviços de playbook/play-call). */
export function requireOpenSave(): OpenSave {
  return mustBeOpen()
}

// ---------------------------------------------------------------- control mode (§8B)

/** Modo de controle da partida. Default `simulation_only` (preserva o fluxo headless/--smoke). */
export function getControlModeOf(o: OpenSave): GameControlMode {
  return metaGet<GameControlMode>(o.saveDb, 'controlMode') ?? 'simulation_only'
}
export function getControlMode(): GameControlMode {
  return getControlModeOf(mustBeOpen())
}
export function setControlMode(input: { mode: GameControlMode }): GameControlMode {
  const o = mustBeOpen()
  metaSet(o.saveDb, 'controlMode', input.mode)
  upsertIndex(saveMetaOf(o))
  return input.mode
}

export function fixtureById(o: OpenSave, id: string): Fixture | undefined {
  return allFixtures(o).find((f) => f.id === id)
}

/** Resultado persistido de um jogo (null se ainda não jogado). */
export function getStoredResult(o: OpenSave, gameId: string): GameResult | null {
  const row = o.saveDb.db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).get()
  return row?.result ? (JSON.parse(row.result) as GameResult) : null
}

export function fixtureViewById(o: OpenSave, id: string): FixtureView | null {
  const f = fixtureById(o, id)
  return f ? fixtureView(o, f, resultsMap(o)) : null
}

/** Constrói o GameInput de um fixture (times do usuário e da IA via gameTeamFor). */
export function buildFixtureInput(o: OpenSave, fixtureId: string): { fixture: Fixture; input: GameInput } {
  const fixture = fixtureById(o, fixtureId)
  if (!fixture) throw new AppError('NO_FIXTURE', 'Jogo não encontrado')
  const importance: GameInput['importance'] = fixture.round === 'championship' ? 'championship' : fixture.round === 'regular' ? 'regular' : 'playoff'
  const input: GameInput = {
    home: gameTeamFor(o, fixture.homeTeamId),
    away: gameTeamFor(o, fixture.awayTeamId),
    rules: LEAGUE_CONFIG[o.info.league].rules,
    importance,
    neutralVenue: fixture.neutralVenue
  }
  return { fixture, input }
}

/** Mapa de PlayerRef para os times de um fixture (para a UI do GameDay). */
export function playerRefsForFixture(o: OpenSave, homeTeamId: string, awayTeamId: string): Record<string, PlayerRef> {
  const players: Record<string, PlayerRef> = {}
  for (const teamId of [homeTeamId, awayTeamId]) {
    for (const p of rosterOf(o, teamId)) {
      players[p.id] = { id: p.id, firstName: p.firstName, lastName: p.lastName, position: p.position, jerseyNumber: p.jerseyNumber, overall: p.overall }
    }
  }
  return players
}

/** Persiste o resultado do jogo interativo e faz a semana avançar (sim dos demais jogos + progressão). */
export function persistInteractiveResult(o: OpenSave, gameId: string, result: GameResult): AdvanceResult {
  o.saveDb.raw.prepare('UPDATE games SET status = ?, result = ? WHERE id = ?').run('played', JSON.stringify(result), gameId)
  updateMasteryFromResult(o, result)
  return playWeek(o, gameId)
}

/** Aumenta a familiaridade dos playbooks ativos do time do usuário (§8B.11/8B.20). */
function bumpPlaybookFamiliarity(o: OpenSave, delta: number): void {
  const team = o.teams.get(o.info.teamId)!
  const profile = metaGet<TeamPlaybookProfile>(o.saveDb, 'playbookProfile') ?? defaultPlaybookProfile(team)
  for (const id of [profile.activeOffensivePlaybookId, profile.activeDefensivePlaybookId, profile.activeSpecialTeamsPlaybookId]) {
    profile.familiarity[id] = Math.min(100, (profile.familiarity[id] ?? 70) + delta)
  }
  metaSet(o.saveDb, 'playbookProfile', profile)
}

/** Mastery por jogada (§8B.21): cresce com o uso das jogadas do time do usuário. */
function updateMasteryFromResult(o: OpenSave, result: GameResult): void {
  const mastery = metaGet<Record<string, number>>(o.saveDb, 'playMastery') ?? {}
  for (const p of result.plays) {
    if (p.offenseTeamId !== o.info.teamId || !p.offensePlayId) continue
    const gained = p.outcome === 'touchdown' || p.outcome === 'first_down' ? 2 : 1
    mastery[p.offensePlayId] = Math.min(100, (mastery[p.offensePlayId] ?? 20) + gained)
  }
  metaSet(o.saveDb, 'playMastery', mastery)
}

function mergeDepth(userDepth: DepthChart, auto: DepthChart, roster: Player[]): DepthChart {
  const valid = new Set(roster.filter((p) => p.injuryWeeks === 0 && !p.suspended).map((p) => p.id))
  const merge = (userIds: string[], autoIds: string[]): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const id of [...userIds.filter((id) => valid.has(id)), ...autoIds]) {
      if (!seen.has(id)) { seen.add(id); out.push(id) }
    }
    return out.slice(0, autoIds.length)
  }
  return {
    offense: merge(userDepth.offense, auto.offense),
    defense: merge(userDepth.defense, auto.defense),
    special: merge(userDepth.special, auto.special)
  }
}

export function gameTeamFor(o: OpenSave, teamId: string): GameTeam {
  const t = o.teams.get(teamId)!
  const roster = rosterOf(o, teamId)
  const rules = LEAGUE_CONFIG[o.info.league].rules
  if (teamId === o.info.teamId) {
    const scheme = metaGet<SchemeSetup>(o.saveDb, 'userScheme') ?? defaultScheme(t)
    const gt = buildGameTeam(t, roster, rules, scheme)
    const userDepth = metaGet<DepthChart>(o.saveDb, 'userDepth')
    if (userDepth) gt.depth = mergeDepth(userDepth, gt.depth, roster)
    return gt
  }
  return buildGameTeam(t, roster, rules)
}

function unitOveralls(o: OpenSave, teamId: string): { off: number; def: number; st: number; star: number } {
  const roster = rosterOf(o, teamId)
  const depth = buildDepthChart(roster, gameTeamFor(o, teamId).scheme, LEAGUE_CONFIG[o.info.league].rules)
  const byId = new Map(roster.map((p) => [p.id, p]))
  const avg = (ids: string[]): number => {
    const ovs = ids.map((id) => byId.get(id)?.overall ?? 0).filter(Boolean)
    return ovs.length ? Math.round(ovs.reduce((a, b) => a + b, 0) / ovs.length) : 0
  }
  return {
    off: avg(depth.offense),
    def: avg(depth.defense),
    st: avg(depth.special),
    star: roster.reduce((m, p) => Math.max(m, p.overall), 0)
  }
}

// ---------------------------------------------------------------- persistence

function allFixtures(o: OpenSave): Fixture[] {
  return o.saveDb.db
    .select()
    .from(gamesTable)
    .all()
    .map((g) => ({
      id: g.id,
      week: g.week,
      round: g.round as SeasonPhase,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      neutralVenue: g.neutral === 1,
      simulationSeed: g.seed,
      status: g.status as Fixture['status']
    }))
}

function resultsMap(o: OpenSave): Map<string, ResultLike> {
  const map = new Map<string, ResultLike>()
  for (const g of o.saveDb.db.select().from(gamesTable).all()) {
    if (g.status === 'played' && g.result) {
      const r = JSON.parse(g.result) as GameResult
      map.set(g.id, { homeScore: r.homeScore, awayScore: r.awayScore, winnerTeamId: r.winnerTeamId })
    }
  }
  return map
}

function insertFixtures(o: OpenSave, fixtures: Fixture[]): void {
  const stmt = o.saveDb.raw.prepare(
    'INSERT OR REPLACE INTO games (id, week, round, home_team_id, away_team_id, neutral, seed, status, result) VALUES (?,?,?,?,?,?,?,?,?)'
  )
  const tx = o.saveDb.raw.transaction((rows: Fixture[]) => {
    for (const f of rows) stmt.run(f.id, f.week, f.round, f.homeTeamId, f.awayTeamId, f.neutralVenue ? 1 : 0, f.simulationSeed, f.status, null)
  })
  tx(fixtures)
}

// ---------------------------------------------------------------- API: saves

export function listSaves(): SaveMeta[] {
  return readIndex()
}

export function createSave(input: {
  saveName: string
  league: League
  teamId: string
  coachName: string
  coachArchetype?: string
  seed?: number
}): SaveMeta {
  closeSave()
  const { teams, players } = loadSeedWorld(input.league)
  if (!teams.find((t) => t.id === input.teamId)) throw new AppError('BAD_TEAM', 'Time inexistente')

  const slug = slugify(input.saveName)
  const masterSeed = input.seed ?? Math.floor(Date.now() % 2147483647)
  const dbPath = join(savesRoot(), slug, 'save.db')
  const saveDb = openSaveDb(dbPath)

  const info: SaveInfo = {
    saveName: input.saveName,
    league: input.league,
    masterSeed,
    coachName: input.coachName,
    coachArchetype: input.coachArchetype,
    teamId: input.teamId
  }
  const season: SeasonState = { week: 1, phase: 'regular', seasonNumber: 1 }

  const schedule = buildScheduleFor(input.league, teams, masterSeed)

  // insere tudo em uma transação
  const insTeam = saveDb.raw.prepare('INSERT INTO teams (id, data) VALUES (?, ?)')
  const insPlayer = saveDb.raw.prepare('INSERT INTO players (id, team_id, position, overall, data) VALUES (?,?,?,?,?)')
  const insGame = saveDb.raw.prepare('INSERT INTO games (id, week, round, home_team_id, away_team_id, neutral, seed, status, result) VALUES (?,?,?,?,?,?,?,?,?)')
  saveDb.raw.transaction(() => {
    for (const t of teams) insTeam.run(t.id, JSON.stringify(t))
    for (const p of players) insPlayer.run(p.id, p.teamId, p.position, p.overall, JSON.stringify(p))
    for (const f of schedule) insGame.run(f.id, f.week, f.round, f.homeTeamId, f.awayTeamId, 0, f.simulationSeed, 'scheduled', null)
    metaSet(saveDb, 'save', info)
    metaSet(saveDb, 'season', season)
    metaSet(saveDb, 'champion', null)
    const objTeam = teams.find((t) => t.id === input.teamId)!
    metaSet(saveDb, 'objectives', generateObjectives(objTeam, createRng(deriveSeed(masterSeed, 'objectives'))))
    metaSet(saveDb, 'userMadePlayoffs', false)
    metaSet(saveDb, 'finalists', [])
    const faPool = generateFreeAgentPool(createRng(deriveSeed(masterSeed, 'free-agents')))
    metaSet(saveDb, 'freeAgents', faPool)
    metaSet(saveDb, 'transactions', [])
    metaSet(saveDb, 'events', { pending: null, legendaryUsed: false, history: [] })
    metaSet(saveDb, 'capCredit', 0)
    // mercado vivo (§10B): listagens iniciais + pulso + contador de ids
    metaSet(saveDb, 'marketListings', seedListingsFromPool(faPool, createRng(deriveSeed(masterSeed, 'market-seed')), 1))
    metaSet(saveDb, 'marketPulse', { seasonNumber: 1, week: 1, phase: 'regular', volatility: 20, heat: 15, deadlinePressure: 0, mediaIntensity: 15, stories: [] } satisfies MarketPulse)
    metaSet(saveDb, 'marketNextId', 5000)
    // trade block + draft picks (§10B.16): próximos 2 drafts, todos os times
    metaSet(saveDb, 'tradeBlock', [])
    metaSet(saveDb, 'draftPicks', teams.flatMap((t) => seedTeamPicks(t.id, 2, 2)))
    // lendas aposentadas cogitando retorno (§10B.3)
    metaSet(saveDb, 'retiredLegends', generateLegendPool(masterSeed))
  })()

  current = {
    slug, saveDb, info, season,
    teams: new Map(teams.map((t) => [t.id, t])),
    players: new Map(players.map((p) => [p.id, p]))
  }
  const meta = saveMetaOf(current)
  upsertIndex(meta)
  return meta
}

export function loadSave(input: { slug: string }): Snapshot {
  closeSave()
  const dbPath = join(savesRoot(), input.slug, 'save.db')
  if (!existsSync(dbPath)) throw new AppError('NOT_FOUND', 'Save não encontrado')
  const saveDb = openSaveDb(dbPath)
  const info = metaGet<SaveInfo>(saveDb, 'save')
  const season = metaGet<SeasonState>(saveDb, 'season')
  if (!info || !season) throw new AppError('CORRUPT', 'Save corrompido')

  const teams = new Map<string, Team>()
  for (const row of saveDb.db.select().from(teamsTable).all()) teams.set(row.id, JSON.parse(row.data) as Team)
  const players = new Map<string, Player>()
  for (const row of saveDb.db.select().from(playersTable).all()) players.set(row.id, JSON.parse(row.data) as Player)

  current = { slug: input.slug, saveDb, info, season, teams, players }
  return snapshot()
}

export function deleteSave(input: { slug: string }): { ok: true } {
  if (current?.slug === input.slug) closeSave()
  const dir = join(savesRoot(), input.slug)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  writeIndex(readIndex().filter((e) => e.slug !== input.slug))
  return { ok: true }
}

export function closeSave(): void {
  if (current) {
    current.saveDb.close()
    current = null
  }
}

// ---------------------------------------------------------------- API: world

export function worldTeams(input: { league: League }): TeamPreview[] {
  const { teams, players } = loadSeedWorld(input.league)
  const rules = LEAGUE_CONFIG[input.league].rules
  return teams.map((t) => {
    const roster = players.filter((p) => p.teamId === t.id)
    const gt = buildGameTeam(t, roster, rules)
    const byId = new Map(roster.map((p) => [p.id, p]))
    const avg = (ids: string[]): number => {
      const ovs = ids.map((id) => byId.get(id)?.overall ?? 0).filter(Boolean)
      return ovs.length ? Math.round(ovs.reduce((a, b) => a + b, 0) / ovs.length) : 0
    }
    return {
      id: t.id, name: t.name, nickname: t.nickname, abbr: t.abbr, city: t.city,
      conference: t.conference, division: t.division, colors: t.colors, altColors: t.altColors,
      reputation: t.reputation, prestige: t.prestige,
      offOverall: avg(gt.depth.offense), defOverall: avg(gt.depth.defense), stOverall: avg(gt.depth.special),
      starOverall: roster.reduce((m, p) => Math.max(m, p.overall), 0)
    }
  })
}

/** Preview detalhado de uma franquia (sem save aberto): médias por categoria + top players por unidade. */
export function worldTeamPreview(input: { league: League; teamId: string }): TeamPreviewDetail {
  const preview = worldTeams({ league: input.league }).find((t) => t.id === input.teamId)
  if (!preview) throw new AppError('BAD_TEAM', 'Time inexistente')
  const { players } = loadSeedWorld(input.league)
  const roster = players.filter((p) => p.teamId === input.teamId)

  const top = (positions: string[], n: number): Player[] =>
    roster.filter((p) => positions.includes(p.position)).sort((a, b) => b.overall - a.overall).slice(0, n)
  const attrAvg = (ps: Player[], keys: (keyof Player['attributes'])[]): number => {
    if (!ps.length) return 40
    const s = ps.reduce((sum, p) => sum + keys.reduce((a, k) => a + p.attributes[k], 0) / keys.length, 0)
    return Math.round(s / ps.length)
  }
  const OFF = ['QB', 'RB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT']
  const DEF = ['DE', 'DT', 'NT', 'OLB', 'ILB', 'MLB', 'CB', 'FS', 'SS']
  const OL = ['LT', 'LG', 'C', 'RG', 'RT']

  const categories = [
    { label: 'Passe', value: Math.round(0.6 * attrAvg(top(['QB'], 1), ['thp', 'tha', 'tup', 'awr']) + 0.4 * attrAvg(top(['WR', 'TE'], 3), ['rte', 'cth', 'rac'])) },
    { label: 'Corrida', value: Math.round(0.5 * attrAvg(top(['RB', 'FB'], 2), ['bcv', 'trk', 'car', 'spd']) + 0.5 * attrAvg(top(OL, 5), ['rbk', 'str'])) },
    { label: 'Bloqueio', value: attrAvg(top(OL, 5), ['pbk', 'rbk']) },
    { label: 'Pass Rush', value: attrAvg(top(['DE', 'DT', 'NT', 'OLB'], 4), ['prsh', 'bsh']) },
    { label: 'Cobertura', value: Math.round(0.7 * attrAvg(top(['CB', 'FS', 'SS'], 4), ['cov', 'zcv', 'prc']) + 0.3 * attrAvg(top(['ILB', 'MLB', 'OLB'], 2), ['cov', 'zcv'])) },
    { label: 'Chute', value: attrAvg(top(['K', 'P'], 2), ['kpw', 'kac']) }
  ]

  const lite = (p: Player): PlayerLite => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, position: p.position, overall: p.overall, jerseyNumber: p.jerseyNumber })
  return {
    team: preview,
    qb: top(['QB'], 1).map(lite)[0] ?? null,
    categories,
    units: {
      offense: top(OFF, 5).map(lite),
      defense: top(DEF, 5).map(lite),
      special: top(['K', 'P', 'LS'], 3).map(lite)
    }
  }
}

// ---------------------------------------------------------------- API: roster

export function rosterGet(input: { teamId?: string }): RosterView {
  const o = mustBeOpen()
  const teamId = input.teamId ?? o.info.teamId
  const team = o.teams.get(teamId)
  if (!team) throw new AppError('BAD_TEAM', 'Time inexistente')
  const picks = (metaGet<DraftPick[]>(o.saveDb, 'draftPicks') ?? []).filter((p) => p.ownerTeamId === teamId).sort((a, b) => a.season - b.season || a.round - b.round)
  return { teamId, team: teamRef(team), players: rosterOf(o, teamId).sort((a, b) => b.overall - a.overall), picks }
}

// ---------------------------------------------------------------- API: tactics

export function getScheme(): SchemeSetup {
  const o = mustBeOpen()
  return metaGet<SchemeSetup>(o.saveDb, 'userScheme') ?? defaultScheme(o.teams.get(o.info.teamId)!)
}

export function setScheme(input: { offense: SchemeSetup['offense']; defense: SchemeSetup['defense']; sliders?: SchemeSetup['sliders'] }): SchemeSetup {
  const o = mustBeOpen()
  const scheme = schemeFrom(input.offense, input.defense, input.sliders)
  metaSet(o.saveDb, 'userScheme', scheme)
  return scheme
}

export function getDepthChart(): DepthChartView {
  const o = mustBeOpen()
  const gt = gameTeamFor(o, o.info.teamId)
  return { teamId: o.info.teamId, scheme: gt.scheme, depth: gt.depth, players: rosterOf(o, o.info.teamId).sort((a, b) => b.overall - a.overall) }
}

export function setDepthChart(input: { unit: 'offense' | 'defense' | 'special'; orderedIds: string[] }): DepthChartView {
  const o = mustBeOpen()
  const current = gameTeamFor(o, o.info.teamId).depth
  const rosterIds = new Set(rosterOf(o, o.info.teamId).map((p) => p.id))
  const cleaned = input.orderedIds.filter((id) => rosterIds.has(id))
  const next: DepthChart = { ...current, [input.unit]: cleaned }
  metaSet(o.saveDb, 'userDepth', next)
  return getDepthChart()
}

// ---------------------------------------------------------------- API: game replay

export function gameResult(input: { gameId: string }): GameDayView {
  const o = mustBeOpen()
  const row = o.saveDb.db.select().from(gamesTable).where(eq(gamesTable.id, input.gameId)).get()
  if (!row || !row.result) throw new AppError('NO_RESULT', 'Jogo não encontrado ou não jogado')
  const result = JSON.parse(row.result) as GameResult
  const home = o.teams.get(row.homeTeamId)!
  const away = o.teams.get(row.awayTeamId)!
  const players: Record<string, PlayerRef> = {}
  for (const teamId of [row.homeTeamId, row.awayTeamId]) {
    for (const p of rosterOf(o, teamId)) {
      players[p.id] = { id: p.id, firstName: p.firstName, lastName: p.lastName, position: p.position, jerseyNumber: p.jerseyNumber, overall: p.overall }
    }
  }
  return { gameId: input.gameId, result, home: teamRef(home), away: teamRef(away), players }
}

// ---------------------------------------------------------------- API: market

function recordTransaction(o: OpenSave, type: 'sign' | 'release' | 'trade', text: string): void {
  const list = metaGet<TransactionView[]>(o.saveDb, 'transactions') ?? []
  list.unshift({ type, text, seasonNumber: o.season.seasonNumber, week: o.season.week })
  metaSet(o.saveDb, 'transactions', list.slice(0, 100))
}

function upsertPlayerRow(o: OpenSave, p: Player): void {
  o.players.set(p.id, p)
  o.saveDb.raw
    .prepare('INSERT OR REPLACE INTO players (id, team_id, position, overall, data) VALUES (?,?,?,?,?)')
    .run(p.id, p.teamId, p.position, p.overall, JSON.stringify(p))
}
function deletePlayerRow(o: OpenSave, id: string): void {
  o.players.delete(id)
  o.saveDb.raw.prepare('DELETE FROM players WHERE id = ?').run(id)
}

function marketView(o: OpenSave): MarketView {
  const fin = financeOf(o)
  const config = LEAGUE_CONFIG[o.info.league]
  const freeAgents = (metaGet<Player[]>(o.saveDb, 'freeAgents') ?? []).sort((a, b) => b.overall - a.overall)
  return {
    leagueCap: fin.leagueCap,
    totalCapHit: fin.totalCapHit,
    capSpace: fin.capSpace,
    rosterSize: fin.rosterSize,
    hasCap: config.hasCap,
    freeAgents,
    roster: rosterOf(o, o.info.teamId).sort((a, b) => b.overall - a.overall),
    teams: [...o.teams.values()].map((t) => ({ id: t.id, abbr: t.abbr, name: `${t.name} ${t.nickname}`, conference: t.conference, division: t.division })),
    transactions: metaGet<TransactionView[]>(o.saveDb, 'transactions') ?? [],
    myPicks: (metaGet<DraftPick[]>(o.saveDb, 'draftPicks') ?? []).filter((p) => p.ownerTeamId === o.info.teamId).sort((a, b) => a.season - b.season || a.round - b.round)
  }
}

export function marketGet(): MarketView {
  return marketView(mustBeOpen())
}

export function marketSignFree(input: { playerId: string }): MarketActionResult {
  const o = mustBeOpen()
  const pool = metaGet<Player[]>(o.saveDb, 'freeAgents') ?? []
  const fa = pool.find((p) => p.id === input.playerId)
  if (!fa) return { ok: false, message: 'Agente livre não encontrado.', market: marketView(o) }
  const fin = financeOf(o)
  const config = LEAGUE_CONFIG[o.info.league]
  if (fin.rosterSize >= 53) return { ok: false, message: 'Roster cheio (53). Libere um jogador antes.', market: marketView(o) }
  if (!freeAgentAccepts(fa, fin.capSpace, config.hasCap)) return { ok: false, message: 'Sem espaço de cap para essa contratação.', market: marketView(o) }
  const signed: Player = { ...fa, teamId: o.info.teamId }
  upsertPlayerRow(o, signed)
  metaSet(o.saveDb, 'freeAgents', pool.filter((p) => p.id !== fa.id))
  // remove qualquer listagem viva que referencie o jogador contratado
  const listings = metaGet<MarketListing[]>(o.saveDb, 'marketListings') ?? []
  metaSet(o.saveDb, 'marketListings', listings.filter((l) => l.player.id !== fa.id))
  recordTransaction(o, 'sign', `Contratou ${fa.firstName} ${fa.lastName} (${fa.position}, ${fa.overall} OVR)`)
  backup(o)
  return { ok: true, message: `${fa.firstName} ${fa.lastName} contratado.`, market: marketView(o) }
}

export function marketRelease(input: { playerId: string }): MarketActionResult {
  const o = mustBeOpen()
  const p = o.players.get(input.playerId)
  if (!p || p.teamId !== o.info.teamId) return { ok: false, message: 'Jogador não encontrado no seu elenco.', market: marketView(o) }
  if (financeOf(o).rosterSize <= 46) return { ok: false, message: 'Roster mínimo (46) atingido.', market: marketView(o) }
  deletePlayerRow(o, p.id)
  const pool = metaGet<Player[]>(o.saveDb, 'freeAgents') ?? []
  pool.push({ ...p, teamId: 'free-agent' })
  metaSet(o.saveDb, 'freeAgents', pool)
  recordTransaction(o, 'release', `Liberou ${p.firstName} ${p.lastName} (${p.position})`)
  backup(o)
  return { ok: true, message: `${p.firstName} ${p.lastName} liberado.`, market: marketView(o) }
}

export function marketProposeTrade(input: { giveIds: string[]; getTeamId: string; getIds: string[]; givePickIds?: string[]; getPickIds?: string[] }): MarketActionResult {
  const o = mustBeOpen()
  const config = LEAGUE_CONFIG[o.info.league]
  const give = input.giveIds.map((id) => o.players.get(id)).filter((p): p is Player => !!p && p.teamId === o.info.teamId)
  const get = input.getIds.map((id) => o.players.get(id)).filter((p): p is Player => !!p && p.teamId === input.getTeamId)

  const allPicks = metaGet<DraftPick[]>(o.saveDb, 'draftPicks') ?? []
  const givePicks = (input.givePickIds ?? []).map((id) => allPicks.find((p) => p.id === id)).filter((p): p is DraftPick => !!p && p.ownerTeamId === o.info.teamId)
  const getPicks = (input.getPickIds ?? []).map((id) => allPicks.find((p) => p.id === id)).filter((p): p is DraftPick => !!p && p.ownerTeamId === input.getTeamId)

  if (!give.length && !givePicks.length) return { ok: false, message: 'Ofereça ao menos um ativo.', market: marketView(o) }
  if (!get.length && !getPicks.length) return { ok: false, message: 'Selecione ao menos um ativo do outro time.', market: marketView(o) }

  const aiTeam = o.teams.get(input.getTeamId)
  if (!aiTeam) return { ok: false, message: 'Time inválido.', market: marketView(o) }
  const aiRoster = rosterOf(o, input.getTeamId)
  const draftSeason = o.season.seasonNumber + 1
  const aiCapSpace = config.hasCap ? (LEAGUE_CAP[o.info.league] ?? 0) - aiRoster.reduce((s, p) => s + p.capHit, 0) : Infinity
  const evalResult = aiEvaluateTradeWithPicks(aiRoster, give, get, picksValue(givePicks, draftSeason), picksValue(getPicks, draftSeason), aiCapSpace, config.hasCap)

  // guardas do usuário: cap e roster
  const userAfterCap = financeOf(o).capSpace + give.reduce((s, p) => s + p.capHit, 0) - get.reduce((s, p) => s + p.capHit, 0)
  if (config.hasCap && userAfterCap < 0) return { ok: false, accepted: false, message: 'A troca estouraria seu salary cap.', market: marketView(o) }
  if (!evalResult.accept) return { ok: true, accepted: false, message: evalResult.reason, market: marketView(o) }

  // executa: jogadores trocam de time
  for (const p of give) upsertPlayerRow(o, { ...p, teamId: input.getTeamId })
  for (const p of get) upsertPlayerRow(o, { ...p, teamId: o.info.teamId })
  // picks trocam de dono
  if (givePicks.length || getPicks.length) {
    const giveSet = new Set(givePicks.map((p) => p.id))
    const getSet = new Set(getPicks.map((p) => p.id))
    metaSet(o.saveDb, 'draftPicks', allPicks.map((p) => (giveSet.has(p.id) ? { ...p, ownerTeamId: input.getTeamId } : getSet.has(p.id) ? { ...p, ownerTeamId: o.info.teamId } : p)))
  }
  const giveDesc = [...give.map((p) => p.lastName), ...givePicks.map((p) => `R${p.round}'${p.season}`)].join(', ')
  const getDesc = [...get.map((p) => p.lastName), ...getPicks.map((p) => `R${p.round}'${p.season}`)].join(', ')
  recordTransaction(o, 'trade', `Trade com ${aiTeam.abbr}: enviou ${giveDesc || '—'} por ${getDesc || '—'}`)
  backup(o)
  return { ok: true, accepted: true, message: 'Troca aceita!', market: marketView(o) }
}

// ---------------------------------------------------------------- API: offseason (multi-temporada)

function templateCounts(): Map<string, number> {
  const m = new Map<string, number>()
  for (const pos of ROSTER_TEMPLATE) m.set(pos, (m.get(pos) ?? 0) + 1)
  return m
}

function neediestPosition(roster: Player[], target: Map<string, number>): Player['position'] {
  const cur = new Map<string, number>()
  for (const p of roster) cur.set(p.position, (cur.get(p.position) ?? 0) + 1)
  let best: Player['position'] = 'WR'
  let bestDeficit = -Infinity
  for (const [pos, tgt] of target) {
    const deficit = tgt - (cur.get(pos) ?? 0)
    if (deficit > bestDeficit) { bestDeficit = deficit; best = pos as Player['position'] }
  }
  return best
}

// -------------------------------------------------- offseason por fases (§10B)

const OFFSEASON_PHASES: SeasonPhase[] = ['offseason', 'draft', 'free_agency', 'pre_season']
const upcomingSeasonNum = (o: OpenSave): number => o.season.seasonNumber + 1

/** offseason: desenvolve/aposenta o elenco (aposentados notáveis viram lendas). */
function enterOffseason(o: OpenSave): void {
  const newSeasonNum = upcomingSeasonNum(o)
  const devSeed = deriveSeed(o.info.masterSeed, 'season', newSeasonNum)
  const rng = createRng(devSeed)
  const survivors: Player[] = []
  const legends = metaGet<Player[]>(o.saveDb, 'retiredLegends') ?? []
  let retired = 0
  for (const p of o.players.values()) {
    const dev = developPlayer(rng, p)
    if (shouldRetire(rng, dev)) {
      retired++
      if (dev.overall >= 82) legends.push({ ...dev, teamId: 'retired', persona: 'comeback_story' })
      continue
    }
    survivors.push(dev)
  }
  o.players = new Map(survivors.map((p) => [p.id, p]))
  o.saveDb.raw.transaction(() => {
    o.saveDb.raw.prepare('DELETE FROM players').run()
    const ins = o.saveDb.raw.prepare('INSERT INTO players (id, team_id, position, overall, data) VALUES (?,?,?,?,?)')
    for (const p of survivors) ins.run(p.id, p.teamId, p.position, p.overall, JSON.stringify(p))
  })()
  metaSet(o.saveDb, 'retiredLegends', legends.slice(0, 24))
  metaSet(o.saveDb, 'champion', null)
  metaSet(o.saveDb, 'finalists', [])
  metaSet(o.saveDb, 'userMadePlayoffs', false)
  metaSet(o.saveDb, 'objectives', generateObjectives(o.teams.get(o.info.teamId)!, createRng(deriveSeed(o.info.masterSeed, 'objectives', newSeasonNum))))
  const evState = metaGet<EventsState>(o.saveDb, 'events') ?? { pending: null, legendaryUsed: false, history: [] }
  metaSet(o.saveDb, 'events', { pending: null, legendaryUsed: false, history: evState.history })
  recordTransaction(o, 'release', `Offseason ${newSeasonNum}: ${retired} aposentadorias, elenco desenvolvido.`)
  o.season = { ...o.season, phase: 'offseason' }
  metaSet(o.saveDb, 'season', o.season)
}

/** draft: garante a classe do próximo draft e entra na janela de Draft Night. */
function enterDraft(o: OpenSave): void {
  ensureDraftClass(o, upcomingSeasonNum(o))
  o.season = { ...o.season, phase: 'draft' }
  metaSet(o.saveDb, 'season', o.season)
}

/** free agency: regenera pool de FAs, mercado e limpa negociação/trade block. */
function enterFreeAgency(o: OpenSave): void {
  const newSeasonNum = upcomingSeasonNum(o)
  const newFaPool = generateFreeAgentPool(createRng(deriveSeed(o.info.masterSeed, 'free-agents', newSeasonNum)))
  metaSet(o.saveDb, 'freeAgents', newFaPool)
  metaSet(o.saveDb, 'marketListings', seedListingsFromPool(newFaPool, createRng(deriveSeed(o.info.masterSeed, 'market-seed', newSeasonNum)), newSeasonNum))
  metaSet(o.saveDb, 'marketPulse', { seasonNumber: newSeasonNum, week: 1, phase: 'free_agency', volatility: 25, heat: 32, deadlinePressure: 0, mediaIntensity: 25, stories: [] } satisfies MarketPulse)
  metaSet(o.saveDb, 'negotiation', null)
  metaSet(o.saveDb, 'tradeBlock', [])
  o.season = { ...o.season, phase: 'free_agency' }
  metaSet(o.saveDb, 'season', o.season)
}

/** pré-temporada: reabre o training camp. */
function enterPreseason(o: OpenSave): void {
  metaSet(o.saveDb, 'campDone', false)
  metaSet(o.saveDb, 'campSummary', null)
  o.season = { ...o.season, phase: 'pre_season' }
  metaSet(o.saveDb, 'season', o.season)
}

/** finaliza a offseason: incrementa a temporada, completa rosters, monta calendário. */
function finalizeRegular(o: OpenSave): void {
  const newSeasonNum = upcomingSeasonNum(o)
  const devSeed = deriveSeed(o.info.masterSeed, 'season', newSeasonNum)
  // backfill de segurança: times abaixo de 53 após draft/FA
  const target = templateCounts()
  let rookieIdx = 90000
  for (const teamId of o.teams.keys()) {
    const team = o.teams.get(teamId)
    if (!team) continue
    let roster = rosterOf(o, teamId)
    while (roster.length < 53) {
      const rk = generateRookie(devSeed, teamId, neediestPosition(roster, target), team.prestige, rookieIdx++)
      upsertPlayerRow(o, rk)
      roster = rosterOf(o, teamId)
    }
  }
  o.saveDb.raw.prepare('DELETE FROM games').run()
  o.season = { week: 1, phase: 'regular', seasonNumber: newSeasonNum }
  insertFixtures(o, buildScheduleFor(o.info.league, [...o.teams.values()], devSeed))
  metaSet(o.saveDb, 'season', o.season)
  metaSet(o.saveDb, 'champion', null)
  metaSet(o.saveDb, 'finalists', [])
  metaSet(o.saveDb, 'userMadePlayoffs', false)
  metaSet(o.saveDb, 'marketPulse', { seasonNumber: newSeasonNum, week: 1, phase: 'regular', volatility: 20, heat: 15, deadlinePressure: 0, mediaIntensity: 15, stories: [] } satisfies MarketPulse)
  for (const k of ['seeds', 'seedIndex', 'alive', 'playoffRounds', 'playoffRoundIdx']) metaSet(o.saveDb, k, null)
  recordTransaction(o, 'sign', `Temporada ${newSeasonNum} começa.`)
}

/** Constrói o AdvanceResult de um passo de offseason (sem jogos simulados). */
function offseasonStep(o: OpenSave, message: string): AdvanceResult {
  backup(o)
  upsertIndex(saveMetaOf(o))
  return { week: o.season.week, phase: o.season.phase, advanced: true, userFixture: null, userGameId: null, seasonComplete: false, championTeamId: metaGet<string | null>(o.saveDb, 'champion'), message }
}

/** Fast-forward: roda toda a offseason restante de uma vez → nova temporada regular. */
export function startNewSeason(): Snapshot {
  const o = mustBeOpen()
  if (o.season.phase !== 'finished' && !OFFSEASON_PHASES.includes(o.season.phase)) {
    throw new AppError('NOT_FINISHED', 'Termine a temporada antes de iniciar outra')
  }
  if (o.season.phase === 'finished') enterOffseason(o)
  if (o.season.phase === 'offseason') enterDraft(o)
  if (o.season.phase === 'draft') {
    const ds = metaGet<DraftState>(o.saveDb, 'draftState')
    if (!ds?.completed || ds.season !== upcomingSeasonNum(o)) draftRun({})
    enterFreeAgency(o)
  }
  if (o.season.phase === 'free_agency') enterPreseason(o)
  if (o.season.phase === 'pre_season') finalizeRegular(o)
  backup(o)
  upsertIndex(saveMetaOf(o))
  return snapshot()
}

export function scoutSearch(input: { position?: string; minOverall?: number }): ScoutView {
  const o = mustBeOpen()
  const min = input.minOverall ?? 0
  const players = [...o.players.values()]
    .filter((p) => p.teamId !== o.info.teamId && (!input.position || p.position === input.position) && p.overall >= min)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 60)
    .map((p) => {
      const t = o.teams.get(p.teamId)!
      return { ...p, teamAbbr: t.abbr, teamName: `${t.name} ${t.nickname}` }
    })
  return { players }
}

// ---------------------------------------------------------------- API: eventos surpresa

export function eventsGet(): EventsView {
  const o = mustBeOpen()
  const st = metaGet<EventsState>(o.saveDb, 'events') ?? { pending: null, legendaryUsed: false, history: [] }
  return {
    pending: st.pending,
    history: st.history.slice(0, 30).map((h) => ({ title: h.card.title, type: h.card.type, seasonNumber: h.seasonNumber, week: h.week, affected: h.affected }))
  }
}

export function eventsChoose(input: { index: number }): EventChooseResult {
  const o = mustBeOpen()
  const st = metaGet<EventsState>(o.saveDb, 'events')
  if (!st?.pending) return { ok: false, message: 'Nenhum acontecimento pendente.', snapshot: snapshot() }
  const card = st.pending[input.index]
  if (!card) return { ok: false, message: 'Escolha inválida.', snapshot: snapshot() }

  const rng = createRng(deriveSeed(o.info.masterSeed, 'event-apply', o.season.seasonNumber, o.season.week, card.id))
  const roster = rosterOf(o, o.info.teamId)
  const result = applyCard(rng, card, roster)
  for (const p of result.players.values()) upsertPlayerRow(o, p)
  if (result.capCredit) metaSet(o.saveDb, 'capCredit', (metaGet<number>(o.saveDb, 'capCredit') ?? 0) + result.capCredit)

  st.pending = null
  if (card.rarity === 'legendary') st.legendaryUsed = true
  st.history.unshift({ card, seasonNumber: o.season.seasonNumber, week: o.season.week, affected: result.affectedNames })
  st.history = st.history.slice(0, 50)
  metaSet(o.saveDb, 'events', st)
  backup(o)
  return { ok: true, message: `${card.title} resolvido.`, snapshot: snapshot() }
}

// ---------------------------------------------------------------- API: feed

export function feedGet(): FeedView {
  const o = mustBeOpen()
  const results = resultsMap(o)
  const abbr = (id: string): string => o.teams.get(id)?.abbr ?? id
  const posts: FeedView['posts'] = []

  // resultados dos jogos do usuário
  const userGames = allFixtures(o)
    .filter((f) => (f.homeTeamId === o.info.teamId || f.awayTeamId === o.info.teamId) && f.status === 'played')
    .sort((a, b) => b.week - a.week)
    .slice(0, 12)
  for (const f of userGames) {
    const r = results.get(f.id)!
    const home = f.homeTeamId === o.info.teamId
    const us = home ? r.homeScore : r.awayScore
    const them = home ? r.awayScore : r.homeScore
    const opp = abbr(home ? f.awayTeamId : f.homeTeamId)
    const win = r.winnerTeamId === o.info.teamId
    const tie = r.winnerTeamId === null
    posts.push({
      id: `g-${f.id}`, category: 'game', tone: tie ? 'neutral' : win ? 'good' : 'bad',
      text: win ? `Vitória sobre ${opp} por ${us}-${them}! O ${o.teams.get(o.info.teamId)!.nickname} segue firme.` : tie ? `Empate ${us}-${them} contra ${opp}.` : `Derrota para ${opp} por ${them}-${us}. Reação necessária.`,
      seasonNumber: o.season.seasonNumber, week: f.week
    })
  }

  // eventos
  const ev = metaGet<EventsState>(o.saveDb, 'events')
  for (const h of (ev?.history ?? []).slice(0, 6)) {
    posts.push({ id: `e-${h.week}-${h.card.id}`, category: 'event', tone: h.card.type === 'positive' ? 'good' : h.card.type === 'negative' ? 'bad' : 'neutral', text: `${h.card.title}: ${h.card.narrative}${h.affected.length ? ` (${h.affected.join(', ')})` : ''}`, seasonNumber: h.seasonNumber, week: h.week })
  }

  // transações
  const txs = metaGet<TransactionView[]>(o.saveDb, 'transactions') ?? []
  for (const t of txs.slice(0, 8)) {
    posts.push({ id: `t-${t.seasonNumber}-${t.week}-${t.text.slice(0, 8)}`, category: 'transaction', tone: t.type === 'release' ? 'bad' : 'neutral', text: t.text, seasonNumber: t.seasonNumber, week: t.week })
  }

  posts.sort((a, b) => b.seasonNumber - a.seasonNumber || b.week - a.week)
  return { posts: posts.slice(0, 40) }
}

// ---------------------------------------------------------------- API: editor (modo-deus)

export function editorUpdatePlayer(input: {
  playerId: string
  firstName?: string
  lastName?: string
  jerseyNumber?: number
  potential?: number
  age?: number
  traits?: Player['traits']
  attributes?: Partial<Player['attributes']>
}): { player: Player } {
  const o = mustBeOpen()
  const p = o.players.get(input.playerId)
  if (!p) throw new AppError('NOT_FOUND', 'Jogador não encontrado')
  const attributes = { ...p.attributes, ...(input.attributes ?? {}) }
  const next: Player = {
    ...p,
    firstName: input.firstName ?? p.firstName,
    lastName: input.lastName ?? p.lastName,
    jerseyNumber: input.jerseyNumber ?? p.jerseyNumber,
    age: input.age ?? p.age,
    traits: input.traits ?? p.traits,
    attributes
  }
  next.overall = computeOverall(next)
  next.potential = Math.max(input.potential ?? p.potential, next.overall)
  next.capHit = computeCapHit(next.overall, next.age, next.position)
  next.marketValue = computeMarketValue(next.overall, next.age, next.position)
  upsertPlayerRow(o, next)
  return { player: next }
}

// ---------------------------------------------------------------- API: snapshot

function fixtureView(o: OpenSave, f: Fixture, results: Map<string, ResultLike>): FixtureView {
  const home = o.teams.get(f.homeTeamId)!
  const away = o.teams.get(f.awayTeamId)!
  const r = results.get(f.id)
  return {
    id: f.id, week: f.week, round: f.round,
    homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId,
    homeAbbr: home.abbr, awayAbbr: away.abbr,
    homeName: `${home.name} ${home.nickname}`, awayName: `${away.name} ${away.nickname}`,
    status: f.status,
    homeScore: r?.homeScore, awayScore: r?.awayScore,
    isUserGame: f.homeTeamId === o.info.teamId || f.awayTeamId === o.info.teamId
  }
}

/** Overall médio de um time = média dos 22 melhores do elenco (aprox. titulares off+def). */
function teamOverall(o: OpenSave, teamId: string): number {
  const top = rosterOf(o, teamId).sort((a, b) => b.overall - a.overall).slice(0, 22)
  return top.length ? Math.round(top.reduce((s, p) => s + p.overall, 0) / top.length) : 0
}

function mapStandingView(o: OpenSave, s: Standing): StandingView {
  const t = o.teams.get(s.teamId)!
  const qbP = rosterOf(o, s.teamId).filter((p) => p.position === 'QB').sort((a, b) => b.overall - a.overall)[0]
  const qb: PlayerLite | null = qbP
    ? { id: qbP.id, firstName: qbP.firstName, lastName: qbP.lastName, position: qbP.position, overall: qbP.overall, jerseyNumber: qbP.jerseyNumber }
    : null
  return {
    teamId: s.teamId, abbr: t.abbr, name: `${t.name} ${t.nickname}`, nickname: t.nickname,
    conference: t.conference, division: t.division, colors: t.colors, overall: teamOverall(o, s.teamId), qb,
    wins: s.wins, losses: s.losses, ties: s.ties, pct: s.pct,
    pointsFor: s.pointsFor, pointsAgainst: s.pointsAgainst, pointDiff: s.pointDiff,
    streak: s.streak, last5: s.last5, position: s.position, zone: s.zone
  }
}

function financeOf(o: OpenSave): OfficeFinance {
  const roster = rosterOf(o, o.info.teamId)
  const totalCapHit = roster.reduce((s, p) => s + p.capHit, 0)
  const rosterValue = roster.reduce((s, p) => s + p.marketValue, 0)
  const avgOverall = roster.length ? Math.round(roster.reduce((s, p) => s + p.overall, 0) / roster.length) : 0
  const hasCap = LEAGUE_CONFIG[o.info.league].hasCap
  const leagueCap = LEAGUE_CAP[o.info.league] ?? 0
  const capCredit = metaGet<number>(o.saveDb, 'capCredit') ?? 0
  const capSpace = hasCap ? leagueCap - totalCapHit + capCredit : 0
  return { leagueCap, totalCapHit, capSpace, rosterValue, rosterSize: roster.length, avgOverall }
}

function userBestWinStreak(o: OpenSave, results: Map<string, ResultLike>): number {
  const games = allFixtures(o)
    .filter((f) => f.round === 'regular' && (f.homeTeamId === o.info.teamId || f.awayTeamId === o.info.teamId) && f.status === 'played')
    .sort((a, b) => a.week - b.week)
  let best = 0
  let cur = 0
  for (const g of games) {
    const r = results.get(g.id)
    if (r?.winnerTeamId === o.info.teamId) { cur++; best = Math.max(best, cur) } else cur = 0
  }
  return best
}

export function snapshot(): Snapshot {
  const o = mustBeOpen()
  const results = resultsMap(o)
  const fixtures = allFixtures(o)
  const teams = [...o.teams.values()]
  const coreStandings = computeStandings(teams, fixtures, results)
  const standings = coreStandings.map((s) => mapStandingView(o, s))
  const myCore = coreStandings.find((s) => s.teamId === o.info.teamId)!
  const team = o.teams.get(o.info.teamId)!
  const units = unitOveralls(o, o.info.teamId)
  const champion = metaGet<string | null>(o.saveDb, 'champion')
  const config = LEAGUE_CONFIG[o.info.league]
  const seasonFinished = o.season.phase === 'finished'

  // objetivos + pressão
  const objs = metaGet<Objective[]>(o.saveDb, 'objectives') ?? []
  const finalists = metaGet<string[]>(o.saveDb, 'finalists') ?? []
  const madePlayoffs = metaGet<boolean>(o.saveDb, 'userMadePlayoffs') ?? false
  const reachedConference = finalists.includes(o.info.teamId) || champion === o.info.teamId
  const ctx = {
    standing: myCore, reputation: team.reputation, divisionRank: myCore.position,
    madePlayoffs, reachedConference, champion: champion === o.info.teamId,
    seasonFinished, bestWinStreak: userBestWinStreak(o, results)
  }
  const objectives: ObjectiveView[] = objs.map((obj) => evaluateObjective(obj, ctx))
  const primaryStatus = objectives.find((v) => v.kind === 'primary')?.status ?? 'pending'
  const boardStatus: BoardStatus = computeBoardStatus(myCore, team.reputation, primaryStatus, seasonFinished)

  const userFixtures = fixtures.filter((f) => f.homeTeamId === o.info.teamId || f.awayTeamId === o.info.teamId)
  const played = userFixtures.filter((f) => f.status === 'played').sort((a, b) => b.week - a.week)
  const upcoming = userFixtures.filter((f) => f.status === 'scheduled').sort((a, b) => a.week - b.week)

  return {
    save: {
      slug: o.slug, league: o.info.league, teamId: o.info.teamId, coachName: o.info.coachName,
      coachArchetype: o.info.coachArchetype,
      week: o.season.week, maxWeek: config.regularSeasonWeeks, phase: o.season.phase, seasonNumber: o.season.seasonNumber
    },
    team: {
      ...teamRef(team),
      offOverall: units.off, defOverall: units.def, avgOverall: Math.round((units.off + units.def) / 2),
      wins: myCore.wins, losses: myCore.losses, ties: myCore.ties, divisionRank: myCore.position
    },
    standings,
    nextFixtures: upcoming.slice(0, 3).map((f) => fixtureView(o, f, results)),
    lastResults: played.slice(0, 5).map((f) => fixtureView(o, f, results)),
    championTeamId: champion,
    objectives,
    finance: financeOf(o),
    boardStatus,
    gameOver: boardStatus === 'fired',
    pendingEvent: !!(metaGet<EventsState>(o.saveDb, 'events')?.pending),
    offseason: OFFSEASON_PHASES.includes(o.season.phase)
      ? { active: true, draftCompleted: metaGet<DraftState>(o.saveDb, 'draftState')?.completed === true && metaGet<DraftState>(o.saveDb, 'draftState')?.season === upcomingSeasonNum(o) }
      : null,
    controlMode: getControlModeOf(o)
  }
}

// ---------------------------------------------------------------- API: advance

function simFixture(o: OpenSave, f: Fixture, importance: 'regular' | 'playoff' | 'championship'): GameResult {
  const home = gameTeamFor(o, f.homeTeamId)
  const away = gameTeamFor(o, f.awayTeamId)
  const res = simulateGame(
    { home, away, rules: LEAGUE_CONFIG[o.info.league].rules, importance, neutralVenue: f.neutralVenue },
    f.simulationSeed
  )
  o.saveDb.raw.prepare('UPDATE games SET status = ?, result = ? WHERE id = ?').run('played', JSON.stringify(res), f.id)
  return res
}

interface EventsState {
  pending: EventCard[] | null
  legendaryUsed: boolean
  history: { card: EventCard; seasonNumber: number; week: number; affected: string[] }[]
}

const EVENT_CHANCE = 0.3

function maybeDrawEvent(o: OpenSave): void {
  const st = metaGet<EventsState>(o.saveDb, 'events') ?? { pending: null, legendaryUsed: false, history: [] }
  if (st.pending) return
  const rng = createRng(deriveSeed(o.info.masterSeed, 'event', o.season.seasonNumber, o.season.week))
  if (!rng.chance(EVENT_CHANCE)) return
  st.pending = drawThree(rng, !st.legendaryUsed)
  metaSet(o.saveDb, 'events', st)
}

// -------------------------------------------------- mercado vivo (§10B)

function seedListingsFromPool(pool: Player[], rng: ReturnType<typeof createRng>, season: number): MarketListing[] {
  return pool.slice(0, 14).map((p, i) => ({
    id: `ml-seed-${i}`,
    type: 'free_agent' as const,
    source: 'agent_call' as const,
    player: p,
    createdSeason: season,
    createdWeek: 1,
    expiresInGames: rng.int(3, 6),
    urgency: rng.int(30, 80),
    interestedTeams: []
  }))
}

/** Rotaciona o mercado vivo após uma leva de jogos (expira/cria + recalcula pulso). */
function rotateLiveMarket(o: OpenSave, hadMajorInjury: boolean): void {
  const config = LEAGUE_CONFIG[o.info.league]
  const listings = metaGet<MarketListing[]>(o.saveDb, 'marketListings') ?? []
  const nextId = metaGet<number>(o.saveDb, 'marketNextId') ?? 5000
  const week = o.season.week
  const deadlineWeek = Math.round(config.regularSeasonWeeks * 0.6)
  const isTradeDeadline = o.season.phase === 'regular' && week === deadlineWeek
  const otherAbbrs = [...o.teams.values()].filter((t) => t.id !== o.info.teamId).map((t) => t.abbr)
  const rng = createRng(deriveSeed(o.info.masterSeed, 'market', o.season.seasonNumber, week))
  const result = rotateMarket(listings, {
    rng, seasonNumber: o.season.seasonNumber, week, phase: o.season.phase,
    totalWeeks: config.regularSeasonWeeks, isTradeDeadline, hadMajorInjury, otherAbbrs, nextId
  })
  // adiciona os novos FAs ao pool (assináveis), com poda por tamanho
  const pool = metaGet<Player[]>(o.saveDb, 'freeAgents') ?? []
  const byId = new Map<string, Player>()
  for (const p of [...pool, ...result.newFreeAgents]) byId.set(p.id, p)
  const listingIds = new Set(result.listings.map((l) => l.player.id))
  const all = [...byId.values()]
  const referenced = all.filter((p) => listingIds.has(p.id))
  const rest = all.filter((p) => !listingIds.has(p.id)).sort((a, b) => b.overall - a.overall)
  metaSet(o.saveDb, 'freeAgents', [...referenced, ...rest].slice(0, 130))
  metaSet(o.saveDb, 'marketListings', result.listings)
  metaSet(o.saveDb, 'marketPulse', result.pulse)
  metaSet(o.saveDb, 'marketNextId', result.nextId)
}

/** Rotaciona o trade block: expira antigos e a IA disponibiliza novos jogadores. */
function rotateTradeBlockLive(o: OpenSave): void {
  const current = metaGet<TradeBlockItem[]>(o.saveDb, 'tradeBlock') ?? []
  const aiPlayersByTeam = [...o.teams.values()].filter((t) => t.id !== o.info.teamId).map((t) => ({ teamId: t.id, players: rosterOf(o, t.id) }))
  const rng = createRng(deriveSeed(o.info.masterSeed, 'tradeblock', o.season.seasonNumber, o.season.week))
  metaSet(o.saveDb, 'tradeBlock', rotateTradeBlock(current, aiPlayersByTeam, o.season.week, rng, rng.int(1, 3)))
}

/** Hook após simular os jogos de uma semana/rodada: lesões + rotação de mercado. */
function onWeekSimulated(o: OpenSave, results: GameResult[]): void {
  // cura semanal das lesões em andamento (snapshot p/ mutar o Map com segurança)
  for (const p of [...o.players.values()]) {
    if (p.injuryWeeks > 0) upsertPlayerRow(o, { ...p, injuryWeeks: p.injuryWeeks - 1 })
  }
  // aplica novas lesões desta leva de jogos
  let hadMajorInjury = false
  for (const res of results) {
    for (const inj of res.injuries) {
      const p = o.players.get(inj.playerId)
      if (!p) continue
      upsertPlayerRow(o, { ...p, injuryWeeks: Math.max(p.injuryWeeks, inj.weeks) })
      if (inj.weeks >= 4) hadMajorInjury = true
    }
  }
  rotateLiveMarket(o, hadMajorInjury)
  rotateTradeBlockLive(o)
}

export function marketPulse(): MarketPulseView {
  const o = mustBeOpen()
  const pulse = metaGet<MarketPulse>(o.saveDb, 'marketPulse') ?? { seasonNumber: o.season.seasonNumber, week: o.season.week, phase: o.season.phase, volatility: 0, heat: 0, deadlinePressure: 0, mediaIntensity: 0, stories: [] }
  const listings = metaGet<MarketListing[]>(o.saveDb, 'marketListings') ?? []
  return { pulse, listings }
}

export function tradeBlockGet(): TradeBlockView {
  const o = mustBeOpen()
  const items = metaGet<TradeBlockItem[]>(o.saveDb, 'tradeBlock') ?? []
  const enriched = items
    .map((i) => {
      const p = o.players.get(i.playerId)
      const t = o.teams.get(i.teamId)
      if (!p || !t || p.teamId !== i.teamId) return null
      return { ...i, player: { id: p.id, firstName: p.firstName, lastName: p.lastName, position: p.position, overall: p.overall, jerseyNumber: p.jerseyNumber }, teamAbbr: t.abbr, teamName: `${t.name} ${t.nickname}` }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
  return { items: enriched }
}

// -------------------------------------------------- notícias (§10B.9)

function pushNews(o: OpenSave, item: NewsItem): void {
  const list = metaGet<NewsItem[]>(o.saveDb, 'news') ?? []
  list.unshift(item)
  metaSet(o.saveDb, 'news', list.slice(0, 80))
  if (item.importance === 'breaking') metaSet(o.saveDb, 'breakingNews', item)
}

export function newsGet(): NewsView {
  const o = mustBeOpen()
  return { items: metaGet<NewsItem[]>(o.saveDb, 'news') ?? [] }
}
export function newsGetBreaking(): NewsItem | null {
  return metaGet<NewsItem | null>(mustBeOpen().saveDb, 'breakingNews') ?? null
}
export function newsAcknowledge(): { ok: true } {
  metaSet(mustBeOpen().saveDb, 'breakingNews', null)
  return { ok: true }
}

// -------------------------------------------------- negociação (§10B.5)

const ROLE_LABEL: Record<string, string> = { star: 'protagonista', starter: 'titular', rotation: 'rotação', depth: 'elenco' }
function moneyStr(n: number): string { return `$${(n / 1_000_000).toFixed(1)}M` }

function negotiationCtx(o: OpenSave, player: Player, listing?: MarketListing): NegotiationCtx {
  const team = o.teams.get(o.info.teamId)!
  const otherAbbrs = [...o.teams.values()].filter((t) => t.id !== o.info.teamId).map((t) => t.abbr)
  return {
    teamIsContender: (team.reputation ?? 2) >= 3,
    teamNeed: needScore(rosterOf(o, o.info.teamId), player.position),
    coachReputation: 60,
    competingTeams: listing?.interestedTeams?.length ? listing.interestedTeams : otherAbbrs.slice(0, 2)
  }
}

function negotiationView(o: OpenSave): NegotiationView {
  const session = metaGet<NegotiationSession | null>(o.saveDb, 'negotiation') ?? null
  const pool = metaGet<Player[]>(o.saveDb, 'freeAgents') ?? []
  const player = session ? pool.find((p) => p.id === session.playerId) ?? null : null
  const fin = financeOf(o)
  return { session, player, teamIsContender: (o.teams.get(o.info.teamId)!.reputation ?? 2) >= 3, capSpace: fin.capSpace, hasCap: LEAGUE_CONFIG[o.info.league].hasCap }
}

export function negotiationGet(): NegotiationView {
  return negotiationView(mustBeOpen())
}

export function negotiationStart(input: { playerId: string }): NegotiationView {
  const o = mustBeOpen()
  const pool = metaGet<Player[]>(o.saveDb, 'freeAgents') ?? []
  const player = pool.find((p) => p.id === input.playerId)
  if (!player) throw new AppError('BAD_PLAYER', 'Agente livre não encontrado.')
  const listing = (metaGet<MarketListing[]>(o.saveDb, 'marketListings') ?? []).find((l) => l.player.id === input.playerId)
  const rng = createRng(deriveSeed(o.info.masterSeed, 'nego', o.season.seasonNumber, o.season.week, player.id))
  const session = openNegotiation(`nego-${player.id}`, player, o.info.teamId, negotiationCtx(o, player, listing), rng)
  metaSet(o.saveDb, 'negotiation', session)
  return negotiationView(o)
}

export function negotiationSubmitOffer(input: ContractOffer): NegotiationView {
  const o = mustBeOpen()
  const session = metaGet<NegotiationSession | null>(o.saveDb, 'negotiation')
  if (!session || session.status === 'accepted' || session.status === 'rejected' || session.status === 'signed_elsewhere') {
    throw new AppError('NO_NEGOTIATION', 'Nenhuma negociação ativa.')
  }
  const pool = metaGet<Player[]>(o.saveDb, 'freeAgents') ?? []
  const player = pool.find((p) => p.id === session.playerId)
  if (!player) throw new AppError('BAD_PLAYER', 'Jogador saiu do mercado.')
  const listing = (metaGet<MarketListing[]>(o.saveDb, 'marketListings') ?? []).find((l) => l.player.id === session.playerId)
  const rng = createRng(deriveSeed(o.info.masterSeed, 'nego-offer', session.id, session.round, Math.round(input.salaryPerYear)))
  const next = evaluateOffer(session, input, negotiationCtx(o, player, listing), rng)
  metaSet(o.saveDb, 'negotiation', next)
  return negotiationView(o)
}

export function negotiationWalkAway(): NegotiationView {
  const o = mustBeOpen()
  metaSet(o.saveDb, 'negotiation', null)
  return negotiationView(o)
}

export function negotiationFinalize(): MarketActionResult {
  const o = mustBeOpen()
  const session = metaGet<NegotiationSession | null>(o.saveDb, 'negotiation')
  if (!session || session.status !== 'accepted' || !session.signedContract) throw new AppError('NOT_ACCEPTED', 'Não há acordo para assinar.')
  const pool = metaGet<Player[]>(o.saveDb, 'freeAgents') ?? []
  const fa = pool.find((p) => p.id === session.playerId)
  if (!fa) throw new AppError('BAD_PLAYER', 'Jogador saiu do mercado.')
  const fin = financeOf(o)
  const config = LEAGUE_CONFIG[o.info.league]
  if (fin.rosterSize >= 53) return { ok: false, message: 'Roster cheio (53). Libere um jogador antes.', market: marketView(o) }
  const c = session.signedContract
  const capHit = c.salaryPerYear
  if (config.hasCap && capHit > fin.capSpace) return { ok: false, message: 'Sem espaço de cap para esse contrato.', market: marketView(o) }
  const signed: Player = { ...fa, teamId: o.info.teamId, salary: c.salaryPerYear, capHit, contractYears: c.years, marketValue: computeMarketValue(fa.overall, fa.age, fa.position) }
  upsertPlayerRow(o, signed)
  metaSet(o.saveDb, 'freeAgents', pool.filter((p) => p.id !== fa.id))
  const listings = metaGet<MarketListing[]>(o.saveDb, 'marketListings') ?? []
  metaSet(o.saveDb, 'marketListings', listings.filter((l) => l.player.id !== fa.id))
  metaSet(o.saveDb, 'negotiation', null)
  recordTransaction(o, 'sign', `Contratou ${fa.firstName} ${fa.lastName} (${fa.position}, ${fa.overall} OVR) — ${c.years}a/${moneyStr(c.salaryPerYear)}`)
  const team = o.teams.get(o.info.teamId)!
  pushNews(o, {
    id: `news-${o.season.seasonNumber}-${o.season.week}-${fa.id}`,
    type: 'signing', importance: 'breaking',
    headline: `${team.name} ${team.nickname} acerta com ${fa.firstName} ${fa.lastName}`,
    subheadline: `${c.years} ${c.years > 1 ? 'anos' : 'ano'} · ${moneyStr(c.salaryPerYear)}/temporada · ${ROLE_LABEL[c.rolePromise ?? 'rotation']} (${fa.position}, ${fa.overall} OVR)`,
    teamIds: [o.info.teamId], playerIds: [fa.id],
    seasonNumber: o.season.seasonNumber, week: o.season.week, visualStyle: 'breaking'
  })
  backup(o)
  return { ok: true, message: `${fa.firstName} ${fa.lastName} contratado.`, market: marketView(o) }
}

// -------------------------------------------------- draft (§10B.6)

function prospectToRookie(o: OpenSave, p: Prospect, pickNumber: number, teamId: string): Player {
  const rng = createRng(deriveSeed(o.info.masterSeed, 'rookie-gen', p.id))
  const rookie = buildPlayer(rng, {
    teamId, firstName: p.firstName, lastName: p.lastName, age: p.age, nationality: 'USA',
    position: p.position, overallTarget: p.trueOverall, potential: p.truePotential,
    jerseyNumber: rng.int(1, 99), traits: [], secondaryPositions: [], classYear: p.classYear
  }, pickNumber)
  rookie.id = `rk-${p.id}`
  rookie.yearsPro = 0
  return rookie
}
function trimRosterTo53(o: OpenSave, teamId: string): void {
  let roster = rosterOf(o, teamId)
  let guard = 0
  while (roster.length > 53 && guard++ < 40) {
    const worst = roster.reduce((m, p) => (p.overall < m.overall ? p : m), roster[0])
    deletePlayerRow(o, worst.id)
    roster = rosterOf(o, teamId)
  }
}
function draftTeamOrder(o: OpenSave): string[] {
  return [...o.teams.values()].sort((a, b) => a.reputation - b.reputation || a.prestige - b.prestige || (a.id < b.id ? -1 : 1)).map((t) => t.id)
}
function buildPickOrder(o: OpenSave, season: number): DraftPick[] {
  const picks = (metaGet<DraftPick[]>(o.saveDb, 'draftPicks') ?? []).filter((p) => p.season === season)
  const order = draftTeamOrder(o)
  const idx = new Map(order.map((id, i) => [id, i]))
  return picks.sort((a, b) => a.round - b.round || ((idx.get(a.originalTeamId) ?? 99) - (idx.get(b.originalTeamId) ?? 99)))
}
const upcomingDraftSeason = (o: OpenSave): number => o.season.seasonNumber + 1

function ensureDraftClass(o: OpenSave, season: number): Prospect[] {
  const existing = metaGet<Prospect[]>(o.saveDb, 'draftClass')
  const state = metaGet<DraftState>(o.saveDb, 'draftState')
  if (existing && state && state.season === season) return existing
  const fresh = generateDraftClass(o.info.masterSeed, season)
  metaSet(o.saveDb, 'draftClass', fresh)
  metaSet(o.saveDb, 'draftState', { season, completed: false, pickOrder: buildPickOrder(o, season).map((p) => p.id) } satisfies DraftState)
  if (metaGet<number>(o.saveDb, 'draftScoutPoints') == null) metaSet(o.saveDb, 'draftScoutPoints', 30)
  return fresh
}
function prospectView(p: Prospect): ProspectView {
  return {
    id: p.id, firstName: p.firstName, lastName: p.lastName, age: p.age, position: p.position,
    classYear: p.classYear, college: p.college, visibleGrade: p.visibleGrade, projectedRound: p.projectedRound,
    boomBust: p.boomBust, scoutingLevel: p.scoutingLevel, revealedOverall: p.revealedOverall, revealedPotential: p.revealedPotential,
    developmentTrait: p.scoutingLevel >= 3 ? p.developmentTrait : undefined, drafted: p.drafted
  }
}
function draftView(o: OpenSave): DraftView {
  const season = upcomingDraftSeason(o)
  const prospects = ensureDraftClass(o, season)
  const state = metaGet<DraftState>(o.saveDb, 'draftState')!
  const order = buildPickOrder(o, season)
  const myPickNumbers = order.map((pk, i) => (pk.ownerTeamId === o.info.teamId ? i + 1 : -1)).filter((n) => n > 0)
  return {
    season, completed: state.completed, scoutPoints: metaGet<number>(o.saveDb, 'draftScoutPoints') ?? 30,
    myPickNumbers, prospects: prospects.map(prospectView)
  }
}

export function draftGetClass(): DraftView { return draftView(mustBeOpen()) }

export function draftScout(input: { prospectId: string }): DraftView {
  const o = mustBeOpen()
  const points = metaGet<number>(o.saveDb, 'draftScoutPoints') ?? 30
  if (points <= 0) throw new AppError('NO_POINTS', 'Sem pontos de scouting nesta janela.')
  const prospects = metaGet<Prospect[]>(o.saveDb, 'draftClass') ?? []
  const idx = prospects.findIndex((p) => p.id === input.prospectId)
  if (idx < 0) throw new AppError('BAD_PROSPECT', 'Prospect inexistente.')
  if (prospects[idx].scoutingLevel >= 4) return draftView(o)
  prospects[idx] = scoutProspect(prospects[idx])
  metaSet(o.saveDb, 'draftClass', prospects)
  metaSet(o.saveDb, 'draftScoutPoints', points - 1)
  return draftView(o)
}

export function draftRun(input: { selections?: Record<string, string> }): DraftRunResult {
  const o = mustBeOpen()
  if (o.season.phase !== 'draft') throw new AppError('NOT_DRAFT_PHASE', 'O Draft Night só acontece na fase de Draft da offseason.')
  const season = upcomingDraftSeason(o)
  const state = metaGet<DraftState>(o.saveDb, 'draftState')
  if (state?.completed && state.season === season) throw new AppError('DRAFT_DONE', 'Draft já realizado nesta janela.')
  const prospects = ensureDraftClass(o, season)
  const byId = new Map(prospects.map((p) => [p.id, p]))
  const available = new Set(prospects.filter((p) => !p.drafted).map((p) => p.id))
  const order = buildPickOrder(o, season)
  const sel = input.selections ?? {}
  const myResults: DraftPickResultView[] = []
  const team = o.teams.get(o.info.teamId)!
  let pickNumber = 0
  for (const pick of order) {
    pickNumber++
    const teamId = pick.ownerTeamId
    let chosen: Prospect | undefined
    const wanted = sel[String(pickNumber)]
    if (teamId === o.info.teamId && wanted && available.has(wanted)) chosen = byId.get(wanted)
    if (!chosen) chosen = bestAvailable([...available].map((id) => byId.get(id)!).filter(Boolean), rosterOf(o, teamId))
    if (!chosen) break
    available.delete(chosen.id)
    chosen.drafted = { teamId, pickNumber }
    upsertPlayerRow(o, prospectToRookie(o, chosen, pickNumber, teamId))
    trimRosterTo53(o, teamId)
    if (teamId === o.info.teamId) {
      myResults.push({ pickNumber, name: `${chosen.firstName} ${chosen.lastName}`, position: chosen.position, overall: chosen.trueOverall, round: pick.round })
      recordTransaction(o, 'sign', `Draft #${pickNumber} (R${pick.round}): ${chosen.firstName} ${chosen.lastName} (${chosen.position}, ${chosen.trueOverall} OVR)`)
    }
  }
  metaSet(o.saveDb, 'draftClass', prospects)
  metaSet(o.saveDb, 'draftPicks', (metaGet<DraftPick[]>(o.saveDb, 'draftPicks') ?? []).filter((p) => p.season !== season))
  metaSet(o.saveDb, 'draftState', { season, completed: true, pickOrder: order.map((p) => p.id) } satisfies DraftState)
  const first = myResults[0]
  if (first) {
    pushNews(o, {
      id: `news-draft-${season}-${first.pickNumber}`, type: 'draft_pick', importance: 'high',
      headline: `${team.name} ${team.nickname} drafta ${first.name}`,
      subheadline: `Pick #${first.pickNumber} · R${first.round} · ${first.position} · ${first.overall} OVR`,
      teamIds: [o.info.teamId], playerIds: [], seasonNumber: o.season.seasonNumber, week: o.season.week, visualStyle: 'draft'
    })
  }
  backup(o)
  return { season, totalPicks: pickNumber, myResults }
}

// -------------------------------------------------- pré-temporada (§10B.7)

function preseasonView(o: OpenSave): PreseasonView {
  const focus = metaGet<TrainingCampFocus>(o.saveDb, 'campFocus') ?? 'conditioning'
  const campDone = metaGet<boolean>(o.saveDb, 'campDone') ?? false
  const summary = metaGet<string>(o.saveDb, 'campSummary') ?? null
  const rng = createRng(deriveSeed(o.info.masterSeed, 'battles', o.season.seasonNumber))
  const battles = resolveBattles(rosterOf(o, o.info.teamId), rng)
  return { focus, campDone, summary, battles }
}

export function preseasonGet(): PreseasonView { return preseasonView(mustBeOpen()) }

export function preseasonSetFocus(input: { focus: TrainingCampFocus }): PreseasonView {
  const o = mustBeOpen()
  metaSet(o.saveDb, 'campFocus', input.focus)
  return preseasonView(o)
}

export function preseasonRunCamp(): PreseasonView {
  const o = mustBeOpen()
  if (o.season.phase !== 'pre_season') throw new AppError('NOT_PRESEASON', 'O training camp só acontece na pré-temporada.')
  if (metaGet<boolean>(o.saveDb, 'campDone')) throw new AppError('CAMP_DONE', 'O training camp desta pré-temporada já foi realizado.')
  const focus = metaGet<TrainingCampFocus>(o.saveDb, 'campFocus') ?? 'conditioning'
  const rng = createRng(deriveSeed(o.info.masterSeed, 'camp', o.season.seasonNumber))
  const res = applyCamp(focus, rosterOf(o, o.info.teamId), rng)
  for (const p of res.players) upsertPlayerRow(o, p)
  if (focus === 'playbook_installation') bumpPlaybookFamiliarity(o, 12)
  metaSet(o.saveDb, 'campDone', true)
  metaSet(o.saveDb, 'campSummary', res.summary)
  backup(o)
  return preseasonView(o)
}

// -------------------------------------------------- lendas aposentadas (§10B.3)

function legendEffRng(o: OpenSave, legendId: string): ReturnType<typeof createRng> {
  return createRng(deriveSeed(o.info.masterSeed, 'legend-eff', legendId))
}

export function legendsGet(): LegendsView {
  const o = mustBeOpen()
  const pool = metaGet<Player[]>(o.saveDb, 'retiredLegends') ?? []
  return {
    legends: pool.map((l) => {
      const eff = effectiveLegend(l, legendEffRng(o, l.id))
      return { id: l.id, firstName: l.firstName, lastName: l.lastName, position: l.position, age: l.age, peakOverall: l.overall, effectiveOverall: eff.overall }
    })
  }
}

/** Sondagem/workout: traz a lenda (com overall efetivo) para o pool de FAs, pronta p/ negociar. */
export function legendWorkout(input: { legendId: string }): { playerId: string } {
  const o = mustBeOpen()
  const pool = metaGet<Player[]>(o.saveDb, 'retiredLegends') ?? []
  const legend = pool.find((l) => l.id === input.legendId)
  if (!legend) throw new AppError('BAD_LEGEND', 'Lenda não encontrada.')
  const eff = { ...effectiveLegend(legend, legendEffRng(o, legend.id)), teamId: 'free-agent' }
  const fa = metaGet<Player[]>(o.saveDb, 'freeAgents') ?? []
  if (!fa.some((p) => p.id === eff.id)) metaSet(o.saveDb, 'freeAgents', [...fa, eff])
  metaSet(o.saveDb, 'retiredLegends', pool.filter((l) => l.id !== legend.id))
  backup(o)
  return { playerId: eff.id }
}

export function advanceWeek(): AdvanceResult {
  const o = mustBeOpen()

  const evState = metaGet<EventsState>(o.saveDb, 'events')
  if (evState?.pending) throw new AppError('EVENT_PENDING', 'Resolva o acontecimento surpresa antes de avançar.')

  // ---- offseason encadeada (§10B): finished → offseason → draft → free_agency → pre_season → regular
  if (o.season.phase === 'finished') { enterOffseason(o); return offseasonStep(o, 'Offseason iniciada: elenco desenvolvido, aposentadorias processadas.') }
  if (o.season.phase === 'offseason') { enterDraft(o); return offseasonStep(o, 'Draft Night disponível — monte seu board e escolha na aba Draft.') }
  if (o.season.phase === 'draft') {
    const ds = metaGet<DraftState>(o.saveDb, 'draftState')
    if (!ds?.completed || ds.season !== upcomingSeasonNum(o)) throw new AppError('DRAFT_PENDING', 'Realize o Draft Night (aba Draft) antes de avançar.')
    enterFreeAgency(o)
    return offseasonStep(o, 'Free Agency aberta — reforce o elenco no Mercado.')
  }
  if (o.season.phase === 'free_agency') { enterPreseason(o); return offseasonStep(o, 'Pré-temporada: rode o training camp na aba Pré-Temp.') }
  if (o.season.phase === 'pre_season') { finalizeRegular(o); return offseasonStep(o, `Temporada ${o.season.seasonNumber} começa!`) }

  // §8B: em modo interativo, o jogo do usuário fica pendente e é conduzido no GameDay
  // (o resto da semana só é simulado após o usuário concluir sua partida — persistInteractiveResult).
  const mode = getControlModeOf(o)
  if (mode !== 'simulation_only') {
    const uf = userScheduledFixture(o)
    if (uf) {
      return {
        week: o.season.week, phase: o.season.phase, advanced: false,
        userFixture: fixtureView(o, uf, resultsMap(o)), userGameId: uf.id,
        seasonComplete: false, championTeamId: null, interactivePending: true,
        message: 'Assuma o controle: escolha suas jogadas no GameDay.'
      }
    }
  }
  return playWeek(o)
}

/** Jogo agendado do usuário na fase jogável atual (semana regular ou rodada de playoff). */
function userScheduledFixture(o: OpenSave): Fixture | undefined {
  const phase = o.season.phase
  const isUser = (f: Fixture): boolean => f.homeTeamId === o.info.teamId || f.awayTeamId === o.info.teamId
  if (phase === 'regular') {
    return allFixtures(o).find((f) => f.round === 'regular' && f.week === o.season.week && f.status === 'scheduled' && isUser(f))
  }
  return allFixtures(o).find((f) => f.round === phase && f.status === 'scheduled' && isUser(f))
}

/**
 * Simula a fase jogável atual (semana regular ou rodada de playoff) e progride a
 * temporada. `skipGameId` = jogo do usuário já jogado interativamente (já 'played',
 * portanto fora do loop de sim); seu resultado é incluído nos efeitos da semana.
 */
function playWeek(o: OpenSave, skipGameId?: string): AdvanceResult {
  const uf: { v: FixtureView | null } = { v: null } // holder: evita narrowing de CFA em closure
  const collectUser = (f: Fixture, res: GameResult): void => {
    if (f.homeTeamId === o.info.teamId || f.awayTeamId === o.info.teamId) {
      uf.v = fixtureView(o, { ...f, status: 'played' }, new Map([[f.id, { homeScore: res.homeScore, awayScore: res.awayScore, winnerTeamId: res.winnerTeamId }]]))
    }
  }
  const includeSkipped = (results: GameResult[]): void => {
    if (!skipGameId) return
    const fx = fixtureById(o, skipGameId)
    const row = o.saveDb.db.select().from(gamesTable).where(eq(gamesTable.id, skipGameId)).get()
    if (fx && row?.result) { const r = JSON.parse(row.result) as GameResult; results.push(r); collectUser(fx, r) }
  }

  if (o.season.phase === 'regular') {
    const week = o.season.week
    const weekGames = allFixtures(o).filter((f) => f.round === 'regular' && f.week === week && f.status === 'scheduled')
    const results: GameResult[] = []
    for (const f of weekGames) {
      const res = simFixture(o, f, 'regular')
      results.push(res)
      collectUser(f, res)
    }
    includeSkipped(results)
    onWeekSimulated(o, results)
    o.season.week++
    const remaining = allFixtures(o).some((f) => f.round === 'regular' && f.status === 'scheduled')
    if (!remaining) startPlayoffs(o)
    else maybeDrawEvent(o)
    metaSet(o.saveDb, 'season', o.season)
    persistPlayers(o)
    backup(o)
    upsertIndex(saveMetaOf(o))
    return { week, phase: o.season.phase, advanced: true, userFixture: uf.v, userGameId: uf.v?.id ?? null, seasonComplete: false, championTeamId: null, message: uf.v ? '' : `Semana ${week}: bye` }
  }

  // ---- playoffs
  const phase = o.season.phase
  const roundGames = allFixtures(o).filter((f) => f.round === phase && f.status === 'scheduled')
  const playoffResults: GameResult[] = []
  for (const f of roundGames) {
    const importance = phase === 'championship' ? 'championship' : 'playoff'
    const res = simFixture(o, f, importance)
    playoffResults.push(res)
    collectUser(f, res)
  }
  includeSkipped(playoffResults)
  onWeekSimulated(o, playoffResults)

  const advancedPhase = advancePlayoffPhase(o, phase)
  metaSet(o.saveDb, 'season', o.season)
  backup(o)
  upsertIndex(saveMetaOf(o))
  const champion = metaGet<string | null>(o.saveDb, 'champion')
  const finalPhase = metaGet<SeasonState>(o.saveDb, 'season')!.phase
  return {
    week: o.season.week, phase: finalPhase, advanced: true, userFixture: uf.v, userGameId: uf.v?.id ?? null,
    seasonComplete: finalPhase === 'finished', championTeamId: champion,
    message: advancedPhase
  }
}

function insertRoundFixtures(o: OpenSave, phase: SeasonPhase, alive: Record<string, string[]>): void {
  for (const conf of LEAGUE_CONFIG[o.info.league].conferences) {
    const { pairs } = nextRoundPairs(alive[conf] ?? [])
    if (!pairs.length) continue
    const fx = makeFixtures(phase, o.season.week, pairs, o.info.masterSeed).map((f) => ({ ...f, id: `${f.id}-${conf}` }))
    insertFixtures(o, fx)
  }
}

function startPlayoffs(o: OpenSave): void {
  const teams = [...o.teams.values()]
  const config = LEAGUE_CONFIG[o.info.league]
  const standings = computeStandings(teams, allFixtures(o), resultsMap(o))
  const seeds = playoffSeeding(teams, standings, config.playoffSeedsPerConference)
  const seedIndex: Record<string, Record<string, number>> = {}
  const alive: Record<string, string[]> = {}
  for (const [conf, arr] of seeds) {
    seedIndex[conf] = {}
    arr.forEach((id, i) => (seedIndex[conf][id] = i))
    alive[conf] = [...arr]
  }
  const rounds = confRoundLabels(confRoundCount(config.playoffSeedsPerConference))
  metaSet(o.saveDb, 'seeds', Object.fromEntries(seeds))
  metaSet(o.saveDb, 'seedIndex', seedIndex)
  metaSet(o.saveDb, 'alive', alive)
  metaSet(o.saveDb, 'playoffRounds', rounds)
  metaSet(o.saveDb, 'playoffRoundIdx', 0)
  metaSet(o.saveDb, 'userMadePlayoffs', [...seeds.values()].some((arr) => arr.includes(o.info.teamId)))

  insertRoundFixtures(o, rounds[0], alive)
  o.season.phase = rounds[0]
}

/** Após simular a rodada `phase`, apura vencedores (byes + vencedores) e monta a próxima. Genérico por nº de seeds. */
function advancePlayoffPhase(o: OpenSave, phase: SeasonPhase): string {
  const results = resultsMap(o)
  const fixtures = allFixtures(o)
  const seedIndex = metaGet<Record<string, Record<string, number>>>(o.saveDb, 'seedIndex')!
  const alivePrev = metaGet<Record<string, string[]>>(o.saveDb, 'alive')!
  const rounds = metaGet<SeasonPhase[]>(o.saveDb, 'playoffRounds')!
  const config = LEAGUE_CONFIG[o.info.league]

  // final (championship) já jogada → campeão
  if (phase === 'championship') {
    const fx = fixtures.find((f) => f.round === 'championship')
    metaSet(o.saveDb, 'champion', (fx ? results.get(fx.id) : undefined)?.winnerTeamId ?? null)
    o.season.phase = 'finished'
    return 'Temporada encerrada'
  }

  // apura vencedores da rodada de conferência (byes desta rodada + vencedores dos jogos)
  const winnersByConf: Record<string, string[]> = {}
  for (const conf of config.conferences) {
    const { byes } = nextRoundPairs(alivePrev[conf] ?? [])
    const winners = [...byes]
    for (const f of fixtures.filter((f) => f.round === phase && f.id.endsWith(`-${conf}`))) {
      const r = results.get(f.id)
      if (r?.winnerTeamId) winners.push(r.winnerTeamId)
    }
    winnersByConf[conf] = winners.sort((a, b) => (seedIndex[conf][a] ?? 99) - (seedIndex[conf][b] ?? 99))
  }
  metaSet(o.saveDb, 'alive', winnersByConf)

  // usa o índice de rodada armazenado (labels podem repetir, ex.: CFP tem 2 'wild_card')
  const idx = metaGet<number>(o.saveDb, 'playoffRoundIdx') ?? rounds.indexOf(phase)
  if (idx < rounds.length - 1) {
    o.season.week++
    const nextIdx = idx + 1
    const nextRound = rounds[nextIdx]
    insertRoundFixtures(o, nextRound, winnersByConf)
    o.season.phase = nextRound
    metaSet(o.saveDb, 'playoffRoundIdx', nextIdx)
    return `${nextRound} montada`
  }

  // última rodada de conferência concluída → final única (neutra)
  const finalists = config.conferences.map((c) => winnersByConf[c][0]).filter(Boolean)
  if (finalists.length === 2) {
    o.season.week++
    const fx = makeFixtures('championship', o.season.week, [{ home: finalists[0], away: finalists[1], neutral: true }], o.info.masterSeed)
    insertFixtures(o, fx)
    metaSet(o.saveDb, 'finalists', finalists)
    o.season.phase = 'championship'
    return `${config.championshipLabel} definido`
  }
  // liga de conferência única (fallback): campeão direto
  metaSet(o.saveDb, 'champion', finalists[0] ?? null)
  o.season.phase = 'finished'
  return 'Temporada encerrada'
}

// ---------------------------------------------------------------- persist / backup

function persistPlayers(_o: OpenSave): void {
  // M4: jogadores não mudam semana a semana (desenvolvimento/fadiga entram no M8)
}

function backup(o: OpenSave): void {
  try {
    const dir = join(savesRoot(), o.slug, 'backups')
    mkdirSync(dir, { recursive: true })
    o.saveDb.raw.pragma('wal_checkpoint(TRUNCATE)')
    const file = join(dir, `auto-${o.season.seasonNumber}-${o.season.phase}-${o.season.week}.db`).replace(/\\/g, '/')
    o.saveDb.raw.exec(`VACUUM INTO '${file}'`)
    const autos = readdirSync(dir).filter((f) => f.startsWith('auto-')).sort()
    while (autos.length > 5) unlinkSync(join(dir, autos.shift()!))
  } catch {
    // best-effort
  }
}
