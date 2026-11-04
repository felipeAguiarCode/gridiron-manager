/**
 * RNG determinístico do jogo. Toda aleatoriedade do core passa por aqui —
 * nunca usar Math.random() em src/core. Seeds derivadas garantem replay
 * exato de partidas e sorteios.
 */
export interface Rng {
  next(): number
  int(min: number, max: number): number
  pick<T>(arr: readonly T[]): T
  shuffle<T>(arr: readonly T[]): T[]
  chance(p: number): boolean
  gaussian(mean: number, sd: number): number
  poisson(lambda: number): number
  triangular(min: number, max: number, mode: number): number
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1))
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)]
    },
    shuffle(arr) {
      const out = [...arr]
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
    chance(p) {
      return next() < p
    },
    gaussian(mean, sd) {
      let u = 0
      let v = 0
      while (u === 0) u = next()
      while (v === 0) v = next()
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
    poisson(lambda) {
      const l = Math.exp(-lambda)
      let k = 0
      let p = 1
      do {
        k++
        p *= next()
      } while (p > l)
      return k - 1
    },
    triangular(min, max, mode) {
      const u = next()
      const c = (mode - min) / (max - min)
      return u < c
        ? min + Math.sqrt(u * (max - min) * (mode - min))
        : max - Math.sqrt((1 - u) * (max - min) * (max - mode))
    }
  }
}

/** Hash FNV-1a de streams — deriva seeds independentes de uma seed mestre. */
export function deriveSeed(masterSeed: number, ...streamIds: (string | number)[]): number {
  let h = 0x811c9dc5 ^ (masterSeed >>> 0)
  const feed = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
  }
  for (const id of streamIds) feed(String(id) + '|')
  return h >>> 0
}
