import { z } from 'zod'
import type { DepthChart, DraftPick, GameResult, League, MarketListing, MarketPulse, NegotiationSession, NewsItem, PlayEvent, Player, PositionBattle, Quarter, SchemeSetup, SeasonPhase, TradeBlockItem, TrainingCampFocus } from '@core/domain/types'
import type { GameControlMode, Playbook, PlaybookPlay, PlaybookType, PlayCallRecommendation } from '@core/domain/playbook'
import type { BoardStatus, ObjectiveView } from '@core/engine/objectives'
import type { EventCard } from '@core/engine/events/deck'
import { attributesSchema, traitSchema } from '../schemas/world'

/**
 * Contrato IPC tipado: `ipcInputs` (Zod, validado no main) + `IpcOutputs` (TS).
 * O router valida input → chama service → serializa erro como { ok:false, code }.
 * Cresce por milestone; M4 cobre saves/mundo/temporada/roster.
 */

const leagueEnum = z.enum(['nfl', 'cfl', 'ufl', 'ncaa'])

export const ipcInputs = {
  'save:list': z.void(),
  'save:create': z.object({
    saveName: z.string().min(1).max(40),
    league: leagueEnum,
    teamId: z.string().min(1),
    coachName: z.string().min(1).max(40),
    coachArchetype: z
      .enum(['offensive_guru', 'defensive_mastermind', 'players_coach', 'ceo_gm', 'special_teams_ace', 'analytics'])
      .optional(),
    seed: z.number().int().optional()
  }),
  'save:load': z.object({ slug: z.string().min(1) }),
  'save:delete': z.object({ slug: z.string().min(1) }),
  'game:snapshot': z.void(),
  'game:advanceWeek': z.void(),
  'season:new': z.void(),
  'world:teams': z.object({ league: leagueEnum }),
  'world:teamPreview': z.object({ league: leagueEnum, teamId: z.string().min(1) }),
  'roster:get': z.object({ teamId: z.string().optional() }),
  'tactics:getScheme': z.void(),
  'tactics:setScheme': z.object({
    offense: z.enum(['air_raid', 'west_coast', 'spread_option', 'power_run', 'vertical', 'pistol_rpo', 'smashmouth']),
    defense: z.enum(['4-3', '3-4', 'nickel', 'dime', 'tampa_2', '46_blitz']),
    sliders: z
      .object({
        tempo: z.number(), aggression: z.number(), blitzRate: z.number(), coverageTightness: z.number(),
        runPassBias: z.number(), playActionRate: z.number(), screenRate: z.number(), tempoDefense: z.number()
      })
      .optional()
  }),
  'tactics:getDepthChart': z.void(),
  'tactics:setDepthChart': z.object({
    unit: z.enum(['offense', 'defense', 'special']),
    orderedIds: z.array(z.string())
  }),
  'game:result': z.object({ gameId: z.string().min(1) }),
  'market:get': z.void(),
  'market:pulse': z.void(),
  'market:signFree': z.object({ playerId: z.string().min(1) }),
  'market:release': z.object({ playerId: z.string().min(1) }),
  'market:proposeTrade': z.object({
    giveIds: z.array(z.string()),
    getTeamId: z.string().min(1),
    getIds: z.array(z.string()),
    givePickIds: z.array(z.string()).optional(),
    getPickIds: z.array(z.string()).optional()
  }),
  'market:tradeBlock': z.void(),
  'market:legends': z.void(),
  'market:legendWorkout': z.object({ legendId: z.string().min(1) }),
  'scout:search': z.object({ position: z.string().optional(), minOverall: z.number().optional() }),
  'negotiation:start': z.object({ playerId: z.string().min(1) }),
  'negotiation:get': z.void(),
  'negotiation:submitOffer': z.object({
    years: z.number().int().min(1).max(6),
    salaryPerYear: z.number().int().min(0),
    rolePromise: z.enum(['star', 'starter', 'rotation', 'depth']).optional()
  }),
  'negotiation:walkAway': z.void(),
  'negotiation:finalize': z.void(),
  'news:get': z.void(),
  'news:getBreaking': z.void(),
  'news:acknowledge': z.void(),
  'draft:getClass': z.void(),
  'draft:scout': z.object({ prospectId: z.string().min(1) }),
  'draft:run': z.object({ selections: z.record(z.string(), z.string()).optional() }),
  'preseason:get': z.void(),
  'preseason:setFocus': z.object({ focus: z.enum(['rookie_development', 'conditioning', 'scheme_installation', 'playbook_installation', 'qb_timing', 'ol_cohesion', 'pass_rush', 'secondary_communication', 'special_teams']) }),
  'preseason:runCamp': z.void(),
  'events:get': z.void(),
  'events:choose': z.object({ index: z.number().int().min(0).max(2) }),
  'feed:get': z.void(),
  'editor:updatePlayer': z.object({
    playerId: z.string().min(1),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    jerseyNumber: z.number().int().min(0).max(99).optional(),
    potential: z.number().int().min(40).max(99).optional(),
    age: z.number().int().min(18).max(45).optional(),
    traits: z.array(traitSchema).optional(),
    attributes: attributesSchema.partial().optional()
  }),
  // --- Playbooks & Play Calling (§8B) ---
  'settings:setControlMode': z.object({ mode: z.enum(['full_coach_control', 'key_moments', 'simulation_only']) }),
  'playbook:hub': z.void(),
  'playbook:list': z.object({ teamId: z.string().optional() }),
  'playbook:get': z.object({ playbookId: z.string().min(1) }),
  'playbook:create': z.object({ name: z.string().min(1).max(48), type: z.enum(['offense', 'defense', 'special_teams']), baseScheme: z.string().min(1) }),
  'playbook:clone': z.object({ playbookId: z.string().min(1), name: z.string().min(1).max(48) }),
  'playbook:rename': z.object({ playbookId: z.string().min(1), name: z.string().min(1).max(48) }),
  'playbook:update': z.object({ playbookId: z.string().min(1), playIds: z.array(z.string()) }),
  'playbook:addPlay': z.object({ playbookId: z.string().min(1), playId: z.string().min(1) }),
  'playbook:removePlay': z.object({ playbookId: z.string().min(1), playId: z.string().min(1) }),
  'playbook:setFavorite': z.object({ playbookId: z.string().min(1), playId: z.string().min(1), favorite: z.boolean() }),
  'playbook:setActive': z.object({ type: z.enum(['offense', 'defense', 'special_teams']), playbookId: z.string().min(1) }),
  'playbook:export': z.object({ playbookId: z.string().min(1) }),
  'playbook:import': z.object({ json: z.string().min(2) }),
  'playbook:familiarity': z.void(),
  'playcall:startGame': z.object({ gameId: z.string().min(1) }),
  'playcall:advance': z.object({ gameId: z.string().min(1), offensePlayId: z.string().optional(), defensePlayId: z.string().optional(), specialTeamsPlayId: z.string().optional(), goForIt: z.boolean().optional(), delegate: z.boolean().optional() }),
  'playcall:getState': z.object({ gameId: z.string().min(1) })
} as const

