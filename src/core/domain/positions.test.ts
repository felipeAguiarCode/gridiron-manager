import { describe, it, expect } from 'vitest'
import { createRng } from '../rng'
import { ARCHETYPES, computeOverall, ROSTER_TEMPLATE } from './positions'
import { rollAttributes } from '../engine/generation/attributes'
import type { Position } from './types'

const ALL_POSITIONS = Object.keys(ARCHETYPES) as Position[]

describe('positions / archetypes', () => {
  it('todas as 22 posições têm pesos de arquétipo', () => {
    expect(ALL_POSITIONS.length).toBe(22)
    for (const pos of ALL_POSITIONS) {
      const w = ARCHETYPES[pos]
      const total = Object.values(w).reduce((a, b) => a + (b ?? 0), 0)
      expect(total).toBeGreaterThan(0)
    }
  })

  it('computeOverall dos atributos rolados bate no alvo (±2) para toda posição', () => {
    const rng = createRng(12345)
    for (const pos of ALL_POSITIONS) {
      for (const target of [55, 70, 80, 90, 97]) {
        const attrs = rollAttributes(rng, pos, target)
        const ov = computeOverall({ position: pos, attributes: attrs })
        expect(Math.abs(ov - target)).toBeLessThanOrEqual(2)
      }
    }
  })

  it('geração é determinística (mesma seed → mesmos atributos)', () => {
    const a = rollAttributes(createRng(999), 'QB', 88)
    const b = rollAttributes(createRng(999), 'QB', 88)
    expect(a).toEqual(b)
  })

  it('ROSTER_TEMPLATE tem 53 posições com distribuição válida por unidade', () => {
    expect(ROSTER_TEMPLATE.length).toBe(53)
    const off = ROSTER_TEMPLATE.filter((p) =>
      ['QB', 'RB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'].includes(p)
    ).length
    const spec = ROSTER_TEMPLATE.filter((p) => ['K', 'P', 'LS'].includes(p)).length
    expect(off).toBeGreaterThanOrEqual(24)
    expect(spec).toBeGreaterThanOrEqual(3)
  })
})
