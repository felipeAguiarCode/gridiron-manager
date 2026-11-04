/**
 * Validação de playbooks (GDD §8B.10/8B.28). Regras de balanceamento:
 * mínimos por categoria, máximos por unidade, teto de trick plays, e
 * compatibilidade jogada↔tipo de playbook.
 */

import type { Playbook, PlaybookPlay, PlaySide } from '../../domain/playbook'
import { PLAYBOOK_LIMITS } from '../../domain/playbook'

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

const SIDE_FOR_TYPE: Record<Playbook['type'], PlaySide | null> = {
  offense: 'offense',
  defense: 'defense',
  special_teams: 'special_teams',
  full_team: null
}

function countCategory(plays: PlaybookPlay[], cat: PlaybookPlay['category']): number {
  return plays.filter((p) => p.category === cat).length
}

export function validatePlaybook(pb: Playbook): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const plays = pb.plays

  // 1) compatibilidade lado ↔ tipo
  const expectedSide = SIDE_FOR_TYPE[pb.type]
  if (expectedSide) {
    const bad = plays.filter((p) => p.side !== expectedSide)
    if (bad.length) errors.push(`${bad.length} jogada(s) incompatível(is) com playbook do tipo "${pb.type}" (esperado side=${expectedSide}).`)
  }

  // 2) ids únicos
  const ids = new Set<string>()
  for (const p of plays) {
    if (ids.has(p.id)) errors.push(`Jogada duplicada: ${p.id}`)
    ids.add(p.id)
  }

  // 3) limites por tipo
  if (pb.type === 'offense') {
    const runs = countCategory(plays, 'run')
    const passes = countCategory(plays, 'pass')
    const tricks = countCategory(plays, 'trick')
    if (plays.length > PLAYBOOK_LIMITS.maxOffensivePlays) errors.push(`Playbook ofensivo excede ${PLAYBOOK_LIMITS.maxOffensivePlays} jogadas (${plays.length}).`)
    if (runs < PLAYBOOK_LIMITS.minRunPlays) errors.push(`Mínimo de ${PLAYBOOK_LIMITS.minRunPlays} jogadas de corrida (tem ${runs}).`)
    if (passes < PLAYBOOK_LIMITS.minPassPlays) errors.push(`Mínimo de ${PLAYBOOK_LIMITS.minPassPlays} jogadas de passe (tem ${passes}).`)
    if (tricks > PLAYBOOK_LIMITS.maxTrickPlays) errors.push(`Máximo de ${PLAYBOOK_LIMITS.maxTrickPlays} trick plays (tem ${tricks}).`)
  } else if (pb.type === 'defense') {
    if (plays.length > PLAYBOOK_LIMITS.maxDefensivePlays) errors.push(`Playbook defensivo excede ${PLAYBOOK_LIMITS.maxDefensivePlays} jogadas (${plays.length}).`)
    if (plays.length < PLAYBOOK_LIMITS.minDefensiveCalls) errors.push(`Mínimo de ${PLAYBOOK_LIMITS.minDefensiveCalls} chamadas defensivas (tem ${plays.length}).`)
  } else if (pb.type === 'special_teams') {
    if (plays.length > PLAYBOOK_LIMITS.maxSpecialTeamsPlays) errors.push(`Playbook de special teams excede ${PLAYBOOK_LIMITS.maxSpecialTeamsPlays} jogadas (${plays.length}).`)
    if (plays.length < PLAYBOOK_LIMITS.minSpecialTeamsCalls) errors.push(`Mínimo de ${PLAYBOOK_LIMITS.minSpecialTeamsCalls} chamadas de special teams (tem ${plays.length}).`)
  }

  if (plays.length === 0) errors.push('Playbook vazio.')

  return { ok: errors.length === 0, errors, warnings }
}

/** Pode adicionar esta jogada a este playbook? (usado pelo editor) */
export function canAddPlay(pb: Playbook, play: PlaybookPlay): ValidationResult {
  const errors: string[] = []
  const expectedSide = SIDE_FOR_TYPE[pb.type]
  if (expectedSide && play.side !== expectedSide) errors.push(`Jogada "${play.name}" (${play.side}) não cabe em playbook ${pb.type}.`)
  if (pb.plays.some((p) => p.id === play.id)) errors.push(`Jogada "${play.name}" já está no playbook.`)
  return { ok: errors.length === 0, errors, warnings: [] }
}
