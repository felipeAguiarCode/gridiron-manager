/**
 * Modelo de domínio do jogo — objetos planos, sem dependência de
 * Electron/Node/SQLite. Tudo em src/core opera sobre estes tipos.
 * Adaptação gridiron do soccer manager: mantém a forma geral do Player
 * (id/nome/idade/overall/traits/morale/form/fatigue/contrato) e troca o
 * bloco de atributos por um conjunto de futebol americano.
 */

export type League = 'nfl' | 'cfl' | 'ufl' | 'ncaa'

export type Position =
  // Ataque
  | 'QB' | 'RB' | 'FB' | 'WR' | 'TE' | 'LT' | 'LG' | 'C' | 'RG' | 'RT'
  // Defesa
  | 'DE' | 'DT' | 'NT' | 'OLB' | 'ILB' | 'MLB' | 'CB' | 'FS' | 'SS'
  // Special teams
  | 'K' | 'P' | 'LS'

export type Unit = 'offense' | 'defense' | 'special'

export type CardTier = 'bronze' | 'silver' | 'gold' | 'elite' | 'legend'

export type TraitId =
  | 'cannon_arm' // braço forte (THP em passes longos)
  | 'deep_threat' // ameaça vertical (big plays no passe)
  | 'elusive' // desvia de tackles (broken tackles)
  | 'bruiser' // corre com força (yards after contact)
  | 'sure_hands' // recepção confiável (menos drops)
  | 'brick_wall' // muralha (block/pass protection ou run stuff)
  | 'sack_artist' // pressão de elite (sacks)
  | 'ball_hawk' // caça-bola (interceptações)
  | 'iron_man' // resistente a lesões
  | 'fumble_prone' // maior risco de fumble
  | 'ice_veins' // frio em FGs/2-minute drill decisivos
  | 'field_general' // reduz impacto de derrotas na moral (liderança)

export interface MentalAttrs {
  composure: number
  leadership: number
  consistency: number
  ambition: number
  professionalism: number
  durability: number
}

/**
 * Atributos gridiron (0-99). Físicos universais + técnicos por família;
 * atributos irrelevantes para a posição ficam baixos e têm peso ~0 no overall.
 */
export interface Attributes {
  // Físicos universais
  spd: number // speed
  acc: number // acceleration
  agi: number // agility
  str: number // strength
  awr: number // awareness
  sta: number // stamina
  // Técnicos por família
  thp: number // throw power (QB)
  tha: number // throw accuracy (QB)
  tup: number // throw under pressure / play-action (QB)
  car: number // carrying (RB/FB/QB)
  bcv: number // ball-carrier vision (RB)
  trk: number // trucking/elusive (RB/FB)
  cth: number // catching (WR/TE/RB)
  rte: number // route running (WR/TE)
  rac: number // catch-in-traffic / run-after-catch (WR/TE)
  rbk: number // run block (OL/TE/FB)
  pbk: number // pass block (OL/TE)
  tak: number // tackle (DL/LB/DB)
  prsh: number // pass rush (DL/OLB)
  bsh: number // block shed (DL/LB)
  cov: number // man coverage (CB/S/LB)
  zcv: number // zone coverage (CB/S/LB)
  prc: number // play recognition (defesa)
  kpw: number // kick power (K/P)
  kac: number // kick accuracy (K/P)
}

export type AttrKey = keyof Attributes

export const ATTR_KEYS: AttrKey[] = [
  'spd', 'acc', 'agi', 'str', 'awr', 'sta',
  'thp', 'tha', 'tup', 'car', 'bcv', 'trk', 'cth', 'rte', 'rac',
  'rbk', 'pbk', 'tak', 'prsh', 'bsh', 'cov', 'zcv', 'prc', 'kpw', 'kac'
]

/** Classe acadêmica (NCAA). Ligas profissionais usam yearsPro. */
export type ClassYear = 'FR' | 'SO' | 'JR' | 'SR'

