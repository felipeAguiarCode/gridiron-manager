import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { buildGenericSchedule } from './schedule'
import { nextRoundPairs, confRoundCount, confRoundLabels } from './playoffs'
import { LEAGUE_CONFIG } from '../../../shared/leagues'
import type { League, Team } from '../../domain/types'

function loadTeams(league: League): Team[] | null {
  const p = join(process.cwd(), 'resources', 'seed', league, 'teams.json')
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf-8')).teams as Team[]) : null
}

describe('calendário genérico (CFL/UFL/NCAA)', () => {
  for (const league of ['cfl', 'ufl', 'ncaa'] as League[]) {
    const teams = loadTeams(league)
    const run = teams ? it : it.skip
    run(`${league.toUpperCase()}: cada time joga gamesPerTeam e ≤1 por semana`, () => {
      const config = LEAGUE_CONFIG[league]
      const sched = buildGenericSchedule(teams!, config.gamesPerTeam, config.regularSeasonWeeks, 42)
      // cada time joga gamesPerTeam
      for (const t of teams!) {
        const g = sched.filter((f) => f.homeTeamId === t.id || f.awayTeamId === t.id).length
        expect(g, t.id).toBe(config.gamesPerTeam)
      }
      // nenhum time duas vezes na mesma semana
      const maxWeek = Math.max(...sched.map((f) => f.week))
      for (let w = 1; w <= maxWeek; w++) {
        const seen = new Set<string>()
        for (const f of sched.filter((x) => x.week === w)) {
          expect(seen.has(f.homeTeamId)).toBe(false)
          expect(seen.has(f.awayTeamId)).toBe(false)
          seen.add(f.homeTeamId); seen.add(f.awayTeamId)
        }
      }
      // sem auto-jogo
      expect(sched.some((f) => f.homeTeamId === f.awayTeamId)).toBe(false)
    })
  }
})

describe('bracket genérico (nextRoundPairs / byes)', () => {
  it('7 seeds (NFL): 1 bye + 3 jogos na 1ª rodada', () => {
    const r = nextRoundPairs(['s1', 's2', 's3', 's4', 's5', 's6', 's7'])
    expect(r.byes).toEqual(['s1'])
    expect(r.pairs.length).toBe(3)
  })
  it('3 seeds (CFL): 1 bye + 1 jogo', () => {
    const r = nextRoundPairs(['s1', 's2', 's3'])
    expect(r.byes).toEqual(['s1'])
    expect(r.pairs.length).toBe(1)
  })
  it('2 seeds (UFL): sem bye + 1 jogo', () => {
    const r = nextRoundPairs(['s1', 's2'])
    expect(r.byes.length).toBe(0)
    expect(r.pairs.length).toBe(1)
  })
  it('12 seeds (CFP): 4 byes + 4 jogos; 4 rodadas totais', () => {
    const r = nextRoundPairs(Array.from({ length: 12 }, (_, i) => 's' + i))
    expect(r.byes.length).toBe(4)
    expect(r.pairs.length).toBe(4)
    expect(confRoundCount(12)).toBe(4)
    expect(confRoundLabels(4)).toEqual(['wild_card', 'wild_card', 'divisional', 'conference'])
  })
  it('rótulos: 3 rodadas = wild_card/divisional/conference', () => {
    expect(confRoundLabels(3)).toEqual(['wild_card', 'divisional', 'conference'])
    expect(confRoundLabels(1)).toEqual(['conference'])
  })
})
