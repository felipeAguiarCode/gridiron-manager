import { createRng, deriveSeed } from '../../rng'
import type { Fixture, Team } from '../../domain/types'

/**
 * Gera o calendário de temporada regular da NFL (17 jogos + 1 bye em 18 semanas),
 * de forma determinística. Fórmula rotativa simplificada mas válida:
 *  - 6 divisionais (2× cada rival)
 *  - 4 vs divisão intra-conferência pareada (todos os 4)
 *  - 4 vs divisão inter-conferência de mesmo nome (todos os 4)
 *  - 2 "same-place" vs as outras 2 divisões da conferência (mesmo lugar)
 *  - 1 "17º jogo" inter-conferência (involução E↔N, S↔W; mesmo lugar)
 * Mutuamente consistente (se A recebe B, B joga fora em A).
 */

const CONFS = ['AFC', 'NFC']
const DIVS = ['East', 'North', 'South', 'West'] // ordem fixa

const INTRA_PAIR: Record<string, string> = { East: 'West', West: 'East', North: 'South', South: 'North' }
// involução inter-conferência p/ o 17º jogo (evita o mesmo nome, já usado no pareamento inter)
const CROSS_17: Record<string, string> = { East: 'North', North: 'East', South: 'West', West: 'South' }

interface Group {
  key: string // "AFC/East"
  conf: string
  div: string
  teams: Team[] // ordenados por "place" (prestige desc)
}

function groupsOf(teams: Team[]): Map<string, Group> {
  const map = new Map<string, Group>()
  for (const conf of CONFS) {
    for (const div of DIVS) {
      const members = teams
        .filter((t) => t.conference === conf && t.division === div)
        .sort((a, b) => b.prestige - a.prestige || a.id.localeCompare(b.id))
      map.set(`${conf}/${div}`, { key: `${conf}/${div}`, conf, div, teams: members })
    }
  }
  return map
}

interface Pairing {
  home: string
  away: string
}

export function buildRegularSchedule(teams: Team[], masterSeed: number, weeks = 18): Fixture[] {
  const groups = groupsOf(teams)
  const pairings: Pairing[] = []
  const homeCount = new Map<string, number>()
  teams.forEach((t) => homeCount.set(t.id, 0))
  const inc = (id: string): void => { homeCount.set(id, (homeCount.get(id) ?? 0) + 1) }

  const addDirected = (home: string, away: string): void => { pairings.push({ home, away }); inc(home) }
  // atribui mando p/ jogo único balanceando quem tem menos jogos em casa
  const addBalanced = (a: string, b: string): void => {
    const ha = homeCount.get(a) ?? 0
    const hb = homeCount.get(b) ?? 0
    if (ha < hb || (ha === hb && a < b)) addDirected(a, b)
    else addDirected(b, a)
  }

  // 1) divisionais: dentro de cada divisão, todos os pares em ida e volta
  for (const g of groups.values()) {
    for (let i = 0; i < g.teams.length; i++) {
      for (let j = i + 1; j < g.teams.length; j++) {
        addDirected(g.teams[i].id, g.teams[j].id)
        addDirected(g.teams[j].id, g.teams[i].id)
      }
    }
  }

  // 2) pareamento de divisão (intra + inter): joga todos os 4; mando por paridade → 2 casa 2 fora
  const seenGroupPair = new Set<string>()
  const playAllFour = (gA: Group, gB: Group): void => {
    const key = [gA.key, gB.key].sort().join('|')
    if (seenGroupPair.has(key)) return
    seenGroupPair.add(key)
    gA.teams.forEach((ta, ia) => {
      gB.teams.forEach((tb, ib) => {
        if ((ia + ib) % 2 === 0) addDirected(ta.id, tb.id)
        else addDirected(tb.id, ta.id)
      })
    })
  }
  for (const conf of CONFS) {
    // intra-conferência
    for (const div of DIVS) {
      const gA = groups.get(`${conf}/${div}`)!
      const gB = groups.get(`${conf}/${INTRA_PAIR[div]}`)!
      playAllFour(gA, gB)
    }
  }
  // inter-conferência (mesmo nome de divisão)
  for (const div of DIVS) {
    playAllFour(groups.get(`AFC/${div}`)!, groups.get(`NFC/${div}`)!)
  }

  // 3) same-place intra-conferência: vs as 2 divisões restantes (mesmo lugar)
  const seenSingle = new Set<string>()
  const addSamePlace = (aId: string, bId: string): void => {
    const key = [aId, bId].sort().join('|')
    if (seenSingle.has(key)) return
    seenSingle.add(key)
    addBalanced(aId, bId)
  }
  for (const conf of CONFS) {
    for (const div of DIVS) {
      const g = groups.get(`${conf}/${div}`)!
      const remaining = DIVS.filter((d) => d !== div && d !== INTRA_PAIR[div])
      for (const rd of remaining) {
        const rg = groups.get(`${conf}/${rd}`)!
        g.teams.forEach((t, place) => {
          const opp = rg.teams[place]
          if (opp) addSamePlace(t.id, opp.id)
        })
      }
    }
  }

  // 4) 17º jogo inter-conferência (involução), mesmo lugar
  for (const div of DIVS) {
    const gA = groups.get(`AFC/${div}`)!
    const gB = groups.get(`NFC/${CROSS_17[div]}`)!
    gA.teams.forEach((t, place) => {
      const opp = gB.teams[place]
      if (opp) addSamePlace(t.id, opp.id)
    })
  }

  // atribuição de semanas (greedy balanceado + retries com seed)
  const fixtures = assignWeeks(pairings, teams, masterSeed, weeks)
  return fixtures
}

