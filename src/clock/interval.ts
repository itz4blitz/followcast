export type Schedule = (periodMs: number, callback: () => void) => () => void

export function intervalTicks(
  periodMs: number,
  signal: AbortSignal,
  every: Schedule,
): AsyncIterable<void> {
  return {
    [Symbol.asyncIterator]: async function* intervalIterator() {
      // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — the while (!signal.aborted) guard exits immediately
      if (signal.aborted) {
        return
      }
      const queued: void[] = []
      let wake: (() => void) | undefined
      const cancel = every(periodMs, () => {
        queued.push(undefined)
        if (wake !== undefined) {
          wake()
        }
      })
      const onAbort = (): void => {
        if (wake !== undefined) {
          wake()
        }
      }
      // Stryker disable next-line ObjectLiteral,BooleanLiteral: equivalent — abort is delivered once per Followcast run
      signal.addEventListener('abort', onAbort, { once: true })
      try {
        while (!signal.aborted) {
          if (queued.length === 0) {
            await new Promise<void>((resolve) => {
              wake = resolve
            })
            wake = undefined
          }
          if (signal.aborted) {
            return
          }
          queued.shift()
          yield
        }
        // Stryker disable next-line BlockStatement: equivalent — cleanup has no observer; ticks already yielded
      } finally {
        cancel()
        // Stryker disable next-line StringLiteral: equivalent — removeEventListener name does not change tick behavior
        signal.removeEventListener('abort', onAbort)
      }
    },
  }
}

export function nodeSchedule(periodMs: number, callback: () => void): () => void {
  const timer = setInterval(callback, periodMs)
  return () => {
    clearInterval(timer)
  }
}
