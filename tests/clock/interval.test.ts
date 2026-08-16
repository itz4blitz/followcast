import { describe, expect, it } from 'vitest'
import { intervalTicks } from '../../src/clock/interval.ts'

describe('intervalTicks', () => {
  it('yields once per scheduled pulse and stops on abort', async () => {
    const controller = new AbortController()
    const pulses: Array<() => void> = []
    const ticks = intervalTicks(100, controller.signal, (_ms, callback) => {
      pulses.push(callback)
      return () => {
        pulses.length = 0
      }
    })
    const seen: number[] = []
    const consume = (async () => {
      for await (const _tick of ticks) {
        seen.push(1)
      }
    })()
    expect(pulses).toHaveLength(1)
    const pulse = pulses[0]
    expect(pulse).toBeDefined()
    if (pulse === undefined) {
      throw new Error('scheduler was not installed')
    }
    pulse()
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    expect(seen).toEqual([1])
    controller.abort()
    await consume
    expect(seen).toEqual([1])
  })

  it('queues a pulse that arrives while the iterator is not waiting', async () => {
    const controller = new AbortController()
    const pulses: Array<() => void> = []
    const ticks = intervalTicks(100, controller.signal, (_ms, callback) => {
      pulses.push(callback)
      return () => {}
    })
    const iterator = ticks[Symbol.asyncIterator]()
    const first = iterator.next()
    const pulse = pulses[0]
    expect(pulse).toBeDefined()
    if (pulse === undefined) {
      throw new Error('scheduler was not installed')
    }
    pulse()
    await expect(first).resolves.toEqual({ value: undefined, done: false })
    pulse()
    pulse()
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: false })
    controller.abort()
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true })
  })

  it('wakes a waiting iterator when aborted with no queued pulse', async () => {
    const controller = new AbortController()
    const ticks = intervalTicks(100, controller.signal, () => () => {})
    const consume = (async () => {
      for await (const _tick of ticks) {
        throw new Error('should not yield')
      }
    })()
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    controller.abort()
    await consume
  })

  it('cancels the scheduler when the iterator ends', async () => {
    const controller = new AbortController()
    let cancelled = false
    const ticks = intervalTicks(100, controller.signal, () => () => {
      cancelled = true
    })
    const consume = (async () => {
      for await (const _tick of ticks) {
        throw new Error('should not yield')
      }
    })()
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    controller.abort()
    await consume
    expect(cancelled).toBe(true)
  })

  it('ends immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const ticks = intervalTicks(100, controller.signal, () => () => {})
    const seen: number[] = []
    for await (const _tick of ticks) {
      seen.push(1)
    }
    expect(seen).toEqual([])
  })
})