/**
 * Calendário genérico (CFL/UFL/NCAA). Quando os parâmetros permitem um número
 * par e constante de times ativos por semana (ex.: NCAA 42×12/14 = 36), usa uma
 * construção direta sem busca (byes cíclicos balanceados + emparelhamento por
 * semana) — robusta e O(n·semanas). Para os casos irregulares (CFL/UFL) cai no
 * emparelhamento guloso + coloração por busca (assignWeeks).
 */
export function buildGenericSchedule(teams: Team[], gamesPerTeam: number, weeks: number, masterSeed: number): Fixture[] {
  const constructed = buildByByeRotation(teams, gamesPerTeam, weeks, masterSeed)
  if (constructed) return constructed

  // fallback: multigrafo gamesPerTeam-regular + coloração de arestas por busca.
  // Uma emparelhagem "difícil" pode falhar no assignWeeks; reembaralhar resolve.
  let lastErr: unknown
  for (let attempt = 0; attempt < 30; attempt++) {
    const pairings = buildPairings(teams, gamesPerTeam, deriveSeed(masterSeed, 'gen-sched', attempt))
    try {
      return assignWeeks(pairings, teams, deriveSeed(masterSeed, 'assign', attempt), weeks)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error('buildGenericSchedule: sem calendário viável')
}

/**
 * Construção direta do calendário para o caso "limpo": n par e
 * (n·gamesPerTeam)/weeks inteiro e par → cada semana tem o mesmo nº (par) de
 * times ativos. Atribui a cada time seus byes por uma fórmula cíclica
 * provadamente balanceada (o bloco contíguo [t·b, t·b+b) mod weeks distribui as
 * folgas igualmente entre as semanas e dá semanas distintas por time), e então
 * emparelha os ativos de cada semana (preferindo adversários inéditos). Sem
 * backtracking. Retorna null quando o caso limpo não se aplica (ex.: CFL/UFL).
 */
function buildByByeRotation(teams: Team[], gamesPerTeam: number, weeks: number, masterSeed: number): Fixture[] | null {
  const n = teams.length
  const activePerWeek = (n * gamesPerTeam) / weeks
  const byesPerTeam = weeks - gamesPerTeam
  if (n % 2 !== 0 || byesPerTeam < 0 || !Number.isInteger(activePerWeek) || activePerWeek % 2 !== 0) return null
  if (byesPerTeam > weeks) return null

  const ids = teams.map((t) => t.id)
  const rng = createRng(deriveSeed(masterSeed, 'bye-rot'))

  // byes cíclicos: time t folga nas semanas { (t·byesPerTeam + k) mod weeks }.
  const byeWeeks: Set<number>[] = ids.map((_, t) => {
    const s = new Set<number>()
    for (let k = 0; k < byesPerTeam; k++) s.add((t * byesPerTeam + k) % weeks)
    return s
  })

  const played = new Set<string>()
  const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const homeCount = new Map<string, number>()
  ids.forEach((id) => homeCount.set(id, 0))
  const fixtures: Fixture[] = []

  for (let wk = 0; wk < weeks; wk++) {
    const active = rng.shuffle(ids.filter((_, t) => !byeWeeks[t].has(wk)))
    const used = new Array<boolean>(active.length).fill(false)
    for (let i = 0; i < active.length; i++) {
      if (used[i]) continue
      const a = active[i]
      let partner = -1
      let anyFree = -1
      for (let m = i + 1; m < active.length; m++) {
        if (used[m]) continue
        if (anyFree < 0) anyFree = m
        if (!played.has(pairKey(a, active[m]))) { partner = m; break }
      }
      if (partner < 0) partner = anyFree
      if (partner < 0) return null // não deveria ocorrer (ativos são pares)
      used[i] = true
      used[partner] = true
      const b = active[partner]
      played.add(pairKey(a, b))
      const home = homeCount.get(a)! <= homeCount.get(b)! ? a : b
      const away = home === a ? b : a
      homeCount.set(home, homeCount.get(home)! + 1)
      fixtures.push({
        id: `reg-w${wk + 1}-${home}-${away}`,
        week: wk + 1,
        round: 'regular',
        homeTeamId: home,
        awayTeamId: away,
        neutralVenue: false,
        simulationSeed: deriveSeed(masterSeed, 'game', home, away, wk + 1),
        status: 'scheduled'
      })
    }
  }
  return fixtures
}

/**
 * Emparelhagem gulosa gamesPerTeam-regular. Evita partidas repetidas enquanto
 * houver adversários inéditos — o grafo fica simples (colorível em ≤ Δ+1 semanas)
 * — e só libera repetições quando forçado (ligas com gamesPerTeam > n-1, p.ex.
 * CFL/UFL). Home/away balanceado por contagem.
 */
function buildPairings(teams: Team[], gamesPerTeam: number, seed: number): Pairing[] {
  const rng = createRng(seed)
  const ids = teams.map((t) => t.id)
  const count = new Map<string, number>()
  const homeCount = new Map<string, number>()
  ids.forEach((id) => { count.set(id, 0); homeCount.set(id, 0) })
  const paired = new Set<string>()
  const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const pairings: Pairing[] = []
  const addPair = (a: string, b: string): void => {
    const ha = homeCount.get(a)!
    const hb = homeCount.get(b)!
    const home = ha < hb || (ha === hb && a < b) ? a : b
    const away = home === a ? b : a
    pairings.push({ home, away })
    homeCount.set(home, homeCount.get(home)! + 1)
    count.set(a, count.get(a)! + 1)
    count.set(b, count.get(b)! + 1)
    paired.add(pairKey(a, b))
  }

  // passes de round-robin embaralhado até todos atingirem gamesPerTeam
  let guard = 0
  let allowDup = false
  while (guard++ < 400) {
    const need = ids.filter((id) => count.get(id)! < gamesPerTeam)
    if (need.length < 2) break
    const order = rng.shuffle(ids)
    let progressed = false
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const a = order[i]
        const b = order[j]
        if (
          count.get(a)! < gamesPerTeam && count.get(b)! < gamesPerTeam &&
          (allowDup || !paired.has(pairKey(a, b)))
        ) { addPair(a, b); progressed = true }
      }
    }
    // sem adversários inéditos possíveis → libera repetições para completar
    if (!progressed) {
      if (allowDup) break
      allowDup = true
    }
  }
  return pairings
}

