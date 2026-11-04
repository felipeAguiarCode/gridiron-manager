/**
 * Sistema de Playbooks, Play Calling & Controle de Jogadas (GDD §8B).
 * Tipos puros — sem dependência de Electron/Node/SQLite. O playbook é a
 * biblioteca concreta de jogadas de um time; o play call é a jogada escolhida
 * antes do snap; os modificadores da jogada entram no motor de partida (§7/§8B.16).
 */

import type {
  AttrKey, CoachArchetypeId, DefenseFront, DefenseSchemeId, OffenseFormation, OffenseSchemeId
} from './types'

// ---------------------------------------------------------------- formações & personnel

/** Formação de uma jogada — reusa as formações ofensivas/frentes defensivas de §8. */
export type FormationId = OffenseFormation | DefenseFront | 'special_teams'

/** Grupo de personnel em campo (1º dígito = RB, 2º = TE; nomes especiais p/ defesa/ST). */
export type PersonnelGroup =
  | '10' | '11' | '12' | '13' | '21' | '22' | '23'
  | 'nickel' | 'dime' | 'goal_line' | 'jumbo' | 'special_teams'

// ---------------------------------------------------------------- categorias & tags

export type PlayCategory =
  | 'run' | 'pass' | 'play_action' | 'screen' | 'rpo' | 'option' | 'trick'
  | 'short_yardage' | 'red_zone' | 'goal_line' | 'two_minute' | 'fourth_down'
  | 'special_teams' | 'defense_base' | 'defense_blitz' | 'defense_coverage'
  | 'defense_goal_line' | 'defense_prevent'

export type PlayTag =
  | 'inside_run' | 'outside_run' | 'power' | 'zone_run' | 'draw' | 'quick_pass'
  | 'slants' | 'mesh' | 'crossers' | 'deep_shot' | 'shotgun' | 'under_center'
  | 'motion' | 'misdirection' | 'bootleg' | 'screen' | 'rpo' | 'option'
  | 'flea_flicker' | 'hb_pass' | 'fake_punt' | 'fake_field_goal' | 'hail_mary'
  | 'qb_sneak' | 'clock_kill' | 'sideline' | 'high_risk' | 'safe'
  // special teams
  | 'punt' | 'punt_directional' | 'punt_short' | 'field_goal' | 'extra_point'
  | 'two_point' | 'kickoff_deep' | 'squib_kick' | 'onside_kick'
  | 'return_safe' | 'return_aggressive' | 'fair_catch'

export type DefensivePlayTag =
  | 'man_coverage' | 'zone_coverage' | 'cover_2' | 'cover_3' | 'cover_4'
  | 'press' | 'soft_coverage' | 'blitz' | 'zero_blitz' | 'spy_qb' | 'contain'
  | 'run_commit' | 'pass_commit' | 'prevent' | 'goal_line_stack'

/**
 * Tag de qualquer família. Jogadas ofensivas usam `PlayTag` e casam contra
 * conceitos defensivos; jogadas defensivas usam `DefensivePlayTag` e casam
 * contra conceitos ofensivos. `tags`/`strongAgainst`/`counteredBy` aceitam ambas.
 */
export type AnyPlayTag = PlayTag | DefensivePlayTag

export type PlaybookTag =
  | 'balanced' | 'pass_heavy' | 'run_heavy' | 'vertical' | 'west_coast' | 'spread'
  | 'power' | 'rpo' | 'trickster' | 'defensive_pressure' | 'coverage_heavy'
  | 'bend_dont_break' | 'red_zone_specialist' | 'clock_control'

// ---------------------------------------------------------------- fit situacional

/** Zona de campo (perspectiva do ataque, yardline 0-100). */
export type FieldZone = 'own_deep' | 'own_territory' | 'midfield' | 'opp_territory' | 'red_zone' | 'goal_line'

export type DownDistanceSituation =
  | 'first_down' | 'second_short' | 'second_long' | 'third_short' | 'third_medium'
  | 'third_long' | 'fourth_short' | 'fourth_long'

export type ClockSituation = 'normal' | 'two_minute' | 'protect_lead' | 'trailing_late' | 'four_minute'

// ---------------------------------------------------------------- jogada

export type PlaySide = 'offense' | 'defense' | 'special_teams'

export interface PlaybookPlay {
  id: string
  name: string
  category: PlayCategory
  side: PlaySide
  formation: FormationId
  personnel: PersonnelGroup
  tags: AnyPlayTag[]

  baseRisk: number // 0-100
  baseReward: number // 0-100
  complexity: number // 0-100
  staminaCost: number // 0-100
  requiredFamiliarity: number // 0-100

  runPassType?: 'run' | 'pass' | 'play_action' | 'screen' | 'rpo' | 'option'
  targetDepth?: 'short' | 'medium' | 'deep' | 'mixed'
  fieldZoneFit: FieldZone[]
  downDistanceFit: DownDistanceSituation[]
  clockFit: ClockSituation[]

  primaryAttributes: AttrKey[]
  counteredBy: AnyPlayTag[]
  strongAgainst: AnyPlayTag[]

