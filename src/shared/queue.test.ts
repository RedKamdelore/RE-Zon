import { describe, it, expect } from 'vitest'
import { nextIndex, prevIndex, buildShuffleOrder, upcomingPositions } from './queue'

describe('queue logic', () => {
  const order = [0, 1, 2, 3]

  it('next: linear advance, stops at end when repeat=off', () => {
    expect(nextIndex(order, 0, 1, 'off')).toBe(1)
    expect(nextIndex(order, 3, 3, 'off')).toBeNull()
  })

  it('next: wraps when repeat=all', () => {
    expect(nextIndex(order, 3, 3, 'all')).toBe(0)
  })

  it('next: stays when repeat=one', () => {
    expect(nextIndex(order, 2, 2, 'one')).toBe(2)
  })

  it('prev: goes back, at 0 stays 0', () => {
    expect(prevIndex(order, 2)).toBe(1)
    expect(prevIndex(order, 0)).toBe(0)
  })

  it('buildShuffleOrder: permutation containing all indices, first = current', () => {
    const shuffled = buildShuffleOrder(10, 3)
    expect(shuffled[0]).toBe(3)
    expect([...shuffled].sort((a, b) => a - b)).toEqual([0,1,2,3,4,5,6,7,8,9])
  })

  it('upcomingPositions: order-space positions after pos', () => {
    expect(upcomingPositions([2, 0, 1, 3], 1)).toEqual([2, 3])
    expect(upcomingPositions([0, 1, 2], 0)).toEqual([1, 2])
  })

  it('upcomingPositions: empty at the end or with empty order', () => {
    expect(upcomingPositions([0, 1], 1)).toEqual([])
    expect(upcomingPositions([], 0)).toEqual([])
  })
})
