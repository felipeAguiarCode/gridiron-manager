import type { Rng } from '../rng'
import { createRng, deriveSeed } from '../rng'
import type { AttrKey, Player, Position } from '../domain/types'
import { ARCHETYPES, computeOverall, SECONDARY_OPTIONS } from '../domain/positions'
import { computeCapHit, computeMarketValue, referenceSalary } from '../domain/valuation'
import { rollAttributes, rollMentals } from './generation/attributes'
import { FIRST_NAMES, LAST_NAMES } from './generation/names'

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)))

/**
 * Envelhecimento + desenvolvimento anual (determinístico). Jovens crescem em
 * direção ao potencial; veteranos declinam. Crescimento e queda se equilibram
 * na liga (sem inflação de overall — validado no teste de 5 temporadas).
 */
export function developPlayer(rng: Rng, p: Player): Player {
  const age = p.age + 1
  let delta: number
  if (age <= 23) delta = rng.int(1, 4)
  else if (age <= 26) delta = rng.int(0, 2)
  else if (age <= 29) delta = rng.int(-1, 1)
  else if (age <= 32) delta = rng.int(-3, 0)
  else delta = rng.int(-5, -1)

  const w = ARCHETYPES[p.position]
  const target = delta >= 0 ? Math.min(p.potential, p.overall + delta) : Math.max(30, p.overall + delta)
  const shift = target - p.overall
  const attributes = { ...p.attributes }
  for (const key in w) attributes[key as AttrKey] = clamp(attributes[key as AttrKey] + shift, 20, 99)
  const overall = clamp(computeOverall({ position: p.position, attributes }), 20, 99)
  const capHit = computeCapHit(overall, age, p.position)

  return {
    ...p,
    age,
    attributes,
    overall,
    capHit,
    marketValue: computeMarketValue(overall, age, p.position),
    salary: referenceSalary(capHit),
    contractYears: Math.max(0, p.contractYears - 1),
    fatigue: 0,
    injuryWeeks: 0,
    yearsPro: p.yearsPro + 1
  }
}

/** Probabilidade de aposentadoria cresce com a idade (K/P/LS duram mais). */
export function shouldRetire(rng: Rng, p: Player): boolean {
  const kicker = p.position === 'K' || p.position === 'P' || p.position === 'LS'
  const age = p.age + (kicker ? -3 : 0) // ajusta o threshold efetivo
  let prob = 0
  if (age >= 39) prob = 0.95
  else if (age >= 37) prob = 0.6
  else if (age >= 35) prob = 0.3
  else if (age >= 33) prob = 0.12
  else if (age >= 31 && p.overall < 68) prob = 0.1
  return rng.chance(prob)
}

/** Gera um calouro (21-23) para repor aposentadorias. */
export function generateRookie(masterSeed: number, teamId: string, position: Position, prestige: number, idx: number): Player {
  const rng = createRng(deriveSeed(masterSeed, 'rookie', teamId, position, idx))
  const base = 54 + Math.round((prestige / 200) * 16) // 54..70
  const overallTarget = clamp(base + rng.gaussian(0, 4), 45, 82)
  const potential = clamp(overallTarget + rng.gaussian(8, 6), overallTarget, 95)
  const age = rng.int(21, 23)
  const attributes = rollAttributes(rng, position, overallTarget)
  const overall = computeOverall({ position, attributes })
  const capHit = computeCapHit(overall, age, position)
  const secondary = rng.chance(0.3) ? [rng.pick(SECONDARY_OPTIONS[position])].filter(Boolean) : []
  return {
    id: `${teamId}-rk${masterSeed % 100000}-${idx}`,
    teamId,
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    nationality: 'USA',
    age,
    position,
    secondaryPositions: secondary as Position[],
    handedness: rng.chance(0.11) ? 'L' : 'R',
    attributes,
    overall,
    potential,
    mental: rollMentals(rng, overallTarget),
    traits: [],
    morale: 65,
    form: 60,
    fatigue: 0,
    injuryWeeks: 0,
    marketValue: computeMarketValue(overall, age, position),
    salary: referenceSalary(capHit),
    capHit,
    contractYears: rng.int(3, 4),
    jerseyNumber: rng.int(1, 99),
    yearsPro: 0
  }
}
