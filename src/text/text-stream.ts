import type { Lead } from "./attention.ts"
import type { Control } from "./dimension.ts"
import { countWords, firstWords } from "./words.ts"

export type GenerationTrigger = "dwell timer" | "pointer moved right" | "steering changed"

/** What leads a continuation: key phrases from the text, and dimensions tuned for what comes next. Either may be empty. */
export type Steering = { leads: Lead[]; controls: Control[] }

export type TextSource = {
  /** May rewrite the text before completion starts, e.g. to a full known opening. */
  expand?(text: string): string
  /**
   * Streams text that continues `prefix`, led by `steering`.
   * Must stop (by throwing or returning) once `signal` aborts.
   */
  complete(prefix: string, steering: Steering, signal: AbortSignal): AsyncIterable<string>
}

/** How the latest generation went: whether it is still running, how long its first chunk took, and how fast words arrived after that. */
export type StreamActivity = { isGenerating: boolean; firstChunkMs?: number; wordsPerSecond?: number }

/** Times of the latest generation; `words` counts those after the first chunk, so the rate measures streaming, not latency. */
type Timing = { startedAt: number; firstChunkAt?: number; lastChunkAt?: number; words: number }

/** `onChange` is called whenever the text changes and once a generation finishes. */
export function createTextStream({ expand, complete }: TextSource, onChange: () => void) {
  let text = ""
  let active: AbortController | undefined
  let id = 0
  let openingWords = 0
  let timing: Timing | undefined

  return {
    get text() {
      return text
    },
    generate,
    truncate,
    regenerate,
    activity,
  }

  function activity(): StreamActivity {
    if (!timing) return { isGenerating: false }
    const { startedAt, firstChunkAt, lastChunkAt, words } = timing
    const streamingMs = firstChunkAt === undefined || lastChunkAt === undefined ? 0 : lastChunkAt - firstChunkAt
    return {
      isGenerating: active !== undefined,
      firstChunkMs: firstChunkAt === undefined ? undefined : firstChunkAt - startedAt,
      wordsPerSecond: streamingMs > 0 ? (words * 1000) / streamingMs : undefined,
    }
  }

  async function generate(trigger: GenerationTrigger, steering: Steering) {
    if (active) return

    const controller = (active = new AbortController())
    const { signal } = controller
    const generationId = ++id
    const expanded = expand?.(text) ?? text
    if (expanded !== text) {
      text = expanded
      openingWords = countWords(text)
      onChange()
    }
    const prefix = text
    const started: Timing = { startedAt: performance.now(), words: 0 }
    timing = started
    console.log(`generation ${generationId} start by ${trigger} after ${countWords(prefix)} words`)

    try {
      for await (const chunk of complete(prefix, steering, signal)) {
        if (signal.aborted) return
        const now = performance.now()
        if (started.firstChunkAt === undefined) started.firstChunkAt = now
        else started.words += countWords(chunk)
        started.lastChunkAt = now
        text += chunk
        onChange()
      }
      if (!signal.aborted) console.log(`generation ${generationId} done with ${countWords(text) - countWords(prefix)} words`)
    } catch (error) {
      if (!signal.aborted) throw error
    } finally {
      if (active === controller) {
        active = undefined
        onChange()
      }
    }
  }

  /** Cutting inside the expanded opening is a no-op unless `count` is zero. */
  function truncate(count: number) {
    if (count > 0 && count <= openingWords) return
    cutAfter(count)
  }

  /** Keeps at least the expanded opening, then generates again. */
  function regenerate(count: number, trigger: GenerationTrigger, steering: Steering) {
    cutAfter(Math.max(count, openingWords))
    return generate(trigger, steering)
  }

  function cutAfter(count: number) {
    if (active) {
      active.abort()
      active = undefined
      console.log(`generation ${id} cancel`)
    }
    text = firstWords(text, count)
    if (count === 0) openingWords = 0
  }
}
