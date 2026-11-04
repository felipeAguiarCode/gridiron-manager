/**
 * Serviço de Playbooks (GDD §8B.25). CRUD de playbooks (sistema + customizados),
 * seleção de ativos por time e resolução do bundle usado pelo motor interativo.
 * Persistência via meta-KV (mesmo padrão de `userScheme`/`userDepth`).
 */

import type { Team } from '@core/domain/types'
import type { Playbook, PlaybookPlay, PlaybookType, TeamPlaybookProfile } from '@core/domain/playbook'
import {
  allSystemPlaybooks, defaultOffensivePlaybook, defaultDefensivePlaybook, defaultSpecialTeamsPlaybook,
  defaultPlaybookProfile, DEFAULT_ST_PLAYBOOK_ID
} from '@core/engine/playbook/defaults'
import { getPlay } from '@core/engine/playbook/plays'
import { validatePlaybook, canAddPlay } from '@core/engine/playbook/validation'
import type { PlaybookBundle } from '@core/engine/game/interactive'
import type { PlaybookHubView, PlaybookSummary, PlaybookFamiliarityView } from '@shared/ipc/contract'
import { AppError, requireOpenSave, getControlModeOf, metaGet, metaSet } from './game-service'
import type { SaveDb } from '../db/connection'

// ---------------------------------------------------------------- storage helpers

function customPlaybooks(saveDb: SaveDb): Playbook[] {
  return metaGet<Playbook[]>(saveDb, 'customPlaybooks') ?? []
}
function saveCustomPlaybooks(saveDb: SaveDb, list: Playbook[]): void {
  metaSet(saveDb, 'customPlaybooks', list)
}

function userTeam(): Team {
  const o = requireOpenSave()
  return o.teams.get(o.info.teamId)!
}

export function getProfile(saveDb: SaveDb, team: Team): TeamPlaybookProfile {
  return metaGet<TeamPlaybookProfile>(saveDb, 'playbookProfile') ?? defaultPlaybookProfile(team)
}
function saveProfile(saveDb: SaveDb, profile: TeamPlaybookProfile): void {
  metaSet(saveDb, 'playbookProfile', profile)
}

function allPlaybooks(saveDb: SaveDb): Playbook[] {
  return [...allSystemPlaybooks(), ...customPlaybooks(saveDb)]
}
function findPlaybook(saveDb: SaveDb, id: string): Playbook | undefined {
  return allPlaybooks(saveDb).find((p) => p.id === id)
}

// ---------------------------------------------------------------- bundle p/ o motor

function famMapFor(plays: PlaybookPlay[], value: number): Record<string, number> {
  const map: Record<string, number> = {}
  for (const p of plays) map[p.id] = value
  return map
}

/** Bundle de jogadas ativo de um time (usado pelo motor interativo). */
export function getActiveBundle(saveDb: SaveDb, team: Team, isUser: boolean): PlaybookBundle {
  if (isUser) {
    const profile = getProfile(saveDb, team)
    const off = findPlaybook(saveDb, profile.activeOffensivePlaybookId) ?? defaultOffensivePlaybook(team.preferredOffense)
    const def = findPlaybook(saveDb, profile.activeDefensivePlaybookId) ?? defaultDefensivePlaybook(team.preferredDefense)
    const st = findPlaybook(saveDb, profile.activeSpecialTeamsPlaybookId) ?? defaultSpecialTeamsPlaybook()
    const famOff = profile.familiarity[off.id] ?? 70
    const famDef = profile.familiarity[def.id] ?? 70
    const famSt = profile.familiarity[st.id] ?? 80
    // mistura mastery por jogada (§8B.21): jogada dominada eleva a familiaridade efetiva
    const mastery = metaGet<Record<string, number>>(saveDb, 'playMastery') ?? {}
    const blend = (plays: PlaybookPlay[], base: number): Record<string, number> => {
      const map: Record<string, number> = {}
      for (const p of plays) map[p.id] = mastery[p.id] !== undefined ? Math.round((base + mastery[p.id]) / 2) : base
      return map
    }
    return {
      offense: off.plays, defense: def.plays, specialTeams: st.plays,
      familiarity: { ...blend(off.plays, famOff), ...blend(def.plays, famDef), ...blend(st.plays, famSt) }
    }
  }
  // IA: playbook padrão do scheme, familiaridade alta (o time "conhece" seu sistema)
  const off = defaultOffensivePlaybook(team.preferredOffense)
  const def = defaultDefensivePlaybook(team.preferredDefense)
  const st = defaultSpecialTeamsPlaybook()
  return {
    offense: off.plays, defense: def.plays, specialTeams: st.plays,
    familiarity: { ...famMapFor(off.plays, 78), ...famMapFor(def.plays, 78), ...famMapFor(st.plays, 80) }
  }
}

// ---------------------------------------------------------------- view