export interface Player {
  id: string
  teamId: string
  firstName: string
  lastName: string
  nationality: string // maioria 'USA'
  age: number
  position: Position
  secondaryPositions: Position[]
  handedness: 'L' | 'R'
  attributes: Attributes
  overall: number // derivado dos atributos pelos pesos do arquétipo
  potential: number
  mental: MentalAttrs
  traits: TraitId[]
  morale: number // 0-100
  form: number // 0-100
  fatigue: number // 0-100
  injuryWeeks: number // 0 = disponível
  suspended?: number // semanas de suspensão (0/ausente = liberado)
  marketValue: number // valuation → base do cap hit
  salary: number // salário anual
  capHit: number // impacto no salary cap na temporada
  contractYears: number
  jerseyNumber: number // 0-99
  yearsPro: number // rookie = 0
  classYear?: ClassYear // NCAA
  persona?: PlayerPersona // Career DNA — orienta negociação/moral (§10B.4)
}

/** Personalidade de carreira que orienta negociação, moral e reações ao mercado. */
export type PlayerPersona =
  | 'ring_chaser'
  | 'money_first'
  | 'loyal_veteran'
  | 'prove_it'
  | 'spotlight_star'
  | 'quiet_professional'
  | 'locker_room_leader'
  | 'fragile_ego'
  | 'hometown_hero'
  | 'scheme_purist'
  | 'mercenary'
  | 'mentor'
  | 'comeback_story'

/** Categoria dramática de uma oportunidade no mercado vivo (§10B.3). */
export type MarketListingType =
  | 'free_agent'
  | 'agent_pitch'
  | 'young_talent'
  | 'retired_legend'
  | 'practice_squad'
  | 'waiver_wire'
  | 'undrafted_rookie'
  | 'trade_block'

/** Fonte narrativa de uma listagem/rumor (§10B.8). */
export type MarketSource =
  | 'agent_call'
  | 'media_rumor'
  | 'scout_tip'
  | 'locker_room_noise'
  | 'injury_replacement'
  | 'deadline_push'
  | 'retirement_watch'
  | 'waiver_wire'
  | 'practice_squad_report'
  | 'college_showcase'

/** Uma oportunidade ativa no mercado vivo. `player` embute o atleta disponível. */
export interface MarketListing {
  id: string
  type: MarketListingType
  source: MarketSource
  player: Player
  createdSeason: number
  createdWeek: number
  expiresInGames: number // rotaciona: -1 a cada jogo; ≤0 sai do mercado
  urgency: number // 0-100
  interestedTeams: string[] // abbrs de rivais de olho
}

/** Função prometida/esperada num contrato (do mais alto ao mais baixo). */
export type DepthRole = 'star' | 'starter' | 'rotation' | 'depth'

/** Oferta de contrato (modelo simples §10B.5: anos + salário + função). */
export interface ContractOffer {
  years: number
  salaryPerYear: number
  rolePromise?: DepthRole
}

export type NegotiationStatus = 'open' | 'countered' | 'accepted' | 'rejected' | 'signed_elsewhere'

/** Sessão de negociação com o agente (rodadas limitadas). */
export interface NegotiationSession {
  id: string
  playerId: string
  teamId: string
  status: NegotiationStatus
  round: number
  maxRounds: number
  playerInterest: number // 0-100
  agentPatience: number // 0-100
  persona: PlayerPersona
  expectation: { years: number; salaryPerYear: number; role: DepthRole }
  competingTeams: string[]
  lastOffer?: ContractOffer
  counter?: ContractOffer // contraproposta do agente
  agentLine: string // resposta textual do agente
  signedContract?: ContractOffer // preenchido quando status = accepted
}

/** Notícia gerada por contratação/trade/rumor (§10B.9). */
export interface NewsItem {
  id: string
  type: 'signing' | 'trade' | 'draft_pick' | 'comeback' | 'holdout' | 'injury' | 'rumor' | 'deadline'
  importance: 'low' | 'medium' | 'high' | 'breaking'
  headline: string
  subheadline: string
  teamIds: string[]
  playerIds: string[]
  seasonNumber: number
  week: number
  visualStyle: 'standard' | 'breaking' | 'draft' | 'legend' | 'deadline'
  acknowledged?: boolean
}

/** Foco do training camp (§10B.7). */
export type TrainingCampFocus =
  | 'rookie_development'
  | 'conditioning'
  | 'scheme_installation'
  | 'playbook_installation'
  | 'qb_timing'
  | 'ol_cohesion'
  | 'pass_rush'
  | 'secondary_communication'
  | 'special_teams'

