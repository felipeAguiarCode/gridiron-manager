import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { Player, Team } from '../../domain/types'
import { buildGameTeam, makeGameInput } from '../game/testkit'
import { LEAGUE_CONFIG } from '../../../shared/leagues'
import {
  defaultOffensivePlaybook, defaultDefensivePlaybook, defaultSpecialTeamsPlaybook, defaultPlaybookProfile
} from './defaults'
import { validatePlaybook } from './validation'
import { recommendPlays, downDistanceOf, fieldZoneOf, scorePlay } from './recommend'
import { getPlay, ALL_PLAYS } from './plays'
import { offensePlayType, runInteractiveToEnd, type PlaybookBundle, type PreSnapDecision } from '../game/interactive'

// ---------------------------------------------------------------- validação (sem seed)

describe('validação de playbook', () => {
  it('playbooks padrão por scheme passam na validação', () => {
    expect(validatePlaybook(defaultOffensivePlaybook('air_raid')).ok).toBe(true)
    expect(validatePlaybook(defaultOffensivePlaybook('power_run')).ok).toBe(true)
    expect(validatePlaybook(defaultDefensivePlaybook('nickel')).ok).toBe(true)
    expect(validatePlaybook(defaultSpecialTeamsPlaybook()).ok).toBe(true)
  })

  it('rejeita playbook ofensivo sem o mínimo de jogadas', () => {
    const pb = defaultOffensivePlaybook('west_coast')
    const stripped = { ...pb, plays: pb.plays.slice(0, 5) }
    const res = validatePlaybook(stripped)
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => /corrida|passe/i.test(e))).toBe(true)
  })

  it('rejeita jogada incompatível com o tipo do playbook', () => {
    const pb = defaultOffensivePlaybook('vertical')
    const withDefense = { ...pb, plays: [...pb.plays, getPlay('def_cover_2')!] }
    const res = validatePlaybook(withDefense)
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => /incompatível/i.test(e))).toBe(true)
  })

  it('rejeita excesso de trick plays', () => {
    const pb = defaultOffensivePlaybook('air_raid')
    const tricks = ALL_PLAYS.filter((p) => p.category === 'trick')
    // duplica trick plays além do limite (ids únicos artificiais)
    const extra = Array.from({ length: 10 }, (_, i) => ({ ...tricks[0], id: `trick_dup_${i}` }))
    const res = validatePlaybook({ ...pb, plays: [...pb.plays, ...extra] })
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => /trick/i.test(e))).toBe(true)
  })
})

// ---------------------------------------------------------------- recomendação (sem seed)

describe('recomendação de jogadas', () => {
  const offense = defaultOffensivePlaybook('west_coast').plays

  it('3ª & longa recomenda um passe no topo', () => {
    const recs = recommendPlays(offense, {
      situation: { down: 3, distance: 12, yardline: 40, clock: 600, quarter: 2, scoreDiff: 0, downsPerSet: 4 }
    }, 5)
    const top = getPlay(recs[0].playId)!
    expect(offensePlayType(top)).toBe('pass')
  })

  it('3ª & curta favorece jogada de corrida/curta no topo', () => {
    const recs = recommendPlays(offense, {
      situation: { down: 3, distance: 1, yardline: 50, clock: 600, quarter: 2, scoreDiff: 0, downsPerSet: 4 }
    }, 5)
    const top = getPlay(recs[0].playId)!
    // não deve recomendar um deep shot em 3ª & 1
    expect(top.targetDepth).not.toBe('deep')
  })

  it('previsibilidade: repetir a mesma jogada reduz seu score (§8B.12)', () => {
    const play = getPlay('off_slants_mesh')!
    const situation = { down: 1, distance: 10, yardline: 40, clock: 600, quarter: 2 as const, scoreDiff: 0, downsPerSet: 4 }
    const fresh = scorePlay(play, { situation })
    const overused = scorePlay(play, { situation, usageCount: { off_slants_mesh: 6 } })
    expect(overused).toBeLessThan(fresh)
  })

  it('adaptação defensiva: counterTargets valoriza jogadas fortes contra a tendência (§8B.12)', () => {
    const cover4 = getPlay('def_cover_4')! // strongAgainst deep_shot
    const situation = { down: 1, distance: 10, yardline: 40, clock: 600, quarter: 2 as const, scoreDiff: 0, downsPerSet: 4 }
    const base = scorePlay(cover4, { situation })
    const adapted = scorePlay(cover4, { situation, counterTargets: ['deep_shot'] })
    expect(adapted).toBeGreaterThan(base)
  })

  it('helpers de situação classificam corretamente', () => {
    expect(downDistanceOf(3, 12, 4)).toBe('third_long')
    expect(downDistanceOf(3, 2, 4)).toBe('third_short')
    expect(downDistanceOf(4, 1, 4)).toBe('fourth_short')
    expect(fieldZoneOf(85)).toBe('red_zone')
    expect(fieldZoneOf(97)).toBe('goal_line')
  })
})

// ---------------------------------------------------------------- motor interativo (gated por seed)

