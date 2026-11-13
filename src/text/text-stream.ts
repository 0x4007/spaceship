export type GenerationTrigger = "dwell timer" | "pointer moved right"

export type TextSource = {
  /** May rewrite the text before completion starts, e.g. to a full known opening. */
  expand?(text: string): string
  /** Streams text that continues `prefix`. Must stop (by throwing or returning) once `signal` aborts. */
  complete(prefix: string, signal: AbortSignal): AsyncIterable<string>
}

export function createTextStream({ expand, complete }: TextSource, onChange: () => void) {
  let text = ""
  let active: AbortController | undefined
  let id = 0
  let openingWords = 0

  return {
    get text() {
      return text
    },
    generate,
    truncate,
  }

  async function generate(trigger: GenerationTrigger) {
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
    console.log(`generation ${generationId} start by ${trigger} after ${countWords(prefix)} words`)

    try {
      for await (const chunk of complete(prefix, signal)) {
        if (signal.aborted) return
        text += chunk
        onChange()
      }
      if (!signal.aborted) console.log(`generation ${generationId} done with ${countWords(text) - countWords(prefix)} words`)
    } catch (error) {
      if (!signal.aborted) throw error
    } finally {
      if (active === controller) active = undefined
    }
  }

  /** Cutting inside the expanded opening is a no-op unless `count` is zero. */
  function truncate(count: number) {
    if (count > 0 && count <= openingWords) return
    if (active) {
      active.abort()
      active = undefined
      console.log(`generation ${id} cancel`)
    }
    text = firstWords(text, count)
    if (count === 0) openingWords = 0
  }
}

export function countWords(text: string) {
  return text.match(/\S+/g)?.length ?? 0
}

function firstWords(text: string, count: number) {
  return text.match(new RegExp(`^(?:\\s*\\S+){${count}}`))?.[0] ?? ""
}
