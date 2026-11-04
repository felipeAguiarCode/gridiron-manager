import type { Fixture, SeasonPhase, Standing, Team } from '../../domain/types'
import { buildRegularSchedule } from './schedule'
import { computeStandings, type ResultLike } from './standings'
import { playoffSeeding, wildCardPairs, reseed, makeFixtures } from './playoffs'

export interface PlayoffGame {
  round: SeasonPhase
  conference: string | null
  fixture: Fixture
  result: ResultLike
}

export interface SeasonOutcome {
  schedule: Fixture[]
  regularResults: Map<string, ResultLike>
  standings: Standing[]
  seeds: Map<string, string[]>
  playoffGames: PlayoffGame[]
  championId: string | null
}

/** Função de resolução de jogo (engine real ou stub de teste). */
export type PlayFn = (f: Fixture, importance: 'regular' | 'playoff' | 'championship', neutral: boolean) => ResultLike

/**
 * Simula uma temporada completa (regular → playoffs → campeão), parametrizada
 * pela função de jogo. Pura: sem I/O. Usada pelo CLI, testes e game-service.
 */
export function simulateSeason(teams: Team[], masterSeed: number, play: PlayFn): SeasonOutcome {
  const schedule = buildRegularSchedule(teams, masterSeed)
  const regularResults = new Map<string, ResultLike>()
  for (const f of schedule) regularResults.set(f.id, play(f, 'regular', false))

  const standings = computeStandings(teams, schedule, regularResults)
  const seeds = playoffSeeding(teams, standings)
  const seedIndex = new Map<string, number>()
  for (const [, arr] of seeds) arr.forEach((id, i) => seedIndex.set(id, i))

  const playoffGames: PlayoffGame[] = []
  const alive = new Map<string, string[]>()
  let week = 100

  // Wild Card
  for (const [conf, s] of seeds) {
    const fx = makeFixtures('wild_card', week, wildCardPairs(s), masterSeed)
    const winners: string[] = [s[0]] // seed 1 bye
    for (const f of fx) {
      const result = play(f, 'playoff', false)
      playoffGames.push({ round: 'wild_card', conference: conf, fixture: f, result })
      winners.push(result.winnerTeamId!)
    }
    alive.set(conf, winners.sort((a, b) => seedIndex.get(a)! - seedIndex.get(b)!))
  }

  // Divisional + Conference
  for (const phase of ['divisional', 'conference'] as SeasonPhase[]) {
    week++
    for (const [conf, list] of alive) {
      const fx = makeFixtures(phase, week, reseed(list), masterSeed)
      const winners: string[] = []
      for (const f of fx) {
        const result = play(f, 'playoff', false)
        playoffGames.push({ round: phase, conference: conf, fixture: f, result })
        winners.push(result.winnerTeamId!)
      }
      alive.set(conf, winners.sort((a, b) => seedIndex.get(a)! - seedIndex.get(b)!))
    }
  }

  // Championship (neutro)
  week++
  const finalists = [...alive.values()].map((v) => v[0]).filter(Boolean)
  let championId: string | null = null
  if (finalists.length === 2) {
    const fx = makeFixtures('championship', week, [{ home: finalists[0], away: finalists[1], neutral: true }], masterSeed)[0]
    const result = play(fx, 'championship', true)
    playoffGames.push({ round: 'championship', conference: null, fixture: fx, result })
    championId = result.winnerTeamId
  }

  return { schedule, regularResults, standings, seeds, playoffGames, championId }
}
