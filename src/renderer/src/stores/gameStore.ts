import { create } from 'zustand'
import { invoke, IpcError } from '../api/game-client'
import type { AdvanceResult, RosterView, SaveMeta, Snapshot } from '@shared/ipc/contract'
import type { CoachArchetypeId, League } from '@core/domain/types'
import type { GameControlMode } from '@core/domain/playbook'

interface GameState {
  saves: SaveMeta[]
  snapshot: Snapshot | null
  roster: RosterView | null
  lastAdvance: AdvanceResult | null
  advancing: boolean
  error: string | null
  minimalCrests: boolean

  refreshSaves: () => Promise<void>
  createCareer: (input: { saveName: string; league: League; teamId: string; coachName: string; coachArchetype?: CoachArchetypeId }) => Promise<void>
  loadCareer: (slug: string) => Promise<void>
  deleteCareer: (slug: string) => Promise<void>
  refreshSnapshot: () => Promise<void>
  advanceWeek: () => Promise<AdvanceResult | null>
  chooseEvent: (index: number) => Promise<void>
  newSeason: () => Promise<void>
  loadRoster: (teamId?: string) => Promise<void>
  setControlMode: (mode: GameControlMode) => Promise<void>
  clearError: () => void
}

function msg(err: unknown): string {
  return err instanceof IpcError ? err.message : err instanceof Error ? err.message : String(err)
}

export const useGameStore = create<GameState>((set, get) => ({
  saves: [],
  snapshot: null,
  roster: null,
  lastAdvance: null,
  advancing: false,
  error: null,
  minimalCrests: true,

  async refreshSaves() {
    try {
      set({ saves: await invoke('save:list') })
    } catch (e) {
      set({ error: msg(e) })
    }
  },

  async createCareer(input) {
    try {
      await invoke('save:create', input)
      const snapshot = await invoke('save:load', { slug: (await invoke('save:list'))[0].slug })
      set({ snapshot, error: null })
    } catch (e) {
      set({ error: msg(e) })
      throw e
    }
  },

  async loadCareer(slug) {
    try {
      const snapshot = await invoke('save:load', { slug })
      set({ snapshot, error: null })
    } catch (e) {
      set({ error: msg(e) })
      throw e
    }
  },

  async deleteCareer(slug) {
    try {
      await invoke('save:delete', { slug })
      await get().refreshSaves()
    } catch (e) {
      set({ error: msg(e) })
    }
  },

  async refreshSnapshot() {
    try {
      set({ snapshot: await invoke('game:snapshot') })
    } catch (e) {
      set({ error: msg(e) })
    }
  },

  async advanceWeek() {
    if (get().advancing) return null
    set({ advancing: true })
    try {
      const result = await invoke('game:advanceWeek')
      const snapshot = await invoke('game:snapshot')
      set({ lastAdvance: result, snapshot, advancing: false })
      return result
    } catch (e) {
      set({ error: msg(e), advancing: false })
      return null
    }
  },

  async chooseEvent(index: number) {
    try {
      const r = await invoke('events:choose', { index })
      set({ snapshot: r.snapshot })
    } catch (e) {
      set({ error: msg(e) })
    }
  },

  async newSeason() {
    if (get().advancing) return
    set({ advancing: true })
    try {
      const snapshot = await invoke('season:new')
      set({ snapshot, lastAdvance: null, advancing: false })
    } catch (e) {
      set({ error: msg(e), advancing: false })
    }
  },

  async loadRoster(teamId) {
    try {
      set({ roster: await invoke('roster:get', { teamId }) })
    } catch (e) {
      set({ error: msg(e) })
    }
  },

  async setControlMode(mode) {
    try {
      await invoke('settings:setControlMode', { mode })
      set({ snapshot: await invoke('game:snapshot') })
    } catch (e) {
      set({ error: msg(e) })
    }
  },

  clearError() {
    set({ error: null })
  }
}))