/** Disputa de posição na pré-temporada (§10B.7). */
export interface PositionBattle {
  position: Position
  contenders: { playerId: string; name: string; overall: number; score: number }[]
  leaderId: string
  intensity: number // 0-100
}

/** Trait de desenvolvimento de um prospect (§10B.6). */
export type DevelopmentTrait = 'normal' | 'quick' | 'star' | 'superstar' | 'slow'

/** Prospect de draft com fog-of-war (atributos verdadeiros ocultos). */
export interface Prospect {
  id: string
  firstName: string
  lastName: string
  age: number
  position: Position
  classYear: ClassYear
  college: string
  visibleGrade: string // 'A+'..'D'
  projectedRound: number // 1-7 (estimativa, pode errar)
  trueOverall: number // oculto até draftar
  truePotential: number // oculto
  developmentTrait: DevelopmentTrait
  boomBust: number // 0-100 (risco)
  scoutingLevel: number // 0-4
  revealedOverall: [number, number] // range que estreita ao escutar
  revealedPotential: [number, number]
  drafted?: { teamId: string; pickNumber: number }
}

/** Estado do draft de uma temporada. */
export interface DraftState {
  season: number
  completed: boolean
  pickOrder: string[] // ids de pick na ordem geral
}

/** Escolha de draft — ativo negociável (§10B.6/16). */
export interface DraftPick {
  id: string
  season: number // ano do draft a que pertence
  round: number // 1-7
  originalTeamId: string
  ownerTeamId: string // dono atual (muda por trade)
}

export type TradeBlockReason =
  | 'cap_casualty'
  | 'rebuild'
  | 'lost_starting_job'
  | 'contract_dispute'
  | 'scheme_mismatch'
  | 'locker_room_issue'
  | 'veteran_ring_chase'
  | 'rookie_emergence'

/** Jogador disponibilizado para trade por um time da IA (§10B.16). */
export interface TradeBlockItem {
  id: string
  playerId: string
  teamId: string
  reason: TradeBlockReason
  askingValue: number // valor pedido (unidades de marketValue)
  createdWeek: number
  expiresInGames: number
}

/** Estado do "pulso" do mercado numa dada semana (§10B.2). */
export interface MarketPulse {
  seasonNumber: number
  week: number
  phase: SeasonPhase
  volatility: number // 0-100
  heat: number // 0-100
  deadlinePressure: number // 0-100
  mediaIntensity: number // 0-100
  stories: string[] // manchetes curtas geradas na última rotação
}

export type AiProfile = 'contender' | 'rebuild' | 'win-now' | 'balanced' | 'analytics'

export interface Team {
  id: string // ex.: 'nfl-gb'
  name: string // 'Green Bay'
  nickname: string // 'Packers'
  abbr: string // 'GB'
  city: string
  colors: { primary: string; secondary: string }
  altColors: { primary: string; secondary: string }
  stadium: { name: string; capacity: number; surface: 'grass' | 'turf'; dome: boolean }
  conference: string // 'AFC' | 'NFC' | ...
  division: string // 'North' | 'South' | 'East' | 'West' (quando aplicável)
  reputation: 1 | 2 | 3 | 4
  prestige: number // 1-200 (desempate/seeding)
  capSpace?: number
  budget: number
  aiProfile: AiProfile
  preferredOffense: OffenseSchemeId
  preferredDefense: DefenseSchemeId
  /** participa da liga selecionada? ausente/true = sim; false = time extra do save */
  inCompetition?: boolean
}

export type CoachArchetypeId =
  | 'offensive_guru'
  | 'defensive_mastermind'
  | 'players_coach'
  | 'ceo_gm'
  | 'special_teams_ace'
  | 'analytics'

export interface Coach {
  name: string
  archetype: CoachArchetypeId
  known?: string // time real associado (rótulo)
}

// ---------------------------------------------------------------- schemes

export type OffenseSchemeId =
  | 'air_raid'
  | 'west_coast'
  | 'spread_option'
  | 'power_run'
  | 'vertical'
  | 'pistol_rpo'
  | 'smashmouth'

