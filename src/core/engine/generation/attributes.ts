import type { Rng } from '../../rng'
import type { Attributes, MentalAttrs, Position } from '../../domain/types'
import { ATTR_KEYS } from '../../domain/types'
import { ARCHETYPES, computeOverall } from '../../domain/positions'

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)))

const PHYSICAL: (keyof Attributes)[] = ['spd', 'acc', 'agi', 'str', 'awr', 'sta']

/**
 * Rola atributos completos em torno de um overall-alvo usando os pesos do
 * arquétipo da posição, depois ajusta iterativamente os atributos relevantes
 * até o overall derivado bater no alvo (±1). Mesmo pipeline do soccer.
 */
export function rollAttributes(rng: Rng, position: Position, overallTarget: number): Attributes {
  const w = ARCHETYPES[position]
  const attrs = {} as Attributes

  // baseline baixo para tudo (atributos irrelevantes têm peso 0 no overall)
  for (const key of ATTR_KEYS) {
    attrs[key] = clamp(rng.gaussian(36, 8), 20, 62)
  }
  // físicos ficam num patamar de atleta profissional
  for (const key of PHYSICAL) {
    attrs[key] = clamp(overallTarget * 0.62 + rng.gaussian(0, 6), 30, 92)
  }
  // atributos do arquétipo em torno do alvo, escalados pelo peso
  for (const key in w) {
    const weight = w[key as keyof Attributes] as number
    const target = overallTarget * (1 + (weight - 1) * 0.5)
    attrs[key as keyof Attributes] = clamp(target + rng.gaussian(0, 3), 28, 99)
  }

  // ajusta atributos relevantes até o overall bater no alvo
  for (let iter = 0; iter < 10; iter++) {
    const ov = computeOverall({ position, attributes: attrs })
    const diff = overallTarget - ov
    if (Math.abs(diff) <= 1) break
    const step = Math.sign(diff) * Math.min(3, Math.abs(diff))
    for (const key in w) {
      attrs[key as keyof Attributes] = clamp(attrs[key as keyof Attributes] + step, 20, 99)
    }
  }
  return attrs
}

export function rollMentals(rng: Rng, overallTarget: number): MentalAttrs {
  const base = 45 + (overallTarget - 60) * 0.35
  const m = (): number => clamp(base + rng.gaussian(0, 10), 20, 99)
  return {
    composure: m(),
    leadership: m(),
    consistency: m(),
    ambition: m(),
    professionalism: m(),
    durability: m()
  }
}
