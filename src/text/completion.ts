import type { Lead } from "./attention.ts"
import type { TextSource } from "./text-stream.ts"

const LATENCY_MS = 150
const WORDS_PER_SECOND = 800
const WORDS_PER_CHUNK = 8
const WORDS_PER_COMPLETION = 400
const CHUNK_INTERVAL_MS = (WORDS_PER_CHUNK / WORDS_PER_SECOND) * 1000

const DICTIONARY =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.".split(
    " ",
  )

export const simulatedSource: TextSource = { complete }

async function* complete(prefix: string, _leads: Lead[], signal: AbortSignal) {
  for (let sent = 0; sent < WORDS_PER_COMPLETION; sent += WORDS_PER_CHUNK) {
    await delay(sent === 0 ? LATENCY_MS : CHUNK_INTERVAL_MS, signal)
    const words = Array.from({ length: WORDS_PER_CHUNK }, randomWord).join(" ")
    yield sent === 0 && !prefix ? words : ` ${words}`
  }
}

function randomWord() {
  return DICTIONARY[Math.floor(Math.random() * DICTIONARY.length)]
}

export function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const timer = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true })
  })
}
