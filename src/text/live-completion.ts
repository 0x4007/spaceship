import { storedApiKey, streamCompletion } from "../llm/cerebras.ts"
import { STORY_OPENINGS } from "../story/openings.ts"
import { STORY_REQUEST } from "../story/prompt.ts"
import type { TextSource } from "./text-stream.ts"

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

async function* completeStory(prefix: string, signal: AbortSignal) {
  const apiKey = storedApiKey()
  if (!apiKey) throw new Error("save an API key first")

  let started = false
  for await (const delta of streamCompletion({ ...STORY_REQUEST, apiKey, user: prefix, signal })) {
    if (started) yield delta
    else if (delta.trim()) {
      started = true
      yield ` ${delta.trimStart()}`
    }
  }
}