  successMod: number // ~1.0 neutro — escala o share efetivo
  turnoverRiskMod: number // ~1.0 neutro — multiplica INT/fumble
  bigPlayMod: number // ~1.0 neutro — multiplica chance de big play
  sackRiskMod?: number // ~1.0 neutro
  penaltyRiskMod?: number // ~1.0 neutro

  flavorText: string
}

// ---------------------------------------------------------------- playbook

export type PlaybookType = 'offense' | 'defense' | 'special_teams' | 'full_team'

export interface Playbook {
  id: string
  ownerTeamId?: string
  name: string
  description?: string
  type: PlaybookType
  baseScheme: OffenseSchemeId | DefenseSchemeId | 'special_teams'
  createdBy: 'system' | 'user' | 'imported'
  isDefault: boolean
  isCustom: boolean
  tags: PlaybookTag[]
  plays: PlaybookPlay[]
  favoritePlayIds?: string[]
  situationalRules?: PlaybookSituationRule[]
  createdAt: string
  updatedAt: string
}

export interface TeamPlaybookProfile {
  teamId: string
  activeOffensivePlaybookId: string
  activeDefensivePlaybookId: string
  activeSpecialTeamsPlaybookId: string
  defaultPlaybookIds: string[]
  customPlaybookIds: string[]
  familiarity: Record<string, number> // playbookId → 0-100
}

// ---------------------------------------------------------------- customização

export interface PlaybookSituationRule {
  id: string
  situation:
    | 'first_down' | 'third_and_short' | 'third_and_long' | 'red_zone' | 'goal_line'
    | 'two_minute' | 'protect_lead' | 'trailing_late' | 'fourth_and_short'
  preferredPlayIds: string[]
  avoidedPlayIds: string[]
}

export interface CustomPlaybook {
  id: string
  userId?: string
  saveId?: string
  name: string
  nickname?: string
  basePlaybookId?: string
  type: PlaybookType
  plays: string[]
  favoritePlays: string[]
  situationalRules: PlaybookSituationRule[]
}

// ---------------------------------------------------------------- familiaridade / mastery / previsibilidade

export interface PlaybookFamiliarity {
  teamId: string
  playbookId: string
  overallFamiliarity: number // 0-100
  formationFamiliarity: Record<string, number>
  playFamiliarity: Record<string, number>
}

export interface PlayMastery {
  playId: string
  teamId: string
  mastery: number // 0-100
  timesCalled: number
  successRate: number
  turnoverRate: number
  explosivePlayRate: number
}

export type MasteryLevel = 'unknown' | 'installed' | 'reliable' | 'specialty' | 'signature'

export function masteryLevel(mastery: number): MasteryLevel {
  if (mastery >= 90) return 'signature'
  if (mastery >= 75) return 'specialty'
  if (mastery >= 50) return 'reliable'
  if (mastery >= 25) return 'installed'
  return 'unknown'
}

export interface PlayUsageMemory {
  teamId: string
  opponentTeamId: string
  playId: string
  timesCalled: number
  successRate: number
  lastCalledQuarter: number
}

export interface SignaturePlay {
  playId: string
  teamId?: string
  coachArchetype?: CoachArchetypeId
  bonusType: 'execution' | 'reduced_turnover' | 'reduced_sack' | 'big_play' | 'red_zone' | 'third_down'
  bonusValue: number
}

// ---------------------------------------------------------------- identidade / templates

export interface TeamPlaybookTemplate {
  teamId: string
  offensiveIdentity:
    | 'balanced' | 'west_coast' | 'air_raid' | 'vertical' | 'power_run'
    | 'spread_option' | 'pistol_rpo' | 'smashmouth'
  defensiveIdentity:
    | 'base_4_3' | 'base_3_4' | 'nickel_heavy' | 'blitz_heavy' | 'tampa_2' | 'coverage_heavy'
  specialTeamsIdentity: 'safe' | 'aggressive' | 'field_position' | 'trick_specialist'
}

// ---------------------------------------------------------------- pré-temporada

export interface PreseasonPlaybookTestPlan {
  playIdsToTest: string[]
  formationFocus: FormationId[]
  trickPlayAllowed: boolean
  startersUsage: number
  rookiesUsage: number
}

// ---------------------------------------------------------------- controle & play call

export type GameControlMode = 'full_coach_control' | 'key_moments' | 'simulation_only'

export type PlayCallSource = 'user' | 'ai' | 'recommended' | 'delegated'

export interface PlayCallInput {
  offensePlayId?: string
  defensePlayId?: string
  specialTeamsPlayId?: string
  controlMode: GameControlMode
}

export interface PlayCallRecommendation {
  playId: string
  confidence: number // 0-100
  reason: string
  riskLabel: 'safe' | 'balanced' | 'aggressive' | 'desperate'
}

// ---------------------------------------------------------------- limites de balanceamento

export const PLAYBOOK_LIMITS = {
  maxOffensivePlays: 80,
  maxDefensivePlays: 70,
  maxSpecialTeamsPlays: 25,
  maxTrickPlays: 8,
  minRunPlays: 12,
  minPassPlays: 18,
  minDefensiveCalls: 20,
  minSpecialTeamsCalls: 8
} as const
