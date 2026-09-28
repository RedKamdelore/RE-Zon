// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import Equalizer from './Equalizer'
import { usePlayerStore } from '../stores/playerStore'
import { useSettingsStore } from '../stores/settingsStore'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  usePlayerStore.setState({ eqGains: Array(10).fill(0) })
  useSettingsStore.setState({ playback: { crossfadeSec: 0 } })
  act(() => root.render(<Equalizer />))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

it('keeps presets and frequency bands together before the separate crossfade control', () => {
  const tone = host.querySelector('.eq-tone')
  const crossfade = host.querySelector('.eq-crossfade')
  expect(tone?.querySelector('.eq-presets')).not.toBeNull()
  expect(tone?.querySelector('.eq-sliders')).not.toBeNull()
  expect(tone?.querySelector('.eq-reset')).not.toBeNull()
  expect(crossfade?.querySelector('.eq-crossfade-slider')).not.toBeNull()
  expect(tone?.compareDocumentPosition(crossfade!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  expect(host.querySelectorAll('.eq-slider')).toHaveLength(10)
  expect(host.querySelector('[aria-label="31 Гц"]')).not.toBeNull()
  expect(host.querySelector('button[aria-pressed="true"]')?.textContent).toBe('Ровный')
})
