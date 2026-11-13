import { storedApiKey, streamCompletion } from "../llm/cerebras.ts"
import { STORY_OPENINGS } from "../story/openings.ts"
import { STORY_MAX_WORDS, STORY_REQUEST } from "../story/prompt.ts"
import type { Lead } from "./attention.ts"
import type { TextSource } from "./text-stream.ts"

const STEERED_SYSTEM_PROMPT = `Continue the story. The user message lists key phrases from the story, then the story so far, which may stop mid-sentence.

- The key phrases lead what happens next: build the continuation on them, most of all on the [bracketed] words.
- Output only the words that come next. Do not repeat the story so far.
- Your first word directly follows the story's last word.
- Plain text only. No title, markdown or commentary.
- At most ${STORY_MAX_WORDS} words. End on a complete sentence.

EXAMPLE
User:
KEY PHRASES
not the one on her [phone]

STORY SO FAR
Mara had locked the kitchen an hour ago. Now the alarm went off, but it was not the one on her phone. She lay still and
Assistant:
reached for the phone anyway. Its screen was dark, and the ringing went on.`

const STEERED_REQUEST = { ...STORY_REQUEST, system: STEERED_SYSTEM_PROMPT }

export const liveSource: TextSource = { expand: expandToStoryStart, complete: completeStory }

/** Picks a random story opening that begins with the same words as `text`. */
function expandToStoryStart(text: string) {
  const words = text.match(/\S+/g) ?? []
  const candidates = STORY_OPENINGS.filter((start) => {
    const startWords = start.split(/\s+/)
    return startWords.length >= words.length && words.every((word, i) => word === startWords[i])
  })
  return candidates[Math.floor(Math.random() * candidates.length)] ?? text
}

async function* completeStory(prefix: string, leads: Lead[], signal: AbortSignal) {
  const apiKey = storedApiKey()
  if (!apiKey) throw new Error("save an API key first")

  const request = leads.length ? { ...STEERED_REQUEST, user: steeredUserMessage(prefix, leads) } : { ...STORY_REQUEST, user: prefix }
  let started = false
  for await (const delta of streamCompletion({ ...request, apiKey, signal })) {
    if (started) yield delta
    else if (delta.trim()) {
      started = true
      yield ` ${delta.trimStart()}`
    }
  }
}

function steeredUserMessage(prefix: string, leads: Lead[]) {
  const phrases = leads.map(({ before, keyword, after }) => `${before}[${keyword}]${after}`).join("\n")
  return `KEY PHRASES\n${phrases}\n\nSTORY SO FAR\n${prefix}`
}
