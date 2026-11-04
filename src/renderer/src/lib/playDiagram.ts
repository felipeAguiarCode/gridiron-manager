/**
 * Sintetiza uma "prancheta" (estilo Madden) a partir de uma `PlaybookPlay`.
 *
 * As jogadas NÃO guardam geometria (só formação/personnel/tags/targetDepth), então
 * aqui derivamos alinhamento + rotas de forma estilizada e reconhecível. Puro/testável,
 * sem React. Sistema de coordenadas: x 0..100 (esquerda→direita), y 0..62 (topo=downfield).
 * LOS em y=42; ataque para cima (y menor = mais fundo). Backfield em y>42.
 */
import type { PlaybookPlay, PersonnelGroup, FormationId } from '@core/domain/playbook'

export type RouteColor = 'downfield' | 'primary' | 'block'
export type MarkerKind = 'ol' | 'skill' | 'qb' | 'back' | 'def' | 'st'

export interface Pt { x: number; y: number }
export interface Marker { id: string; kind: MarkerKind; x: number; y: number; badge?: string }
export interface RouteLine { points: Pt[]; color: RouteColor; arrow: boolean; dashed?: boolean }
export interface Zone { x: number; y: number; r: number }
export interface PlayGraphic {
  flag: 'RUN' | 'PASS' | 'DEF' | 'ST'
  markers: Marker[]
  routes: RouteLine[]
  zones?: Zone[]
}

// ------------------------------------------------------------------ constantes de campo
const LOS = 42
const DEEP = 8
const MED = 22
const SHORT = 33
const SIDE_L = 8
const SIDE_R = 92
const CENTER = 50

const P = (x: number, y: number): Pt => ({ x, y })
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
/** desloca `from` em direção a `target` no máximo `amt` (sem ultrapassar). */
const nudge = (from: number, target: number, amt: number): number =>
  from + Math.sign(target - from) * Math.min(amt, Math.abs(target - from))
const rl = (color: RouteColor, arrow: boolean, points: Pt[], dashed = false): RouteLine => ({ points, color, arrow, dashed })

// ------------------------------------------------------------------ personnel → contagem
interface Skill { wr: number; te: number; rb: number }
function decodePersonnel(p: PersonnelGroup): Skill {
  if (/^\d\d$/.test(p)) {
    const rb = Number(p[0])
    const te = Number(p[1])
    return { rb, te, wr: clamp(5 - rb - te, 0, 5) }
  }
  if (p === 'jumbo' || p === 'goal_line') return { rb: 1, te: 2, wr: 1 } // pesado
  return { rb: 1, te: 1, wr: 3 } // default 11
}

// ------------------------------------------------------------------ alinhamento ofensivo
interface AlignedOffense {
  ol: Marker[]
  qb: Marker
  backs: Marker[]
  receivers: Marker[] // com badge X/B/A/H/Y...
}

const OL_X = [34, 42, 50, 58, 66]
const WR_SPOTS = [
  { x: 9, badge: 'X' }, // fora esquerda
  { x: 91, badge: 'B' }, // fora direita
  { x: 76, badge: 'A' }, // slot direita
  { x: 24, badge: 'H' } // slot esquerda
]
const TE_SPOTS = [
  { x: 69, badge: 'Y' }, // preso à direita
  { x: 31, badge: 'Y2' }, // preso à esquerda
  { x: 74, badge: 'Y3' } // wing direita
]

