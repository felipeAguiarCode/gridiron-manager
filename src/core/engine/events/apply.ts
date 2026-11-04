import type { Rng } from '../../rng'
import type { Player, Unit } from '../../domain/types'
import { unitOf } from '../../domain/types'
import { EVENT_DECK, type EventCard, type EventGroup } from './deck'

/** Sorteia 3 cartas distintas (legendárias raras; excluídas se já usada na temporada). */
export function drawThree(rng: Rng, allowLegendary: boolean): EventCard[] {
  const weight = (c: EventCard): number =>
    c.rarity === 'legendary' ? (allowLegendary ? 1 : 0) : c.rarity === 'epic' ? 4 : c.rarity === 'rare' ? 10 : 20
  const pool = EVENT_DECK.filter((c) => weight(c) > 0)
  const picked: EventCard[] = []
  const used = new Set<string>()
  while (picked.length < 3 && used.size < pool.length) {
    const total = pool.filter((c) => !used.has(c.id)).reduce((s, c) => s + weight(c), 0)
    let r = rng.next() * total
    for (const c of pool) {
      if (used.has(c.id)) continue
      r -= weight(c)
      if (r <= 0) { picked.push(c); used.add(c.id); break }
    }
  }
  return picked
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)))

function selectGroup(rng: Rng, roster: Player[], group: EventGroup): Player[] {
  const available = roster.filter((p) => p.teamId !== 'free-agent')
  switch (group) {
    case 'all': return available
    case 'star': return [available.slice().sort((a, b) => b.overall - a.overall)[0]].filter(Boolean)
    case 'random': return [rng.pick(available)].filter(Boolean)
    case 'rookie': {
      const rk = available.filter((p) => p.yearsPro === 0)
      return [(rk.length ? rng.pick(rk) : available.slice().sort((a, b) => a.age - b.age)[0])].filter(Boolean)
    }
    case 'offense': return available.filter((p) => unitOf(p.position) === ('offense' as Unit))
    case 'defense': return available.filter((p) => unitOf(p.position) === ('defense' as Unit))
    default: return available
  }
}

export interface ApplyResult {
  players: Map<string, Player> // apenas os alterados
  capCredit: number
  reputationDelta: number
  affectedNames: string[]
}

/** Aplica os efeitos declarativos da carta ao elenco; retorna alterações. */
export function applyCard(rng: Rng, card: EventCard, roster: Player[]): ApplyResult {
  const e = card.effects
  const changed = new Map<string, Player>()
  const affected: string[] = []

  if (e.cureInjury) {
    for (const p of roster) if (p.injuryWeeks > 0) { changed.set(p.id, { ...p, injuryWeeks: 0 }); affected.push(p.lastName) }
  }

  const targets = e.group ? selectGroup(rng, roster, e.group) : []
  for (const p of targets) {
    const base = changed.get(p.id) ?? p
    const next: Player = {
      ...base,
      morale: e.moraleDelta != null ? clamp(base.morale + e.moraleDelta, 10, 100) : base.morale,
      form: e.formDelta != null ? clamp(base.form + e.formDelta, 10, 100) : base.form,
      fatigue: e.fatigueDelta != null ? clamp(base.fatigue + e.fatigueDelta, 0, 100) : base.fatigue,
      potential: e.potentialDelta != null ? clamp(base.potential + e.potentialDelta, base.overall, 99) : base.potential,
      injuryWeeks: e.injuryWeeks != null ? Math.max(base.injuryWeeks, e.injuryWeeks) : base.injuryWeeks
    }
    changed.set(p.id, next)
    if (e.group === 'star' || e.group === 'random' || e.group === 'rookie' || e.injuryWeeks) affected.push(p.lastName)
  }

  return { players: changed, capCredit: e.capCredit ?? 0, reputationDelta: e.reputationDelta ?? 0, affectedNames: affected }
}
