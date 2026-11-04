import type { Player, Prospect } from '../../domain/types'
import { needScore } from '../market/market'

/**
 * Melhor prospect disponível para um roster: mistura talento verdadeiro,
 * necessidade posicional e potencial (BPA + need, §10B.8).
 */
export function bestAvailable(available: Prospect[], roster: Player[]): Prospect | undefined {
  let best: Prospect | undefined
  let bestScore = -Infinity
  for (const p of available) {
    const score = p.trueOverall + needScore(roster, p.position) * 0.6 + p.truePotential * 0.15
    if (score > bestScore) { bestScore = score; best = p }
  }
  return best
}
