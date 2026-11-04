import type { IpcChannel, IpcInput, IpcOutputs, IpcResponse } from '@shared/ipc/contract'

declare global {
  interface Window {
    api: {
      invoke(channel: string, payload?: unknown): Promise<unknown>
      onGameEvent(cb: (event: unknown) => void): () => void
    }
  }
}

export class IpcError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'IpcError'
  }
}

/** Chamada IPC tipada: valida no main, lança IpcError em { ok:false }, senão retorna data. */
export async function invoke<C extends IpcChannel>(channel: C, input?: IpcInput<C>): Promise<IpcOutputs[C]> {
  const res = (await window.api.invoke(channel, input)) as IpcResponse<C>
  if (!res.ok) throw new IpcError(res.code, res.message)
  return res.data
}
