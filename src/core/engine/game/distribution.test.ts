import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createRng, deriveSeed } from '../../rng'
import { simulateGame } from './engine'
import { buildGameTeam, makeGameInput } from './testkit'
import { LEAGUE_CONFIG } from '../../../shared/leagues'
import type { Player, Team } from '../../domain/types'

const seedDir = join(process.cwd(), 'resources', 'seed', 'nfl')
const hasSeed = existsSync(join(seedDir, 'players.json'))
const maybe = hasSeed ? describe : describe.skip

interface Built {
  team: Team
  strength: number
  make: () => ReturnType<typeof buildGameTeam>
}

maybe('harness de distribuição (1000 sims) — bandas realistas', () => {
  const rules = LEAGUE_CONFIG.nfl.rules
  const teams: Team[] = JSON.parse(readFileSync(join(seedDir, 'teams.json'), 'utf-8')).teams
  const players: Player[] = JSON.parse(readFileSync(join(seedDir, 'players.json'), 'utf-8')).players
  const rosterOf = (id: string): Player[] => players.filter((p) => p.teamId === id)

  const built: Built[] = teams.map((team) => {
    const roster = rosterOf(team.id)
    const make = (): ReturnType<typeof buildGameTeam> => buildGameTeam(team, roster, rules)
    const gt = make()
    const starters = [...gt.depth.offense, ...gt.depth.defense].map((pid) => gt.players.get(pid)!).filter(Boolean)
    const strength = starters.reduce((s, p) => s + p.overall, 0) / starters.length
    return { team, strength, make }
  })

  const N = 1000
  let totalPoints = 0
  let totalYards = 0
  let totalTurnovers = 0
  let games = 0
  let ties = 0

  // gaps de força entre médias de 22 titulares são comprimidos; thresholds
  // calibrados à distribuição real de rosters (elite ~82 vs fraco ~74).
  const buckets = {
    even: { favWins: 0, n: 0 }, // gap < 1.5
    slight: { favWins: 0, n: 0 }, // 1.5–3.5
    clear: { favWins: 0, n: 0 }, // 3.5–6
    big: { favWins: 0, n: 0 } // > 6
  }

  const rng = createRng(777)
  for (let i = 0; i < N; i++) {
    const a = built[rng.int(0, built.length - 1)]
    let b = built[rng.int(0, built.length - 1)]
    let guard = 0
    while (b.team.id === a.team.id && guard++ < 5) b = built[rng.int(0, built.length - 1)]
    if (b.team.id === a.team.id) continue

    const home = a.make()
    const away = b.make()
    const input = makeGameInput(home, away, rules)
    const res = simulateGame(input, deriveSeed(777, a.team.id, b.team.id, i))

    games++
    totalPoints += res.homeScore + res.awayScore
    totalYards += res.stats.home.totalYards + res.stats.away.totalYards
    totalTurnovers += res.stats.home.turnovers + res.stats.away.turnovers
    if (res.winnerTeamId === null) ties++

    const gap = a.strength - b.strength
    const favTeamId = gap >= 0 ? a.team.id : b.team.id
    const absGap = Math.abs(gap)
    const bucket = absGap < 1.5 ? buckets.even : absGap < 3.5 ? buckets.slight : absGap < 6 ? buckets.clear : buckets.big
    bucket.n++
    if (res.winnerTeamId === favTeamId) bucket.favWins++
  }

  const meanPointsPerTeam = totalPoints / games / 2
  const meanYardsPerTeam = totalYards / games / 2
  const meanToPerTeam = totalTurnovers / games / 2

  // relatório de calibragem
  const pct = (b: { favWins: number; n: number }): string => (b.n ? ((b.favWins / b.n) * 100).toFixed(1) + '%' : 'n/a')
  console.log('\n=== HARNESS NFL (1000 sims) ===')
  console.log(`jogos: ${games} · empates: ${ties}`)
  console.log(`pontos/time: ${meanPointsPerTeam.toFixed(1)} (alvo 20-27)`)
  console.log(`jardas/time: ${meanYardsPerTeam.toFixed(0)} (alvo ~330)`)
  console.log(`turnovers/time: ${meanToPerTeam.toFixed(2)} (alvo 1-2)`)
  console.log(`vitória do favorito — equilíbrio: ${pct(buckets.even)} (n=${buckets.even.n}) · leve: ${pct(buckets.slight)} · claro: ${pct(buckets.clear)} · grande: ${pct(buckets.big)}`)

  it('placar médio por time é realista (17-30)', () => {
    expect(meanPointsPerTeam).toBeGreaterThan(17)
    expect(meanPointsPerTeam).toBeLessThan(30)
  })
  it('jardas totais por time são realistas (260-430)', () => {
    expect(meanYardsPerTeam).toBeGreaterThan(260)
    expect(meanYardsPerTeam).toBeLessThan(430)
  })
  it('turnovers por time são realistas (0.7-2.6)', () => {
    expect(meanToPerTeam).toBeGreaterThan(0.7)
    expect(meanToPerTeam).toBeLessThan(2.6)
  })
  it('favorito forte (gap > 6) vence entre 62% e 95%', () => {
    expect(buckets.big.n).toBeGreaterThan(15)
    const p = buckets.big.favWins / buckets.big.n
    expect(p).toBeGreaterThan(0.62)
    expect(p).toBeLessThan(0.95)
  })
  it('jogo equilibrado fica entre 40% e 60%', () => {
    expect(buckets.even.n).toBeGreaterThan(20)
    const p = buckets.even.favWins / buckets.even.n
    expect(p).toBeGreaterThan(0.4)
    expect(p).toBeLessThan(0.6)
  })
  it('probabilidade de vitória cresce monotonicamente com o gap', () => {
    const rate = (b: { favWins: number; n: number }): number => (b.n ? b.favWins / b.n : 0)
    expect(rate(buckets.slight)).toBeGreaterThanOrEqual(rate(buckets.even) - 0.03)
    expect(rate(buckets.clear)).toBeGreaterThanOrEqual(rate(buckets.slight) - 0.03)
  })
})
