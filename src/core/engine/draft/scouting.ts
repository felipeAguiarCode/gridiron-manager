import type { Prospect } from '../../domain/types'

/** Larguras do range revelado por nível de scouting (0-4). */
const WIDTH = [8, 5, 3, 2, 0]

/**
 * Aprofunda o scouting de um prospect (§10B.6): sobe um nível e estreita os
 * ranges revelados, misturando a estimativa anterior com a verdade na proporção
 * do nível. No nível 4 o range colapsa no valor verdadeiro.
 */
export function scoutProspect(prospect: Prospect): Prospect {
  if (prospect.scoutingLevel >= 4) return prospect
  const level = prospect.scoutingLevel + 1
  const width = WIDTH[level]
  const mix = level / 4
  const oMid = Math.round(prospect.trueOverall * mix + ((prospect.revealedOverall[0] + prospect.revealedOverall[1]) / 2) * (1 - mix))
  const pMid = Math.round(prospect.truePotential * mix + ((prospect.revealedPotential[0] + prospect.revealedPotential[1]) / 2) * (1 - mix))
  const oLo = Math.max(40, Math.min(99, oMid - width))
  const pLo = Math.max(40, Math.min(99, pMid - width))
  return {
    ...prospect,
    scoutingLevel: level,
    revealedOverall: [oLo, Math.max(oLo, Math.min(99, oMid + width))],
    revealedPotential: [pLo, Math.max(pLo, Math.min(99, pMid + width))]
  }
}
