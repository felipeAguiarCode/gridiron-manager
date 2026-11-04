/**
 * Motor de partida INTERATIVO (GDD §8B.16/8B.17). Um gerador resumível que
 * conduz o jogo jogada-a-jogada e pausa (yield) numa `PreSnapDecision` quando é
 * a vez ofensiva do time do usuário e o modo/situação pede escolha. Reusa os
 * helpers puros do motor (`effective`/`resolvePlay`/`kickFieldGoal`/callPlay +
 * bookkeeping) e aplica os modificadores da jogada escolhida.
 *
 * Determinismo (§8B.17): cada jogada resolve com seed derivado
 * `deriveSeed(gameSeed, driveIndex, playIndex, offPlayId, defPlayId)`, e a
 * seleção da IA usa um stream separado. Mesma seed + mesmas escolhas =
 * mesmo resultado; escolher diferente diverge de forma reproduzível.
 */

import { createRng, deriveSeed } from '../../rng'
import type {
  Drive, GameInput, GameResult, GameTeam, PlayEvent, PlayType, Quarter
} from '../../domain/types'
import type {
  GameControlMode, PlaybookPlay, PlayCallRecommendation, PlayCallSource
} from '../../domain/playbook'
import { BALANCE } from './constants'
import { OFFENSE_SCHEMES } from '../scheme/schemes'
import {
  QUARTER_SECONDS, type LiveState, type Side, fmtClock, cloneTeam, emptyTeamStats, onField,
  line, callPlay, effective, resolvePlay, kickFieldGoal, addMomentum, decayMomentumAll,
  applyPlayerStats, creditTd, accrueFatigue, finalizeRatings, rolloverClock
} from './engine'
import {
  type PlayCallSituation, type OpponentTendency, aiPickPlay, recommendPlays, scorePlay
} from '../playbook/recommend'

// ---------------------------------------------------------------- API pública

export interface PlaybookBundle {
  offense: PlaybookPlay[]
  defense: PlaybookPlay[]
  specialTeams: PlaybookPlay[]
  familiarity?: Record<string, number> // playId → 0-100
}

export interface InteractiveOptions {
  controlMode: GameControlMode
  userTeamId: string
  playbooks: { home: PlaybookBundle; away: PlaybookBundle }
  /** tendências do adversário por lado (preenchido em M5.8; opcional) */
  tendencies?: { home?: OpponentTendency; away?: OpponentTendency }
}

/** Situação apresentada ao usuário antes do snap. */
export interface PreSnapDecision {
  kind: 'offense' | 'defense' | 'special_teams'
  /** para kind='special_teams': permite "ir pra cima" na 4ª descida */
  allowGoForIt?: boolean
  offenseTeamId: string
  defenseTeamId: string
  quarter: Quarter
  clock: string
  down: 1 | 2 | 3 | 4
  distance: number
  yardline: number
  homeScore: number
  awayScore: number
  momentum: number // do ponto de vista do ataque
  available: PlaybookPlay[]
  recommendations: PlayCallRecommendation[]
  /** snapshot do event log até (não incluindo) este snap — para o replay no GameDay */
  log: PlayEvent[]
}

/** Resposta do usuário/host. Campo ausente = delega para a recomendação. */
export interface PlayCallChoice {
  offensePlayId?: string
  defensePlayId?: string
  specialTeamsPlayId?: string
  goForIt?: boolean
}

export type GameGenerator = Generator<PreSnapDecision, GameResult, PlayCallChoice | undefined>

// ---------------------------------------------------------------- helpers locais

export function offensePlayType(play: PlaybookPlay): 'run' | 'pass' {
  return play.runPassType === 'run' || play.runPassType === 'option' ? 'run' : 'pass'
}

