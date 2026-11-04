import type { Rng } from '../../rng'
import { createRng, deriveSeed } from '../../rng'
import type { ClassYear, Player, Position, TraitId } from '../../domain/types'
import { ROSTER_TEMPLATE, SECONDARY_OPTIONS, computeOverall } from '../../domain/positions'
import { computeCapHit, computeMarketValue, referenceSalary } from '../../domain/valuation'
import { rollAttributes, rollMentals } from './attributes'
import { FIRST_NAMES, LAST_NAMES } from './names'

/** Linha compacta do seed: [first, last, age, nat, POS, overall, potential, jersey, traits?, secondary?] */
export type Row = [
  string, string, number, string, Position, number, number, number,
  TraitId[]?, Position[]?
]

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)))

interface BuildParams {
  teamId: string
  firstName: string
  lastName: string
  age: number
  nationality: string
  position: Position
  overallTarget: number
  potential: number
  jerseyNumber: number
  traits: TraitId[]
  secondaryPositions: Position[]
  classYear?: ClassYear
}

export function buildPlayer(rng: Rng, p: BuildParams, idx: number): Player {
  const attributes = rollAttributes(rng, p.position, p.overallTarget)
  const overall = clampOverallToTarget(p.position, attributes, p.overallTarget)
  const mental = rollMentals(rng, p.overallTarget)
  const yearsPro = Math.max(0, p.age - 22)
  const handedness: 'L' | 'R' = rng.chance(0.11) ? 'L' : 'R'
  const capHit = computeCapHit(overall, p.age, p.position)
  const marketValue = computeMarketValue(overall, p.age, p.position)

  return {
    id: `${p.teamId}-p${idx}`,
    teamId: p.teamId,
    firstName: p.firstName,
    lastName: p.lastName,
    nationality: p.nationality,
    age: p.age,
    position: p.position,
    secondaryPositions: p.secondaryPositions,
    handedness,
    attributes,
    overall,
    potential: clamp(Math.max(p.potential, overall), overall, 99),
    mental,
    traits: p.traits,
    morale: clamp(rng.gaussian(70, 10), 40, 99),
    form: clamp(rng.gaussian(65, 12), 30, 99),
    fatigue: 0,
    injuryWeeks: 0,
    marketValue,
    salary: referenceSalary(capHit),
    capHit,
    contractYears: rng.int(1, 5),
    jerseyNumber: p.jerseyNumber,
    yearsPro,
    classYear: p.classYear
  }
}

/** Garante que o overall derivado não fuja do alvo (o roll já converge ±1). */
function clampOverallToTarget(
  position: Position,
  attributes: Player['attributes'],
  target: number
): number {
  const ov = computeOverall({ position, attributes })
  return Math.abs(ov - target) <= 2 ? ov : target
}

/** Expande uma linha compacta em Player completo (usado por generate-seed). */
export function expandRow(masterSeed: number, teamId: string, row: Row, idx: number): Player {
  const [first, last, age, nat, pos, overall, potential, jersey, traits, secondary] = row
  const rng = createRng(deriveSeed(masterSeed, teamId, last, first, idx))
  return buildPlayer(
    rng,
    {
      teamId,
      firstName: first,
      lastName: last,
      age,
      nationality: nat,
      position: pos,
      overallTarget: overall,
      potential,
      jerseyNumber: jersey,
      traits: traits ?? [],
      secondaryPositions: secondary ?? []
    },
    idx
  )
}

/**
 * Geração procedural de roster de 53 — usada para times custom e para preencher
 * franquias sem roster autorado. overall base = f(prestige, profundidade).
 */
export function generateRoster(rng: Rng, teamId: string, prestige: number, masterSeed: number): Player[] {
  const players: Player[] = []
  // overall-alvo do titular por prestige (1-200), com decaimento por profundidade
  const starterBase = 62 + Math.round((prestige / 200) * 26) // ~62..88
  const usedNumbers = new Set<number>()

  const byPos: Record<string, number> = {}
  ROSTER_TEMPLATE.forEach((pos, i) => {
    byPos[pos] = (byPos[pos] ?? 0) + 1
    const depth = byPos[pos] - 1
    const overallTarget = clamp(starterBase - depth * 6 + rng.gaussian(0, 3), 42, 99)
    const potential = clamp(overallTarget + rng.gaussian(4, 5), overallTarget, 99)
    const age = clamp(rng.triangular(21, 37, 25), 21, 39)
    const jersey = pickJersey(rng, pos, usedNumbers)
    const first = rng.pick(FIRST_NAMES)
    const last = rng.pick(LAST_NAMES)
    const secondary = rng.chance(0.3) ? [rng.pick(SECONDARY_OPTIONS[pos])].filter(Boolean) : []
    const pr = createRng(deriveSeed(masterSeed, teamId, 'gen', i))
    players.push(
      buildPlayer(
        pr,
        {
          teamId,
          firstName: first,
          lastName: last,
          age,
          nationality: 'USA',
          position: pos,
          overallTarget,
          potential,
          jerseyNumber: jersey,
          traits: [],
          secondaryPositions: secondary as Position[]
        },
        i
      )
    )
  })
  return players
}

const JERSEY_RANGES: Partial<Record<Position, [number, number]>> = {
  QB: [1, 19], K: [1, 19], P: [1, 19],
  RB: [20, 49], FB: [20, 49], CB: [20, 49], FS: [20, 49], SS: [20, 49],
  WR: [10, 19], TE: [80, 89],
  C: [50, 79], LG: [50, 79], RG: [50, 79], LT: [50, 79], RT: [50, 79], LS: [50, 59],
  OLB: [40, 59], ILB: [40, 59], MLB: [40, 59],
  DE: [90, 99], DT: [90, 99], NT: [90, 99]
}

function pickJersey(rng: Rng, pos: Position, used: Set<number>): number {
  const [lo, hi] = JERSEY_RANGES[pos] ?? [1, 99]
  for (let attempt = 0; attempt < 40; attempt++) {
    const n = rng.int(lo, hi)
    if (!used.has(n)) {
      used.add(n)
      return n
    }
  }
  // fallback: qualquer número livre
  for (let n = 1; n <= 99; n++) {
    if (!used.has(n)) {
      used.add(n)
      return n
    }
  }
  return 0
}
