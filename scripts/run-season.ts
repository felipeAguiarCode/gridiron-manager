/**
 * Roda uma temporada completa da NFL headless via simulateSeason (engine real)
 * e imprime standings + playoffs + campeão. Uso: tsx scripts/run-season.ts [seed]
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { simulateGame } from '../src/core/engine/game/engine'
import { buildGameTeam } from '../src/core/engine/game/testkit'
import { simulateSeason } from '../src/core/engine/season/runSeason'
import type { ResultLike } from '../src/core/engine/season/standings'
import { LEAGUE_CONFIG } from '../src/shared/leagues'
import type { Fixture, GameTeam, Player, Team } from '../src/core/domain/types'

const seedDir = join(process.cwd(), 'resources', 'seed', 'nfl')
const masterSeed = Number(process.argv[2] || 20260703)
const rules = LEAGUE_CONFIG.nfl.rules
const teams: Team[] = JSON.parse(readFileSync(join(seedDir, 'teams.json'), 'utf-8')).teams
const players: Player[] = JSON.parse(readFileSync(join(seedDir, 'players.json'), 'utf-8')).players
const teamById = new Map(teams.map((t) => [t.id, t]))
const abbr = (id: string): string => teamById.get(id)!.abbr

const gt = new Map<string, GameTeam>()
for (const t of teams) gt.set(t.id, buildGameTeam(t, players.filter((p) => p.teamId === t.id), rules))
const play = (f: Fixture, importance: 'regular' | 'playoff' | 'championship', neutral: boolean): ResultLike => {
  const res = simulateGame({ home: gt.get(f.homeTeamId)!, away: gt.get(f.awayTeamId)!, rules, importance, neutralVenue: neutral }, f.simulationSeed)
  return { homeScore: res.homeScore, awayScore: res.awayScore, winnerTeamId: res.winnerTeamId }
}

const t0 = Date.now()
const out = simulateSeason(teams, masterSeed, play)
const stById = new Map(out.standings.map((s) => [s.teamId, s]))

console.log(`Temporada regular: ${out.schedule.length} jogos`)
console.log('\n=== STANDINGS ===')
for (const conf of LEAGUE_CONFIG.nfl.conferences) {
  console.log(`\n${conf}`)
  for (const div of LEAGUE_CONFIG.nfl.divisionsPerConference) {
    console.log(`  ${div}`)
    teams.filter((t) => t.conference === conf && t.division === div).map((t) => stById.get(t.id)!).sort((a, b) => a.position - b.position)
      .forEach((s) => {
        const tag = s.zone === 'division_leader' ? '🏆' : s.zone === 'wildcard' ? '✚' : s.zone === 'bubble' ? '·' : ' '
        console.log(`   ${tag} ${abbr(s.teamId).padEnd(3)} ${s.wins}-${s.losses}-${s.ties}  (${s.pointDiff >= 0 ? '+' : ''}${s.pointDiff})`)
      })
  }
}

console.log('\n=== PLAYOFFS ===')
for (const g of out.playoffGames) {
  const label = g.round === 'championship' ? 'SUPER BOWL' : `${g.conference} ${g.round}`
  console.log(`  ${label}: ${abbr(g.fixture.homeTeamId)} ${g.result.homeScore}-${g.result.awayScore} ${abbr(g.fixture.awayTeamId)} → ${abbr(g.result.winnerTeamId!)}`)
}
const champ = teamById.get(out.championId!)!
console.log(`\n🏆 CAMPEÃO: ${champ.name} ${champ.nickname}  (${Date.now() - t0}ms)`)
