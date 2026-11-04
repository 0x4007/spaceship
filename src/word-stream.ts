const LATENCY_MS = 150
const WORDS_PER_SECOND = 800
const WORDS_PER_CHUNK = 8
const WORDS_PER_GENERATION = 400
const CHUNK_INTERVAL_MS = (WORDS_PER_CHUNK / WORDS_PER_SECOND) * 1000

const DICTIONARY =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.".split(
    " ",
  )

export type GenerationTrigger = "dwell timer" | "pointer moved right"

export type WordStream = {
  readonly words: readonly string[]
  /** Start generating a continuation of the current words. No-op while a generation is running. */
  generate(trigger: GenerationTrigger): void
  /** Cancel the running generation, if any, and keep only the first `count` words. */
  truncate(count: number): void
}

export function createWordStream(onArrive: () => void): WordStream {
  const words: string[] = []
  let active: AbortController | undefined
  let id = 0

  return { words, generate, truncate }

  async function generate(trigger: GenerationTrigger) {
    if (active) return

    const controller = (active = new AbortController())
    const generationId = ++id
    const startLength = words.length
    console.log(`generation ${generationId} start by ${trigger} after ${startLength} words`)

    try {
      for (let sent = 0; sent < WORDS_PER_GENERATION; sent += WORDS_PER_CHUNK) {
        await delay(sent === 0 ? LATENCY_MS : CHUNK_INTERVAL_MS, controller.signal)
        words.push(...Array.from({ length: WORDS_PER_CHUNK }, randomWord))
        onArrive()
      }
      console.log(`generation ${generationId} done with ${words.length - startLength} words`)
    } catch (error) {
      if (!controller.signal.aborted) throw error
    } finally {
      if (active === controller) active = undefined
    }
  }

  function truncate(count: number) {
    if (active) {
      active.abort()
      active = undefined
      console.log(`generation ${id} cancel`)
    }
    words.length = count
  }
}

function randomWord() {
  return DICTIONARY[Math.floor(Math.random() * DICTIONARY.length)]
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const timer = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true })
  })
}
