import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { computeOverall } from '../../domain/positions'
import { unitOf } from '../../domain/types'
import type { Player } from '../../domain/types'
import { makeLeagueFileSchema, playersFileSchema } from '../../../shared/schemas/world'

const seedDir = join(process.cwd(), 'resources', 'seed', 'nfl')
const playersPath = join(seedDir, 'players.json')
const hasSeed = existsSync(playersPath)

// só roda quando o seed foi gerado (npm run seed:generate)
const maybe = hasSeed ? describe : describe.skip

maybe('NFL world (seed gerado)', () => {
  let players: Player[] = []
  let teams: ReturnType<typeof makeLeagueFileSchema>['_output']['teams'] = []

  beforeAll(() => {
    const teamsRaw = JSON.parse(readFileSync(join(seedDir, 'teams.json'), 'utf-8'))
    teams = makeLeagueFileSchema(32).parse(teamsRaw).teams
    const playersRaw = JSON.parse(readFileSync(playersPath, 'utf-8'))
    players = playersFileSchema.parse(playersRaw).players
  })

  it('32 franquias e 53 jogadores por franquia (1696 no total)', () => {
    expect(teams.length).toBe(32)
    expect(players.length).toBe(32 * 53)
    for (const team of teams) {
      const roster = players.filter((p) => p.teamId === team.id)
      expect(roster.length, team.id).toBe(53)
    }
  })

  it('números de camisa únicos por time', () => {
    for (const team of teams) {
      const roster = players.filter((p) => p.teamId === team.id)
      const jerseys = new Set(roster.map((p) => p.jerseyNumber))
      expect(jerseys.size, team.id).toBe(53)
    }
  })

  it('overall armazenado é consistente com os atributos (derivado)', () => {
    for (const p of players) {
      expect(Math.abs(p.overall - computeOverall(p)), p.id).toBeLessThanOrEqual(2)
    }
  })

  it('guardas de roster: ≥1 QB e cada unidade fecha 11 titulares', () => {
    for (const team of teams) {
      const roster = players.filter((p) => p.teamId === team.id)
      const off = roster.filter((p) => unitOf(p.position) === 'offense').length
      const def = roster.filter((p) => unitOf(p.position) === 'defense').length
      expect(roster.some((p) => p.position === 'QB'), team.id).toBe(true)
      expect(off, `${team.id} offense`).toBeGreaterThanOrEqual(11)
      expect(def, `${team.id} defense`).toBeGreaterThanOrEqual(11)
    }
  })

  it('distribuição de overall realista (estrelas e reservas)', () => {
    const overalls = players.map((p) => p.overall)
    const max = Math.max(...overalls)
    const avg = overalls.reduce((a, b) => a + b, 0) / overalls.length
    expect(max).toBeGreaterThanOrEqual(90) // há superstars
    expect(avg).toBeGreaterThan(60)
    expect(avg).toBeLessThan(80)
  })
})
