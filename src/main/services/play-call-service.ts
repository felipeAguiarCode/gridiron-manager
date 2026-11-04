/**
 * Serviço de Play Calling (GDD §8B.25). Conduz a partida INTERATIVA do usuário:
 * mantém a sessão viva (gerador do motor), entrega decisões pré-snap ao GameDay,
 * aplica a escolha e, ao fim, persiste o resultado e faz a semana avançar.
 */

import type { GameResult, Team } from '@core/domain/types'
import type { GameControlMode } from '@core/domain/playbook'
import { createInteractiveGame, type GameGenerator, type PreSnapDecision, type InteractiveOptions } from '@core/engine/game/interactive'
import type { AdvanceResult, PlayCallStateView, PreSnapDecisionView } from '@shared/ipc/contract'
import {
  AppError, requireOpenSave, buildFixtureInput, fixtureById, getControlModeOf, getStoredResult,
  persistInteractiveResult, playerRefsForFixture, teamRef
} from './game-service'
import { getActiveBundle } from './playbook-service'

interface LiveSession {
  gameId: string
  homeId: string
  awayId: string
  gen: GameGenerator
  controlMode: GameControlMode
  /** opções vivas do gerador — mutar `opts.controlMode` altera o prompting em tempo real */
  opts: InteractiveOptions
  pending: PreSnapDecision | null
  done: boolean
  result: GameResult | null
  advance: AdvanceResult | null
}

let session: LiveSession | null = null

function decisionView(d: PreSnapDecision): PreSnapDecisionView {
  return {
    kind: d.kind, allowGoForIt: d.allowGoForIt,
    offenseTeamId: d.offenseTeamId, defenseTeamId: d.defenseTeamId,
    quarter: d.quarter, clock: d.clock, down: d.down, distance: d.distance, yardline: d.yardline,
    homeScore: d.homeScore, awayScore: d.awayScore, momentum: d.momentum,
    available: d.available, recommendations: d.recommendations
  }
}

function stateView(gameId: string, homeId: string, awayId: string): PlayCallStateView {
  const o = requireOpenSave()
  const s = session
  const home = teamRef(o.teams.get(homeId)!)
  const away = teamRef(o.teams.get(awayId)!)
  const players = playerRefsForFixture(o, homeId, awayId)
  if (s && s.gameId === gameId) {
    const log = s.pending ? s.pending.log : s.result?.plays ?? []
    return {
      gameId, home, away, players, controlMode: s.controlMode, interactive: true,
      log, decision: s.pending ? decisionView(s.pending) : null, done: s.done, result: s.result, advance: s.advance
    }
  }
  // sem sessão viva → replay de um jogo já concluído
  const result = getStoredResult(o, gameId)
  return {
    gameId, home, away, players, controlMode: getControlModeOf(o), interactive: false,
    log: result?.plays ?? [], decision: null, done: true, result, advance: null
  }
}

function buildOptions(controlMode: GameControlMode): InteractiveOptions {
  const o = requireOpenSave()
  const fx = fixtureById(o, session!.gameId)!
  const homeTeam = o.teams.get(fx.homeTeamId) as Team
  const awayTeam = o.teams.get(fx.awayTeamId) as Team
  return {
    controlMode,
    userTeamId: o.info.teamId,
    playbooks: {
      home: getActiveBundle(o.saveDb, homeTeam, homeTeam.id === o.info.teamId),
      away: getActiveBundle(o.saveDb, awayTeam, awayTeam.id === o.info.teamId)
    }
  }
}

/** Inicia (ou resume) a sessão interativa de um jogo. Idempotente por gameId. */
export function startInteractiveGame(input: { gameId: string }): PlayCallStateView {
  const o = requireOpenSave()
  if (session && session.gameId === input.gameId) return stateView(input.gameId, session.homeId, session.awayId)

  const fx = fixtureById(o, input.gameId)
  if (!fx) throw new AppError('NO_FIXTURE', 'Jogo não encontrado')

  // jogo já concluído → replay (não interativo)
  if (fx.status === 'played') return stateView(input.gameId, fx.homeTeamId, fx.awayTeamId)

  const controlMode = getControlModeOf(o)
  const { fixture, input: gameInput } = buildFixtureInput(o, input.gameId)
  session = {
    gameId: input.gameId, homeId: fixture.homeTeamId, awayId: fixture.awayTeamId,
    gen: null as unknown as GameGenerator, controlMode,
    opts: null as unknown as InteractiveOptions, pending: null, done: false, result: null, advance: null
  }
  // buildOptions lê session!.gameId, então precisa ser chamado após atribuir `session`
  session.opts = buildOptions(controlMode)
  session.gen = createInteractiveGame(gameInput, fixture.simulationSeed, session.opts)

  const step = session.gen.next()
  return applyStep(step)
}

function applyStep(step: IteratorResult<PreSnapDecision, GameResult>): PlayCallStateView {
  const o = requireOpenSave()
  const s = session!
  if (step.done) {
    s.done = true
    s.result = step.value
    s.pending = null
    s.advance = persistInteractiveResult(o, s.gameId, step.value)
  } else {
    s.pending = step.value
  }
  return stateView(s.gameId, s.homeId, s.awayId)
}

/** Aplica a escolha do usuário e avança até a próxima decisão (ou o fim). */
export function advanceInteractive(input: { gameId: string; offensePlayId?: string; defensePlayId?: string; specialTeamsPlayId?: string; goForIt?: boolean; delegate?: boolean }): PlayCallStateView {
  const s = session
  if (!s || s.gameId !== input.gameId) throw new AppError('NO_SESSION', 'Sessão de jogo não encontrada — reinicie o GameDay')
  if (s.done) return stateView(s.gameId, s.homeId, s.awayId)
  // re-sincroniza o modo de comando (o usuário pode ter trocado no overlay durante a partida)
  const mode = getControlModeOf(requireOpenSave())
  s.opts.controlMode = mode
  s.controlMode = mode
  const hasChoice = input.offensePlayId || input.defensePlayId || input.specialTeamsPlayId || input.goForIt
  const choice = hasChoice
    ? { offensePlayId: input.offensePlayId, defensePlayId: input.defensePlayId, specialTeamsPlayId: input.specialTeamsPlayId, goForIt: input.goForIt }
    : undefined
  const step = s.gen.next(choice)
  return applyStep(step)
}

export function getPlayCallState(input: { gameId: string }): PlayCallStateView {
  const s = session
  if (s && s.gameId === input.gameId) return stateView(s.gameId, s.homeId, s.awayId)
  return startInteractiveGame(input)
}
