import type { Position } from './types'

/**
 * Valuation gridiron — deriva marketValue / capHit / salary de overall + idade +
 * posição. Análogo ao `computeMarketValue` do soccer, reinterpretado para o
 * salary cap da NFL (valores em dólares). Calibrável; cap balance é ajustado no M7.
 */

/** Teto de salary cap por liga (ligas com cap). */
export const LEAGUE_CAP: Record<string, number> = {
  nfl: 255_000_000,
  ufl: 0, // sem cap rígido (valuation uniforme NFL-scale)
  cfl: 0,
  ncaa: 0 // NCAA: orçamento de programa, sem cap
}

const POSITION_VALUE_MULT: Record<Position, number> = {
  QB: 1.2, RB: 0.8, FB: 0.45, WR: 1.0, TE: 0.85,
  LT: 1.1, LG: 0.9, C: 0.9, RG: 0.9, RT: 1.05,
  DE: 1.1, DT: 0.95, NT: 0.8, OLB: 1.0, ILB: 0.85, MLB: 0.9,
  CB: 1.05, FS: 0.9, SS: 0.9,
  K: 0.35, P: 0.3, LS: 0.22
}

function ageMult(age: number): number {
  if (age <= 23) return 0.72 // contratos de rookie são baratos
  if (age <= 29) return 1.0
  if (age <= 32) return 0.85
  return 0.6
}

/** Cap hit anual (dólares) a partir de overall/idade/posição.
 *  Curva calibrada para um roster de 53 somar perto do salary cap (~$255M):
 *  estrelas $20-45M, titulares $6-16M, profundidade <$3M, mínimo $0.75M. */
export function computeCapHit(overall: number, age: number, position: Position): number {
  const base = Math.pow(Math.max(0, overall - 40) / 59, 4.6) * 52_000_000
  const raw = base * POSITION_VALUE_MULT[position] * ageMult(age)
  return Math.max(750_000, Math.round(raw / 100_000) * 100_000)
}

/** Valor de mercado (ativo de trade) — múltiplo do cap hit. */
export function computeMarketValue(overall: number, age: number, position: Position): number {
  return Math.round(computeCapHit(overall, age, position) * 4)
}

/** Salário anual base — no MVP, igual ao cap hit (sem dead money detalhado). */
export function referenceSalary(capHit: number): number {
  return capHit
}
