import { afterEach, describe, expect, it, vi } from 'vitest'
import { nodeSchedule } from '../../src/clock/interval.ts'

describe('nodeSchedule', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('invokes the callback on the interval until cancelled', () => {
    vi.useFakeTimers()
    let pulses = 0
    const cancel = nodeSchedule(100, () => {
      pulses += 1
    })
    vi.advanceTimersByTime(250)
    expect(pulses).toBe(2)
    cancel()
    vi.advanceTimersByTime(250)
    expect(pulses).toBe(2)
  })
})