function alignOffense(play: PlaybookPlay): AlignedOffense {
  const f = play.formation
  const { wr, te, rb } = decodePersonnel(play.personnel)
  const empty = f === 'empty'
  const shotgun = f === 'shotgun'
  const pistol = f === 'pistol'
  const gun = shotgun || pistol || empty

  const ol: Marker[] = OL_X.map((x, i) => ({ id: `ol${i}`, kind: 'ol', x, y: LOS }))

  const qbY = gun ? (pistol ? 50 : 52) : LOS + 5
  const qb: Marker = { id: 'qb', kind: 'qb', x: CENTER, y: qbY, badge: 'QB' }

  // backs
  const backs: Marker[] = []
  const backsInField = empty ? 0 : rb
  if (backsInField >= 1) {
    if (f === 'i_form') {
      if (backsInField >= 2) { backs.push({ id: 'fb', kind: 'back', x: CENTER, y: 50, badge: 'FB' }); backs.push({ id: 'rb', kind: 'back', x: CENTER, y: 56, badge: 'RB' }) }
      else backs.push({ id: 'rb', kind: 'back', x: CENTER, y: 55, badge: 'RB' })
    } else if (pistol) {
      backs.push({ id: 'rb', kind: 'back', x: CENTER, y: 57, badge: 'RB' })
      if (backsInField >= 2) backs.push({ id: 'fb', kind: 'back', x: 60, y: 53, badge: 'FB' })
    } else if (shotgun) {
      backs.push({ id: 'rb', kind: 'back', x: 41, y: 54, badge: 'RB' })
      if (backsInField >= 2) backs.push({ id: 'fb', kind: 'back', x: 59, y: 54, badge: 'FB' })
    } else { // singleback / jumbo / under center
      backs.push({ id: 'rb', kind: 'back', x: 44, y: 54, badge: 'RB' })
      if (backsInField >= 2) backs.push({ id: 'fb', kind: 'back', x: 58, y: 52, badge: 'FB' })
    }
  }

  // receivers: TEs presos primeiro, depois WRs nos spots largos; RB "empty" vira slot
  const receivers: Marker[] = []
  for (let i = 0; i < te; i++) {
    const s = TE_SPOTS[Math.min(i, TE_SPOTS.length - 1)]
    receivers.push({ id: `te${i}`, kind: 'skill', x: s.x, y: LOS, badge: s.badge })
  }
  const wrTotal = wr + (empty ? rb : 0)
  for (let i = 0; i < wrTotal; i++) {
    const s = WR_SPOTS[Math.min(i, WR_SPOTS.length - 1)]
    // se dois receptores caírem no mesmo spot, empilha levemente pra dentro
    const bump = i >= WR_SPOTS.length ? (i - WR_SPOTS.length + 1) * 8 * (s.x < CENTER ? 1 : -1) : 0
    receivers.push({ id: `wr${i}`, kind: 'skill', x: clamp(s.x + bump, SIDE_L, SIDE_R), y: LOS - 0.5, badge: s.badge })
  }

  return { ol, qb, backs, receivers }
}

// ------------------------------------------------------------------ formas de rota
const isLeft = (s: Pt): boolean => s.x < CENTER
const go = (s: Pt): RouteLine => rl('downfield', true, [s, P(s.x, DEEP)])
const seam = (s: Pt): RouteLine => rl('downfield', true, [s, P(nudge(s.x, CENTER, 4), DEEP)])
const post = (s: Pt): RouteLine => rl('downfield', true, [s, P(s.x, MED), P(nudge(s.x, CENTER, 20), DEEP - 1)])
const corner = (s: Pt): RouteLine => rl('downfield', true, [s, P(s.x, MED), P(isLeft(s) ? SIDE_L : SIDE_R, DEEP + 4)])
const wheel = (s: Pt): RouteLine => rl('downfield', true, [s, P(isLeft(s) ? SIDE_L + 2 : SIDE_R - 2, SHORT), P(isLeft(s) ? SIDE_L + 2 : SIDE_R - 2, DEEP + 2)])
const digDeep = (s: Pt): RouteLine => rl('downfield', true, [s, P(s.x, MED + 2), P(nudge(s.x, CENTER, 22), MED + 2)])
const crossDeep = (s: Pt): RouteLine => rl('downfield', true, [s, P(nudge(s.x, CENTER, 6), MED + 4), P(isLeft(s) ? 70 : 30, MED)])
const slant = (s: Pt): RouteLine => rl('primary', true, [s, P(nudge(s.x, CENTER, 13), SHORT - 3)])
const hitch = (s: Pt): RouteLine => rl('primary', true, [s, P(s.x, SHORT), P(nudge(s.x, CENTER, 2), SHORT + 3)])
const curl = (s: Pt): RouteLine => rl('primary', true, [s, P(s.x, MED + 6), P(nudge(s.x, CENTER, 4), MED + 9)])
const out = (s: Pt): RouteLine => rl('primary', true, [s, P(s.x, MED + 5), P(isLeft(s) ? SIDE_L : SIDE_R, MED + 5)])
const comeback = (s: Pt): RouteLine => rl('primary', true, [s, P(s.x, MED), P(isLeft(s) ? s.x - 4 : s.x + 4, MED + 5)])
const flat = (s: Pt): RouteLine => rl('primary', true, [s, P(isLeft(s) ? SIDE_L + 4 : SIDE_R - 4, SHORT + 5)])
const drag = (s: Pt): RouteLine => rl('primary', true, [s, P(isLeft(s) ? 72 : 28, SHORT + 1)])
const stalk = (s: Pt): RouteLine => rl('block', false, [s, P(s.x, s.y - 7)])

