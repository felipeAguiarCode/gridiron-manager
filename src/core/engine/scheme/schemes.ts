import type { DefenseSchemeId, OffenseSchemeId } from '../../domain/types'

/**
 * Definições de schemes ofensivos/defensivos + matriz de matchup (GDD §8).
 * Equivalem aos playbooks do soccer: cada scheme tem viés de play-call, custo
 * de fadiga, requisito de elenco e um multiplicador de matchup contra o scheme
 * rival (aplicado ao EffOff). Calibrar com o harness.
 */

export interface OffenseScheme {
  id: OffenseSchemeId
  label: string
  passRate: number // fração base de passes (situação ajusta)
  tempo: number // ritmo relativo (afeta nº de jogadas e fadiga)
  fatigueCost: number // multiplicador de fadiga por snap
  bigPlayBias: number // tendência a jogadas explosivas
}

export interface DefenseScheme {
  id: DefenseSchemeId
  label: string
  blitzRate: number // pressão extra base
  coverageBias: number // >1 favorece cobertura, <1 favorece pressão
  runFit: number // >1 melhor contra corrida
  fatigueCost: number
}

export const OFFENSE_SCHEMES: Record<OffenseSchemeId, OffenseScheme> = {
  air_raid: { id: 'air_raid', label: 'Air Raid', passRate: 0.68, tempo: 1.15, fatigueCost: 1.12, bigPlayBias: 1.15 },
  west_coast: { id: 'west_coast', label: 'West Coast', passRate: 0.6, tempo: 1.0, fatigueCost: 1.0, bigPlayBias: 0.95 },
  spread_option: { id: 'spread_option', label: 'Spread Option', passRate: 0.52, tempo: 1.08, fatigueCost: 1.05, bigPlayBias: 1.05 },
  power_run: { id: 'power_run', label: 'Power Run', passRate: 0.42, tempo: 0.92, fatigueCost: 0.95, bigPlayBias: 0.9 },
  vertical: { id: 'vertical', label: 'Vertical', passRate: 0.63, tempo: 1.02, fatigueCost: 1.05, bigPlayBias: 1.2 },
  pistol_rpo: { id: 'pistol_rpo', label: 'Pistol/RPO', passRate: 0.5, tempo: 1.05, fatigueCost: 1.02, bigPlayBias: 1.05 },
  smashmouth: { id: 'smashmouth', label: 'Smashmouth', passRate: 0.38, tempo: 0.88, fatigueCost: 0.9, bigPlayBias: 0.85 }
}

export const DEFENSE_SCHEMES: Record<DefenseSchemeId, DefenseScheme> = {
  '4-3': { id: '4-3', label: '4-3', blitzRate: 0.22, coverageBias: 1.0, runFit: 1.05, fatigueCost: 1.0 },
  '3-4': { id: '3-4', label: '3-4', blitzRate: 0.25, coverageBias: 1.0, runFit: 1.02, fatigueCost: 1.0 },
  nickel: { id: 'nickel', label: 'Nickel', blitzRate: 0.2, coverageBias: 1.08, runFit: 0.92, fatigueCost: 1.0 },
  dime: { id: 'dime', label: 'Dime', blitzRate: 0.15, coverageBias: 1.15, runFit: 0.82, fatigueCost: 1.0 },
  tampa_2: { id: 'tampa_2', label: 'Tampa 2', blitzRate: 0.12, coverageBias: 1.12, runFit: 0.95, fatigueCost: 0.98 },
  '46_blitz': { id: '46_blitz', label: '46 Blitz', blitzRate: 0.45, coverageBias: 0.85, runFit: 1.08, fatigueCost: 1.15 }
}

/** Matriz de matchup off×def (multiplicador ao EffOff). GDD §8. */
export const SCHEME_MATCHUP: Record<OffenseSchemeId, Record<DefenseSchemeId, number>> = {
  air_raid: { '4-3': 1.02, '3-4': 1.0, nickel: 0.96, dime: 1.06, tampa_2: 0.94, '46_blitz': 1.08 },
  west_coast: { '4-3': 1.0, '3-4': 1.02, nickel: 1.0, dime: 0.98, tampa_2: 1.03, '46_blitz': 0.96 },
  spread_option: { '4-3': 1.04, '3-4': 0.98, nickel: 1.02, dime: 1.05, tampa_2: 0.97, '46_blitz': 0.92 },
  power_run: { '4-3': 1.05, '3-4': 1.06, nickel: 1.02, dime: 1.1, tampa_2: 1.0, '46_blitz': 0.9 },
  vertical: { '4-3': 0.98, '3-4': 1.0, nickel: 0.95, dime: 1.04, tampa_2: 0.9, '46_blitz': 1.07 },
  pistol_rpo: { '4-3': 1.03, '3-4': 0.97, nickel: 1.02, dime: 1.04, tampa_2: 0.99, '46_blitz': 0.95 },
  smashmouth: { '4-3': 1.06, '3-4': 1.05, nickel: 1.03, dime: 1.08, tampa_2: 1.01, '46_blitz': 0.88 }
}

export function schemeMatchup(off: OffenseSchemeId, def: DefenseSchemeId): number {
  return SCHEME_MATCHUP[off][def]
}

export const DEFAULT_SLIDERS = {
  tempo: 50,
  aggression: 50,
  blitzRate: 40,
  coverageTightness: 50,
  runPassBias: 50,
  playActionRate: 45,
  screenRate: 35,
  tempoDefense: 50
} as const
