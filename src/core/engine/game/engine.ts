import { createRng, type Rng } from '../../rng'
import type {
  Drive, GameInput, GameResult, GameTeam, PlayerGameLine, PlayEvent,
  PlayOutcome, PlayType, Player, Position, Quarter, TeamGameStats
} from '../../domain/types'
import { BALANCE, RATING_MAX, RATING_MIN } from './constants'
import { computeBaseline, schemeFitOffense } from './ratings'
import { OFFENSE_SCHEMES, schemeMatchup } from '../scheme/schemes'

export const QUARTER_SECONDS = 900

// --------------------------------------------------------------- helpers

function sharpen(share: number, k: number): number {
  const a = Math.pow(share, k)
  const b = Math.pow(1 - share, k)
  return a / (a + b)
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function cloneTeam(gt: GameTeam): GameTeam {
  const players = new Map<string, Player>()
  for (const [id, p] of gt.players) players.set(id, { ...p, attributes: { ...p.attributes } })
  return { ...gt, players }
}

export function emptyTeamStats(): TeamGameStats {
  return {
    points: 0, totalYards: 0, passYards: 0, rushYards: 0, firstDowns: 0, turnovers: 0,
    sacks: 0, penalties: 0, penaltyYards: 0, timeOfPossession: 0, thirdDownConv: 0, thirdDownAtt: 0
  }
}

export function onField(gt: GameTeam, ids: string[]): Player[] {
  return ids.map((id) => gt.players.get(id)).filter((p): p is Player => !!p)
}

export function pick(players: Player[], positions: Position[]): Player[] {
  return players.filter((p) => positions.includes(p.position))
}

export function weightedPick(rng: Rng, players: Player[], weight: (p: Player) => number): Player | undefined {
  if (!players.length) return undefined
  const total = players.reduce((s, p) => s + Math.max(0.01, weight(p)), 0)
  let r = rng.next() * total
  for (const p of players) {
    r -= Math.max(0.01, weight(p))
    if (r <= 0) return p
  }
  return players[players.length - 1]
}

// --------------------------------------------------------------- state

export type Side = 'home' | 'away'

export interface LiveState {
  home: GameTeam
  away: GameTeam
  homeScore: number
  awayScore: number
  quarter: Quarter
  clock: number
  momentum: Record<Side, number>
  plays: PlayEvent[]
  drives: Drive[]
  lines: Map<string, PlayerGameLine>
  stats: Record<Side, TeamGameStats>
  momentumSeries: number[]
  injuries: { playerId: string; teamId: string; weeks: number }[]
  overtime: boolean
}

export function line(state: LiveState, p: Player): PlayerGameLine {
  let l = state.lines.get(p.id)
  if (!l) {
    l = {
      playerId: p.id, teamId: p.teamId, passAtt: 0, passComp: 0, passYards: 0, passTd: 0, passInt: 0,
      rushAtt: 0, rushYards: 0, rushTd: 0, rec: 0, recYards: 0, recTd: 0, tackles: 0, sacks: 0,
      interceptions: 0, forcedFumbles: 0, fgMade: 0, fgAtt: 0, xpMade: 0, xpAtt: 0, rating: BALANCE.RATING_BASE
    }
    state.lines.set(p.id, l)
  }
  return l
}

// --------------------------------------------------------------- play-call

export function callPlay(
  down: number, distance: number, yardline: number, clock: number, quarter: Quarter,
  scoreDiff: number, passRate: number, downsPerSet: number, rng: Rng
): PlayType {
  const toGoal = 100 - yardline
  const fgDistance = toGoal + 17
  const lastDown = downsPerSet
  const qNum = quarter === 'OT' ? 5 : quarter
  const half2min = (quarter === 2 || quarter === 4) && clock <= 120

  if (down >= lastDown) {
    const desperate = quarter === 4 && scoreDiff < 0 && clock < 300
    if (fgDistance <= 56 && !(desperate && distance <= 2)) return 'field_goal'
    if (distance <= 2 && (yardline > 55 || desperate || rng.chance(0.35))) return 'run'
    if (desperate && toGoal > 5) return 'pass'
    if (yardline > 62 && distance <= 4 && rng.chance(0.4)) return 'pass'
    return 'punt'
  }

  if (quarter === 4 && scoreDiff > 0 && clock <= 40 && down === 1) return 'kneel'

  let pass = passRate
  if (distance >= 8) pass += 0.2
  if (distance <= 2) pass -= 0.22
  if (down === 3) pass += distance >= 4 ? 0.18 : -0.1
  if (scoreDiff <= -9 && qNum >= 3) pass += 0.18
  if (scoreDiff >= 9 && qNum >= 3) pass -= 0.2
  if (half2min && scoreDiff <= 0) pass += 0.25
  if (half2min && scoreDiff > 0) pass -= 0.2
  pass = Math.min(0.94, Math.max(0.12, pass))
  return rng.chance(pass) ? 'pass' : 'run'
}

// --------------------------------------------------------------- resolution

export interface Effective {
  passShare: number
  runShare: number
}

/**
 * Shares efetivos passe/corrida. `offMod`/`defMod` (default 1 = neutro) permitem
 * ao motor interativo aplicar o `successMod` da jogada ofensiva / execução defensiva
 * sem alterar o comportamento do caminho não-interativo (byte-identical com mods=1).
 */
export function effective(
  momentumSide: number, off: GameTeam, def: GameTeam, isHome: boolean, neutral: boolean,
  weather?: string, offMod = 1, defMod = 1
): Effective {
  const base = computeBaseline(off, def)
  const homeAdv = !neutral && isHome ? BALANCE.HOME_ADV : 1
  const matchup = schemeMatchup(off.scheme.offense, def.scheme.defense)
  const fit = schemeFitOffense(off)
  const momMod = 1 + BALANCE.MOMENTUM_EFFECT * momentumSide
  const weatherPass = weather === 'rain' || weather === 'snow' || weather === 'wind' ? 0.96 : 1
  const passOff = base.passOff * homeAdv * matchup * fit * momMod * weatherPass * offMod
  const runOff = base.runOff * homeAdv * matchup * fit * momMod * offMod
  const passDef = base.passDef * defMod
  const runDef = base.runDef * defMod
  return {
    passShare: sharpen(passOff / (passOff + passDef), BALANCE.K),
    runShare: sharpen(runOff / (runOff + runDef), BALANCE.K)
  }
}

export interface PlayResolution {
  outcome: PlayOutcome
  yards: number
  time: number
  turnover: boolean
  passerId?: string
  rusherId?: string
  receiverId?: string
  tacklerId?: string
  text: string
}

/**
 * Modificadores da jogada escolhida (§8B.16). Todos default 1 = neutro, de modo
 * que o caminho não-interativo (mods ausente) permanece byte-identical.
 */
export interface PlayMods {
  turnoverRiskMod?: number
  sackRiskMod?: number
  bigPlayMod?: number
}

export function resolvePlay(
  playType: PlayType, off: GameTeam, def: GameTeam, eff: Effective, yardline: number, rng: Rng,
  weather?: string, mods?: PlayMods
): PlayResolution {
  const sackMod = mods?.sackRiskMod ?? 1
  const toMod = mods?.turnoverRiskMod ?? 1
  const bigMod = mods?.bigPlayMod ?? 1
  const offP = onField(off, off.depth.offense)
  const defP = onField(def, def.depth.defense)
  const qb = pick(offP, ['QB'])[0]
  const rbs = pick(offP, ['RB', 'FB'])
  const recs = pick(offP, ['WR', 'TE'])
  const rushers = pick(defP, ['DE', 'DT', 'NT', 'OLB'])
  const coverers = pick(defP, ['CB', 'FS', 'SS', 'ILB', 'MLB', 'OLB'])
  const toGoal = 100 - yardline
  const num = (p?: Player): string => (p ? `#${p.jerseyNumber} ${p.lastName}` : 'jogador')

  if (playType === 'pass') {
    const share = eff.passShare
    const sackP = BALANCE.SACK_P * (1.6 - share) * sackMod
    if (rng.chance(Math.max(0.01, sackP))) {
      const sacker = weightedPick(rng, rushers, (p) => p.attributes.prsh) ?? rushers[0]
      const loss = Math.min(Math.round(Math.abs(rng.gaussian(BALANCE.YARDS_SACK.mean, BALANCE.YARDS_SACK.sd))), Math.max(1, yardline))
      return { outcome: 'sack', yards: -loss, time: 40, turnover: false, passerId: qb?.id, tacklerId: sacker?.id, text: `SACK! ${num(sacker)} derruba ${num(qb)} (-${loss})` }
    }
    const intP = BALANCE.INT_P * (1.5 - share) * (qb ? 88 / Math.max(50, qb.attributes.tha) : 1) * toMod
    if (rng.chance(Math.max(0.004, intP))) {
      const db = weightedPick(rng, coverers, (p) => p.attributes.cov + p.attributes.zcv) ?? coverers[0]
      return { outcome: 'interception', yards: 0, time: 12, turnover: true, passerId: qb?.id, tacklerId: db?.id, text: `INTERCEPTAÇÃO! ${num(db)} rouba o passe de ${num(qb)}` }
    }
    const incompleteP = (BALANCE.INCOMPLETE_P_BASE + (0.5 - share) * 0.3) * (weather === 'rain' || weather === 'snow' ? 1.12 : 1)
    if (rng.chance(Math.max(0.08, incompleteP))) {
      return { outcome: 'incomplete', yards: 0, time: BALANCE.SEC_PER_PASS_INCOMPLETE, turnover: false, passerId: qb?.id, text: `Passe incompleto de ${num(qb)}` }
    }
    const rec = weightedPick(rng, recs, (p) => p.attributes.rte + p.attributes.cth) ?? recs[0]
    const deep = rng.chance(Math.min(0.95, BALANCE.DEEP_SHOT_RATE * bigMod))
    const dist = deep ? BALANCE.YARDS_PASS_DEEP : BALANCE.YARDS_PASS_SHORT
    let yards = Math.round(rng.gaussian(dist.mean, dist.sd) * (0.7 + share))
    yards = Math.max(-2, Math.min(yards, toGoal))
    const tackler = weightedPick(rng, coverers, (p) => p.attributes.tak) ?? coverers[0]
    return { outcome: 'gain', yards, time: BALANCE.SEC_PER_PASS_COMPLETE, turnover: false, passerId: qb?.id, receiverId: rec?.id, tacklerId: tackler?.id, text: `${num(qb)} completa ${yards} jd p/ ${num(rec)}` }
  }

  // run
  const share = eff.runShare
  const rusher = weightedPick(rng, rbs, (p) => p.overall) ?? rbs[0] ?? qb
  const fumbleP = BALANCE.FUMBLE_P * (1.4 - share) * (rusher?.traits.includes('fumble_prone') ? 1.8 : 1) * toMod
  const tackler = weightedPick(rng, [...pick(defP, ['DT', 'NT', 'DE']), ...pick(defP, ['ILB', 'MLB', 'OLB'])], (p) => p.attributes.tak) ?? defP[0]
  if (rng.chance(Math.max(0.003, fumbleP))) {
    return { outcome: 'fumble_lost', yards: Math.max(0, Math.round(rng.gaussian(2, 2))), time: 20, turnover: true, rusherId: rusher?.id, tacklerId: tackler?.id, text: `FUMBLE! ${num(rusher)} perde a bola` }
  }
  let yards = Math.round(rng.gaussian(BALANCE.YARDS_RUN.mean, BALANCE.YARDS_RUN.sd) * (0.6 + share))
  if (rusher?.traits.includes('bruiser')) yards += 1
  if (bigMod > 1 && rng.chance(Math.min(0.6, (bigMod - 1) * 0.5))) yards += Math.round(Math.abs(rng.gaussian(6, 4)))
  yards = Math.max(-4, Math.min(yards, toGoal))
  return { outcome: 'gain', yards, time: BALANCE.SEC_PER_RUN, turnover: false, rusherId: rusher?.id, tacklerId: tackler?.id, text: `${num(rusher)} corre por ${yards} jd` }
}

export function kickFieldGoal(off: GameTeam, yardline: number, rng: Rng, weather?: string): boolean {
  const kicker = onField(off, off.depth.special).find((p) => p.position === 'K')
  const dist = 100 - yardline + 17
  let base =
    dist < 30 ? BALANCE.FG_BASE_BY_DISTANCE.u30 :
    dist < 40 ? BALANCE.FG_BASE_BY_DISTANCE.d30_39 :
    dist < 50 ? BALANCE.FG_BASE_BY_DISTANCE.d40_49 : BALANCE.FG_BASE_BY_DISTANCE.d50
  if (kicker) base *= 0.85 + (kicker.attributes.kac / 99) * 0.2
  if (kicker?.traits.includes('ice_veins')) base *= 1.03
  if (weather === 'wind' || weather === 'snow') base *= 0.9
  return rng.chance(Math.min(0.99, base))
}

export function addMomentum(state: LiveState, side: Side, delta: number): void {
  const other: Side = side === 'home' ? 'away' : 'home'
  state.momentum[side] = Math.max(-1, Math.min(1, state.momentum[side] + delta))
  state.momentum[other] = Math.max(-1, Math.min(1, state.momentum[other] - delta * 0.6))
}

// --------------------------------------------------------------- engine

export function simulateGame(input: GameInput, seed: number): GameResult {
  const rng = createRng(seed)
  const home = cloneTeam(input.home)
  const away = cloneTeam(input.away)
  const rules = input.rules

  const state: LiveState = {
    home, away, homeScore: 0, awayScore: 0, quarter: 1, clock: QUARTER_SECONDS,
    momentum: { home: 0, away: 0 }, plays: [], drives: [], lines: new Map(),
    stats: { home: emptyTeamStats(), away: emptyTeamStats() }, momentumSeries: [], injuries: [], overtime: false
  }

  const teamOf = (s: Side): GameTeam => (s === 'home' ? home : away)
  const other = (s: Side): Side => (s === 'home' ? 'away' : 'home')
  const addScore = (s: Side, pts: number): void => {
    if (s === 'home') state.homeScore += pts
    else state.awayScore += pts
  }

  const homeReceivesFirst = rng.chance(0.5)
  let offenseSide: Side = homeReceivesFirst ? 'home' : 'away'
  let ballYardline = 25
  const quarterStart = { home: 0, away: 0 }
  const quarters: [number, number][] = []
  let currentQuarterForTally: number = 1

  const tallyQuarter = (): void => {
    quarters.push([state.homeScore - quarterStart.home, state.awayScore - quarterStart.away])
    quarterStart.home = state.homeScore
    quarterStart.away = state.awayScore
  }

  const record = (off: GameTeam, drive: Drive, ev: Omit<PlayEvent, 'offenseTeamId' | 'clock' | 'down'> & { clock: number; down: number }, offSide: Side): void => {
    const full: PlayEvent = { ...ev, down: ev.down as 1 | 2 | 3 | 4, clock: fmtClock(ev.clock), offenseTeamId: off.team.id }
    state.plays.push(full)
    drive.plays.push(full)
    if (drive.plays.length === 1) state.drives.push(drive)
    state.stats[offSide].timeOfPossession += ev.type === 'punt' || ev.type === 'field_goal' ? BALANCE.SEC_PER_SPECIAL : 0
  }

  // roda um drive; retorna quando a posse muda; trata virada de quarter dentro do mesmo tempo
  const runDrive = (): void => {
    const offSide = offenseSide
    const defSide = other(offSide)
    const off = teamOf(offSide)
    const def = teamOf(defSide)
    const passRate = OFFENSE_SCHEMES[off.scheme.offense].passRate
    const drive: Drive = { offenseTeamId: off.team.id, startYardline: ballYardline, plays: [], result: 'PUNT', points: 0 }
    let down = 1
    let distance = 10
    let yardline = ballYardline
    let guard = 0

    const endDrive = (): void => { offenseSide = defSide }

    while (guard++ < 60) {
      const scoreDiff = offSide === 'home' ? state.homeScore - state.awayScore : state.awayScore - state.homeScore
      const playType = callPlay(down, distance, yardline, state.clock, state.quarter, scoreDiff, passRate, rules.downsPerSet, rng)

      if (playType === 'punt') {
        const punter = onField(off, off.depth.special).find((p) => p.position === 'P')
        const puntYards = Math.round(rng.gaussian(45, 7) * (punter ? 0.85 + (punter.attributes.kpw / 99) * 0.2 : 1))
        record(off, drive, { quarter: state.quarter, clock: state.clock, down, distance, yardline, type: 'punt', outcome: 'punt', yards: puntYards, text: `Punt de ${puntYards} jd` }, offSide)
        state.clock -= BALANCE.SEC_PER_SPECIAL
        state.stats[offSide].timeOfPossession += 0
        ballYardline = Math.max(20, 100 - Math.min(99, yardline + puntYards))
        drive.result = 'PUNT'
        endDrive(); return
      }
      if (playType === 'field_goal') {
        const good = kickFieldGoal(off, yardline, rng, input.weather)
        const k = onField(off, off.depth.special).find((p) => p.position === 'K')
        if (k) { const l = line(state, k); l.fgAtt++; if (good) l.fgMade++ }
        record(off, drive, { quarter: state.quarter, clock: state.clock, down, distance, yardline, type: 'field_goal', outcome: good ? 'field_goal_good' : 'field_goal_miss', yards: 0, scorerId: k?.id, text: good ? `FIELD GOAL BOM (${100 - yardline + 17} jd)` : `FG ERRADO (${100 - yardline + 17} jd)` }, offSide)
        state.clock -= BALANCE.SEC_PER_SPECIAL
        if (good) { addScore(offSide, 3); drive.result = 'FG'; drive.points = 3; addMomentum(state, offSide, 0.12); ballYardline = 25 }
        else { drive.result = 'MISSED_FG'; ballYardline = Math.max(20, 100 - yardline) }
        endDrive(); return
      }
      if (playType === 'kneel') {
        record(off, drive, { quarter: state.quarter, clock: state.clock, down, distance, yardline, type: 'kneel', outcome: 'kneel', yards: -1, text: 'Kneel down' }, offSide)
        state.clock -= 42
        down++
        if (down > rules.downsPerSet) { drive.result = 'DOWNS'; ballYardline = Math.max(20, 100 - yardline); endDrive(); return }
        if (rolloverClock(state)) return
        continue
      }

      const eff = effective(offSide === 'home' ? state.momentum.home : state.momentum.away, off, def, offSide === 'home', input.neutralVenue, input.weather)
      const res = resolvePlay(playType, off, def, eff, yardline, rng, input.weather)
      accrueFatigue(off, def)

      const isThird = down === rules.downsPerSet - 1
      if (isThird) state.stats[offSide].thirdDownAtt++
      applyPlayerStats(state, off, def, playType, res)

      const snapYl = yardline // posição pré-snap (usada no play log)
      yardline += res.yards
      state.clock -= res.time
      state.stats[offSide].timeOfPossession += res.time
      if (playType === 'pass' && res.outcome !== 'sack') { state.stats[offSide].passYards += Math.max(0, res.yards); state.stats[offSide].totalYards += Math.max(0, res.yards) }
      else if (playType === 'run') { state.stats[offSide].rushYards += Math.max(0, res.yards); state.stats[offSide].totalYards += Math.max(0, res.yards) }
      if (res.outcome === 'sack') state.stats[defSide].sacks++

      if (yardline >= 100) {
        addScore(offSide, 6)
        const k = onField(off, off.depth.special).find((p) => p.position === 'K')
        const xpGood = k ? rng.chance(Math.min(0.99, 0.9 + (k.attributes.kac / 99) * 0.08)) : rng.chance(0.94)
        if (k) { const l = line(state, k); l.xpAtt++; if (xpGood) l.xpMade++ }
        if (xpGood) addScore(offSide, 1)
        record(off, drive, { quarter: state.quarter, clock: state.clock, down, distance, yardline: snapYl, type: playType, outcome: 'touchdown', yards: res.yards, passerId: res.passerId, rusherId: res.rusherId, receiverId: res.receiverId, scorerId: res.receiverId ?? res.rusherId, tacklerId: res.tacklerId, text: `TOUCHDOWN! ${res.text}` }, offSide)
        creditTd(state, res)
        drive.result = 'TD'; drive.points = xpGood ? 7 : 6
        addMomentum(state, offSide, BALANCE.MOMENTUM_GAIN_TD)
        ballYardline = 25; endDrive(); return
      }
      if (yardline <= 0) {
        addScore(defSide, 2)
        record(off, drive, { quarter: state.quarter, clock: state.clock, down, distance, yardline: snapYl, type: playType, outcome: 'safety', yards: res.yards, text: `SAFETY! ${res.text}` }, offSide)
        drive.result = 'SAFETY'; addMomentum(state, defSide, 0.15)
        ballYardline = 25; endDrive(); return
      }

      const reachedFirst = res.yards >= distance && res.outcome !== 'sack'
      record(off, drive, { quarter: state.quarter, clock: state.clock, down, distance, yardline: snapYl, type: playType, outcome: reachedFirst ? 'first_down' : res.outcome, yards: res.yards, passerId: res.passerId, rusherId: res.rusherId, receiverId: res.receiverId, tacklerId: res.tacklerId, text: res.text }, offSide)

      if (res.turnover) {
        state.stats[offSide].turnovers++
        drive.result = 'TURNOVER'; addMomentum(state, defSide, BALANCE.MOMENTUM_TO)
        ballYardline = Math.max(20, 100 - yardline); endDrive(); return
      }

      if (reachedFirst) {
        down = 1; distance = 10; state.stats[offSide].firstDowns++
        if (isThird) state.stats[offSide].thirdDownConv++
      } else {
        down++; distance -= res.yards
        if (down > rules.downsPerSet) { drive.result = 'DOWNS'; ballYardline = Math.max(20, 100 - yardline); endDrive(); return }
      }

      if (rolloverClock(state)) return // fim de tempo (Q2/Q4) encerra o drive
    }
    ballYardline = Math.max(20, 100 - yardline); endDrive()
  }

  // loop principal — regulation
  let mainGuard = 0
  while (mainGuard++ < 400) {
    // tally de quarter quando muda
    if ((state.quarter as number) !== currentQuarterForTally && state.quarter !== 'OT') {
      tallyQuarter()
      currentQuarterForTally = state.quarter as number
    }
    runDrive()
    decayMomentumAll(state)
    state.momentumSeries.push(Math.round((state.momentum.home - state.momentum.away) * 100) / 100)

    if (state.clock <= 0) {
      if (state.quarter === 1) { state.quarter = 2; state.clock += QUARTER_SECONDS }
      else if (state.quarter === 2) { tallyQuarter(); currentQuarterForTally = 3; state.quarter = 3; state.clock = QUARTER_SECONDS; offenseSide = homeReceivesFirst ? 'away' : 'home'; ballYardline = 25 }
      else if (state.quarter === 3) { state.quarter = 4; state.clock += QUARTER_SECONDS }
      else { tallyQuarter(); break } // fim do 4º quarter
    }
  }

  // overtime
  const tied = state.homeScore === state.awayScore
  if (tied && (input.importance !== 'regular' || !rules.allowRegularTie)) {
    state.overtime = true
    state.quarter = 'OT'
    state.clock = 600
    offenseSide = rng.chance(0.5) ? 'home' : 'away'
    ballYardline = 25
    let otGuard = 0
    while (state.homeScore === state.awayScore && otGuard++ < 8 && state.clock > 0) {
      runDrive()
      decayMomentumAll(state)
    }
  }

  const winnerTeamId = state.homeScore > state.awayScore ? home.team.id : state.awayScore > state.homeScore ? away.team.id : null
  finalizeRatings(state)

  return {
    seed, homeTeamId: home.team.id, awayTeamId: away.team.id, homeScore: state.homeScore, awayScore: state.awayScore,
    quarters, drives: state.drives, plays: state.plays, stats: state.stats, playerStats: [...state.lines.values()],
    momentum: state.momentumSeries, overtime: state.overtime, winnerTeamId, injuries: state.injuries
  }
}

/** Vira o quarter quando o relógio zera dentro de um tempo; retorna true se o drive deve parar (fim de Q2/Q4). */
export function rolloverClock(state: LiveState): boolean {
  if (state.clock > 0) return false
  if (state.quarter === 1) { state.quarter = 2; state.clock += QUARTER_SECONDS; return false }
  if (state.quarter === 3) { state.quarter = 4; state.clock += QUARTER_SECONDS; return false }
  return true // Q2 (halftime) ou Q4 (fim) — encerra o drive
}

export function decayMomentumAll(state: LiveState): void {
  state.momentum.home *= BALANCE.MOMENTUM_DECAY
  state.momentum.away *= BALANCE.MOMENTUM_DECAY
}

export function applyPlayerStats(state: LiveState, off: GameTeam, def: GameTeam, playType: PlayType, res: PlayResolution): void {
  if (playType === 'pass') {
    const qb = res.passerId ? off.players.get(res.passerId) : undefined
    if (qb) {
      const l = line(state, qb)
      l.passAtt++
      if (res.outcome === 'interception') l.passInt++
      else if (res.outcome !== 'incomplete' && res.outcome !== 'sack') { l.passComp++; l.passYards += Math.max(0, res.yards) }
    }
    const rec = res.receiverId ? off.players.get(res.receiverId) : undefined
    if (rec && res.outcome !== 'incomplete' && res.outcome !== 'sack' && res.outcome !== 'interception') {
      const l = line(state, rec); l.rec++; l.recYards += Math.max(0, res.yards)
    }
  } else if (playType === 'run') {
    const rusher = res.rusherId ? off.players.get(res.rusherId) : undefined
    if (rusher) { const l = line(state, rusher); l.rushAtt++; l.rushYards += res.yards }
  }
  const tackler = res.tacklerId ? def.players.get(res.tacklerId) : undefined
  if (tackler) {
    const l = line(state, tackler)
    l.tackles++
    if (res.outcome === 'sack') l.sacks++
    if (res.outcome === 'interception') l.interceptions++
    if (res.outcome === 'fumble_lost') l.forcedFumbles++
  }
}

export function creditTd(state: LiveState, res: PlayResolution): void {
  const scorer = res.receiverId ?? res.rusherId
  if (!scorer) return
  const l = state.lines.get(scorer)
  if (l) { if (res.receiverId) l.recTd++; else l.rushTd++ }
  if (res.passerId) { const q = state.lines.get(res.passerId); if (q) q.passTd++ }
}

export function accrueFatigue(off: GameTeam, def: GameTeam): void {
  for (const id of off.depth.offense) { const p = off.players.get(id); if (p) p.fatigue = Math.min(100, p.fatigue + BALANCE.FATIGUE_PER_SNAP) }
  for (const id of def.depth.defense) { const p = def.players.get(id); if (p) p.fatigue = Math.min(100, p.fatigue + BALANCE.FATIGUE_PER_SNAP) }
}

export function finalizeRatings(state: LiveState): void {
  for (const l of state.lines.values()) {
    let r = BALANCE.RATING_BASE
    r += l.passTd * 0.7 + l.rushTd * 1.0 + l.recTd * 1.0
    r += (l.passYards + l.rushYards + l.recYards) / 120
    r += l.sacks * 0.6 + l.interceptions * 1.1 + l.forcedFumbles * 0.8
    r -= l.passInt * 1.0
    r += l.fgMade * 0.3
    l.rating = Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(r * 10) / 10))
  }
}
