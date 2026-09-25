import { describe, expect, it } from 'vitest'
import { activeLyricIndex, parseLrc } from './lyrics'

describe('synced lyrics', () => {
  it('sorts repeated timestamps and ignores metadata', () => {
    expect(parseLrc('[ar:Artist]\n[00:10.50][00:20.500]Припев\n[00:02]Куплет')).toEqual([
      {timeSec: 2, text: 'Куплет'}, {timeSec: 10.5, text: 'Припев'}, {timeSec: 20.5, text: 'Припев'},
    ])
  })
  it('applies offset and chooses the current line across pause and seek', () => {
    const lines = parseLrc('[offset:-500]\n[00:01.00]Раз\n[00:03.00]Два')
    expect(lines.map(line => line.timeSec)).toEqual([0.5, 2.5])
    expect(activeLyricIndex(lines, 0)).toBe(-1)
    expect(activeLyricIndex(lines, 2.6)).toBe(1)
    expect(activeLyricIndex(lines, 1.1)).toBe(0)
  })
  it('leaves plain text as untimed and rejects invalid seconds', () => {
    expect(parseLrc('Обычный текст без меток')).toEqual([])
    expect(parseLrc('[00:70.00]Неверная\n[01:01]Верная')).toEqual([{timeSec:61,text:'Верная'}])
  })
})
