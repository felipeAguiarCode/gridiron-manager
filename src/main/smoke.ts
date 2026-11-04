import * as game from './services/game-service'
import type { League } from '@core/domain/types'

/**
 * Smoke headless (electron --smoke [--league=cfl]): cria save → avança a
 * temporada inteira → valida campeão/integridade. Roda no main sem UI.
 */
export async function runSmoke(): Promise<void> {
  const leagueArg = process.argv.find((a) => a.startsWith('--league='))
  const league = (leagueArg ? leagueArg.split('=')[1] : 'nfl') as League
  const teamId = game.worldTeams({ league })[0].id
  console.log(`[smoke] criando save ${league.toUpperCase()} (${teamId})...`)
  const meta = game.createSave({
    saveName: `Smoke ${league}`,
    league,
    teamId,
    coachName: 'Coach Smoke',
    seed: 20260703
  })
  console.log(`[smoke] save criado: ${meta.slug} · ${meta.teamName}`)

  let snap = game.snapshot()
  console.log(`[smoke] semana ${snap.save.week}/${snap.save.maxWeek}, fase ${snap.save.phase}`)

  // ---- mercado (M7)
  const m0 = game.marketGet()
  console.log(`[smoke] FAs: ${m0.freeAgents.length}, roster ${m0.rosterSize}, cap ${(m0.capSpace / 1e6).toFixed(0)}M`)
  const full = game.marketSignFree({ playerId: m0.freeAgents[0].id })
  if (full.ok) throw new Error('assinou com roster cheio (deveria falhar)')
  console.log(`[smoke] assinar com roster cheio bloqueado: "${full.message}"`)
  // libera o contrato mais caro para abrir muito espaço de cap, depois assina o FA mais barato
  const expensive = [...m0.roster].sort((a, b) => b.capHit - a.capHit)[0]
  const rel = game.marketRelease({ playerId: expensive.id })
  if (!rel.ok) throw new Error('release falhou: ' + rel.message)
  const cheapest = [...game.marketGet().freeAgents].sort((a, b) => a.capHit - b.capHit)[0]
  const sign = game.marketSignFree({ playerId: cheapest.id })
  if (!sign.ok) throw new Error('sign após liberar falhou: ' + sign.message)
  console.log(`[smoke] release+sign OK (roster ${sign.market.rosterSize})`)
  // trade lowball (recusa) vs pacote maior
  const mkt = game.marketGet()
  const other = mkt.teams.find((t) => t.id !== teamId)!
  const otherRoster = game.rosterGet({ teamId: other.id }).players
  const myWorst = [...mkt.roster].sort((a, b) => a.overall - b.overall).slice(0, 1).map((p) => p.id)
  const theirBest = [...otherRoster].sort((a, b) => b.overall - a.overall).slice(0, 1).map((p) => p.id)
  const lowball = game.marketProposeTrade({ giveIds: myWorst, getTeamId: other.id, getIds: theirBest })
  console.log(`[smoke] trade lowball aceita=${lowball.accepted}: "${lowball.message}"`)
  if (lowball.accepted) throw new Error('IA aceitou uma trade lowball (deveria recusar)')

  let guard = 0
  let lastMsg = ''
  let eventsResolved = 0
  while (guard++ < 60) {
    if (game.snapshot().pendingEvent) {
      const ev = game.eventsGet()
      if (!ev.pending || ev.pending.length !== 3) throw new Error('acontecimento pendente inválido')
      game.eventsChoose({ index: 0 })
      eventsResolved++
      continue
    }
    const res = game.advanceWeek()
    if (res.userFixture) {
      const f = res.userFixture
      lastMsg = `S${f.week} ${f.homeAbbr} ${f.homeScore}-${f.awayScore} ${f.awayAbbr}`
    }
    if (res.phase !== 'regular') console.log(`[smoke] fase: ${res.phase} ${res.message}`)
    if (res.seasonComplete || res.phase === 'finished') break
  }
  console.log(`[smoke] acontecimentos surpresa resolvidos: ${eventsResolved}`)

  snap = game.snapshot()
  const champId = snap.championTeamId
  if (!champId) throw new Error('temporada terminou sem campeão')

  // valida standings
  const totalGames = snap.standings.reduce((s, st) => s + st.wins + st.losses + st.ties, 0)
  console.log(`[smoke] último jogo do usuário: ${lastMsg}`)
  console.log(`[smoke] standings: ${snap.standings.length} times, ${totalGames} team-games`)
  console.log(`[smoke] 🏆 campeão: ${snap.standings.find((s) => s.teamId === champId)?.name ?? champId}`)

  // roster
  const roster = game.rosterGet({})
  console.log(`[smoke] roster ${roster.team.abbr}: ${roster.players.length} jogadores, top OVR ${roster.players[0]?.overall}`)
  if (roster.players.length !== 53) throw new Error(`roster tem ${roster.players.length}, esperado 53`)

  // ---- offseason + 2ª temporada (M8)
  const beforeAvg = game.rosterGet({}).players.reduce((s, p) => s + p.overall, 0) / 53
  const s2 = game.startNewSeason()
  if (s2.save.seasonNumber !== 2) throw new Error('seasonNumber não avançou para 2')
  if (s2.save.phase !== 'regular' || s2.save.week !== 1) throw new Error('nova temporada não reiniciou em regular/sem 1')
  if (s2.championTeamId !== null) throw new Error('campeão não foi limpo na nova temporada')
  const r2 = game.rosterGet({})
  if (r2.players.length !== 53) throw new Error(`roster pós-offseason tem ${r2.players.length}`)
  const afterAvg = r2.players.reduce((s, p) => s + p.overall, 0) / 53
  const rookies = r2.players.filter((p) => p.yearsPro === 0).length
  console.log(`[smoke] offseason OK: temporada ${s2.save.seasonNumber}, roster ${r2.players.length}, OVR ${beforeAvg.toFixed(1)}→${afterAvg.toFixed(1)}, ${rookies} calouros`)
  // joga algumas semanas da 2ª temporada (resolvendo eventos)
  for (let i = 0; i < 5; i++) {
    if (game.snapshot().pendingEvent) { game.eventsChoose({ index: 0 }); i--; continue }
    game.advanceWeek()
  }
  const s2snap = game.snapshot()
  console.log(`[smoke] 2ª temporada em andamento: sem ${s2snap.save.week}, ${s2snap.team.wins}-${s2snap.team.losses}`)

  // reabre o save (persistência)
  const slug = snap.save.slug
  game.closeSave()
  const reopened = game.loadSave({ slug })
  if (reopened.save.seasonNumber !== 2) throw new Error('temporada 2 não persistiu após reabrir')
  console.log('[smoke] reabertura OK, temporada 2 persistida')

  game.deleteSave({ slug })
  console.log('[smoke] ✅ OK')
}