const seedDir = join(process.cwd(), 'resources', 'seed', 'nfl')
const hasSeed = existsSync(join(seedDir, 'players.json'))
const maybe = hasSeed ? describe : describe.skip

maybe('motor de partida interativo', () => {
  const rules = LEAGUE_CONFIG.nfl.rules
  const teams: Team[] = JSON.parse(readFileSync(join(seedDir, 'teams.json'), 'utf-8')).teams
  const players: Player[] = JSON.parse(readFileSync(join(seedDir, 'players.json'), 'utf-8')).players
  const rosterOf = (id: string): Player[] => players.filter((p) => p.teamId === id)
  const kc = teams.find((t) => t.id === 'nfl-kc')!
  const car = teams.find((t) => t.id === 'nfl-car')!

  const bundleOf = (t: Team): PlaybookBundle => ({
    offense: defaultOffensivePlaybook(t.preferredOffense).plays,
    defense: defaultDefensivePlaybook(t.preferredDefense).plays,
    specialTeams: defaultSpecialTeamsPlaybook().plays,
    familiarity: defaultPlaybookProfile(t).familiarity
  })
  const build = () =>
    makeGameInput(buildGameTeam(kc, rosterOf(kc.id), rules), buildGameTeam(car, rosterOf(car.id), rules), rules)
  const opts = () => ({
    controlMode: 'key_moments' as const,
    userTeamId: kc.id,
    playbooks: { home: bundleOf(kc), away: bundleOf(car) }
  })
  const takeFirstRec = (d: PreSnapDecision) => ({ offensePlayId: d.recommendations[0]?.playId })

  it('determinismo: mesma seed + mesmas escolhas → resultado idêntico', () => {
    const a = runInteractiveToEnd(build(), 777, opts(), takeFirstRec)
    const b = runInteractiveToEnd(build(), 777, opts(), takeFirstRec)
    expect(a.homeScore).toBe(b.homeScore)
    expect(a.awayScore).toBe(b.awayScore)
    expect(a.plays.length).toBe(b.plays.length)
    expect(a.plays.map((p) => p.text).join('|')).toBe(b.plays.map((p) => p.text).join('|'))
  })

  it('escolhas diferentes produzem jogos reproduzíveis (e podem divergir)', () => {
    const chooseDeep = (d: PreSnapDecision) => {
      const deep = d.available.find((p) => p.targetDepth === 'deep')
      return { offensePlayId: deep?.id ?? d.recommendations[0]?.playId }
    }
    const x1 = runInteractiveToEnd(build(), 999, opts(), chooseDeep)
    const x2 = runInteractiveToEnd(build(), 999, opts(), chooseDeep)
    // reprodutível
    expect(x1.plays.map((p) => p.text).join('|')).toBe(x2.plays.map((p) => p.text).join('|'))
  })

  it('registra o nome da jogada ofensiva no event log', () => {
    const res = runInteractiveToEnd(build(), 321, opts(), takeFirstRec)
    const named = res.plays.filter((p) => p.offensePlayName)
    expect(named.length).toBeGreaterThan(10)
    const userCalled = res.plays.filter((p) => p.playCallSource === 'user')
    expect(userCalled.length).toBeGreaterThan(0)
  })

  it('modo simulation_only não pede escolha nenhuma', () => {
    let prompts = 0
    const res = runInteractiveToEnd(build(), 55, { ...opts(), controlMode: 'simulation_only' }, () => { prompts++; return undefined })
    expect(prompts).toBe(0)
    expect(res.plays.length).toBeGreaterThan(80)
  })

  it('modo full_coach_control pede chamadas ofensivas, defensivas e de special teams', () => {
    const kinds = new Set<string>()
    const chooser = (d: PreSnapDecision) => {
      kinds.add(d.kind)
      if (d.kind === 'defense') return { defensePlayId: d.recommendations[0]?.playId }
      if (d.kind === 'special_teams') return undefined // delega (chuta)
      return { offensePlayId: d.recommendations[0]?.playId }
    }
    const full = { ...opts(), controlMode: 'full_coach_control' as const }
    const a = runInteractiveToEnd(build(), 4242, full, chooser)
    const b = runInteractiveToEnd(build(), 4242, full, chooser)
    expect(kinds.has('offense')).toBe(true)
    expect(kinds.has('defense')).toBe(true)
    // determinismo mantém-se com chamadas dos dois lados
    expect(a.plays.map((p) => p.text).join('|')).toBe(b.plays.map((p) => p.text).join('|'))
    // jogadas defensivas foram registradas
    expect(a.plays.some((p) => p.defensePlayId)).toBe(true)
  })

  it('resultado interativo é estruturalmente coerente (placar = soma dos quarters)', () => {
    const res = runInteractiveToEnd(build(), 42, opts(), takeFirstRec)
    const homeSum = res.quarters.reduce((s, q) => s + q[0], 0)
    const awaySum = res.quarters.reduce((s, q) => s + q[1], 0)
    expect(homeSum).toBe(res.homeScore)
    expect(awaySum).toBe(res.awayScore)
    // há punts no jogo (macro decision de 4th down funciona)
    expect(res.plays.some((p) => p.type === 'punt')).toBe(true)
  })
})