/**
 * Atribui semanas aos jogos: edge-coloring em matchings quase-perfeitos (cada
 * time com bye quando gamesPerTeam < weeks). CSP com backtracking + MCF.
 */
export function assignWeeks(pairings: Pairing[], teams: Team[], masterSeed: number, weeks: number): Fixture[] {
  const capacity = Math.ceil(teams.length / 2) // 16
  const n = pairings.length
  const homes = pairings.map((p) => p.home)
  const aways = pairings.map((p) => p.away)

  for (let attempt = 0; attempt < 40; attempt++) {
    const rng = createRng(deriveSeed(masterSeed, 'schedule', attempt))
    const busy: Array<Set<string>> = Array.from({ length: weeks + 1 }, () => new Set<string>())
    const weekCount = new Array<number>(weeks + 1).fill(0)
    const week = new Array<number>(n).fill(0)
    const assigned = new Array<boolean>(n).fill(false)
    let remaining = n
    let budget = 400_000

    const feasibleOf = (idx: number): number[] => {
      const h = homes[idx]
      const a = aways[idx]
      const out: number[] = []
      for (let w = 1; w <= weeks; w++) {
        if (weekCount[w] < capacity && !busy[w].has(h) && !busy[w].has(a)) out.push(w)
      }
      return out
    }

    const dfs = (): boolean => {
      if (remaining === 0) return true
      if (budget-- <= 0) return false
      // MCF: escolhe o jogo não atribuído com menos semanas viáveis
      let pick = -1
      let pickFeasible: number[] = []
      let pickCount = Infinity
      for (let i = 0; i < n; i++) {
        if (assigned[i]) continue
        const f = feasibleOf(i)
        if (f.length < pickCount) { pickCount = f.length; pick = i; pickFeasible = f; if (pickCount <= 1) break }
      }
      if (pickCount === 0) return false
      // least-loaded primeiro, tie aleatório
      const order = rng.shuffle(pickFeasible).sort((x, y) => weekCount[x] - weekCount[y])
      const h = homes[pick]
      const a = aways[pick]
      for (const w of order) {
        busy[w].add(h); busy[w].add(a); weekCount[w]++; week[pick] = w; assigned[pick] = true; remaining--
        if (dfs()) return true
        busy[w].delete(h); busy[w].delete(a); weekCount[w]--; assigned[pick] = false; remaining++
      }
      return false
    }

    if (dfs()) {
      return pairings.map((p, i) => ({
        id: `reg-w${week[i]}-${p.home}-${p.away}`,
        week: week[i],
        round: 'regular' as const,
        homeTeamId: p.home,
        awayTeamId: p.away,
        neutralVenue: false,
        simulationSeed: deriveSeed(masterSeed, 'game', p.home, p.away, week[i]),
        status: 'scheduled' as const
      }))
    }
  }
  throw new Error('assignWeeks: não foi possível montar o calendário')
}
