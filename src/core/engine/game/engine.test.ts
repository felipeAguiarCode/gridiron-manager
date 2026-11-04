import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { simulateGame } from './engine'
import { buildGameTeam, makeGameInput } from './testkit'
import { LEAGUE_CONFIG } from '../../../shared/leagues'
import type { Player, Team } from '../../domain/types'

const seedDir = join(process.cwd(), 'resources', 'seed', 'nfl')
const hasSeed = existsSync(join(seedDir, 'players.json'))
const maybe = hasSeed ? describe : describe.skip

maybe('motor de partida — estrutura e reprodutibilidade', () => {
  const rules = LEAGUE_CONFIG.nfl.rules
  const teams: Team[] = JSON.parse(readFileSync(join(seedDir, 'teams.json'), 'utf-8')).teams
  const players: Player[] = JSON.parse(readFileSync(join(seedDir, 'players.json'), 'utf-8')).players
  const rosterOf = (id: string): Player[] => players.filter((p) => p.teamId === id)
  const kc = teams.find((t) => t.id === 'nfl-kc')!
  const car = teams.find((t) => t.id === 'nfl-car')!

  const build = () =>
    makeGameInput(
      buildGameTeam(kc, rosterOf(kc.id), rules),
      buildGameTeam(car, rosterOf(car.id), rules),
      rules
    )

  it('golden: mesma seed → resultado idêntico', () => {
    const a = simulateGame(build(), 123456)
    const b = simulateGame(build(), 123456)
    expect(a.homeScore).toBe(b.homeScore)
    expect(a.awayScore).toBe(b.awayScore)
    expect(a.plays.length).toBe(b.plays.length)
    expect(a.plays[0].text).toBe(b.plays[0].text)
    expect(a.winnerTeamId).toBe(b.winnerTeamId)
  })

  it('seeds diferentes → resultados variam', () => {
    const a = simulateGame(build(), 1)
    const b = simulateGame(build(), 2)
    expect(a.homeScore !== b.homeScore || a.awayScore !== b.awayScore).toBe(true)
  })

  it('estrutura do resultado é coerente', () => {
    const res = simulateGame(build(), 42)
    expect(res.quarters.length).toBeGreaterThanOrEqual(4)
    expect(res.drives.length).toBeGreaterThan(6)
    expect(res.plays.length).toBeGreaterThan(80)
    // soma dos quarters bate com o placar final
    const homeSum = res.quarters.reduce((s, q) => s + q[0], 0)
    const awaySum = res.quarters.reduce((s, q) => s + q[1], 0)
    expect(homeSum).toBe(res.homeScore)
    expect(awaySum).toBe(res.awayScore)
    // sem empate na regulation? pode empatar e ir p/ OT — mas nunca fica nulo se houve OT
    if (res.overtime) expect(res.winnerTeamId).not.toBeNull()
    // há um QB com jardas de passe
    const qbLine = res.playerStats.find((l) => l.passAtt > 5)
    expect(qbLine).toBeTruthy()
    expect(qbLine!.passYards).toBeGreaterThan(0)
  })

  it('KC (elite, mandante) vence CAR (fraco) na maioria de 150 jogos', () => {
    let kcWins = 0
    for (let i = 0; i < 150; i++) {
      const res = simulateGame(build(), 1000 + i)
      if (res.winnerTeamId === kc.id) kcWins++
    }
    expect(kcWins / 150).toBeGreaterThan(0.6) // favorito claro em casa
  })
})