// ------------------------------------------------------------------ rotas ofensivas (passe)
function passRoutes(play: PlaybookPlay, a: AlignedOffense): RouteLine[] {
  const recv = a.receivers.map((m) => P(m.x, m.y))
  const routes: RouteLine[] = []
  const has = (t: string): boolean => (play.tags as string[]).includes(t)
  const depth = play.targetDepth ?? 'medium'
  // ordena por proximidade do centro (para conceitos por "interno/externo")
  const byInner = [...recv].sort((p, q) => Math.abs(p.x - CENTER) - Math.abs(q.x - CENTER))
  const outermost = [...recv].sort((p, q) => Math.abs(q.x - CENTER) - Math.abs(p.x - CENTER))

  const addRB = (): void => { if (a.backs[0]) routes.push(flat(P(a.backs[0].x, a.backs[0].y))) }

  if (has('screen')) {
    // tela: alvo recebe atrás do LOS e sobe; OL solta; demais limpam a área
    const bubble = play.id.includes('bubble')
    // bubble parte do slot (interno) e abre pra fora; RB screen parte do backfield
    const target = bubble ? (byInner[0] ?? P(a.qb.x, a.qb.y)) : P(a.backs[0]?.x ?? 41, a.backs[0]?.y ?? 54)
    const dir = target.x < CENTER ? -1 : 1
    routes.push(rl('primary', true, [target, P(clamp(target.x + dir * 6, SIDE_L, SIDE_R), LOS + 3), P(clamp(target.x + dir * 12, SIDE_L, SIDE_R), MED + 9)]))
    a.ol.slice(0, 3).forEach((o, i) => routes.push(rl('block', true, [P(o.x, o.y), P(clamp(o.x + dir * (8 + i * 4), SIDE_L, SIDE_R), LOS + 2)])))
    recv.filter((r) => r !== target).forEach((r) => routes.push(go(r)))
    return routes
  }

  if (has('bootleg') || play.id.includes('flood')) {
    // bootleg/flood: QB rola pra um lado, inunda 3 níveis
    const dir = 1 // rola pra direita
    routes.push(rl('block', true, [P(a.qb.x, a.qb.y), P(70, LOS + 2)]))
    const sideRecv = recv.filter((r) => (dir > 0 ? r.x >= CENTER : r.x < CENTER)).sort((p, q) => p.y - q.y)
    const back = recv.filter((r) => !sideRecv.includes(r))
    if (sideRecv[0]) routes.push(corner(sideRecv[0]))
    if (sideRecv[1]) routes.push(out(sideRecv[1]))
    if (sideRecv[2]) routes.push(flat(sideRecv[2]))
    back.forEach((r) => routes.push(drag(r)))
    if (!sideRecv[2]) routes.push(flat(P(a.backs[0]?.x ?? 58, a.backs[0]?.y ?? 54)))
    return routes
  }

  if (has('deep_shot') && recv.length >= 4 && !has('crossers') && !has('mesh')) {
    // four verticals
    recv.forEach((r) => routes.push(Math.abs(r.x - CENTER) < 30 ? seam(r) : go(r)))
    addRB()
    return routes
  }

  if (has('mesh')) {
    // dois internos cruzam raso; externos slant/hitch
    byInner.forEach((r, i) => {
      if (i < 2) routes.push(drag(r))
      else if (has('slants')) routes.push(slant(r))
      else routes.push(hitch(r))
    })
    addRB()
    return routes
  }

  if (has('crossers')) {
    byInner.forEach((r, i) => {
      if (i === 0) routes.push(crossDeep(r))
      else if (i === 1) routes.push(drag(r))
      else if (has('deep_shot')) routes.push(post(r))
      else routes.push(digDeep(r))
    })
    addRB()
    return routes
  }

  if (has('slants')) { recv.forEach((r) => routes.push(slant(r))); addRB(); return routes }

  if (has('deep_shot')) {
    // tiro profundo: mais externo post/go, wheel se post-wheel, resto por baixo
    outermost.forEach((r, i) => {
      if (i === 0) routes.push(post(r))
      else if (i === 1) routes.push(play.id.includes('wheel') ? wheel(r) : digDeep(r))
      else routes.push(drag(r))
    })
    addRB()
    return routes
  }

  if (has('sideline')) {
    outermost.forEach((r, i) => {
      const smash = play.id.includes('smash')
      if (i === 0) routes.push(smash ? corner(r) : comeback(r))
      else if (i === 1) routes.push(smash ? hitch(r) : out(r))
      else routes.push(drag(r))
    })
    addRB()
    return routes
  }

  if (has('quick_pass') || depth === 'short') {
    byInner.forEach((r, i) => routes.push(i === 0 ? curl(r) : hitch(r)))
    addRB()
    return routes
  }

  // fallback por profundidade
  outermost.forEach((r, i) => {
    if (depth === 'deep') routes.push(i === 0 ? post(r) : i === 1 ? go(r) : digDeep(r))
    else routes.push(i === 0 ? comeback(r) : i === 1 ? digDeep(r) : drag(r))
  })
  addRB()
  return routes
}

