import { ipcMain } from 'electron'
import { ipcInputs, type IpcChannel, type IpcInput, type IpcOutputs } from '@shared/ipc/contract'
import * as game from '../services/game-service'
import * as playbook from '../services/playbook-service'
import * as playcall from '../services/play-call-service'

type Handlers = { [C in IpcChannel]: (input: IpcInput<C>) => IpcOutputs[C] }

const handlers: Handlers = {
  'save:list': () => game.listSaves(),
  'save:create': (i) => game.createSave(i),
  'save:load': (i) => game.loadSave(i),
  'save:delete': (i) => game.deleteSave(i),
  'game:snapshot': () => game.snapshot(),
  'game:advanceWeek': () => game.advanceWeek(),
  'season:new': () => game.startNewSeason(),
  'world:teams': (i) => game.worldTeams(i),
  'world:teamPreview': (i) => game.worldTeamPreview(i),
  'roster:get': (i) => game.rosterGet(i),
  'tactics:getScheme': () => game.getScheme(),
  'tactics:setScheme': (i) => game.setScheme(i),
  'tactics:getDepthChart': () => game.getDepthChart(),
  'tactics:setDepthChart': (i) => game.setDepthChart(i),
  'game:result': (i) => game.gameResult(i),
  'market:get': () => game.marketGet(),
  'market:pulse': () => game.marketPulse(),
  'market:tradeBlock': () => game.tradeBlockGet(),
  'market:legends': () => game.legendsGet(),
  'market:legendWorkout': (i) => game.legendWorkout(i),
  'market:signFree': (i) => game.marketSignFree(i),
  'market:release': (i) => game.marketRelease(i),
  'market:proposeTrade': (i) => game.marketProposeTrade(i),
  'scout:search': (i) => game.scoutSearch(i),
  'negotiation:start': (i) => game.negotiationStart(i),
  'negotiation:get': () => game.negotiationGet(),
  'negotiation:submitOffer': (i) => game.negotiationSubmitOffer(i),
  'negotiation:walkAway': () => game.negotiationWalkAway(),
  'negotiation:finalize': () => game.negotiationFinalize(),
  'news:get': () => game.newsGet(),
  'news:getBreaking': () => game.newsGetBreaking(),
  'news:acknowledge': () => game.newsAcknowledge(),
  'draft:getClass': () => game.draftGetClass(),
  'draft:scout': (i) => game.draftScout(i),
  'draft:run': (i) => game.draftRun(i),
  'preseason:get': () => game.preseasonGet(),
  'preseason:setFocus': (i) => game.preseasonSetFocus(i),
  'preseason:runCamp': () => game.preseasonRunCamp(),
  'events:get': () => game.eventsGet(),
  'events:choose': (i) => game.eventsChoose(i),
  'feed:get': () => game.feedGet(),
  'editor:updatePlayer': (i) => game.editorUpdatePlayer(i),
  // --- Playbooks & Play Calling (§8B) ---
  'settings:setControlMode': (i) => game.setControlMode(i),
  'playbook:hub': () => playbook.playbookHub(),
  'playbook:list': (i) => playbook.playbookList(i),
  'playbook:get': (i) => playbook.playbookGet(i),
  'playbook:create': (i) => playbook.playbookCreate(i),
  'playbook:clone': (i) => playbook.playbookClone(i),
  'playbook:rename': (i) => playbook.playbookRename(i),
  'playbook:update': (i) => playbook.playbookUpdate(i),
  'playbook:addPlay': (i) => playbook.playbookAddPlay(i),
  'playbook:removePlay': (i) => playbook.playbookRemovePlay(i),
  'playbook:setFavorite': (i) => playbook.playbookSetFavorite(i),
  'playbook:setActive': (i) => playbook.playbookSetActive(i),
  'playbook:export': (i) => playbook.playbookExport(i),
  'playbook:import': (i) => playbook.playbookImport(i),
  'playbook:familiarity': () => playbook.playbookFamiliarity(),
  'playcall:startGame': (i) => playcall.startInteractiveGame(i),
  'playcall:advance': (i) => playcall.advanceInteractive(i),
  'playcall:getState': (i) => playcall.getPlayCallState(i)
}

/** Registra o handler genérico: valida input Zod → service → { ok, data } | { ok:false, code }. */
export function registerIpcHandlers(): void {
  for (const channel of Object.keys(handlers) as IpcChannel[]) {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (_e, payload) => {
      const parsed = ipcInputs[channel].safeParse(payload)
      if (!parsed.success) return { ok: false, code: 'INVALID_INPUT', message: parsed.error.message }
      try {
        const fn = handlers[channel] as (i: unknown) => unknown
        return { ok: true, data: fn(parsed.data) }
      } catch (err) {
        if (err instanceof game.AppError) return { ok: false, code: err.code, message: err.message }
        console.error('[ipc]', channel, err)
        return { ok: false, code: 'INTERNAL', message: (err as Error)?.message ?? String(err) }
      }
    })
  }
}
