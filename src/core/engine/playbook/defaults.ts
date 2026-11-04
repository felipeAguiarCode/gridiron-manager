/**
 * Playbooks padrão por scheme (GDD §8B.18). Cada time recebe playbooks
 * ofensivo/defensivo/special-teams coerentes com sua identidade, derivados de
 * `preferredOffense`/`preferredDefense`. Dados estáticos puros e determinísticos
 * (sem Date.now — timestamp de sistema fixo; o `main` carimba os customizados).
 */

import type { DefenseSchemeId, OffenseSchemeId, Team } from '../../domain/types'
import type { Playbook, PlaybookTag, TeamPlaybookProfile } from '../../domain/playbook'
import { DEFENSE_PLAYS, SPECIAL_TEAMS_PLAYS, playsBySide } from './plays'

const SYSTEM_TS = '2024-01-01T00:00:00.000Z'

const OFFENSE_TAGS: Record<OffenseSchemeId, PlaybookTag[]> = {
  air_raid: ['pass_heavy', 'spread', 'vertical'],
  west_coast: ['balanced', 'west_coast'],
  spread_option: ['spread', 'rpo', 'balanced'],
  power_run: ['run_heavy', 'power'],
  vertical: ['pass_heavy', 'vertical'],
  pistol_rpo: ['rpo', 'spread'],
  smashmouth: ['run_heavy', 'power', 'clock_control']
}

const OFFENSE_LABEL: Record<OffenseSchemeId, string> = {
  air_raid: 'Air Raid Attack',
  west_coast: 'West Coast Offense',
  spread_option: 'Spread Option',
  power_run: 'Power Run Offense',
  vertical: 'Vertical Passing',
  pistol_rpo: 'Pistol RPO',
  smashmouth: 'Smashmouth Offense'
}

const DEFENSE_TAGS: Record<DefenseSchemeId, PlaybookTag[]> = {
  '4-3': ['balanced'],
  '3-4': ['defensive_pressure'],
  nickel: ['coverage_heavy'],
  dime: ['coverage_heavy', 'bend_dont_break'],
  tampa_2: ['coverage_heavy'],
  '46_blitz': ['defensive_pressure']
}

const DEFENSE_LABEL: Record<DefenseSchemeId, string> = {
  '4-3': '4-3 Defense',
  '3-4': '3-4 Defense',
  nickel: 'Nickel Defense',
  dime: 'Dime Defense',
  tampa_2: 'Tampa 2 Defense',
  '46_blitz': '46 Blitz Defense'
}

export function defaultOffensivePlaybookId(scheme: OffenseSchemeId): string {
  return `pb_off_${scheme}`
}
export function defaultDefensivePlaybookId(scheme: DefenseSchemeId): string {
  return `pb_def_${scheme.replace('-', '')}`
}
export const DEFAULT_ST_PLAYBOOK_ID = 'pb_st_default'

/** Playbook ofensivo padrão para um scheme — inclui todo o pool ofensivo, com identidade por tags. */
export function defaultOffensivePlaybook(scheme: OffenseSchemeId): Playbook {
  return {
    id: defaultOffensivePlaybookId(scheme),
    name: OFFENSE_LABEL[scheme],
    description: `Playbook ofensivo padrão (${scheme}).`,
    type: 'offense',
    baseScheme: scheme,
    createdBy: 'system',
    isDefault: true,
    isCustom: false,
    tags: OFFENSE_TAGS[scheme],
    plays: playsBySide('offense'),
    createdAt: SYSTEM_TS,
    updatedAt: SYSTEM_TS
  }
}

export function defaultDefensivePlaybook(scheme: DefenseSchemeId): Playbook {
  return {
    id: defaultDefensivePlaybookId(scheme),
    name: DEFENSE_LABEL[scheme],
    description: `Playbook defensivo padrão (${scheme}).`,
    type: 'defense',
    baseScheme: scheme,
    createdBy: 'system',
    isDefault: true,
    isCustom: false,
    tags: DEFENSE_TAGS[scheme],
    plays: DEFENSE_PLAYS,
    createdAt: SYSTEM_TS,
    updatedAt: SYSTEM_TS
  }
}

export function defaultSpecialTeamsPlaybook(): Playbook {
  return {
    id: DEFAULT_ST_PLAYBOOK_ID,
    name: 'Special Teams',
    description: 'Playbook padrão de special teams.',
    type: 'special_teams',
    baseScheme: 'special_teams',
    createdBy: 'system',
    isDefault: true,
    isCustom: false,
    tags: ['balanced'],
    plays: SPECIAL_TEAMS_PLAYS,
    createdAt: SYSTEM_TS,
    updatedAt: SYSTEM_TS
  }
}

/** Todos os playbooks de sistema (7 off × 6 def + 1 ST). */
export function allSystemPlaybooks(): Playbook[] {
  const offenses: OffenseSchemeId[] = ['air_raid', 'west_coast', 'spread_option', 'power_run', 'vertical', 'pistol_rpo', 'smashmouth']
  const defenses: DefenseSchemeId[] = ['4-3', '3-4', 'nickel', 'dime', 'tampa_2', '46_blitz']
  return [
    ...offenses.map(defaultOffensivePlaybook),
    ...defenses.map(defaultDefensivePlaybook),
    defaultSpecialTeamsPlaybook()
  ]
}

/** Perfil de playbooks padrão de um time (deriva do scheme preferido). */
export function defaultPlaybookProfile(team: Team): TeamPlaybookProfile {
  const off = defaultOffensivePlaybookId(team.preferredOffense)
  const def = defaultDefensivePlaybookId(team.preferredDefense)
  const st = DEFAULT_ST_PLAYBOOK_ID
  return {
    teamId: team.id,
    activeOffensivePlaybookId: off,
    activeDefensivePlaybookId: def,
    activeSpecialTeamsPlaybookId: st,
    defaultPlaybookIds: [off, def, st],
    customPlaybookIds: [],
    familiarity: { [off]: 75, [def]: 75, [st]: 80 }
  }
}
