import type { Rng } from '../../rng'
import { createRng, deriveSeed } from '../../rng'
import type { Player, Position } from '../../domain/types'
import { buildPlayer } from '../generation/generate'
import { computeCapHit, computeMarketValue } from '../../domain/valuation'
import { FIRST_NAMES, LAST_NAMES } from '../generation/names'

/**
 * Lendas aposentadas que podem cogitar retorno (§10B.3). Eram estrelas; ao voltar,
 * sofrem declínio por idade + ferrugem (overall efetivo menor), contrato curto e
 * alto risco de lesão — para não quebrar o jogo.
 */

const LEGEND_POS: Position[] = ['QB', 'RB', 'WR', 'TE', 'DE', 'CB', 'LT', 'OLB']

export function generateLegendPool(masterSeed: number, count = 8): Player[] {
  const legends: Player[] = []
  for (let i = 0; i < count; i++) {
    const rng = createRng(deriveSeed(masterSeed, 'legend', i))
    const position = LEGEND_POS[i % LEGEND_POS.length]
    const peak = Math.round(rng.triangular(88, 99, 93))
    const age = Math.round(rng.triangular(34, 40, 36))
    const p = buildPlayer(rng, {
      teamId: 'retired', firstName: rng.pick(FIRST_NAMES), lastName: rng.pick(LAST_NAMES),
      age, nationality: 'USA', position, overallTarget: peak, potential: peak,
      jerseyNumber: rng.int(1, 99), traits: [], secondaryPositions: []
    }, i)
    p.id = `legend-${i}-${p.lastName}`
    p.persona = 'comeback_story'
    legends.push(p)
  }
  return legends
}

/** Overall efetivo ao voltar: pico − declínio por idade − ferrugem. */
export function effectiveLegend(legend: Player, rng: Rng): Player {
  const ageDecline = Math.max(0, legend.age - 33) * 2
  const rust = rng.int(4, 10)
  const eff = Math.max(60, legend.overall - ageDecline - rust)
  return {
    ...legend,
    overall: eff,
    attributes: { ...legend.attributes, sta: Math.max(40, legend.attributes.sta - 15 - rust) },
    capHit: computeCapHit(eff, legend.age, legend.position),
    marketValue: computeMarketValue(eff, legend.age, legend.position),
    contractYears: 1,
    form: 52,
    fatigue: 25,
    injuryWeeks: 0,
    persona: 'comeback_story'
  }
}
