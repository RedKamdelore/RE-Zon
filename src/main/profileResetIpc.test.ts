import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ handle: vi.fn(), confirm: vi.fn(), request: vi.fn(), relaunch: vi.fn(), exit: vi.fn() }))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle }, dialog: { showMessageBox: mocks.confirm },
  app: { getPath: (key: string) => key, relaunch: mocks.relaunch, exit: mocks.exit },
}))
vi.mock('./profileReset', () => ({ requestProfileReset: mocks.request }))
import { registerProfileReset } from './profileResetIpc'
const win = { webContents: {}, isDestroyed: () => false }
let handler: (event: {sender: unknown}) => Promise<boolean>
beforeEach(() => {
  vi.resetAllMocks()
  registerProfileReset(() => win as never, () => true)
  handler = mocks.handle.mock.calls[0][1]
})
it('defaults to cancellation and leaves the profile untouched when cancelled', async () => {
  mocks.confirm.mockResolvedValue({ response: 0 })
  expect(await handler({sender: win.webContents})).toBe(false)
  expect(mocks.confirm.mock.calls[0][1]).toMatchObject({defaultId: 0, cancelId: 0})
  expect(mocks.request).not.toHaveBeenCalled()
  expect(mocks.exit).not.toHaveBeenCalled()
})
it('schedules the confirmed reset before restarting', async () => {
  mocks.confirm.mockResolvedValue({ response: 1 })
  await handler({sender: win.webContents})
  expect(mocks.request).toHaveBeenCalledWith('appData', 'userData')
  expect(mocks.relaunch).toHaveBeenCalledOnce()
  expect(mocks.exit).toHaveBeenCalledWith(0)
  expect(mocks.request.mock.invocationCallOrder[0]).toBeLessThan(mocks.relaunch.mock.invocationCallOrder[0])
})
it('rejects other windows and blocks reset during an update', async () => {
  expect(await handler({sender: {}})).toBe(false)
  registerProfileReset(() => win as never, () => false)
  handler = mocks.handle.mock.calls[1][1]
  await expect(handler({sender: win.webContents})).rejects.toThrow('обновления')
  expect(mocks.confirm).not.toHaveBeenCalled()
})
it('rechecks update state after the confirmation and does not restart on write failure', async () => {
  const canReset = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false)
  registerProfileReset(() => win as never, canReset)
  handler = mocks.handle.mock.calls[1][1]
  mocks.confirm.mockResolvedValue({ response: 1 })
  await expect(handler({sender: win.webContents})).rejects.toThrow('обновления')
  expect(mocks.request).not.toHaveBeenCalled()
  registerProfileReset(() => win as never, () => true)
  handler = mocks.handle.mock.calls[2][1]
  mocks.request.mockImplementation(() => { throw new Error('disk full') })
  await expect(handler({sender: win.webContents})).rejects.toThrow('disk full')
  expect(mocks.relaunch).not.toHaveBeenCalled()
})
