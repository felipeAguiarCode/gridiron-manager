import type { Fixture, Standing, Team } from '../../domain/types'

export interface ResultLike {
  homeScore: number
  awayScore: number
  winnerTeamId: string | null
}

interface Raw {
  team: Team
  wins: number
  losses: number
  ties: number
  pf: number
  pa: number
  divWins: number
  divLosses: number
  confWins: number
  confLosses: number
  results: { week: number; wl: 'W' | 'L' | 'T'; oppId: string }[]
}

/** Registro head-to-head: h2h[a][b] = vitórias de a sobre b. */
type H2H = Map<string, Map<string, number>>

function empty(team: Team): Raw {
  return { team, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, divWins: 0, divLosses: 0, confWins: 0, confLosses: 0, results: [] }
}

export function computeStandings(
  teams: Team[],
  fixtures: Fixture[],
  results: Map<string, ResultLike>
): Standing[] {
  const raw = new Map<string, Raw>()
  teams.forEach((t) => raw.set(t.id, empty(t)))
  const h2h: H2H = new Map(teams.map((t) => [t.id, new Map()]))

  const played = fixtures
    .filter((f) => f.round === 'regular' && results.has(f.id))
    .sort((a, b) => a.week - b.week)

  for (const f of played) {
    const r = results.get(f.id)!
    const home = raw.get(f.homeTeamId)
    const away = raw.get(f.awayTeamId)
    if (!home || !away) continue
    home.pf += r.homeScore; home.pa += r.awayScore
    away.pf += r.awayScore; away.pa += r.homeScore
    const sameDiv = home.team.conference === away.team.conference && home.team.division === away.team.division
    const sameConf = home.team.conference === away.team.conference

    if (r.winnerTeamId === null) {
      home.ties++; away.ties++
      home.results.push({ week: f.week, wl: 'T', oppId: away.team.id })
      away.results.push({ week: f.week, wl: 'T', oppId: home.team.id })
    } else {
      const winner = r.winnerTeamId === home.team.id ? home : away
      const loser = winner === home ? away : home
      winner.wins++; loser.losses++
      winner.results.push({ week: f.week, wl: 'W', oppId: loser.team.id })
      loser.results.push({ week: f.week, wl: 'L', oppId: winner.team.id })
      if (sameDiv) { winner.divWins++; loser.divLosses++ }
      if (sameConf) { winner.confWins++; loser.confLosses++ }
      h2h.get(winner.team.id)!.set(loser.team.id, (h2h.get(winner.team.id)!.get(loser.team.id) ?? 0) + 1)
    }
  }

  const pct = (r: Raw): number => {
    const g = r.wins + r.losses + r.ties
    return g === 0 ? 0 : (r.wins + r.ties * 0.5) / g
  }
  const divPct = (r: Raw): number => {
    const g = r.divWins + r.divLosses
    return g === 0 ? 0 : r.divWins / g
  }
  const confPct = (r: Raw): number => {
    const g = r.confWins + r.confLosses
    return g === 0 ? 0 : r.confWins / g
  }

  // comparador com desempates NFL (simplificado): pct → h2h (2 times) → div → conf → diff → pf → prestige
  const compare = (a: Raw, b: Raw): number => {
    if (pct(b) !== pct(a)) return pct(b) - pct(a)
    const ah2h = h2h.get(a.team.id)!.get(b.team.id) ?? 0
    const bh2h = h2h.get(b.team.id)!.get(a.team.id) ?? 0
    if (ah2h !== bh2h) return bh2h - ah2h
    if (divPct(b) !== divPct(a)) return divPct(b) - divPct(a)
    if (confPct(b) !== confPct(a)) return confPct(b) - confPct(a)
    const aDiff = a.pf - a.pa
    const bDiff = b.pf - b.pa
    if (bDiff !== aDiff) return bDiff - aDiff
    if (b.pf !== a.pf) return b.pf - a.pf
    if (b.team.prestige !== a.team.prestige) return b.team.prestige - a.team.prestige
    return a.team.id.localeCompare(b.team.id)
  }

  const toStanding = (r: Raw): Standing => {
    const last5 = r.results.slice(-5).map((x) => x.wl)
    let streak = 0
    for (let i = r.results.length - 1; i >= 0; i--) {
      const wl = r.results[i].wl
      if (i === r.results.length - 1) streak = wl === 'W' ? 1 : wl === 'L' ? -1 : 0
      else if (wl === 'W' && streak > 0) streak++
      else if (wl === 'L' && streak < 0) streak--
      else break
    }
    return {
      teamId: r.team.id,
      played: r.wins + r.losses + r.ties,
      wins: r.wins, losses: r.losses, ties: r.ties,
      pointsFor: r.pf, pointsAgainst: r.pa, pointDiff: r.pf - r.pa,
      divWins: r.divWins, divLosses: r.divLosses, confWins: r.confWins, confLosses: r.confLosses,
      streak, last5, pct: pct(r), position: 0, zone: 'eliminated'
    }
  }

  const standings = teams.map((t) => toStanding(raw.get(t.id)!))
  const standingById = new Map(standings.map((s) => [s.teamId, s]))
  const rawById = raw

  // posição dentro da divisão
  for (const conf of new Set(teams.map((t) => t.conference))) {
    for (const div of new Set(teams.filter((t) => t.conference === conf).map((t) => t.division))) {
      const members = teams.filter((t) => t.conference === conf && t.division === div)
      const sorted = members.map((t) => rawById.get(t.id)!).sort(compare)
      sorted.forEach((r, i) => { standingById.get(r.team.id)!.position = i + 1 })
    }
  }

  // zonas de playoff por conferência (4 líderes de divisão + 3 wild cards)
  for (const conf of new Set(teams.map((t) => t.conference))) {
    const confTeams = teams.filter((t) => t.conference === conf)
    const leaders: string[] = []
    for (const div of new Set(confTeams.map((t) => t.division))) {
      const members = confTeams.filter((t) => t.division === div).map((t) => rawById.get(t.id)!).sort(compare)
      if (members[0]) leaders.push(members[0].team.id)
    }
    const rest = confTeams.filter((t) => !leaders.includes(t.id)).map((t) => rawById.get(t.id)!).sort(compare)
    const wildcards = rest.slice(0, 3).map((r) => r.team.id)
    const bubble = rest.slice(3, 5).map((r) => r.team.id)
    for (const t of confTeams) {
      const s = standingById.get(t.id)!
      s.zone = leaders.includes(t.id) ? 'division_leader' : wildcards.includes(t.id) ? 'wildcard' : bubble.includes(t.id) ? 'bubble' : 'eliminated'
    }
  }

  return standings
}

/** Comparador exposto para seeding de playoffs. */
export function rankConference(
  teams: Team[],
  standings: Standing[],
  conf: string
): Standing[] {
  const byId = new Map(standings.map((s) => [s.teamId, s]))
  const teamById = new Map(teams.map((t) => [t.id, t]))
  const confStandings = standings.filter((s) => teamById.get(s.teamId)?.conference === conf)

  const divisions = new Set(teams.filter((t) => t.conference === conf).map((t) => t.division))
  const leaders: Standing[] = []
  for (const div of divisions) {
    const members = confStandings
      .filter((s) => teamById.get(s.teamId)?.division === div)
      .sort((a, b) => seedCompare(a, b, byId))
    if (members[0]) leaders.push(members[0])
  }
  leaders.sort((a, b) => seedCompare(a, b, byId))
  const nonLeaders = confStandings.filter((s) => !leaders.includes(s)).sort((a, b) => seedCompare(a, b, byId))
  return [...leaders, ...nonLeaders]
}

function seedCompare(a: Standing, b: Standing, _byId: Map<string, Standing>): number {
  if (b.pct !== a.pct) return b.pct - a.pct
  if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff
  if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor
  return a.teamId.localeCompare(b.teamId)
}