// ------------------------------------------------------------------ rotas ofensivas (corrida)
function runRoutes(play: PlaybookPlay, a: AlignedOffense): RouteLine[] {
  const has = (t: string): boolean => (play.tags as string[]).includes(t)
  const routes: RouteLine[] = []
  const qbCarry = has('qb_sneak') || play.id.includes('qb_power')
  const carrier = qbCarry ? P(a.qb.x, a.qb.y) : P(a.backs[a.backs.length - 1]?.x ?? a.qb.x, a.backs[a.backs.length - 1]?.y ?? a.qb.y)
  const outside = has('outside_run') || play.id.includes('toss') || play.id.includes('stretch')
  const misdir = has('misdirection') || play.id.includes('counter') || play.id.includes('reverse')
  const gapDir = outside ? 1 : play.id.includes('counter') ? -1 : 1
  const edge = gapDir > 0 ? 74 : 26

  if (qbCarry) {
    routes.push(rl('primary', true, [carrier, P(CENTER + 1, LOS - 6)]))
  } else if (outside) {
    routes.push(rl('primary', true, [carrier, P(edge, LOS + 1), P(edge + gapDir * 4, MED + 6)]))
  } else if (misdir) {
    routes.push(rl('primary', true, [carrier, P(carrier.x - gapDir * 10, carrier.y - 1), P(CENTER, LOS - 1), P(CENTER + gapDir * 8, MED + 8)]))
  } else {
    routes.push(rl('primary', true, [carrier, P(CENTER + 4, LOS - 2), P(CENTER + 6, MED + 6)]))
  }

  // bloqueios da OL — pequenas setas pra frente (com leve inclinação em zone)
  const zoneLean = has('zone_run') || has('outside_run') ? gapDir * 3 : 0
  a.ol.forEach((o) => routes.push(rl('block', true, [P(o.x, o.y), P(clamp(o.x + zoneLean, SIDE_L, SIDE_R), o.y - 4)], false)))

  // FB / lead blocker
  const fb = a.backs.find((b) => b.badge === 'FB')
  if (fb && (has('power') || play.id.includes('iso'))) routes.push(rl('block', true, [P(fb.x, fb.y), P(CENTER + gapDir * 3, LOS - 2)]))

  // opção: leitura do QB (keep) para a edge oposta
  if (play.runPassType === 'option' || has('option')) routes.push(rl('block', true, [P(a.qb.x, a.qb.y), P(gapDir > 0 ? 22 : 78, LOS)], false))

  // WRs stalk-block
  a.receivers.forEach((m) => routes.push(stalk(P(m.x, m.y))))
  return routes
}

