import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createRng, deriveSeed } from '../../rng'
import { buildRegularSchedule } from './schedule'
import { computeStandings, type ResultLike } from './standings'
import { simulateSeason } from './runSeason'
import { simulateGame } from '../game/engine'
import { buildGameTeam } from '../game/testkit'
import { LEAGUE_CONFIG } from '../../../shared/leagues'
import type { Fixture, GameTeam, Player, Team } from '../../domain/types'

const seedDir = join(process.cwd(), 'resources', 'seed', 'nfl')
const hasSeed = existsSync(join(seedDir, 'players.json'))
const maybe = hasSeed ? describe : describe.skip

maybe('temporada NFL — schedule, standings, playoffs', () => {
  const rules = LEAGUE_CONFIG.nfl.rules
  const teams: Team[] = JSON.parse(readFileSync(join(seedDir, 'teams.json'), 'utf-8')).teams
  const players: Player[] = JSON.parse(readFileSync(join(seedDir, 'players.json'), 'utf-8')).players
  const teamById = new Map(teams.map((t) => [t.id, t]))
  const schedule = buildRegularSchedule(teams, 20260703)

  describe('schedule', () => {
    it('272 jogos em 18 semanas', () => {
      expect(schedule.length).toBe(272)
      expect(Math.max(...schedule.map((f) => f.week))).toBe(18)
    })

    it('cada time joga exatamente 17 jogos (1 bye)', () => {
      for (const t of teams) {
        const games = schedule.filter((f) => f.homeTeamId === t.id || f.awayTeamId === t.id)
        expect(games.length, t.id).toBe(17)
      }
    })

    it('cada time joga 6 divisionais (2× cada rival)', () => {
      for (const t of teams) {
        const rivals = teams.filter((r) => r.id !== t.id && r.conference === t.conference && r.division === t.division)
        for (const r of rivals) {
          const meetings = schedule.filter(
            (f) => (f.homeTeamId === t.id && f.awayTeamId === r.id) || (f.homeTeamId === r.id && f.awayTeamId === t.id)
          )
          expect(meetings.length, `${t.id} vs ${r.id}`).toBe(2)
        }
      }
    })

    it('mando de campo balanceado (7-10 em casa) e sem auto-jogo', () => {
      for (const t of teams) {
        const home = schedule.filter((f) => f.homeTeamId === t.id).length
        expect(home, t.id).toBeGreaterThanOrEqual(7)
        expect(home, t.id).toBeLessThanOrEqual(10)
      }
      expect(schedule.some((f) => f.homeTeamId === f.awayTeamId)).toBe(false)
    })

    it('nenhum time joga duas vezes na mesma semana', () => {
      for (let w = 1; w <= 18; w++) {
        const wk = schedule.filter((f) => f.week === w)
        const seen = new Set<string>()
        for (const f of wk) {
          expect(seen.has(f.homeTeamId)).toBe(false)
          expect(seen.has(f.awayTeamId)).toBe(false)
          seen.add(f.homeTeamId); seen.add(f.awayTeamId)
        }
      }
    })

    it('schedule é determinístico (mesma seed → mesmo calendário)', () => {
      const a = buildRegularSchedule(teams, 55).map((f) => f.id).sort()
      const b = buildRegularSchedule(teams, 55).map((f) => f.id).sort()
      expect(a).toEqual(b)
    })
  })

  describe('standings + tiebreakers', () => {
    // resultado sintético determinístico: maior prestige vence (com ruído leve)
    const synthetic = (): Map<string, ResultLike> => {
      const rng = createRng(42)
      const results = new Map<string, ResultLike>()
      for (const f of schedule) {
        const hp = teamById.get(f.homeTeamId)!.prestige + 8 // home edge
        const ap = teamById.get(f.awayTeamId)!.prestige
        const homeWin = rng.next() < hp / (hp + ap)
        results.set(f.id, homeWin ? { homeScore: 24, awayScore: 17, winnerTeamId: f.homeTeamId } : { homeScore: 20, awayScore: 27, winnerTeamId: f.awayTeamId })
      }
      return results
    }

    it('registros consistentes e zonas de playoff por conferência', () => {
      const standings = computeStandings(teams, schedule, synthetic())
      for (const s of standings) {
        expect(s.played).toBe(s.wins + s.losses + s.ties)
        expect(s.played).toBe(17)
        expect(s.pointDiff).toBe(s.pointsFor - s.pointsAgainst)
      }
      for (const conf of LEAGUE_CONFIG.nfl.conferences) {
        const confSt = standings.filter((s) => teamById.get(s.teamId)!.conference === conf)
        expect(confSt.filter((s) => s.zone === 'division_leader').length).toBe(4)
        expect(confSt.filter((s) => s.zone === 'wildcard').length).toBe(3)
      }
    })

    it('cada divisão tem posições 1-4 únicas', () => {
      const standings = computeStandings(teams, schedule, synthetic())
      const stById = new Map(standings.map((s) => [s.teamId, s]))
      for (const conf of LEAGUE_CONFIG.nfl.conferences) {
        for (const div of LEAGUE_CONFIG.nfl.divisionsPerConference) {
          const positions = teams.filter((t) => t.conference === conf && t.division === div).map((t) => stById.get(t.id)!.position).sort()
          expect(positions).toEqual([1, 2, 3, 4])
        }
      }
    })
  })

  describe('playoffs (engine real)', () => {
    const gt = new Map<string, GameTeam>()
    for (const t of teams) gt.set(t.id, buildGameTeam(t, players.filter((p) => p.teamId === t.id), rules))
    const play = (f: Fixture, importance: 'regular' | 'playoff' | 'championship', neutral: boolean): ResultLike => {
      const res = simulateGame({ home: gt.get(f.homeTeamId)!, away: gt.get(f.awayTeamId)!, rules, importance, neutralVenue: neutral }, f.simulationSeed)
      return { homeScore: res.homeScore, awayScore: res.awayScore, winnerTeamId: res.winnerTeamId }
    }

    it('temporada completa produz exatamente 1 campeão', () => {
      const outcome = simulateSeason(teams, 20260703, play)
      expect(outcome.championId).not.toBeNull()
      // 7 seeds por conferência
      for (const conf of LEAGUE_CONFIG.nfl.conferences) expect(outcome.seeds.get(conf)!.length).toBe(7)
      // 6 wild card + 4 divisional + 2 conference + 1 championship = 13 jogos de playoff
      expect(outcome.playoffGames.length).toBe(13)
      // todo jogo de playoff tem vencedor (sem empate)
      expect(outcome.playoffGames.every((g) => g.result.winnerTeamId !== null)).toBe(true)
    })

    it('temporada é determinística (mesma seed → mesmo campeão)', () => {
      const a = simulateSeason(teams, 999, play)
      const b = simulateSeason(teams, 999, play)
      expect(a.championId).toBe(b.championId)
      expect(a.standings.map((s) => `${s.teamId}:${s.wins}`)).toEqual(b.standings.map((s) => `${s.teamId}:${s.wins}`))
    })

    it('campeão vem de uma conferência e estava no seeding', () => {
      const outcome = simulateSeason(teams, 2026, play)
      const allSeeds = [...outcome.seeds.values()].flat()
      expect(allSeeds).toContain(outcome.championId!)
    })
  })
})

void deriveSeed
