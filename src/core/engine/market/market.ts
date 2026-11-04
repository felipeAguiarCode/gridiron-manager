import type { Rng } from '../../rng'
import type { Player, Position } from '../../domain/types'
import { computeCapHit, computeMarketValue, referenceSalary } from '../../domain/valuation'
import { rollAttributes, rollMentals } from '../generation/attributes'
import { computeOverall, SECONDARY_OPTIONS } from '../../domain/positions'
import { FIRST_NAMES, LAST_NAMES } from '../generation/names'

/** Valor de trade de um jogador (base para avaliação da IA). */
export function tradeValue(p: Player): number {
  return p.marketValue
}

/** Necessidade posicional de um roster (0-40): quanto pior o topo da posição, maior. */
export function needScore(roster: Player[], position: Position): number {
  const atPos = roster.filter((p) => p.position === position).sort((a, b) => b.overall - a.overall)
  const topAvg = atPos.length ? atPos.slice(0, 2).reduce((s, p) => s + p.overall, 0) / Math.min(2, atPos.length) : 40
  return Math.max(0, Math.min(40, 82 - topAvg))
}

export interface TradeEval {
  accept: boolean
  reason: string
}

/**
 * IA avalia uma trade: recebe `give` (jogadores que o usuário manda) e cede `get`.
 * Aceita se o valor recebido + bônus de necessidade cobre o valor cedido e o cap fecha.
 */
export function aiEvaluateTrade(aiRoster: Player[], give: Player[], get: Player[], aiCapSpace: number, aiHasCap: boolean): TradeEval {
  const giveValue = give.reduce((s, p) => s + tradeValue(p), 0)
  const getValue = get.reduce((s, p) => s + tradeValue(p), 0)
  const needBonus = give.reduce((s, p) => s + needScore(aiRoster, p.position) * 250_000, 0)

  // cap da IA após a troca (assume os capHits de `give`, libera os de `get`)
  if (aiHasCap) {
    const capDelta = give.reduce((s, p) => s + p.capHit, 0) - get.reduce((s, p) => s + p.capHit, 0)
    if (capDelta > aiCapSpace) return { accept: false, reason: 'A IA não tem espaço de cap para essa troca.' }
  }
  // guarda de roster: a IA não fica com menos jogadores do que manda +... simplificado
  if (get.length > give.length + 1) return { accept: false, reason: 'A IA não desfalca tanto o elenco.' }

  if (giveValue + needBonus >= getValue * 1.05) return { accept: true, reason: 'Proposta aceita.' }
  return { accept: false, reason: 'Valor insuficiente para a IA. Adicione mais peças.' }
}

/** Um agente livre aceita a oferta do time se houver cap (sem haggling no MVP). */
export function freeAgentAccepts(player: Player, capSpace: number, hasCap: boolean): boolean {
  return !hasCap || player.capHit <= capSpace
}

/** Gera um agente livre procedural (veterano/rotação). */
export function makeFreeAgent(rng: Rng, position: Position, idx: number): Player {
  const overallTarget = Math.round(rng.triangular(58, 84, 68))
  const age = Math.round(rng.triangular(24, 36, 29))
  const attributes = rollAttributes(rng, position, overallTarget)
  const overall = computeOverall({ position, attributes })
  const capHit = computeCapHit(overall, age, position)
  const secondary = rng.chance(0.3) ? [rng.pick(SECONDARY_OPTIONS[position])].filter(Boolean) : []
  return {
    id: `fa-${idx}-${LAST_NAMES[idx % LAST_NAMES.length]}`,
    teamId: 'free-agent',
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    nationality: 'USA',
    age,
    position,
    secondaryPositions: secondary as Position[],
    handedness: rng.chance(0.11) ? 'L' : 'R',
    attributes,
    overall,
    potential: Math.max(overall, Math.round(overall + rng.gaussian(1, 3))),
    mental: rollMentals(rng, overallTarget),
    traits: [],
    morale: 60,
    form: 60,
    fatigue: 0,
    injuryWeeks: 0,
    marketValue: computeMarketValue(overall, age, position),
    salary: referenceSalary(capHit),
    capHit,
    contractYears: rng.int(1, 3),
    jerseyNumber: rng.int(1, 99),
    yearsPro: Math.max(1, age - 22)
  }
}

const FA_POSITIONS: Position[] = [
  'QB', 'QB', 'RB', 'RB', 'RB', 'WR', 'WR', 'WR', 'WR', 'TE', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT', 'LT', 'RT',
  'DE', 'DE', 'DT', 'DT', 'NT', 'OLB', 'OLB', 'ILB', 'MLB',
  'CB', 'CB', 'CB', 'FS', 'SS', 'K', 'P', 'LS'
]

/** Pool inicial de agentes livres. */
export function generateFreeAgentPool(rng: Rng, count = 50): Player[] {
  const pool: Player[] = []
  for (let i = 0; i < count; i++) {
    const pos = FA_POSITIONS[i % FA_POSITIONS.length]
    pool.push(makeFreeAgent(rng, pos, i))
  }
  return pool.sort((a, b) => b.overall - a.overall)
}