// ------------------------------------------------------------------ ofensiva (completo)
function offenseGraphic(play: PlaybookPlay): PlayGraphic {
  const a = alignOffense(play)
  const isRun = play.runPassType === 'run' || play.runPassType === 'option' ||
    (!play.runPassType && ['run', 'short_yardage', 'goal_line'].includes(play.category) && !play.tags.includes('deep_shot'))
  const routes = isRun ? runRoutes(play, a) : passRoutes(play, a)

  // play action: fake de handoff em branco
  if (play.runPassType === 'play_action' && a.backs[0]) {
    routes.unshift(rl('block', true, [P(a.qb.x, a.qb.y), P(a.backs[0].x, a.backs[0].y)], true))
  }

  const markers: Marker[] = [...a.ol, a.qb, ...a.backs, ...a.receivers]
  return { flag: isRun ? 'RUN' : 'PASS', markers, routes }
}

// ------------------------------------------------------------------ defensiva
interface DefFront { dl: number; lb: number; cb: number; s: number }
function defFront(f: FormationId): DefFront {
  switch (f) {
    case 'base_3_4': return { dl: 3, lb: 4, cb: 2, s: 2 }
    case 'nickel': return { dl: 4, lb: 2, cb: 3, s: 2 }
    case 'dime': return { dl: 4, lb: 1, cb: 4, s: 2 }
    case 'goal_line': return { dl: 6, lb: 3, cb: 1, s: 1 }
    default: return { dl: 4, lb: 3, cb: 2, s: 2 } // base_4_3
  }
}
function spread(n: number, lo: number, hi: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [(lo + hi) / 2]
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1))
}

function defenseGraphic(play: PlaybookPlay): PlayGraphic {
  const fr = defFront(play.formation)
  const has = (t: string): boolean => (play.tags as string[]).includes(t)
  const markers: Marker[] = []
  const routes: RouteLine[] = []
  const zones: Zone[] = []

  const dl = spread(fr.dl, 30, 70).map((x, i) => ({ id: `dl${i}`, kind: 'def' as const, x, y: LOS - 2, badge: 'DL' }))
  const lb = spread(fr.lb, 26, 74).map((x, i) => ({ id: `lb${i}`, kind: 'def' as const, x, y: LOS - 12, badge: 'LB' }))
  const cb = spread(fr.cb, 10, 90).map((x, i) => ({ id: `cb${i}`, kind: 'def' as const, x: fr.cb === 3 && i === 1 ? 50 : x, y: LOS - 20, badge: 'CB' }))
  const saf = spread(fr.s, 36, 64).map((x, i) => ({ id: `s${i}`, kind: 'def' as const, x, y: LOS - 30, badge: 'S' }))
  markers.push(...dl, ...lb, ...cb, ...saf)

  const qbSpot = P(CENTER, LOS + 10)
  if (has('blitz') || has('zero_blitz')) {
    // setas de pressão dos DL + um LB extra
    dl.forEach((d) => routes.push(rl('primary', true, [P(d.x, d.y), P(nudge(d.x, CENTER, 8), qbSpot.y - 4)])))
    if (lb[0]) routes.push(rl('primary', true, [P(lb[0].x, lb[0].y), P(nudge(lb[0].x, CENTER, 10), qbSpot.y - 6)]))
  } else {
    dl.forEach((d) => routes.push(rl('block', true, [P(d.x, d.y), P(d.x, d.y + 5)])))
  }

  if (has('man_coverage') || has('press')) {
    // marcação: pequenos ganchos pra frente nos DBs
    ;[...cb, ...saf].forEach((d) => routes.push(rl('downfield', false, [P(d.x, d.y), P(d.x, d.y + 6)], true)))
  } else if (has('cover_2')) {
    zones.push({ x: 28, y: LOS - 26, r: 12 }, { x: 72, y: LOS - 26, r: 12 })
  } else if (has('cover_4') || has('prevent')) {
    ;[22, 42, 58, 78].forEach((x) => zones.push({ x, y: LOS - 28, r: 9 }))
  } else if (has('cover_3') || has('zone_coverage')) {
    ;[22, 50, 78].forEach((x) => zones.push({ x, y: LOS - 26, r: 10 }))
  }

  return { flag: 'DEF', markers, routes, zones }
}