/** Modificador de execução por familiaridade/complexidade (§8B.11) — versão base. */
export function executionMod(play: PlaybookPlay, familiarity: number): number {
  const fam = familiarity / 100
  const familiarityBonus = (fam - 0.6) * 0.18 // ±~11% em torno de 60
  const complexityPenalty = (play.complexity / 100) * (1 - fam) * 0.2
  return Math.max(0.8, Math.min(1.15, 1 + familiarityBonus - complexityPenalty))
}

function isKeyMoment(s: PlayCallSituation): boolean {
  if (s.quarter === 'OT') return true
  const last = s.downsPerSet
  if (s.down >= last - 1) return true // 3ª/4ª descida
  if (s.yardline >= 80) return true // red zone
  const twoMin = (s.quarter === 2 || s.quarter === 4) && s.clock <= 120
  if (twoMin) return true
  const q = s.quarter as number
  if (q >= 4 && Math.abs(s.scoreDiff) <= 8 && s.clock <= 300) return true // reta final apertada
  return false
}

function bundleFor(opts: InteractiveOptions, side: Side): PlaybookBundle {
  return side === 'home' ? opts.playbooks.home : opts.playbooks.away
}

/** Tags que o adversário vem abusando (§8B.12) — alvo da adaptação defensiva. */
function hotTags(counts: Record<string, number>): string[] {
  return Object.entries(counts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t)
}

// ---------------------------------------------------------------- gerador principal

export function createInteractiveGame(input: GameInput, seed: number, opts: InteractiveOptions): GameGenerator {
  return playGame(input, seed, opts)
}

