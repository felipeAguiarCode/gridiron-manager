/**
 * Expande rosters compactos (rows autoradas) em players.json completos por liga.
 * Lê resources/seed/<league>/teams.json + squads/*.json, valida por Zod,
 * expande cada row em atributos completos pelo arquétipo (determinístico) e
 * valida contagem/posições/números de camisa. Uso: `tsx scripts/generate-seed.ts [league]`.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { makeLeagueFileSchema, squadsFileSchema } from '../src/shared/schemas/world'
import { LEAGUE_CONFIG } from '../src/shared/leagues'
import { expandRow, type Row } from '../src/core/engine/generation/generate'
import type { League, Player, Position } from '../src/core/domain/types'
import { computeOverall } from '../src/core/domain/positions'

const GEN_SEED = 20260703

const POS_GROUP: Record<string, Position[]> = {
  OL: ['LT', 'LG', 'C', 'RG', 'RT'],
  DL: ['DE', 'DT', 'NT'],
  LB: ['OLB', 'ILB', 'MLB'],
  DB: ['CB', 'FS', 'SS']
}

const MIN = { QB: 2, WR: 5, TE: 2, RB: 2, OL: 8, DL: 6, LB: 5, DB: 8, K: 1, P: 1 }

function countPos(players: Player[], pos: Position): number {
  return players.filter((p) => p.position === pos).length
}
function countGroup(players: Player[], group: Position[]): number {
  return players.filter((p) => group.includes(p.position)).length
}

function validateTeam(teamId: string, players: Player[], errors: string[]): void {
  if (players.length !== 53) errors.push(`${teamId}: roster tem ${players.length} jogadores (esperado 53)`)
  const jerseys = new Set<number>()
  for (const p of players) {
    if (jerseys.has(p.jerseyNumber)) errors.push(`${teamId}: número de camisa duplicado ${p.jerseyNumber}`)
    jerseys.add(p.jerseyNumber)
  }
  if (countPos(players, 'QB') < MIN.QB) errors.push(`${teamId}: menos de ${MIN.QB} QB`)
  if (countPos(players, 'WR') < MIN.WR) errors.push(`${teamId}: menos de ${MIN.WR} WR`)
  if (countPos(players, 'TE') < MIN.TE) errors.push(`${teamId}: menos de ${MIN.TE} TE`)
  if (countPos(players, 'RB') < MIN.RB) errors.push(`${teamId}: menos de ${MIN.RB} RB`)
  if (countGroup(players, POS_GROUP.OL) < MIN.OL) errors.push(`${teamId}: menos de ${MIN.OL} OL`)
  if (countGroup(players, POS_GROUP.DL) < MIN.DL) errors.push(`${teamId}: menos de ${MIN.DL} DL`)
  if (countGroup(players, POS_GROUP.LB) < MIN.LB) errors.push(`${teamId}: menos de ${MIN.LB} LB`)
  if (countGroup(players, POS_GROUP.DB) < MIN.DB) errors.push(`${teamId}: menos de ${MIN.DB} DB`)
  if (countPos(players, 'K') < MIN.K) errors.push(`${teamId}: sem K`)
  if (countPos(players, 'P') < MIN.P) errors.push(`${teamId}: sem P`)
}

function generateLeague(league: League): void {
  const dir = join(process.cwd(), 'resources', 'seed', league)
  const config = LEAGUE_CONFIG[league]

  const teamsRaw = JSON.parse(readFileSync(join(dir, 'teams.json'), 'utf-8'))
  const teamsFile = makeLeagueFileSchema(config.teamCount).parse(teamsRaw)

  // merge de todos os arquivos de squads
  const squadsDir = join(dir, 'squads')
  const merged: Record<string, Row[]> = {}
  if (existsSync(squadsDir)) {
    for (const file of readdirSync(squadsDir).filter((f) => f.endsWith('.json'))) {
      const raw = JSON.parse(readFileSync(join(squadsDir, file), 'utf-8'))
      const parsed = squadsFileSchema.parse(raw)
      for (const [teamId, rows] of Object.entries(parsed)) {
        if (merged[teamId]) throw new Error(`teamId duplicado em squads: ${teamId} (arquivo ${file})`)
        merged[teamId] = rows as Row[]
      }
    }
  }

  const allPlayers: Player[] = []
  const errors: string[] = []

  for (const team of teamsFile.teams) {
    const rows = merged[team.id]
    if (!rows) {
      errors.push(`${team.id}: sem roster autorado (squads/*.json)`)
      continue
    }
    const teamPlayers: Player[] = []
    rows.forEach((row, i) => {
      const player = expandRow(GEN_SEED, team.id, row, i)
      // sanidade: overall autorado vs derivado
      const derived = computeOverall(player)
      if (Math.abs(derived - row[5]) > 3) {
        errors.push(`${team.id}: overall derivado ${derived} difere do autorado ${row[5]} (${row[0]} ${row[1]})`)
      }
      teamPlayers.push(player)
    })
    validateTeam(team.id, teamPlayers, errors)
    allPlayers.push(...teamPlayers)
  }

  if (errors.length) {
    console.error(`\n❌ ${league.toUpperCase()}: ${errors.length} problema(s) de validação:\n`)
    for (const e of errors) console.error('  - ' + e)
    process.exitCode = 1
    return
  }

  const outPath = join(dir, 'players.json')
  writeFileSync(outPath, JSON.stringify({ generatorSeed: GEN_SEED, players: allPlayers }, null, 0))
  console.log(`✅ ${league.toUpperCase()}: ${allPlayers.length} jogadores gerados de ${teamsFile.teams.length} times → ${outPath}`)
}

const target: string = process.argv[2] || 'nfl'
const leagues: League[] = target === 'all' ? ['nfl', 'cfl', 'ufl', 'ncaa'] : [target as League]
for (const lg of leagues) {
  const teamsPath = join(process.cwd(), 'resources', 'seed', lg, 'teams.json')
  if (!existsSync(teamsPath)) {
    console.log(`⏭️  ${lg.toUpperCase()}: sem teams.json, pulando`)
    continue
  }
  generateLeague(lg)
}