// ------------------------------------------------------------------ special teams
function specialGraphic(play: PlaybookPlay): PlayGraphic {
  const has = (t: string): boolean => (play.tags as string[]).includes(t)
  const markers: Marker[] = spread(7, 26, 74).map((x, i) => ({ id: `st${i}`, kind: 'st' as const, x, y: LOS, badge: i === 3 ? 'LS' : '' }))
  const routes: RouteLine[] = []

  if (has('field_goal') || has('fake_field_goal')) {
    markers.push({ id: 'hold', kind: 'st', x: CENTER, y: LOS + 8, badge: 'H' })
    markers.push({ id: 'k', kind: 'st', x: 45, y: LOS + 13, badge: 'K' })
    routes.push(rl('block', true, [P(CENTER, LOS), P(CENTER, LOS + 8)]))
    routes.push(has('fake_field_goal')
      ? rl('primary', true, [P(CENTER, LOS + 8), P(72, LOS + 2), P(80, MED + 8)])
      : rl('downfield', true, [P(45, LOS + 13), P(CENTER, DEEP)]))
  } else if (has('punt') || has('punt_directional') || has('punt_short') || has('fake_punt')) {
    markers.push({ id: 'p', kind: 'st', x: CENTER, y: LOS + 16, badge: 'P' })
    routes.push(rl('block', true, [P(CENTER, LOS), P(CENTER, LOS + 16)], true))
    if (has('fake_punt')) routes.push(rl('primary', true, [P(CENTER, LOS + 16), P(70, LOS + 2), P(76, MED + 6)]))
    else routes.push(rl('downfield', true, [P(CENTER, LOS + 16), P(has('punt_short') ? 78 : has('punt_directional') ? 70 : CENTER, DEEP + 2)]))
  } else if (has('kickoff_deep') || has('squib_kick') || has('onside_kick')) {
    markers.push({ id: 'k', kind: 'st', x: CENTER, y: LOS + 14, badge: 'K' })
    const end = has('onside_kick') ? P(72, LOS - 2) : has('squib_kick') ? P(60, MED + 6) : P(CENTER, DEEP)
    routes.push(rl('downfield', true, [P(CENTER, LOS + 14), end]))
  } else { // return
    markers.push({ id: 'ret', kind: 'st', x: CENTER, y: SHORT + 4, badge: 'KR' })
    routes.push(rl('primary', true, [P(CENTER, SHORT + 4), P(has('return_aggressive') ? 66 : CENTER, LOS + 12)]))
  }

  return { flag: 'ST', markers, routes }
}

// ------------------------------------------------------------------ entrada
export function synthesizePlay(play: PlaybookPlay): PlayGraphic {
  if (play.side === 'defense') return defenseGraphic(play)
  if (play.side === 'special_teams') return specialGraphic(play)
  return offenseGraphic(play)
}
