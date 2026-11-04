import type {
  DefenseFront, GameInput, GameTeam, LeagueRules, OffenseFormation, Player, SchemeSetup, Team
} from '../../domain/types'
import { buildDepthChart } from '../ai/selectDepth'
import { DEFAULT_SLIDERS } from '../scheme/schemes'

/** Formação-base padrão por scheme ofensivo. */
const OFF_FORMATION: Record<Team['preferredOffense'], OffenseFormation> = {
  air_raid: 'shotgun', west_coast: 'singleback', spread_option: 'shotgun', power_run: 'i_form',
  vertical: 'shotgun', pistol_rpo: 'pistol', smashmouth: 'i_form'
}
const DEF_FRONT: Record<Team['preferredDefense'], DefenseFront> = {
  '4-3': 'base_4_3', '3-4': 'base_3_4', nickel: 'nickel', dime: 'dime', tampa_2: 'nickel', '46_blitz': 'base_4_3'
}

export function defaultScheme(team: Team): SchemeSetup {
  return schemeFrom(team.preferredOffense, team.preferredDefense)
}

/** Constrói um SchemeSetup a partir dos schemes off/def escolhidos (deriva formação/frente). */
export function schemeFrom(
  offense: SchemeSetup['offense'],
  defense: SchemeSetup['defense'],
  sliders?: SchemeSetup['sliders']
): SchemeSetup {
  return {
    offense,
    defense,
    offenseFormation: OFF_FORMATION[offense],
    defenseFront: DEF_FRONT[defense],
    sliders: sliders ?? { ...DEFAULT_SLIDERS }
  }
}

/** Monta um GameTeam pronto para simulação (scheme padrão + depth chart automático). */
export function buildGameTeam(team: Team, roster: Player[], rules: LeagueRules, scheme?: SchemeSetup): GameTeam {
  const players = new Map<string, Player>()
  for (const p of roster) players.set(p.id, p)
  const sc = scheme ?? defaultScheme(team)
  return { team, scheme: sc, depth: buildDepthChart(roster, sc, rules), players }
}

export function makeGameInput(
  home: GameTeam, away: GameTeam, rules: LeagueRules,
  opts?: { importance?: GameInput['importance']; neutralVenue?: boolean; weather?: GameInput['weather'] }
): GameInput {
  return {
    home, away, rules,
    importance: opts?.importance ?? 'regular',
    neutralVenue: opts?.neutralVenue ?? false,
    weather: opts?.weather
  }
}
