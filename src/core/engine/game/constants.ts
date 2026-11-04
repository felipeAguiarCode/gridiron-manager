/**
 * Constantes centrais de balanceamento do motor de partida (GDD Apêndice B).
 * Objeto único calibrável — o harness de 1000 sims (§7.7) valida as bandas e
 * serve para tunar K e as probabilidades. Nunca hardcode fora daqui.
 */
export const BALANCE = {
  K: 4.8, // sharpening de força → jardas
  HOME_ADV: 1.03,
  BASE_PLAYS_PER_TEAM: 64, // ~128 no jogo
  PASS_RATE_BASE: 0.57,

  SACK_P: 0.065,
  INT_P: 0.025,
  FUMBLE_P: 0.018,
  BIG_PLAY_P: 0.09,

  // probabilidade de FG por faixa de distância (jardas do chute)
  FG_BASE_BY_DISTANCE: { u30: 0.97, d30_39: 0.9, d40_49: 0.78, d50: 0.58 },
  PENALTY_P: 0.09,

  MOMENTUM_EFFECT: 0.15,
  MOMENTUM_GAIN_TD: 0.25,
  MOMENTUM_TO: 0.3, // turnover
  MOMENTUM_DECAY: 0.55,

  MORALE_SCALE: 500,
  FORM_SCALE: 500,

  FATIGUE_PER_SNAP: 0.8,
  FATIGUE_MAX_PENALTY: 0.22,

  CRIT_PERF_EXTRA: 0.93,
  CRIT_INJURY_MULT: 2.0,
  INJURY_P_PER_PLAY: 0.004,

  RATING_BASE: 6.2,

  // distribuição de jardas por tipo de jogada (média, desvio)
  YARDS_RUN: { mean: 4.3, sd: 4.5 },
  YARDS_PASS_SHORT: { mean: 6.5, sd: 4.0 },
  YARDS_PASS_DEEP: { mean: 17, sd: 10 },
  YARDS_SACK: { mean: -6.5, sd: 2.5 },
  INCOMPLETE_P_BASE: 0.36,
  DEEP_SHOT_RATE: 0.24,

  SEC_PER_RUN: 38,
  SEC_PER_PASS_COMPLETE: 34,
  SEC_PER_PASS_INCOMPLETE: 8,
  SEC_PER_SPECIAL: 15
} as const

export type Balance = typeof BALANCE

/** Nota pós-jogo base + limites. */
export const RATING_MIN = 3.0
export const RATING_MAX = 10.0
