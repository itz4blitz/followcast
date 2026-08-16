export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly pending: T[] = []
  private readonly waiters: ((result: IteratorResult<T>) => void)[] = []
  private closed = false

  push(value: T): void {
    const waiter = this.waiters.shift()
    if (waiter !== undefined) {
      waiter({ value, done: false })
      return
    }
    this.pending.push(value)
  }

  close(): void {
    this.closed = true
    for (const waiter of this.waiters) {
      waiter({ value: undefined, done: true })
    }
    this.waiters.length = 0
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (true) {
      const next = this.pending.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      if (this.closed) {
        return
      }
      const result = await new Promise<IteratorResult<T>>((resolve) => {
        this.waiters.push(resolve)
      })
      if (result.done === true) {
        return
      }
      yield result.value
    }
  }
}