function summaryOf(pb: Playbook, profile: TeamPlaybookProfile): PlaybookSummary {
  const active =
    pb.id === profile.activeOffensivePlaybookId ||
    pb.id === profile.activeDefensivePlaybookId ||
    pb.id === profile.activeSpecialTeamsPlaybookId
  return {
    id: pb.id, name: pb.name, type: pb.type, baseScheme: String(pb.baseScheme),
    isCustom: pb.isCustom, isDefault: pb.isDefault, playCount: pb.plays.length,
    tags: pb.tags, active, familiarity: profile.familiarity[pb.id] ?? (pb.isCustom ? 30 : 70)
  }
}

function buildHub(saveDb: SaveDb, team: Team): PlaybookHubView {
  const profile = getProfile(saveDb, team)
  const all = allPlaybooks(saveDb)
  const byType = (t: PlaybookType): PlaybookSummary[] => all.filter((p) => p.type === t).map((p) => summaryOf(p, profile))
  return {
    teamId: team.id,
    controlMode: getControlModeOf(requireOpenSave()),
    activeOffensiveId: profile.activeOffensivePlaybookId,
    activeDefensiveId: profile.activeDefensivePlaybookId,
    activeSpecialTeamsId: profile.activeSpecialTeamsPlaybookId,
    offensive: byType('offense'),
    defensive: byType('defense'),
    specialTeams: byType('special_teams')
  }
}

// ---------------------------------------------------------------- IPC handlers

export function playbookHub(): PlaybookHubView {
  const o = requireOpenSave()
  return buildHub(o.saveDb, userTeam())
}

export function playbookList(input: { teamId?: string }): PlaybookSummary[] {
  const o = requireOpenSave()
  const team = input.teamId ? o.teams.get(input.teamId) ?? userTeam() : userTeam()
  const profile = getProfile(o.saveDb, team)
  return allPlaybooks(o.saveDb).map((p) => summaryOf(p, profile))
}

export function playbookGet(input: { playbookId: string }): Playbook {
  const o = requireOpenSave()
  const pb = findPlaybook(o.saveDb, input.playbookId)
  if (!pb) throw new AppError('NO_PLAYBOOK', 'Playbook não encontrado')
  return pb
}

let customCounter = 0
function newCustomId(): string {
  customCounter++
  return `pb_custom_${Date.now().toString(36)}_${customCounter}`
}

function seedPlaysFor(type: PlaybookType, baseScheme: string): PlaybookPlay[] {
  if (type === 'offense') return defaultOffensivePlaybook(baseScheme as never).plays
  if (type === 'defense') return defaultDefensivePlaybook(baseScheme as never).plays
  return defaultSpecialTeamsPlaybook().plays
}

export function playbookCreate(input: { name: string; type: PlaybookType; baseScheme: string }): PlaybookHubView {
  const o = requireOpenSave()
  const now = new Date().toISOString()
  const pb: Playbook = {
    id: newCustomId(), ownerTeamId: o.info.teamId, name: input.name, type: input.type,
    baseScheme: input.baseScheme as Playbook['baseScheme'], createdBy: 'user', isDefault: false, isCustom: true,
    tags: [], plays: seedPlaysFor(input.type, input.baseScheme), favoritePlayIds: [], situationalRules: [],
    createdAt: now, updatedAt: now
  }
  const list = customPlaybooks(o.saveDb)
  list.push(pb)
  saveCustomPlaybooks(o.saveDb, list)
  return buildHub(o.saveDb, userTeam())
}

export function playbookClone(input: { playbookId: string; name: string }): PlaybookHubView {
  const o = requireOpenSave()
  const src = findPlaybook(o.saveDb, input.playbookId)
  if (!src) throw new AppError('NO_PLAYBOOK', 'Playbook de origem não encontrado')
  const now = new Date().toISOString()
  const clone: Playbook = {
    ...src, id: newCustomId(), ownerTeamId: o.info.teamId, name: input.name, createdBy: 'user',
    isDefault: false, isCustom: true, plays: [...src.plays], favoritePlayIds: [...(src.favoritePlayIds ?? [])],
    situationalRules: [...(src.situationalRules ?? [])], createdAt: now, updatedAt: now
  }
  const list = customPlaybooks(o.saveDb)
  list.push(clone)
  saveCustomPlaybooks(o.saveDb, list)
  return buildHub(o.saveDb, userTeam())
}

function mutateCustom(saveDb: SaveDb, id: string, fn: (pb: Playbook) => void): void {
  const list = customPlaybooks(saveDb)
  const pb = list.find((p) => p.id === id)
  if (!pb) throw new AppError('NOT_CUSTOM', 'Só playbooks customizados podem ser editados')
  fn(pb)
  pb.updatedAt = new Date().toISOString()
  saveCustomPlaybooks(saveDb, list)
}

export function playbookRename(input: { playbookId: string; name: string }): PlaybookHubView {
  const o = requireOpenSave()
  mutateCustom(o.saveDb, input.playbookId, (pb) => { pb.name = input.name })
  return buildHub(o.saveDb, userTeam())
}

export function playbookUpdate(input: { playbookId: string; playIds: string[] }): PlaybookHubView {
  const o = requireOpenSave()
  mutateCustom(o.saveDb, input.playbookId, (pb) => {
    pb.plays = input.playIds.map((id) => getPlay(id)).filter((p): p is PlaybookPlay => !!p && p.side === sideForType(pb.type))
  })
  return buildHub(o.saveDb, userTeam())
}

