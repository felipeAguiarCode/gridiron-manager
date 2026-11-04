import type { AttrKey, Player, Position } from './types'

/**
 * Pesos de arquétipo por posição — usados na geração de atributos, no recálculo
 * de overall e no desenvolvimento. Só os atributos relevantes à posição entram;
 * os ausentes têm peso 0 e não contam no overall. Mesma filosofia do soccer
 * (`computeOverall` = média ponderada pelos pesos do arquétipo).
 */
export type StatWeights = Partial<Record<AttrKey, number>>

export const ARCHETYPES: Record<Position, StatWeights> = {
  // ---- Ataque
  QB: { tha: 1.5, awr: 1.2, thp: 1.1, tup: 1.0, acc: 0.3, agi: 0.3 },
  RB: { spd: 1.1, acc: 1.0, agi: 1.0, bcv: 1.1, car: 1.0, trk: 1.0, cth: 0.5, str: 0.6 },
  FB: { str: 1.2, rbk: 1.1, trk: 1.0, car: 0.9, awr: 0.7, cth: 0.5 },
  WR: { spd: 1.2, rte: 1.3, cth: 1.3, rac: 1.0, acc: 1.0, agi: 0.9, awr: 0.6 },
  TE: { cth: 1.2, rbk: 1.0, rte: 0.9, rac: 0.9, str: 0.9, pbk: 0.7, spd: 0.7, awr: 0.7 },
  LT: { pbk: 1.4, rbk: 1.0, str: 1.1, awr: 0.9, agi: 0.6 },
  LG: { rbk: 1.3, pbk: 1.1, str: 1.2, awr: 0.8 },
  C: { rbk: 1.2, pbk: 1.1, str: 1.1, awr: 1.1 },
  RG: { rbk: 1.3, pbk: 1.1, str: 1.2, awr: 0.8 },
  RT: { pbk: 1.4, rbk: 1.0, str: 1.1, awr: 0.9, agi: 0.6 },
  // ---- Defesa
  DE: { prsh: 1.3, bsh: 1.0, str: 1.0, tak: 0.9, acc: 0.8, spd: 0.7, awr: 0.7 },
  DT: { bsh: 1.2, str: 1.3, prsh: 1.0, tak: 0.9, awr: 0.7 },
  NT: { str: 1.4, bsh: 1.3, tak: 0.8, prsh: 0.7, awr: 0.7 },
  OLB: { prsh: 1.1, tak: 1.1, spd: 0.9, bsh: 0.9, prc: 0.9, cov: 0.8, str: 0.8 },
  ILB: { tak: 1.2, prc: 1.1, awr: 1.0, cov: 0.9, zcv: 0.9, bsh: 0.8, str: 0.8, spd: 0.7 },
  MLB: { tak: 1.2, prc: 1.1, awr: 1.0, cov: 0.9, zcv: 0.9, bsh: 0.8, str: 0.8, spd: 0.7 },
  CB: { spd: 1.2, cov: 1.3, zcv: 1.0, acc: 1.0, agi: 1.0, prc: 0.9, awr: 0.7, tak: 0.5 },
  FS: { spd: 1.1, zcv: 1.2, cov: 1.0, prc: 1.1, awr: 0.9, tak: 0.8 },
  SS: { tak: 1.1, cov: 1.0, zcv: 1.0, prc: 1.0, str: 0.9, spd: 0.9, awr: 0.9 },
  // ---- Special teams
  K: { kac: 1.5, kpw: 1.2, awr: 0.6 },
  P: { kpw: 1.4, kac: 1.2, awr: 0.5 },
  LS: { awr: 1.2, kac: 0.8, str: 0.6 }
}

/** Overall = média ponderada dos atributos pelos pesos do arquétipo da posição. */
export function computeOverall(p: Pick<Player, 'position' | 'attributes'>): number {
  const w = ARCHETYPES[p.position]
  let sum = 0
  let total = 0
  for (const key in w) {
    const weight = w[key as AttrKey] as number
    sum += weight * p.attributes[key as AttrKey]
    total += weight
  }
  if (total === 0) return 50
  return Math.round(sum / total)
}

/**
 * Template de roster: 53 jogadores por franquia.
 * Ataque ~25 · Defesa ~24 · Special ~4.
 */
export const ROSTER_TEMPLATE: Position[] = [
  // Ataque (25)
  'QB', 'QB', 'QB',
  'RB', 'RB', 'RB', 'FB',
  'WR', 'WR', 'WR', 'WR', 'WR', 'WR',
  'TE', 'TE', 'TE',
  'LT', 'LT', 'LG', 'LG', 'C', 'C', 'RG', 'RG', 'RT',
  // Defesa (24)
  'DE', 'DE', 'DE', 'DT', 'DT', 'DT', 'NT', 'NT',
  'OLB', 'OLB', 'ILB', 'ILB', 'MLB', 'OLB', 'OLB',
  'CB', 'CB', 'CB', 'CB', 'CB', 'FS', 'FS', 'SS', 'SS',
  // Special (4)
  'K', 'P', 'LS', 'CB'
]

/** Posições secundárias plausíveis (versatilidade / cross-training). */
export const SECONDARY_OPTIONS: Record<Position, Position[]> = {
  QB: [],
  RB: ['FB', 'WR'],
  FB: ['RB', 'TE'],
  WR: ['RB'],
  TE: ['FB', 'LT'],
  LT: ['RT', 'LG'],
  LG: ['C', 'RG'],
  C: ['LG', 'RG'],
  RG: ['C', 'LG'],
  RT: ['LT', 'RG'],
  DE: ['DT', 'OLB'],
  DT: ['DE', 'NT'],
  NT: ['DT'],
  OLB: ['DE', 'ILB', 'MLB'],
  ILB: ['MLB', 'OLB'],
  MLB: ['ILB', 'OLB'],
  CB: ['FS', 'SS'],
  FS: ['SS', 'CB'],
  SS: ['FS', 'CB'],
  K: ['P'],
  P: ['K'],
  LS: ['C']
}

/** Titulares por unidade (slots ordenados no depth chart / campo). */
export const OFFENSE_STARTERS: Position[] = ['QB', 'RB', 'WR', 'WR', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT']
export const DEFENSE_STARTERS_43: Position[] = ['DE', 'DT', 'DT', 'DE', 'OLB', 'MLB', 'OLB', 'CB', 'CB', 'FS', 'SS']
export const DEFENSE_STARTERS_34: Position[] = ['DE', 'NT', 'DE', 'OLB', 'ILB', 'ILB', 'OLB', 'CB', 'CB', 'FS', 'SS']
export const SPECIAL_STARTERS: Position[] = ['K', 'P', 'LS']

/** Guardas de roster mínimas por unidade (validação pré-jogo). */
export const MIN_ROSTER = 46
export const MIN_BY_GROUP = { QB: 1, kicker: 1, OL: 5, DL: 4, LB: 3, DB: 4 }
