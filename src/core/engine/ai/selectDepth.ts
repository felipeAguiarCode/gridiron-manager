import type { DepthChart, LeagueRules, Player, Position, SchemeSetup } from '../../domain/types'

/**
 * Monta o depth chart (titulares por unidade) a partir do roster e do scheme.
 * A IA usa isto para escalar automaticamente; o usuário sobrescreve via
 * drag&drop (M5). Sempre fecha 11 por unidade (12 na CFL, via rules).
 */

const byOverall = (a: Player, b: Player): number => b.overall - a.overall

function available(players: Player[]): Player[] {
  return players.filter((p) => p.injuryWeeks === 0 && !p.suspended)
}

/** Pega os N melhores de uma ou mais posições, evitando ids já usados. */
function pickTop(pool: Player[], positions: Position[], n: number, used: Set<string>): Player[] {
  const cands = pool
    .filter((p) => !used.has(p.id) && (positions.includes(p.position) || p.secondaryPositions.some((s) => positions.includes(s))))
    .sort(byOverall)
  const picked = cands.slice(0, n)
  picked.forEach((p) => used.add(p.id))
  return picked
}

/** Preenche faltas com qualquer jogador disponível (guarda anti-lesão). */
function fill(pool: Player[], need: number, used: Set<string>): Player[] {
  const rest = pool.filter((p) => !used.has(p.id)).sort(byOverall).slice(0, need)
  rest.forEach((p) => used.add(p.id))
  return rest
}

export function buildDepthChart(players: Player[], scheme: SchemeSetup, rules: LeagueRules): DepthChart {
  const pool = available(players)
  const defenders = rules.playersOnField // 11 ou 12

  // -------- Ataque (11)
  const offUsed = new Set<string>()
  const offense: Player[] = [
    ...pickTop(pool, ['QB'], 1, offUsed),
    ...pickTop(pool, ['RB'], 1, offUsed),
    ...pickTop(pool, ['WR'], 3, offUsed),
    ...pickTop(pool, ['TE'], 1, offUsed),
    ...pickTop(pool, ['LT'], 1, offUsed),
    ...pickTop(pool, ['LG'], 1, offUsed),
    ...pickTop(pool, ['C'], 1, offUsed),
    ...pickTop(pool, ['RG'], 1, offUsed),
    ...pickTop(pool, ['RT'], 1, offUsed)
  ]
  if (offense.length < 11) offense.push(...fill(pool, 11 - offense.length, offUsed))

  // -------- Defesa (11/12) — fronte conforme scheme
  const defUsed = new Set<string>()
  const defense: Player[] = []
  const is34 = scheme.defense === '3-4'
  const isDime = scheme.defense === 'dime'
  const isNickel = scheme.defense === 'nickel'
  if (is34) {
    defense.push(...pickTop(pool, ['DE', 'DT'], 2, defUsed))
    defense.push(...pickTop(pool, ['NT', 'DT'], 1, defUsed))
    defense.push(...pickTop(pool, ['OLB'], 2, defUsed))
    defense.push(...pickTop(pool, ['ILB', 'MLB'], 2, defUsed))
  } else {
    // base 4-3 / nickel / dime / tampa-2 / 46: 4 down linemen
    defense.push(...pickTop(pool, ['DE'], 2, defUsed))
    defense.push(...pickTop(pool, ['DT', 'NT'], 2, defUsed))
    const lbCount = isDime ? 1 : isNickel ? 2 : 3
    defense.push(...pickTop(pool, ['MLB', 'ILB', 'OLB'], lbCount, defUsed))
  }
  // secundária: CB×2 (+nickel/dime extra), FS, SS
  const extraDb = isDime ? 2 : isNickel ? 1 : 0
  defense.push(...pickTop(pool, ['CB'], 2 + extraDb, defUsed))
  defense.push(...pickTop(pool, ['FS'], 1, defUsed))
  defense.push(...pickTop(pool, ['SS'], 1, defUsed))
  if (defense.length < defenders) defense.push(...fill(pool, defenders - defense.length, defUsed))
  else if (defense.length > defenders) defense.length = defenders

  // -------- Special teams
  const spUsed = new Set<string>()
  const special: Player[] = [
    ...pickTop(pool, ['K'], 1, spUsed),
    ...pickTop(pool, ['P'], 1, spUsed),
    ...pickTop(pool, ['LS'], 1, spUsed)
  ]

  return {
    offense: offense.map((p) => p.id),
    defense: defense.map((p) => p.id),
    special: special.map((p) => p.id)
  }
}