export type IpcChannel = keyof typeof ipcInputs
export type IpcInput<C extends IpcChannel> = z.infer<(typeof ipcInputs)[C]>

// ---------------------------------------------------------------- view DTOs

export interface SaveMeta {
  slug: string
  saveName: string
  league: League
  teamId: string
  teamName: string
  coachName: string
  week: number
  phase: SeasonPhase
  seasonNumber: number
  updatedAt: number
}

export interface TeamRef {
  id: string
  name: string
  nickname: string
  abbr: string
  city: string
  colors: { primary: string; secondary: string }
  conference: string
  division: string
  reputation: number
}

export interface StandingView {
  teamId: string
  abbr: string
  name: string
  nickname: string
  conference: string
  division: string
  colors: { primary: string; secondary: string }
  overall: number
  /** QB principal (maior overall) — usado no banner de próximo jogo na Home */
  qb: PlayerLite | null
  wins: number
  losses: number
  ties: number
  pct: number
  pointsFor: number
  pointsAgainst: number
  pointDiff: number
  streak: number
  last5: ('W' | 'L' | 'T')[]
  position: number
  zone: 'division_leader' | 'wildcard' | 'bubble' | 'eliminated'
}

export interface FixtureView {
  id: string
  week: number
  round: SeasonPhase
  homeTeamId: string
  awayTeamId: string
  homeAbbr: string
  awayAbbr: string
  homeName: string
  awayName: string
  status: 'scheduled' | 'played' | 'bye'
  homeScore?: number
  awayScore?: number
  isUserGame: boolean
}

export interface TeamPreview {
  id: string
  name: string
  nickname: string
  abbr: string
  city: string
  conference: string
  division: string
  colors: { primary: string; secondary: string }
  altColors: { primary: string; secondary: string }
  reputation: number
  prestige: number
  offOverall: number
  defOverall: number
  stOverall: number
  starOverall: number
}

export interface OfficeFinance {
  leagueCap: number
  totalCapHit: number
  capSpace: number
  rosterValue: number
  rosterSize: number
  avgOverall: number
}

export interface PlayerLite {
  id: string
  firstName: string
  lastName: string
  position: string
  overall: number
  jerseyNumber: number
}

export interface TeamPreviewDetail {
  team: TeamPreview
  qb: PlayerLite | null
  categories: { label: string; value: number }[]
  units: { offense: PlayerLite[]; defense: PlayerLite[]; special: PlayerLite[] }
}

