export type AttentionTarget = { wordIndex: number }

/** Streams targets among the word-like segments of `text`, as given by `wordSpans`. Must stop (by throwing or returning) once `signal` aborts. */
export type AttentionSource = (text: string, signal: AbortSignal) => AsyncIterable<AttentionTarget>

export type AttentionGeneration = AsyncIterable<AttentionTarget> & { text: string; abort(): void }

/** Starts generating right away and buffers targets, so a later reader replays what already arrived and then follows the rest. */
export function startAttention(source: AttentionSource, text: string): AttentionGeneration {
  const controller = new AbortController()
  const targets: AttentionTarget[] = []
  const waiters = new Set<() => void>()
  let isDone = false

  consume()

  return {
    text,
    abort: () => controller.abort(),
    async *[Symbol.asyncIterator]() {
      for (let i = 0; ; i++) {
        while (i >= targets.length) {
          if (isDone) return
          await new Promise<void>((resolve) => waiters.add(resolve))
        }
        yield targets[i]
      }
    },
  }

  async function consume() {
    try {
      for await (const target of source(text, controller.signal)) {
        if (controller.signal.aborted) break
        targets.push(target)
        notify()
      }
    } catch (error) {
      if (!controller.signal.aborted) console.error(error)
    } finally {
      isDone = true
      notify()
    }
  }

  function notify() {
    for (const resolve of waiters) resolve()
    waiters.clear()
  }
}