export type DefenseSchemeId = '4-3' | '3-4' | 'nickel' | 'dime' | 'tampa_2' | '46_blitz'

export type OffenseFormation = 'i_form' | 'singleback' | 'shotgun' | 'empty' | 'pistol'
export type DefenseFront = 'base_4_3' | 'base_3_4' | 'nickel' | 'dime' | 'goal_line'

/** Sliders táticos 1-100. */
export interface TacticSliders {
  tempo: number
  aggression: number
  blitzRate: number
  coverageTightness: number
  runPassBias: number
  playActionRate: number
  screenRate: number
  tempoDefense: number
}

export interface SchemeSetup {
  offense: OffenseSchemeId
  defense: DefenseSchemeId
  offenseFormation: OffenseFormation
  defenseFront: DefenseFront
  sliders: TacticSliders
}

/** Depth chart por unidade: ordem de titularidade por posição. */
export interface DepthChart {
  offense: string[] // 11 titulares ordenados por slot ofensivo
  defense: string[] // 11 titulares (12 na CFL)
  special: string[] // K/P/LS + returners
}

// --------------------------------------------------------------- partida

export type PlayType =
  | 'run' | 'pass' | 'punt' | 'field_goal' | 'kickoff'
  | 'extra_point' | 'two_point' | 'kneel' | 'spike'

export type PlayOutcome =
  | 'gain' | 'first_down' | 'touchdown' | 'field_goal_good' | 'field_goal_miss'
  | 'punt' | 'sack' | 'interception' | 'fumble_lost' | 'incomplete'
  | 'safety' | 'turnover_on_downs' | 'penalty' | 'extra_point_good' | 'extra_point_miss'
  | 'two_point_good' | 'two_point_fail' | 'kneel' | 'spike' | 'touchback'

export type Quarter = 1 | 2 | 3 | 4 | 'OT'

export interface PlayEvent {
  quarter: Quarter
  clock: string // "12:43"
  offenseTeamId: string
  down: 1 | 2 | 3 | 4
  distance: number
  yardline: number // 0-100 (perspectiva do ataque; 100 = end zone adversária)
  type: PlayType
  outcome: PlayOutcome
  yards: number
  scorerId?: string
  passerId?: string
  rusherId?: string
  receiverId?: string
  tacklerId?: string
  text: string // narração
  // Play calling (§8B.17) — opcionais: ausentes em jogos simulados sem playbook
  offensePlayId?: string
  defensePlayId?: string
  specialTeamsPlayId?: string
  offensePlayName?: string
  playCallSource?: 'user' | 'ai' | 'recommended' | 'delegated'
}

export type DriveResult =
  | 'TD' | 'FG' | 'PUNT' | 'TURNOVER' | 'DOWNS' | 'SAFETY' | 'END_HALF' | 'MISSED_FG'

export interface Drive {
  offenseTeamId: string
  startYardline: number
  plays: PlayEvent[]
  result: DriveResult
  points: number
}

export interface TeamGameStats {
  points: number
  totalYards: number
  passYards: number
  rushYards: number
  firstDowns: number
  turnovers: number
  sacks: number
  penalties: number
  penaltyYards: number
  timeOfPossession: number // segundos
  thirdDownConv: number
  thirdDownAtt: number
}

export interface PlayerGameLine {
  playerId: string
  teamId: string
  // passing
  passAtt: number
  passComp: number
  passYards: number
  passTd: number
  passInt: number
  // rushing
  rushAtt: number
  rushYards: number
  rushTd: number
  // receiving
  rec: number
  recYards: number
  recTd: number
  // defense
  tackles: number
  sacks: number
  interceptions: number
  forcedFumbles: number
  // kicking
  fgMade: number
  fgAtt: number
  xpMade: number
  xpAtt: number
  rating: number // nota pós-jogo
}

export interface GameResult {
  seed: number
  homeTeamId: string
  awayTeamId: string
  homeScore: number
  awayScore: number
  quarters: [number, number][] // pontos por quarter [home, away]
  drives: Drive[]
  plays: PlayEvent[] // timeline completa
  stats: { home: TeamGameStats; away: TeamGameStats }
  playerStats: PlayerGameLine[]
  momentum: number[] // série p/ o gráfico de ímpeto
  overtime: boolean
  winnerTeamId: string | null // null = empate (regular NFL/CFL)
  injuries: { playerId: string; teamId: string; weeks: number }[]
}