export interface Snapshot {
  save: {
    slug: string
    league: League
    teamId: string
    coachName: string
    coachArchetype?: string
    week: number
    maxWeek: number
    phase: SeasonPhase
    seasonNumber: number
  }
  team: TeamRef & { offOverall: number; defOverall: number; avgOverall: number; wins: number; losses: number; ties: number; divisionRank: number }
  standings: StandingView[]
  nextFixtures: FixtureView[]
  lastResults: FixtureView[]
  championTeamId: string | null
  objectives: ObjectiveView[]
  finance: OfficeFinance
  boardStatus: BoardStatus
  gameOver: boolean
  pendingEvent: boolean
  offseason: { active: boolean; draftCompleted: boolean } | null
  controlMode: GameControlMode
}

export interface RosterView {
  teamId: string
  team: TeamRef
  players: Player[]
  picks: DraftPick[]
}

export interface AdvanceResult {
  week: number
  phase: SeasonPhase
  advanced: boolean
  userFixture: FixtureView | null
  userGameId: string | null
  seasonComplete: boolean
  championTeamId: string | null
  message: string
  /** §8B: em modo interativo, o jogo do usuário fica pendente e é conduzido no GameDay */
  interactivePending?: boolean
}

// ---------------------------------------------------------------- Playbooks & Play Calling (§8B)

export interface PreSnapDecisionView {
  kind: 'offense' | 'defense' | 'special_teams'
  allowGoForIt?: boolean
  offenseTeamId: string
  defenseTeamId: string
  quarter: Quarter
  clock: string
  down: number
  distance: number
  yardline: number
  homeScore: number
  awayScore: number
  momentum: number
  available: PlaybookPlay[]
  recommendations: PlayCallRecommendation[]
}

export interface PlayCallStateView {
  gameId: string
  home: TeamRef
  away: TeamRef
  players: Record<string, PlayerRef>
  controlMode: GameControlMode
  interactive: boolean // false = replay de jogo já concluído
  log: PlayEvent[]
  decision: PreSnapDecisionView | null
  done: boolean
  result: GameResult | null
  advance: AdvanceResult | null // preenchido quando o jogo termina e a semana avança
}

export interface PlaybookSummary {
  id: string
  name: string
  type: PlaybookType
  baseScheme: string
  isCustom: boolean
  isDefault: boolean
  playCount: number
  tags: string[]
  active: boolean
  familiarity: number
}

export interface PlaybookHubView {
  teamId: string
  controlMode: GameControlMode
  activeOffensiveId: string
  activeDefensiveId: string
  activeSpecialTeamsId: string
  offensive: PlaybookSummary[]
  defensive: PlaybookSummary[]
  specialTeams: PlaybookSummary[]
}

export interface PlaybookFamiliarityView {
  teamId: string
  entries: { playbookId: string; name: string; familiarity: number }[]
}

export interface PlayerRef {
  id: string
  firstName: string
  lastName: string
  position: string
  jerseyNumber: number
  overall: number
}

export interface GameDayView {
  gameId: string
  result: GameResult
  home: TeamRef
  away: TeamRef
  players: Record<string, PlayerRef>
}

export interface DepthChartView {
  teamId: string
  scheme: SchemeSetup
  depth: DepthChart
  players: Player[]
}

export interface TransactionView {
  type: 'sign' | 'release' | 'trade'
  text: string
  seasonNumber: number
  week: number
}

export interface MarketView {
  leagueCap: number
  totalCapHit: number
  capSpace: number
  rosterSize: number
  hasCap: boolean
  freeAgents: Player[]
  roster: Player[]
  teams: { id: string; abbr: string; name: string; conference: string; division: string }[]
  transactions: TransactionView[]
  myPicks: DraftPick[]
}

/** Item enriquecido do trade block (§10B.16). */
export type TradeBlockEntry = TradeBlockItem & {
  player: { id: string; firstName: string; lastName: string; position: string; overall: number; jerseyNumber: number }
  teamAbbr: string
  teamName: string
}
export interface TradeBlockView {
  items: TradeBlockEntry[]
}

/** Lenda aposentada cogitando retorno (§10B.3). */
export interface LegendEntry {
  id: string
  firstName: string
  lastName: string
  position: string
  age: number
  peakOverall: number
  effectiveOverall: number
}
export interface LegendsView {
  legends: LegendEntry[]
}

/** Prospect com fog-of-war (§10B.6) — sem os valores verdadeiros. */
export interface ProspectView {
  id: string
  firstName: string
  lastName: string
  age: number
  position: string
  classYear: string
  college: string
  visibleGrade: string
  projectedRound: number
  boomBust: number
  scoutingLevel: number
  revealedOverall: [number, number]
  revealedPotential: [number, number]
  developmentTrait?: string
  drafted?: { teamId: string; pickNumber: number }
}
export interface DraftView {
  season: number
  completed: boolean
  scoutPoints: number
  myPickNumbers: number[]
  prospects: ProspectView[]
}
export interface DraftPickResultView {
  pickNumber: number
  name: string
  position: string
  overall: number
  round: number
}
export interface DraftRunResult {
  season: number
  totalPicks: number
  myResults: DraftPickResultView[]
}

