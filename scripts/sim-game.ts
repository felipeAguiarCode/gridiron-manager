/**
 * CLI de inspeção: simula uma partida entre dois times do seed e imprime
 * placar por quarter, uma drive de exemplo e os líderes. Uso:
 *   tsx scripts/sim-game.ts [homeId] [awayId] [seed]
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { simulateGame } from '../src/core/engine/game/engine'
import { buildGameTeam, makeGameInput } from '../src/core/engine/game/testkit'
import { LEAGUE_CONFIG } from '../src/shared/leagues'
import type { Player, Team } from '../src/core/domain/types'

const seedDir = join(process.cwd(), 'resources', 'seed', 'nfl')
const rules = LEAGUE_CONFIG.nfl.rules
const teams: Team[] = JSON.parse(readFileSync(join(seedDir, 'teams.json'), 'utf-8')).teams
const players: Player[] = JSON.parse(readFileSync(join(seedDir, 'players.json'), 'utf-8')).players
const R = (id: string): Player[] => players.filter((p) => p.teamId === id)

const homeId = process.argv[2] || 'nfl-bal'
const awayId = process.argv[3] || 'nfl-buf'
const seed = Number(process.argv[4] || 20260703)
const home = teams.find((t) => t.id === homeId)!
const away = teams.find((t) => t.id === awayId)!

const res = simulateGame(makeGameInput(buildGameTeam(home, R(homeId), rules), buildGameTeam(away, R(awayId), rules), rules), seed)
console.log(`\nFINAL: ${home.nickname} ${res.homeScore} - ${res.awayScore} ${away.nickname}${res.overtime ? ' (OT)' : ''}`)
console.log('quarters:', JSON.stringify(res.quarters))
console.log(`yards ${home.abbr} ${res.stats.home.totalYards} / ${away.abbr} ${res.stats.away.totalYards} | 3rd ${home.abbr} ${res.stats.home.thirdDownConv}/${res.stats.home.thirdDownAtt}, TO ${home.abbr} ${res.stats.home.turnovers}/${away.abbr} ${res.stats.away.turnovers}`)

const nm = (id?: string): string => { const p = players.find((x) => x.id === id); return p ? p.lastName : String(id) }
const td = res.drives.find((d) => d.result === 'TD') || res.drives[0]
console.log('\n-- drive de exemplo (TD) --')
td.plays.forEach((p) => console.log(`  Q${p.quarter} ${p.clock}  ${p.down}&${p.distance} @${p.yardline}: ${p.text}`))

console.log('\n-- líderes --')
res.playerStats.filter((l) => l.passAtt > 3).sort((a, b) => b.passYards - a.passYards).slice(0, 2).forEach((l) => console.log(`  QB ${nm(l.playerId)}: ${l.passComp}/${l.passAtt}, ${l.passYards} yds, ${l.passTd} TD, ${l.passInt} INT`))
res.playerStats.filter((l) => l.rushAtt > 3).sort((a, b) => b.rushYards - a.rushYards).slice(0, 2).forEach((l) => console.log(`  RB ${nm(l.playerId)}: ${l.rushAtt} car, ${l.rushYards} yds, ${l.rushTd} TD`))
res.playerStats.filter((l) => l.rec > 2).sort((a, b) => b.recYards - a.recYards).slice(0, 3).forEach((l) => console.log(`  WR ${nm(l.playerId)}: ${l.rec} rec, ${l.recYards} yds, ${l.recTd} TD`))
