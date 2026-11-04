import { deriveSeed } from '../../rng'
import type { Fixture, SeasonPhase, Standing, Team } from '../../domain/types'
import { rankConference } from './standings'

export const PLAYOFF_PHASES: SeasonPhase[] = ['wild_card', 'divisional', 'conference', 'championship']

/** Seeds por conferência: 4 líderes de divisão (1-4) + 3 wild cards (5-7), em ordem de seed. */
export function playoffSeeding(teams: Team[], standings: Standing[], seedsPerConf = 7): Map<string, string[]> {
  const conferences = new Set(teams.map((t) => t.conference))
  const out = new Map<string, string[]>()
  for (const conf of conferences) {
    const ranked = rankConference(teams, standings, conf).slice(0, seedsPerConf)
    out.set(conf, ranked.map((s) => s.teamId))
  }
  return out
}

/**
 * Emparelha os times vivos de uma conferência por reseeding (melhor vs pior).
 * `aliveSortedBySeed`: ids ordenados por número de seed (0 = melhor).
 * Retorna jogos com mando do melhor seed.
 */
export function reseed(aliveSortedBySeed: string[]): { home: string; away: string }[] {
  const pairs: { home: string; away: string }[] = []
  let i = 0
  let j = aliveSortedBySeed.length - 1
  while (i < j) {
    pairs.push({ home: aliveSortedBySeed[i], away: aliveSortedBySeed[j] })
    i++
    j--
  }
  return pairs
}

/** Wild card: seed 1 tem bye; jogam (2v7),(3v6),(4v5). */
export function wildCardPairs(seeds: string[]): { home: string; away: string }[] {
  return reseed(seeds.slice(1)) // exclui o seed 1 (bye)
}

export function makeFixtures(
  round: SeasonPhase,
  week: number,
  pairs: { home: string; away: string; neutral?: boolean }[],
  masterSeed: number
): Fixture[] {
  return pairs.map((p, i) => ({
    id: `${round}-w${week}-${p.home}-${p.away}`,
    week,
    round,
    homeTeamId: p.home,
    awayTeamId: p.away,
    neutralVenue: p.neutral ?? false,
    simulationSeed: deriveSeed(masterSeed, 'playoff', round, p.home, p.away, i),
    status: 'scheduled' as const
  }))
}

/** Próxima fase do playoff (ou null se acabou). */
export function nextPhase(phase: SeasonPhase): SeasonPhase | null {
  const idx = PLAYOFF_PHASES.indexOf(phase)
  if (idx < 0 || idx >= PLAYOFF_PHASES.length - 1) return null
  return PLAYOFF_PHASES[idx + 1]
}

/**
 * Emparelhamento genérico de uma rodada eliminatória com byes para os melhores
 * seeds até o campo virar potência de 2. `aliveSortedBySeed` ordenado por seed.
 * Retorna os jogos (play-in) e os times que passam direto (byes).
 */
export function nextRoundPairs(aliveSortedBySeed: string[]): { pairs: { home: string; away: string }[]; byes: string[] } {
  const len = aliveSortedBySeed.length
  if (len <= 1) return { pairs: [], byes: aliveSortedBySeed }
  const p = 1 << Math.floor(Math.log2(len))
  if (len === p) return { pairs: reseed(aliveSortedBySeed), byes: [] }
  const games = len - p
  const byes = aliveSortedBySeed.slice(0, len - 2 * games)
  const playIn = aliveSortedBySeed.slice(len - 2 * games)
  return { pairs: reseed(playIn), byes }
}

/** Nº de rodadas de conferência até restar 1 (ceil(log2(seeds))). */
export function confRoundCount(seeds: number): number {
  return Math.max(1, Math.ceil(Math.log2(seeds)))
}

/** Rótulos das fases de conferência em ordem de disputa: última rodada = 'conference'. */
export function confRoundLabels(numRounds: number): SeasonPhase[] {
  const byDistanceFromEnd: SeasonPhase[] = ['conference', 'divisional', 'wild_card']
  const out: SeasonPhase[] = []
  for (let r = 0; r < numRounds; r++) {
    const dist = numRounds - 1 - r
    out.push(byDistanceFromEnd[Math.min(dist, byDistanceFromEnd.length - 1)])
  }
  return out
}
