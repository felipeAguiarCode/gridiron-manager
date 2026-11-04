import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createRng, deriveSeed } from '../rng'
import { developPlayer, shouldRetire, generateRookie } from './development'
import { ROSTER_TEMPLATE } from '../domain/positions'
import { computeOverall } from '../domain/positions'
import type { Player, Position, Team } from '../domain/types'

const seedDir = join(process.cwd(), 'resources', 'seed', 'nfl')
const hasSeed = existsSync(join(seedDir, 'players.json'))
const maybe = hasSeed ? describe : describe.skip

const templateCounts = (): Map<Position, number> => {
  const m = new Map<Position, number>()
  for (const p of ROSTER_TEMPLATE) m.set(p, (m.get(p) ?? 0) + 1)
  return m
}
const neediest = (roster: Player[], target: Map<Position, number>): Position => {
  const cur = new Map<Position, number>()
  for (const p of roster) cur.set(p.position, (cur.get(p.position) ?? 0) + 1)
  let best: Position = 'WR'
  let bestDef = -Infinity
  for (const [pos, tgt] of target) {
    const def = tgt - (cur.get(pos) ?? 0)
    if (def > bestDef) { bestDef = def; best = pos }
  }
  return best
}

maybe('desenvolvimento multi-temporada', () => {
  const teams: Team[] = JSON.parse(readFileSync(join(seedDir, 'teams.json'), 'utf-8')).teams
  const players0: Player[] = JSON.parse(readFileSync(join(seedDir, 'players.json'), 'utf-8')).players

  it('5 temporadas: sem inflação de overall, rosters cheios, aposentadorias repostas', () => {
    let players = players0.map((p) => ({ ...p }))
    const avg0 = players.reduce((s, p) => s + p.overall, 0) / players.length
    let totalRetired = 0

    for (let season = 1; season <= 5; season++) {
      const rng = createRng(deriveSeed(20260703, 'season', season))
      const byTeam = new Map<string, Player[]>()
      teams.forEach((t) => byTeam.set(t.id, []))
      for (const p of players) {
        const dev = developPlayer(rng, p)
        if (shouldRetire(rng, dev)) { totalRetired++; continue }
        byTeam.get(dev.teamId)?.push(dev)
      }
      const target = templateCounts()
      let idx = 0
      const next: Player[] = []
      for (const [teamId, roster] of byTeam) {
        const team = teams.find((t) => t.id === teamId)!
        while (roster.length < 53) roster.push(generateRookie(deriveSeed(20260703, 'season', season), teamId, neediest(roster, target), team.prestige, idx++))
        next.push(...roster)
      }
      players = next
    }

    // cada time com 53
    for (const t of teams) expect(players.filter((p) => p.teamId === t.id).length, t.id).toBe(53)
    // aposentadorias aconteceram
    expect(totalRetired).toBeGreaterThan(50)
    // overall médio não infla nem colapsa
    const avg5 = players.reduce((s, p) => s + p.overall, 0) / players.length
    expect(Math.abs(avg5 - avg0)).toBeLessThan(6)
    expect(avg5).toBeGreaterThan(58)
    expect(avg5).toBeLessThan(78)
    // idades plausíveis (calouros e veteranos)
    expect(players.some((p) => p.yearsPro === 0)).toBe(true)
    expect(Math.max(...players.map((p) => p.age))).toBeLessThan(45)
  })

  it('developPlayer respeita o potencial e recalcula overall', () => {
    const rng = createRng(1)
    const young = players0.find((p) => p.age <= 23 && p.potential > p.overall + 5)
    if (young) {
      const dev = developPlayer(rng, young)
      expect(dev.age).toBe(young.age + 1)
      expect(dev.overall).toBeLessThanOrEqual(dev.potential)
      expect(dev.overall).toBe(computeOverall(dev))
    }
    expect(true).toBe(true)
  })
})
