import type { Rng } from '../../rng'
import type { Player, PlayerPersona } from '../../domain/types'

/**
 * Career DNA (§10B.4). Atribui uma persona determinística ao jogador, enviesada
 * por idade/overall/posição — usada pela negociação (interesse) e por moral.
 */
const ALL_PERSONAS: PlayerPersona[] = [
  'ring_chaser', 'money_first', 'loyal_veteran', 'prove_it', 'spotlight_star',
  'quiet_professional', 'locker_room_leader', 'fragile_ego', 'hometown_hero',
  'scheme_purist', 'mercenary', 'mentor', 'comeback_story'
]

export function assignPersona(rng: Rng, player: Pick<Player, 'age' | 'overall' | 'position'>): PlayerPersona {
  const w = new Map<PlayerPersona, number>(ALL_PERSONAS.map((p) => [p, 1]))
  const bump = (p: PlayerPersona, n: number): void => {
    w.set(p, (w.get(p) ?? 0) + n)
  }

  // veteranos: lealdade, anel, mentoria; jovens: prove-it, ego, holofote
  if (player.age >= 31) { bump('ring_chaser', 3); bump('loyal_veteran', 3); bump('mentor', 3); bump('comeback_story', 1) }
  else if (player.age <= 24) { bump('prove_it', 4); bump('fragile_ego', 2); bump('spotlight_star', 2) }
  else { bump('quiet_professional', 2); bump('money_first', 2) }

  // estrelas: holofote/dinheiro; medianos: prove-it/mercenário
  if (player.overall >= 85) { bump('spotlight_star', 3); bump('money_first', 3); bump('ring_chaser', 2) }
  else if (player.overall <= 70) { bump('prove_it', 3); bump('mercenary', 2); bump('quiet_professional', 1) }

  // QBs tendem a liderança; specialists a quiet professional
  if (player.position === 'QB') bump('locker_room_leader', 3)
  if (player.position === 'K' || player.position === 'P' || player.position === 'LS') bump('quiet_professional', 3)

  const total = [...w.values()].reduce((s, n) => s + n, 0)
  let roll = rng.next() * total
  for (const p of ALL_PERSONAS) {
    roll -= w.get(p) ?? 0
    if (roll <= 0) return p
  }
  return 'quiet_professional'
}

/** Garante persona no jogador (idempotente) — usado ao gerar FAs e ao negociar. */
export function ensurePersona(rng: Rng, player: Player): PlayerPersona {
  if (!player.persona) player.persona = assignPersona(rng, player)
  return player.persona
}
