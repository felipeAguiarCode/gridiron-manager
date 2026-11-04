import type { Rng } from '../../rng'
import { createRng, deriveSeed } from '../../rng'
import type { ClassYear, DevelopmentTrait, Position, Prospect } from '../../domain/types'
import { FIRST_NAMES, LAST_NAMES } from '../generation/names'

/**
 * Geração procedural da classe de draft (§10B.6). Determinística por seed.
 * `trueOverall`/`truePotential` ficam ocultos; o jogador só vê `visibleGrade`,
 * `projectedRound` (estimativa imperfeita) e ranges que estreitam ao escutar.
 */

const COLLEGES = ['Alabama', 'Ohio State', 'Georgia', 'Michigan', 'LSU', 'Texas', 'USC', 'Oregon', 'Clemson', 'Notre Dame', 'Penn State', 'Florida', 'Oklahoma', 'Miami', 'Tennessee', 'Washington', 'Utah', 'Iowa', 'Wisconsin', 'Baylor']
const POS_DIST: Position[] = ['QB', 'QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'WR', 'TE', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'DE', 'DE', 'DT', 'DT', 'NT', 'OLB', 'ILB', 'MLB', 'CB', 'CB', 'CB', 'FS', 'SS', 'K', 'P']
const DEV_TRAITS: { t: DevelopmentTrait; w: number }[] = [{ t: 'normal', w: 60 }, { t: 'quick', w: 18 }, { t: 'slow', w: 12 }, { t: 'star', w: 8 }, { t: 'superstar', w: 2 }]

function grade(round: number): string {
  return ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'][round - 1] ?? 'D'
}
function pickDev(rng: Rng): DevelopmentTrait {
  const total = DEV_TRAITS.reduce((s, d) => s + d.w, 0)
  let r = rng.next() * total
  for (const d of DEV_TRAITS) { r -= d.w; if (r <= 0) return d.t }
  return 'normal'
}
function classYearFor(age: number): ClassYear {
  return age >= 23 ? 'SR' : age >= 22 ? 'JR' : 'SO'
}

export function generateDraftClass(masterSeed: number, season: number, count = 224): Prospect[] {
  const rng = createRng(deriveSeed(masterSeed, 'draft-class', season))
  const prospects: Prospect[] = []
  for (let i = 0; i < count; i++) {
    const position = POS_DIST[i % POS_DIST.length]
    const trueOverall = Math.round(rng.triangular(52, 90, 66))
    const truePotential = Math.min(99, Math.round(trueOverall + rng.triangular(2, 24, 12)))
    const projectedRound = Math.max(1, Math.min(7, 8 - Math.round((trueOverall - 52) / 5) + Math.round(rng.gaussian(0, 0.8))))
    const age = Math.round(rng.triangular(21, 23, 22))
    const boomBust = Math.max(0, Math.min(100, Math.round((truePotential - trueOverall) * 3 + rng.gaussian(20, 12))))
    const oEst = Math.round(trueOverall + rng.gaussian(0, 4))
    const pEst = Math.round(truePotential + rng.gaussian(0, 6))
    const oLo = Math.max(40, Math.min(99, oEst - 8))
    const pLo = Math.max(40, Math.min(99, pEst - 12))
    prospects.push({
      id: `prospect-${season}-${i}`,
      firstName: rng.pick(FIRST_NAMES),
      lastName: rng.pick(LAST_NAMES),
      age,
      position,
      classYear: classYearFor(age),
      college: rng.pick(COLLEGES),
      visibleGrade: grade(projectedRound),
      projectedRound,
      trueOverall,
      truePotential,
      developmentTrait: pickDev(rng),
      boomBust,
      scoutingLevel: 0,
      revealedOverall: [oLo, Math.max(oLo, Math.min(99, oEst + 8))],
      revealedPotential: [pLo, Math.max(pLo, Math.min(99, pEst + 12))]
    })
  }
  return prospects.sort((a, b) => a.projectedRound - b.projectedRound || b.trueOverall - a.trueOverall)
}
