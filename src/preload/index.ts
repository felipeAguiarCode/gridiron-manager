import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: (channel: string, payload?: unknown): Promise<unknown> =>
    ipcRenderer.invoke(channel, payload),
  onGameEvent: (cb: (event: unknown) => void): (() => void) => {
    const listener = (_: unknown, data: unknown): void => cb(data)
    ipcRenderer.on('game:event', listener)
    return () => ipcRenderer.removeListener('game:event', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
