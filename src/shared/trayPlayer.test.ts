import { describe, expect, it } from 'vitest'
import { isTrayPlayerCommand } from './trayPlayer'

describe('tray commands', () => {
  it('permits navigation, playback and bounded volume', () => {
    for (const command of ['lyrics', 'queue', 'expand', 'toggle', 'stop', 'prev', 'next', 'volume:0', 'volume:0.65', 'volume:1', 'seek:214.3']) expect(isTrayPlayerCommand(command)).toBe(true)
  })
  it('rejects malformed, non-finite and out-of-range commands', () => {
    for (const command of ['volume:1.1', 'volume:-1', 'volume:NaN', 'seek:Infinity', 'seek:-3', 'seek:', 'settings', 'seek:' + '9'.repeat(400)]) expect(isTrayPlayerCommand(command)).toBe(false)
  })
})