/** Estado da pré-temporada (§10B.7). */
export interface PreseasonView {
  focus: TrainingCampFocus
  campDone: boolean
  summary: string | null
  battles: PositionBattle[]
}

/** Visão do mercado vivo (§10B): pulso da semana + listagens ativas. */
export interface MarketPulseView {
  pulse: MarketPulse
  listings: MarketListing[]
}

/** Estado da sala de negociação com o agente. */
export interface NegotiationView {
  session: NegotiationSession | null
  player: Player | null
  teamIsContender: boolean
  capSpace: number
  hasCap: boolean
}

/** Feed de notícias (§10B.9). */
export interface NewsView {
  items: NewsItem[]
}

// re-export dos tipos de contrato p/ o renderer
export type { ContractOffer, NegotiationSession, NewsItem, DraftPick, TradeBlockItem, PositionBattle, TrainingCampFocus } from '@core/domain/types'

export interface MarketActionResult {
  ok: boolean
  accepted?: boolean
  message: string
  market: MarketView
}

export interface ScoutView {
  players: (Player & { teamAbbr: string; teamName: string })[]
}

export interface EventHistoryEntry {
  title: string
  type: 'positive' | 'negative' | 'mixed'
  seasonNumber: number
  week: number
  affected: string[]
}

export interface EventsView {
  pending: EventCard[] | null
  history: EventHistoryEntry[]
}

export interface EventChooseResult {
  ok: boolean
  message: string
  snapshot: Snapshot
}

export interface FeedPost {
  id: string
  category: 'game' | 'event' | 'transaction' | 'board'
  tone: 'good' | 'bad' | 'neutral'
  text: string
  seasonNumber: number
  week: number
}

export interface FeedView {
  posts: FeedPost[]
}

export interface IpcOutputs {
  'save:list': SaveMeta[]
  'save:create': SaveMeta
  'save:load': Snapshot
  'save:delete': { ok: true }
  'game:snapshot': Snapshot
  'game:advanceWeek': AdvanceResult
  'season:new': Snapshot
  'world:teams': TeamPreview[]
  'world:teamPreview': TeamPreviewDetail
  'roster:get': RosterView
  'tactics:getScheme': SchemeSetup
  'tactics:setScheme': SchemeSetup
  'tactics:getDepthChart': DepthChartView
  'tactics:setDepthChart': DepthChartView
  'game:result': GameDayView
  'market:get': MarketView
  'market:pulse': MarketPulseView
  'market:tradeBlock': TradeBlockView
  'market:legends': LegendsView
  'market:legendWorkout': { playerId: string }
  'negotiation:start': NegotiationView
  'negotiation:get': NegotiationView
  'negotiation:submitOffer': NegotiationView
  'negotiation:walkAway': NegotiationView
  'negotiation:finalize': MarketActionResult
  'news:get': NewsView
  'news:getBreaking': NewsItem | null
  'news:acknowledge': { ok: true }
  'draft:getClass': DraftView
  'draft:scout': DraftView
  'draft:run': DraftRunResult
  'preseason:get': PreseasonView
  'preseason:setFocus': PreseasonView
  'preseason:runCamp': PreseasonView
  'market:signFree': MarketActionResult
  'market:release': MarketActionResult
  'market:proposeTrade': MarketActionResult
  'scout:search': ScoutView
  'events:get': EventsView
  'events:choose': EventChooseResult
  'feed:get': FeedView
  'editor:updatePlayer': { player: Player }
  // --- Playbooks & Play Calling (§8B) ---
  'settings:setControlMode': GameControlMode
  'playbook:hub': PlaybookHubView
  'playbook:list': PlaybookSummary[]
  'playbook:get': Playbook
  'playbook:create': PlaybookHubView
  'playbook:clone': PlaybookHubView
  'playbook:rename': PlaybookHubView
  'playbook:update': PlaybookHubView
  'playbook:addPlay': PlaybookHubView
  'playbook:removePlay': PlaybookHubView
  'playbook:setFavorite': PlaybookHubView
  'playbook:setActive': PlaybookHubView
  'playbook:export': { json: string }
  'playbook:import': PlaybookHubView
  'playbook:familiarity': PlaybookFamiliarityView
  'playcall:startGame': PlayCallStateView
  'playcall:advance': PlayCallStateView
  'playcall:getState': PlayCallStateView
}

export type IpcResponse<C extends IpcChannel> =
  | { ok: true; data: IpcOutputs[C] }
  | { ok: false; code: string; message: string }