function* playGame(input: GameInput, seed: number, opts: InteractiveOptions): GameGenerator {
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

  // streams independentes para coin-toss e seleção da IA (não interferem no resRng por jogada)
  const metaRng = createRng(deriveSeed(seed, 'meta'))
  const homeReceivesFirst = metaRng.chance(0.5)
  let offenseSide: Side = homeReceivesFirst ? 'home' : 'away'
  let ballYardline = 25
  const quarterStart = { home: 0, away: 0 }
  const quarters: [number, number][] = []
  let currentQuarterForTally = 1
  let driveIndex = 0
  let playIndex = 0
  // §8B.12 — memória de uso por lado (previsibilidade + adaptação da IA)
  const usage: Record<Side, Record<string, number>> = { home: {}, away: {} }
  const tagUsage: Record<Side, Record<string, number>> = { home: {}, away: {} }

  const tallyQuarter = (): void => {
    quarters.push([state.homeScore - quarterStart.home, state.awayScore - quarterStart.away])
    quarterStart.home = state.homeScore
    quarterStart.away = state.awayScore
  }

  const push = (_off: GameTeam, drive: Drive, ev: PlayEvent, offSide: Side): void => {
    state.plays.push(ev)
    drive.plays.push(ev)
    if (drive.plays.length === 1) state.drives.push(drive)
    state.stats[offSide].timeOfPossession += ev.type === 'punt' || ev.type === 'field_goal' ? BALANCE.SEC_PER_SPECIAL : 0
  }

  function selRngFor(kind: string): ReturnType<typeof createRng> {
    return createRng(deriveSeed(seed, driveIndex, playIndex, kind))
  }
  function resRngFor(offPlayId: string, defPlayId: string): ReturnType<typeof createRng> {
    return createRng(deriveSeed(seed, driveIndex, playIndex, offPlayId, defPlayId))
  }

  function situationOf(offSide: Side, down: number, distance: number, yardline: number): PlayCallSituation {
    const scoreDiff = offSide === 'home' ? state.homeScore - state.awayScore : state.awayScore - state.homeScore
    return { down, distance, yardline, clock: state.clock, quarter: state.quarter, scoreDiff, downsPerSet: rules.downsPerSet }
  }

  function buildDecision(
    kind: PreSnapDecision['kind'], allowGoForIt: boolean, offSide: Side, off: GameTeam, def: GameTeam,
    down: number, distance: number, yardline: number, available: PlaybookPlay[], recommendations: PlayCallRecommendation[]
  ): PreSnapDecision {
    return {
      kind, allowGoForIt, offenseTeamId: off.team.id, defenseTeamId: def.team.id,
      quarter: state.quarter, clock: fmtClock(state.clock), down: down as 1 | 2 | 3 | 4, distance, yardline,
      homeScore: state.homeScore, awayScore: state.awayScore,
      momentum: offSide === 'home' ? state.momentum.home : state.momentum.away,
      available, recommendations, log: [...state.plays]
    }
  }

  const promptsFor = (teamId: string, sit: PlayCallSituation): boolean =>
    teamId === opts.userTeamId && (opts.controlMode === 'full_coach_control' || (opts.controlMode === 'key_moments' && isKeyMoment(sit)))

  function specialTeamsOptions(plays: PlaybookPlay[], macro: 'punt' | 'field_goal'): PlaybookPlay[] {
    const want = macro === 'punt' ? ['punt', 'punt_directional', 'punt_short'] : ['field_goal']
    return plays.filter((p) => p.tags.some((t) => want.includes(t)))
  }

  function* runDrive(): Generator<PreSnapDecision, void, PlayCallChoice | undefined> {
    const offSide = offenseSide
    const defSide = other(offSide)
    const off = teamOf(offSide)
    const def = teamOf(defSide)
    const offBundle = bundleFor(opts, offSide)
    const defBundle = bundleFor(opts, defSide)
    const passRate = OFFENSE_SCHEMES[off.scheme.offense].passRate
    const drive: Drive = { offenseTeamId: off.team.id, startYardline: ballYardline, plays: [], result: 'PUNT', points: 0 }
    let down = 1
    let distance = 10
    let yardline = ballYardline
    let guard = 0

    const endDrive = (): void => { offenseSide = defSide }

    while (guard++ < 60) {
      const sit = situationOf(offSide, down, distance, yardline)
      const scoreDiff = sit.scoreDiff
      // macro decisão (punt/FG/kneel/normal) reusa a lógica testada do motor
      const macroRng = selRngFor('macro')
      const macro = callPlay(down, distance, yardline, state.clock, state.quarter, scoreDiff, passRate, rules.downsPerSet, macroRng)

      // Special teams / 4ª descida — usuário no ataque decide (chutar variante ou ir pra cima)
      let goForIt = false
      let stChosenId: string | undefined
      let stSource: PlayCallSource = 'ai'
      if ((macro === 'punt' || macro === 'field_goal') && promptsFor(off.team.id, sit)) {
        const opts2 = specialTeamsOptions(offBundle.specialTeams, macro)
        const choice = yield buildDecision('special_teams', true, offSide, off, def, down, distance, yardline, opts2, [])
        if (choice?.goForIt) goForIt = true
        else if (choice?.specialTeamsPlayId) { stChosenId = choice.specialTeamsPlayId; stSource = 'user' }
      }

      if (macro === 'punt' && !goForIt) {
        playIndex++
        const stId = stChosenId ?? 'st_punt'
        const punter = onField(off, off.depth.special).find((p) => p.position === 'P')
        const puntRng = resRngFor(stId, '')
        const dirBonus = stId === 'st_punt_short' || stId === 'st_punt_directional' ? 0.94 : 1
        const puntYards = Math.round(puntRng.gaussian(45, 7) * (punter ? 0.85 + (punter.attributes.kpw / 99) * 0.2 : 1) * dirBonus)
        push(off, drive, { quarter: state.quarter, clock: fmtClock(state.clock), offenseTeamId: off.team.id, down: down as 1 | 2 | 3 | 4, distance, yardline, type: 'punt', outcome: 'punt', yards: puntYards, text: `Punt de ${puntYards} jd`, specialTeamsPlayId: stId, playCallSource: stSource }, offSide)
        state.clock -= BALANCE.SEC_PER_SPECIAL
        ballYardline = Math.max(20, 100 - Math.min(99, yardline + puntYards))
        drive.result = 'PUNT'
        endDrive(); return
      }
      if (macro === 'field_goal' && !goForIt) {
        playIndex++
        const stId = stChosenId ?? 'st_field_goal'
        const fgRng = resRngFor(stId, '')
        const good = kickFieldGoal(off, yardline, fgRng, input.weather)
        const k = onField(off, off.depth.special).find((p) => p.position === 'K')
        if (k) { const l = line(state, k); l.fgAtt++; if (good) l.fgMade++ }
        push(off, drive, { quarter: state.quarter, clock: fmtClock(state.clock), offenseTeamId: off.team.id, down: down as 1 | 2 | 3 | 4, distance, yardline, type: 'field_goal', outcome: good ? 'field_goal_good' : 'field_goal_miss', yards: 0, scorerId: k?.id, text: good ? `FIELD GOAL BOM (${100 - yardline + 17} jd)` : `FG ERRADO (${100 - yardline + 17} jd)`, specialTeamsPlayId: stId, playCallSource: stSource }, offSide)
        state.clock -= BALANCE.SEC_PER_SPECIAL
        if (good) { addScore(offSide, 3); drive.result = 'FG'; drive.points = 3; addMomentum(state, offSide, 0.12); ballYardline = 25 }
        else { drive.result = 'MISSED_FG'; ballYardline = Math.max(20, 100 - yardline) }
        endDrive(); return
      }
      if (macro === 'kneel') {
        playIndex++
        push(off, drive, { quarter: state.quarter, clock: fmtClock(state.clock), offenseTeamId: off.team.id, down: down as 1 | 2 | 3 | 4, distance, yardline, type: 'kneel', outcome: 'kneel', yards: -1, text: 'Kneel down', offensePlayId: 'off_kneel', offensePlayName: 'Victory Kneel', playCallSource: 'ai' }, offSide)
        state.clock -= 42
        down++
        if (down > rules.downsPerSet) { drive.result = 'DOWNS'; ballYardline = Math.max(20, 100 - yardline); endDrive(); return }
        if (rolloverClock(state)) return
        continue
      }

      // ---- snap normal: seleciona jogada ofensiva ----
      playIndex++
      const wantType: 'run' | 'pass' = macro === 'pass' ? 'pass' : 'run'
      const famOff = offBundle.familiarity ?? {}
      const offCtx = { situation: sit, familiarity: famOff, opponent: opts.tendencies?.[defSide], usageCount: usage[offSide] }

      let offPlay: PlaybookPlay | undefined
      let source: PlayCallSource = 'ai'
      // defesa adapta às tags que o ataque vem abusando neste jogo
      const defCtx = { situation: sit, familiarity: defBundle.familiarity ?? {}, opponent: opts.tendencies?.[offSide], counterTargets: hotTags(tagUsage[offSide]) }

      // ---- seleção ofensiva (usuário no ataque decide; senão IA) ----
      if (promptsFor(off.team.id, sit)) {
        const recommendations = recommendPlays(offBundle.offense, offCtx, 5)
        const choice = yield buildDecision('offense', false, offSide, off, def, down, distance, yardline, offBundle.offense, recommendations)
        if (choice?.offensePlayId) { offPlay = offBundle.offense.find((p) => p.id === choice.offensePlayId); source = 'user' }
        if (!offPlay) {
          const top = recommendations[0]
          offPlay = top ? offBundle.offense.find((p) => p.id === top.playId) : undefined
          source = 'recommended'
        }
      } else {
        const pool = offBundle.offense.filter((p) => offensePlayType(p) === wantType)
        offPlay = aiPickPlay(pool.length ? pool : offBundle.offense, offCtx, selRngFor('offsel'))
        source = 'ai'
      }

      // ---- seleção defensiva (usuário na defesa decide; senão IA) ----
      let defPlay: PlaybookPlay | undefined
      if (promptsFor(def.team.id, sit)) {
        const defRecs = recommendPlays(defBundle.defense, defCtx, 5)
        const choice = yield buildDecision('defense', false, offSide, off, def, down, distance, yardline, defBundle.defense, defRecs)
        if (choice?.defensePlayId) defPlay = defBundle.defense.find((p) => p.id === choice.defensePlayId)
        if (!defPlay) { const top = defRecs[0]; defPlay = top ? defBundle.defense.find((p) => p.id === top.playId) : undefined }
        if (!defPlay) defPlay = aiPickPlay(defBundle.defense, defCtx, selRngFor('defsel'))
      } else {
        defPlay = aiPickPlay(defBundle.defense, defCtx, selRngFor('defsel'))
      }

      // registra uso do lado ofensivo (previsibilidade + adaptação da IA no restante do jogo)
      if (offPlay) {
        usage[offSide][offPlay.id] = (usage[offSide][offPlay.id] ?? 0) + 1
        for (const t of offPlay.tags) tagUsage[offSide][t] = (tagUsage[offSide][t] ?? 0) + 1
      }

      const playType: PlayType = offPlay ? offensePlayType(offPlay) : wantType
      const offPlayId = offPlay?.id ?? ''
      const defPlayId = defPlay?.id ?? ''

      // modificadores da jogada
      const fam = famOff[offPlayId] ?? 60
      const offMod = (offPlay?.successMod ?? 1) * executionMod(offPlay ?? ({ complexity: 30 } as PlaybookPlay), fam)
      // matchup jogada×jogada: se a chamada defensiva estiver entre os counteredBy da ofensiva, penaliza
      let counterMod = 1
      if (offPlay && defPlay) {
        const defTags = new Set(defPlay.tags)
        if (offPlay.counteredBy.some((t) => defTags.has(t))) counterMod *= 0.92
        if (offPlay.strongAgainst.some((t) => defTags.has(t))) counterMod *= 1.08
      }
      const mods = {
        turnoverRiskMod: (offPlay?.turnoverRiskMod ?? 1) * (defPlay?.turnoverRiskMod ?? 1),
        sackRiskMod: (offPlay?.sackRiskMod ?? 1) * (defPlay?.tags.includes('blitz') ? 1.15 : 1),
        bigPlayMod: (offPlay?.bigPlayMod ?? 1) * (defPlay?.bigPlayMod ?? 1)
      }

      const resRng = resRngFor(offPlayId, defPlayId)
      const mSide = offSide === 'home' ? state.momentum.home : state.momentum.away
      const eff = effective(mSide, off, def, offSide === 'home', input.neutralVenue, input.weather, offMod * counterMod, 1)
      const res = resolvePlay(playType, off, def, eff, yardline, resRng, input.weather, mods)
      accrueFatigue(off, def)

      const isThird = down === rules.downsPerSet - 1
      if (isThird) state.stats[offSide].thirdDownAtt++
      applyPlayerStats(state, off, def, playType, res)

      const snapYl = yardline
      yardline += res.yards
      state.clock -= res.time
      state.stats[offSide].timeOfPossession += res.time
      if (playType === 'pass' && res.outcome !== 'sack') { state.stats[offSide].passYards += Math.max(0, res.yards); state.stats[offSide].totalYards += Math.max(0, res.yards) }
      else if (playType === 'run') { state.stats[offSide].rushYards += Math.max(0, res.yards); state.stats[offSide].totalYards += Math.max(0, res.yards) }
      if (res.outcome === 'sack') state.stats[defSide].sacks++

      const baseEvent = {
        quarter: state.quarter, clock: fmtClock(state.clock), offenseTeamId: off.team.id,
        down: down as 1 | 2 | 3 | 4, distance, yardline: snapYl, type: playType, yards: res.yards,
        passerId: res.passerId, rusherId: res.rusherId, receiverId: res.receiverId, tacklerId: res.tacklerId,
        offensePlayId: offPlay?.id, offensePlayName: offPlay?.name, defensePlayId: defPlay?.id, playCallSource: source,
        text: res.text
      }

      if (yardline >= 100) {
        addScore(offSide, 6)
        const k = onField(off, off.depth.special).find((p) => p.position === 'K')
        const xpGood = k ? resRng.chance(Math.min(0.99, 0.9 + (k.attributes.kac / 99) * 0.08)) : resRng.chance(0.94)
        if (k) { const l = line(state, k); l.xpAtt++; if (xpGood) l.xpMade++ }
        if (xpGood) addScore(offSide, 1)
        push(off, drive, { ...baseEvent, outcome: 'touchdown', scorerId: res.receiverId ?? res.rusherId, text: `TOUCHDOWN! ${res.text}` }, offSide)
        creditTd(state, res)
        drive.result = 'TD'; drive.points = xpGood ? 7 : 6
        addMomentum(state, offSide, BALANCE.MOMENTUM_GAIN_TD)
        ballYardline = 25; endDrive(); return
      }
      if (yardline <= 0) {
        addScore(defSide, 2)
        push(off, drive, { ...baseEvent, outcome: 'safety', text: `SAFETY! ${res.text}` }, offSide)
        drive.result = 'SAFETY'; addMomentum(state, defSide, 0.15)
        ballYardline = 25; endDrive(); return
      }

      const reachedFirst = res.yards >= distance && res.outcome !== 'sack'
      push(off, drive, { ...baseEvent, outcome: reachedFirst ? 'first_down' : res.outcome }, offSide)

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

      if (rolloverClock(state)) return
    }
    ballYardline = Math.max(20, 100 - yardline); endDrive()
  }

  // loop principal — regulation
  let mainGuard = 0
  while (mainGuard++ < 400) {
    if ((state.quarter as number) !== currentQuarterForTally && state.quarter !== 'OT') {
      tallyQuarter()
      currentQuarterForTally = state.quarter as number
    }
    yield* runDrive()
    driveIndex++
    decayMomentumAll(state)
    state.momentumSeries.push(Math.round((state.momentum.home - state.momentum.away) * 100) / 100)

    if (state.clock <= 0) {
      if (state.quarter === 1) { state.quarter = 2; state.clock += QUARTER_SECONDS }
      else if (state.quarter === 2) { tallyQuarter(); currentQuarterForTally = 3; state.quarter = 3; state.clock = QUARTER_SECONDS; offenseSide = homeReceivesFirst ? 'away' : 'home'; ballYardline = 25 }
      else if (state.quarter === 3) { state.quarter = 4; state.clock += QUARTER_SECONDS }
      else { tallyQuarter(); break }
    }
  }

  // overtime
  const tied = state.homeScore === state.awayScore
  if (tied && (input.importance !== 'regular' || !rules.allowRegularTie)) {
    state.overtime = true
    state.quarter = 'OT'
    state.clock = 600
    offenseSide = metaRng.chance(0.5) ? 'home' : 'away'
    ballYardline = 25
    let otGuard = 0
    while (state.homeScore === state.awayScore && otGuard++ < 8 && state.clock > 0) {
      yield* runDrive()
      driveIndex++
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

/**
 * Conduz o gerador até o fim com um `chooser` (útil em testes e no modo
 * simulation-driven headless). O chooser recebe a decisão e devolve a escolha.
 */
export function runInteractiveToEnd(
  input: GameInput, seed: number, opts: InteractiveOptions,
  chooser: (d: PreSnapDecision) => PlayCallChoice | undefined
): GameResult {
  const gen = createInteractiveGame(input, seed, opts)
  let step = gen.next()
  while (!step.done) {
    const choice = chooser(step.value)
    step = gen.next(choice)
  }
  return step.value
}

// re-export para uso pelo host/serviços
export { scorePlay }
