import type { CardTier, PlayEvent, Position, SeasonPhase } from '@core/domain/types'

export function tierOf(overall: number): CardTier {
  if (overall >= 92) return 'legend'
  if (overall >= 85) return 'elite'
  if (overall >= 75) return 'gold'
  if (overall >= 60) return 'silver'
  return 'bronze'
}

export const POSITION_LABEL: Record<Position, string> = {
  QB: 'QB', RB: 'RB', FB: 'FB', WR: 'WR', TE: 'TE',
  LT: 'LT', LG: 'LG', C: 'C', RG: 'RG', RT: 'RT',
  DE: 'DE', DT: 'DT', NT: 'NT', OLB: 'OLB', ILB: 'ILB', MLB: 'MLB',
  CB: 'CB', FS: 'FS', SS: 'SS', K: 'K', P: 'P', LS: 'LS'
}

export const PHASE_LABEL: Record<SeasonPhase, string> = {
  pre_season: 'Pré-temporada',
  regular: 'Temporada Regular',
  wild_card: 'Wild Card',
  divisional: 'Divisional',
  conference: 'Final de Conferência',
  championship: 'Super Bowl',
  review: 'Revisão',
  finished: 'Encerrada',
  offseason: 'Offseason',
  draft: 'Draft',
  free_agency: 'Free Agency'
}

export function recordStr(w: number, l: number, t: number): string {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`
}

/**
 * Emoji para o log da partida — escolhido pelo desfecho (e tipo) da jogada.
 * Cobre todos os `outcome`/`type` que o motor realmente emite hoje (§ engine.ts / interactive.ts).
 */
export function playEmoji(p: Pick<PlayEvent, 'outcome' | 'type'>): string {
  switch (p.outcome) {
    case 'touchdown':
      return '🎉'
    case 'field_goal_good':
      return '🥅'
    case 'field_goal_miss':
      return '❌'
    case 'safety':
      return '🛡️'
    case 'sack':
      return '🛑'
    case 'interception':
      return '🚨'
    case 'fumble_lost':
      return '💥'
    case 'incomplete':
      return '🚫'
    case 'punt':
      return '🦵'
    case 'kneel':
      return '🧎'
    case 'spike':
      return '⬇️'
    case 'two_point_good':
      return '✌️'
    case 'two_point_fail':
      return '❌'
    case 'turnover_on_downs':
      return '🔁'
    case 'first_down':
      return '📏'
    case 'gain':
      return p.type === 'pass' ? '🎯' : p.type === 'run' ? '🏃' : '➡️'
    default:
      return '🏈'
  }
}

/** Mini-stats por família de posição para o card (3 destaques). */
export function cardStats(position: Position, attrs: Record<string, number>): { label: string; value: number }[] {
  const off = ['QB'].includes(position)
    ? [['THP', attrs.thp], ['THA', attrs.tha], ['AWR', attrs.awr]]
    : ['RB', 'FB'].includes(position)
      ? [['SPD', attrs.spd], ['BCV', attrs.bcv], ['TRK', attrs.trk]]
      : ['WR', 'TE'].includes(position)
        ? [['SPD', attrs.spd], ['CTH', attrs.cth], ['RTE', attrs.rte]]
        : ['LT', 'LG', 'C', 'RG', 'RT'].includes(position)
          ? [['PBK', attrs.pbk], ['RBK', attrs.rbk], ['STR', attrs.str]]
          : ['DE', 'DT', 'NT'].includes(position)
            ? [['PRS', attrs.prsh], ['BSH', attrs.bsh], ['STR', attrs.str]]
            : ['OLB', 'ILB', 'MLB'].includes(position)
              ? [['TAK', attrs.tak], ['PRC', attrs.prc], ['COV', attrs.cov]]
              : ['CB', 'FS', 'SS'].includes(position)
                ? [['SPD', attrs.spd], ['COV', attrs.cov], ['ZCV', attrs.zcv]]
                : [['KPW', attrs.kpw], ['KAC', attrs.kac], ['AWR', attrs.awr]]
  return off.map(([label, value]) => ({ label: label as string, value: value as number }))
}