/** Clima da partida. */
export type Weather = 'clear' | 'rain' | 'snow' | 'wind' | 'heat'

/** Flags de regra por liga (não-forks; variação declarativa no motor). */
export interface LeagueRules {
  downsPerSet: number // 4 (NFL/UFL/NCAA), 3 (CFL)
  playersOnField: number // 11, 12 (CFL)
  fieldLength: number // 100 (NFL), 110 (CFL)
  rouge: boolean // single canadense
  otMode: 'nfl' | 'college' | 'ufl' | 'sudden'
  allowRegularTie: boolean
}

export interface GameTeam {
  team: Team
  scheme: SchemeSetup
  depth: DepthChart
  players: Map<string, Player>
}

export interface GameInput {
  home: GameTeam
  away: GameTeam
  rules: LeagueRules
  importance: 'regular' | 'playoff' | 'championship'
  neutralVenue: boolean
  weather?: Weather
}

// ------------------------------------------------------------ competição

export type SeasonPhase =
  | 'pre_season'
  | 'regular'
  | 'wild_card'
  | 'divisional'
  | 'conference'
  | 'championship'
  | 'review'
  | 'finished'
  // fases da offseason (§10B) encadeadas no avanço de semana
  | 'offseason'
  | 'draft'
  | 'free_agency'

export interface Fixture {
  id: string
  week: number
  round: SeasonPhase
  homeTeamId: string
  awayTeamId: string
  neutralVenue: boolean
  simulationSeed: number
  status: 'scheduled' | 'played' | 'bye'
}

export interface Standing {
  teamId: string
  played: number
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  pointDiff: number
  divWins: number
  divLosses: number
  confWins: number
  confLosses: number
  streak: number // + vitórias / - derrotas consecutivas
  last5: ('W' | 'L' | 'T')[]
  pct: number
  position: number
  zone: 'division_leader' | 'wildcard' | 'bubble' | 'eliminated'
}

export interface BracketSeed {
  teamId: string
  seed: number
}

export interface BracketGame {
  gameId: string
  round: SeasonPhase
  homeTeamId: string | null
  awayTeamId: string | null
  homeSeed: number | null
  awaySeed: number | null
  winnerTeamId: string | null
}

export interface Bracket {
  conferences: Record<string, BracketSeed[]> // seeds por conferência
  games: BracketGame[]
  championGameId: string | null
}

// -------------------------------------------------------------- objetivos

export interface Objective {
  id: string
  kind: 'primary' | 'secondary'
  code: string
  label: string
  target: number
}

// ---------------------------------------------------------------- utils

export function cardTier(overall: number): CardTier {
  if (overall >= 92) return 'legend'
  if (overall >= 85) return 'elite'
  if (overall >= 75) return 'gold'
  if (overall >= 60) return 'silver'
  return 'bronze'
}

const STAMINA_BY_TIER: Record<CardTier, number> = {
  legend: 100,
  elite: 95,
  gold: 90,
  silver: 82,
  bronze: 75
}

/** Teto de stamina por raridade do card. */
export function maxStamina(overall: number): number {
  return STAMINA_BY_TIER[cardTier(overall)]
}

/** Stamina atual em fração 0..1 do teto pessoal. */
export function staminaPct(overall: number, fatigue: number): number {
  const max = maxStamina(overall)
  return Math.min(max, Math.max(0, max - fatigue)) / max
}

export const STAMINA_WARN = 0.7
export const STAMINA_CRIT = 0.4

const OFFENSE_POS: Position[] = ['QB', 'RB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT']
const DEFENSE_POS: Position[] = ['DE', 'DT', 'NT', 'OLB', 'ILB', 'MLB', 'CB', 'FS', 'SS']

export function unitOf(position: Position): Unit {
  if (OFFENSE_POS.includes(position)) return 'offense'
  if (DEFENSE_POS.includes(position)) return 'defense'
  return 'special'
}
