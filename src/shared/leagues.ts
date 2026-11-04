import type { League, LeagueRules } from '@core/domain/types'

/** Configuração estrutural fixa por liga (como a UCL fixa 36 times). */
export interface LeagueConfig {
  id: League
  label: string
  teamCount: number
  regularSeasonWeeks: number // nº de semanas de temporada regular (inclui byes na NFL)
  gamesPerTeam: number
  conferences: string[]
  divisionsPerConference: string[] // vazio quando a liga não usa divisões
  playoffSeedsPerConference: number
  championshipLabel: string
  hasCap: boolean
  rules: LeagueRules
}

const NFL_RULES: LeagueRules = {
  downsPerSet: 4,
  playersOnField: 11,
  fieldLength: 100,
  rouge: false,
  otMode: 'nfl',
  allowRegularTie: true
}

const CFL_RULES: LeagueRules = {
  downsPerSet: 3,
  playersOnField: 12,
  fieldLength: 110,
  rouge: true,
  otMode: 'college',
  allowRegularTie: true
}

const UFL_RULES: LeagueRules = {
  downsPerSet: 4,
  playersOnField: 11,
  fieldLength: 100,
  rouge: false,
  otMode: 'ufl',
  allowRegularTie: false
}

const NCAA_RULES: LeagueRules = {
  downsPerSet: 4,
  playersOnField: 11,
  fieldLength: 100,
  rouge: false,
  otMode: 'college',
  allowRegularTie: false
}

export const LEAGUE_CONFIG: Record<League, LeagueConfig> = {
  nfl: {
    id: 'nfl',
    label: 'NFL',
    teamCount: 32,
    regularSeasonWeeks: 18, // 17 jogos + 1 bye
    gamesPerTeam: 17,
    conferences: ['AFC', 'NFC'],
    divisionsPerConference: ['North', 'South', 'East', 'West'],
    playoffSeedsPerConference: 7,
    championshipLabel: 'Super Bowl',
    hasCap: true,
    rules: NFL_RULES
  },
  cfl: {
    id: 'cfl',
    label: 'CFL',
    teamCount: 9,
    regularSeasonWeeks: 21,
    gamesPerTeam: 18,
    conferences: ['East', 'West'],
    divisionsPerConference: [],
    playoffSeedsPerConference: 3,
    championshipLabel: 'Grey Cup',
    hasCap: false,
    rules: CFL_RULES
  },
  ufl: {
    id: 'ufl',
    label: 'UFL',
    teamCount: 8,
    regularSeasonWeeks: 11,
    gamesPerTeam: 10,
    conferences: ['USFL', 'XFL'],
    divisionsPerConference: [],
    playoffSeedsPerConference: 2,
    championshipLabel: 'UFL Championship',
    hasCap: false,
    rules: UFL_RULES
  },
  ncaa: {
    id: 'ncaa',
    label: 'NCAA',
    teamCount: 42,
    regularSeasonWeeks: 14,
    gamesPerTeam: 12,
    // conferência única "FBS" com as conferências reais como divisões:
    // o seeding do CFP vira 6 campeões de divisão + 6 at-large = 12 seeds.
    conferences: ['FBS'],
    divisionsPerConference: ['SEC', 'Big Ten', 'ACC', 'Big 12', 'Pac', 'Group of 5'],
    playoffSeedsPerConference: 12,
    championshipLabel: 'National Championship',
    hasCap: false,
    rules: NCAA_RULES
  }
}
