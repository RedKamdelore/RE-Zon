import { describe, expect, it } from 'vitest'
import { popupPosition } from './trayPopup'

describe('tray popup placement', () => {
  const workArea = {x:0,y:0,width:1920,height:1040}
  it('appears above a bottom taskbar icon and stays on screen', () => {
    expect(popupPosition({x:1870,y:1050,width:24,height:24},workArea)).toEqual({x:1614,y:736})
  })
  it('appears below an icon near the top edge', () => {
    expect(popupPosition({x:12,y:8,width:24,height:24},workArea)).toEqual({x:0,y:40})
  })
})
