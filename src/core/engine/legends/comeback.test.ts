import { describe, it, expect } from 'vitest'
import { createRng, deriveSeed } from '../../rng'
import { generateLegendPool, effectiveLegend } from './comeback'

describe('Lendas aposentadas (M7.5)', () => {
  it('gera lendas veteranas de alto overall', () => {
    const pool = generateLegendPool(42, 8)
    expect(pool.length).toBe(8)
    for (const p of pool) {
      expect(p.age).toBeGreaterThanOrEqual(34)
      expect(p.overall).toBeGreaterThanOrEqual(85)
      expect(p.persona).toBe('comeback_story')
    }
  })

  it('overall efetivo ao voltar é menor que o pico (idade + ferrugem)', () => {
    const legend = generateLegendPool(1, 8)[0]
    const eff = effectiveLegend(legend, createRng(deriveSeed(1, 'wk')))
    expect(eff.overall).toBeLessThan(legend.overall)
    expect(eff.contractYears).toBe(1)
  })

  it('é determinístico por seed', () => {
    expect(generateLegendPool(7, 6).map((p) => p.id)).toEqual(generateLegendPool(7, 6).map((p) => p.id))
  })
})
