import { optionIndexAt } from "./dimension.ts"
import type { Steering, TextSource } from "./text-stream.ts"

const LATENCY_MS = 150
const WORDS_PER_SECOND = 800
const WORDS_PER_CHUNK = 8
const WORDS_PER_COMPLETION = 400
/** Share of words drawn from the steering instead of the dictionary, so its effect is visible. */
const STEERED_SHARE = 0.25
const CHUNK_INTERVAL_MS = (WORDS_PER_CHUNK / WORDS_PER_SECOND) * 1000

const DICTIONARY =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.".split(
    " ",
  )

export const simulatedSource: TextSource = { complete }

async function* complete(prefix: string, steering: Steering, signal: AbortSignal) {
  const steeredWords = steeredWordsOf(steering)
  const randomWord = () => (Math.random() < STEERED_SHARE && pick(steeredWords)?.()) || pick(DICTIONARY)!
  for (let sent = 0; sent < WORDS_PER_COMPLETION; sent += WORDS_PER_CHUNK) {
    await delay(sent === 0 ? LATENCY_MS : CHUNK_INTERVAL_MS, signal)
    const words = Array.from({ length: WORDS_PER_CHUNK }, randomWord).join(" ")
    yield sent === 0 && !prefix ? words : ` ${words}`
  }
}

/** One word picker per lead and control: a lead gives its keyword, a control its value words (a scale's high pole as often as its position), as often as its strength. */
function steeredWordsOf({ leads, controls }: Steering): (() => string | undefined)[] {
  return [
    ...leads.map(
      ({ keyword }) =>
        () =>
          keyword,
    ),
    ...controls.map(({ dimension, position, strength }) => () => {
      if (Math.random() >= strength) return
      if (dimension.kind === "choice") return dimension.options[optionIndexAt(dimension.options.length, position)]
      return Math.random() < position ? dimension.high : dimension.low
    }),
  ]
}

function pick<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)]
}

export function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const timer = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true })
  })
}