function sideForType(type: PlaybookType): PlaybookPlay['side'] {
  return type === 'defense' ? 'defense' : type === 'special_teams' ? 'special_teams' : 'offense'
}

export function playbookAddPlay(input: { playbookId: string; playId: string }): PlaybookHubView {
  const o = requireOpenSave()
  const play = getPlay(input.playId)
  if (!play) throw new AppError('NO_PLAY', 'Jogada não encontrada')
  mutateCustom(o.saveDb, input.playbookId, (pb) => {
    const check = canAddPlay(pb, play)
    if (!check.ok) throw new AppError('INVALID_PLAY', check.errors.join(' '))
    pb.plays.push(play)
  })
  return buildHub(o.saveDb, userTeam())
}

export function playbookRemovePlay(input: { playbookId: string; playId: string }): PlaybookHubView {
  const o = requireOpenSave()
  mutateCustom(o.saveDb, input.playbookId, (pb) => { pb.plays = pb.plays.filter((p) => p.id !== input.playId) })
  return buildHub(o.saveDb, userTeam())
}

export function playbookSetFavorite(input: { playbookId: string; playId: string; favorite: boolean }): PlaybookHubView {
  const o = requireOpenSave()
  mutateCustom(o.saveDb, input.playbookId, (pb) => {
    const set = new Set(pb.favoritePlayIds ?? [])
    if (input.favorite) set.add(input.playId)
    else set.delete(input.playId)
    pb.favoritePlayIds = [...set]
  })
  return buildHub(o.saveDb, userTeam())
}

export function playbookSetActive(input: { type: PlaybookType; playbookId: string }): PlaybookHubView {
  const o = requireOpenSave()
  const pb = findPlaybook(o.saveDb, input.playbookId)
  if (!pb) throw new AppError('NO_PLAYBOOK', 'Playbook não encontrado')
  if (pb.type !== input.type) throw new AppError('WRONG_TYPE', 'Tipo de playbook incompatível')
  const val = validatePlaybook(pb)
  if (!val.ok) throw new AppError('INVALID_PLAYBOOK', `Playbook inválido: ${val.errors.join(' ')}`)
  const team = userTeam()
  const profile = getProfile(o.saveDb, team)
  if (input.type === 'offense') profile.activeOffensivePlaybookId = pb.id
  else if (input.type === 'defense') profile.activeDefensivePlaybookId = pb.id
  else profile.activeSpecialTeamsPlaybookId = pb.id
  if (profile.familiarity[pb.id] === undefined) profile.familiarity[pb.id] = pb.isCustom ? 30 : 70
  saveProfile(o.saveDb, profile)
  return buildHub(o.saveDb, userTeam())
}

export function playbookExport(input: { playbookId: string }): { json: string } {
  const o = requireOpenSave()
  const pb = findPlaybook(o.saveDb, input.playbookId)
  if (!pb) throw new AppError('NO_PLAYBOOK', 'Playbook não encontrado')
  return { json: JSON.stringify(pb, null, 2) }
}

export function playbookImport(input: { json: string }): PlaybookHubView {
  const o = requireOpenSave()
  let parsed: Playbook
  try {
    parsed = JSON.parse(input.json) as Playbook
  } catch {
    throw new AppError('BAD_JSON', 'JSON inválido')
  }
  if (!parsed || !Array.isArray(parsed.plays) || !parsed.type) throw new AppError('BAD_PLAYBOOK', 'Estrutura de playbook inválida')
  // re-resolve as jogadas contra a biblioteca (ids desconhecidos são descartados)
  const plays = parsed.plays.map((p) => getPlay(p.id)).filter((p): p is PlaybookPlay => !!p)
  const now = new Date().toISOString()
  const pb: Playbook = {
    id: newCustomId(), ownerTeamId: o.info.teamId, name: parsed.name || 'Playbook Importado', description: parsed.description,
    type: parsed.type, baseScheme: parsed.baseScheme ?? 'special_teams', createdBy: 'imported', isDefault: false, isCustom: true,
    tags: Array.isArray(parsed.tags) ? parsed.tags : [], plays, favoritePlayIds: Array.isArray(parsed.favoritePlayIds) ? parsed.favoritePlayIds : [],
    situationalRules: [], createdAt: now, updatedAt: now
  }
  const list = customPlaybooks(o.saveDb)
  list.push(pb)
  saveCustomPlaybooks(o.saveDb, list)
  return buildHub(o.saveDb, userTeam())
}

export function playbookFamiliarity(): PlaybookFamiliarityView {
  const o = requireOpenSave()
  const team = userTeam()
  const profile = getProfile(o.saveDb, team)
  const all = allPlaybooks(o.saveDb)
  const entries = Object.keys(profile.familiarity).map((pid) => ({
    playbookId: pid, name: all.find((p) => p.id === pid)?.name ?? pid, familiarity: profile.familiarity[pid]
  }))
  return { teamId: team.id, entries }
}

export { DEFAULT_ST_PLAYBOOK_ID }
